// Planificador: orquesta el cálculo del DAG con caché por contenido, invalidación
// en cascada, render progresivo (preview→final), prioridad por viewport,
// cancelación por token (época) y debounce de ediciones.
//
// Resolución POR NODO: cada estado se renderiza a su `resolution` (px). El preview
// se limita a PREVIEW_CAP para feedback rápido; el definitivo usa la del nodo.
import type { Project, StateCode } from './types';
import type { GpuTexture, GpuBackend } from '../gpu/types';
import type { Executor } from './executor';
import { TextureCache } from './cache';
import { hashParams } from './hash';
import { topoOrder, requiredClosure, descendants } from './dag';
import { getModifier, hasModifier, DEFAULT_RESOLUTION } from '../modifiers/registry';
import type { CellListener, CellStatus, CellUpdate } from '../../protocol/messages';

const PREVIEW_CAP = 192;
const THUMB_ACTIVE = 256;
const THUMB_CELL = 96;
const DEBOUNCE_MS = 80;

type ResOf = (code: StateCode) => number;

export class Scheduler {
  private project: Project = { bands: [], states: {}, version: 1 };
  private status = new Map<StateCode, CellStatus>();
  private visible = new Set<StateCode>();
  private active: StateCode | null = null;
  private listener: CellListener | null = null;

  private runToken = 0;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private keyMemo = new Map<string, string>();

  constructor(
    private backend: GpuBackend,
    private executor: Executor,
    private cache: TextureCache,
  ) {}

  setListener(l: CellListener): void {
    this.listener = l;
  }

  setProject(p: Project): void {
    this.project = p;
    this.status.clear();
    for (const c of Object.keys(p.states)) this.status.set(c, 'dirty');
    this.scheduleRun();
  }

  setStructure(p: Project): void {
    this.project = p;
    for (const c of Object.keys(p.states)) if (!this.status.has(c)) this.status.set(c, 'dirty');
    this.scheduleRun();
  }

  setParam(code: StateCode, key: string, value: unknown): void {
    const s = this.project.states[code];
    if (!s) return;
    s.params = { ...s.params, [key]: value };
    this.invalidate(code);
  }

  setViewport(visible: StateCode[], active: StateCode | null): void {
    this.visible = new Set(visible);
    this.active = active;
    this.scheduleRun();
  }

  refresh(): void {
    this.scheduleRun();
  }

  private invalidate(code: StateCode): void {
    const affected = descendants(this.project, code);
    affected.add(code);
    for (const c of affected) {
      this.status.set(c, 'dirty');
      this.emit({ code: c, status: 'dirty' });
    }
    this.scheduleRun();
  }

  private setStatus(code: StateCode, status: CellStatus): void {
    this.status.set(code, status);
  }

  private emit(u: CellUpdate): void {
    this.listener?.(u);
  }

  private scheduleRun(): void {
    this.runToken++;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.runNow(), DEBOUNCE_MS);
  }

  // ---- resolución y claves ----

  private resForNode(code: StateCode, phase: 'preview' | 'final'): number {
    const r = this.project.states[code]?.resolution ?? DEFAULT_RESOLUTION;
    return phase === 'final' ? r : Math.min(r, PREVIEW_CAP);
  }

  /** Clave de caché. `tag` separa pasadas (preview/final/export); `resOf` da la resolución por nodo. */
  private nodeKey(code: StateCode, tag: string, resOf: ResOf): string {
    const memoKey = `${code}@${tag}`;
    const cached = this.keyMemo.get(memoKey);
    if (cached) return cached;
    const s = this.project.states[code];
    if (!s || !hasModifier(s.modifierId)) {
      const k = `missing@${resOf(code)}`;
      this.keyMemo.set(memoKey, k);
      return k;
    }
    const mod = getModifier(s.modifierId);
    const packed = mod.pack(s.params);
    const res = resOf(code);
    const inputKeys = s.inputs
      .slice(0, mod.inputArity)
      .map((i) => (this.project.states[i] ? this.nodeKey(i, tag, resOf) : 'none'));
    const key = `${mod.id}#${mod.shaderVersion}@${res}|${hashParams(packed)}|${inputKeys.join(',')}`;
    this.keyMemo.set(memoKey, key);
    return key;
  }

  // ---- ejecución ----

  private targets(): StateCode[] {
    const all = Object.keys(this.project.states);
    if (this.visible.size === 0 && !this.active) return all;
    const set = new Set<StateCode>(this.visible);
    if (this.active) set.add(this.active);
    return [...set];
  }

  private orderedClosure(targets: StateCode[]): StateCode[] {
    const needed = new Set<StateCode>();
    for (const t of targets) for (const c of requiredClosure(this.project, t)) needed.add(c);
    return topoOrder(this.project).filter((c) => needed.has(c));
  }

  private isVisible(code: StateCode): boolean {
    return this.visible.size === 0 || this.visible.has(code) || this.active === code;
  }

  private async computeNode(
    code: StateCode,
    tag: string,
    resOf: ResOf,
    token: number,
  ): Promise<GpuTexture | null> {
    const key = this.nodeKey(code, tag, resOf);
    const hit = this.cache.get(key);
    if (hit) return hit;

    const s = this.project.states[code];
    if (!s || !hasModifier(s.modifierId)) {
      this.setStatus(code, 'error');
      this.emit({ code, status: 'error', error: 'unknown modifier' });
      return null;
    }
    const mod = getModifier(s.modifierId);
    const inputs: GpuTexture[] = [];
    for (const inp of s.inputs.slice(0, mod.inputArity)) {
      const it = this.project.states[inp] ? this.cache.get(this.nodeKey(inp, tag, resOf)) : undefined;
      if (it) inputs.push(it);
    }

    this.setStatus(code, 'computing');
    if (this.isVisible(code)) this.emit({ code, status: 'computing' });

    try {
      const tex = await this.executor.run(s, inputs, resOf(code), new AbortController().signal);
      if (token !== this.runToken) {
        tex.destroy();
        return null;
      }
      this.cache.set(key, tex);
      return tex;
    } catch (err) {
      this.setStatus(code, 'error');
      this.emit({ code, status: 'error', error: String(err) });
      return null;
    }
  }

  private async emitThumb(code: StateCode, tex: GpuTexture, status: CellStatus): Promise<void> {
    if (!this.listener || !this.isVisible(code)) return;
    const size = this.active === code ? THUMB_ACTIVE : THUMB_CELL;
    const mod = getModifier(this.project.states[code]!.modifierId);
    try {
      const thumb = await this.backend.toImageBitmap(tex, size);
      this.emit({ code, status, thumb, color: mod.outputsColor ?? false });
    } catch {
      this.emit({ code, status });
    }
  }

  private async runNow(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const token = this.runToken;
    this.keyMemo.clear();

    try {
      const order = this.orderedClosure(this.targets());
      const touched = new Set<string>();

      const phases: Array<['preview' | 'final', string]> = [
        ['preview', 'p'],
        ['final', 'f'],
      ];
      for (const [phase, tag] of phases) {
        const resOf: ResOf = (c) => this.resForNode(c, phase);
        for (const code of order) {
          if (token !== this.runToken) return;
          const tex = await this.computeNode(code, tag, resOf, token);
          touched.add(this.nodeKey(code, tag, resOf));
          if (tex) {
            const status: CellStatus = phase === 'preview' ? 'preview' : 'final';
            this.setStatus(code, status);
            await this.emitThumb(code, tex, status);
          }
          await Promise.resolve();
        }
        this.cache.trim(touched);
      }
    } finally {
      this.running = false;
      if (token !== this.runToken) this.scheduleRun();
    }
  }

  /** Render de un nodo a una resolución UNIFORME (para export). Devuelve la textura. */
  async renderTo(code: StateCode, res: number): Promise<GpuTexture> {
    this.keyMemo.clear();
    const token = this.runToken;
    const resOf: ResOf = () => res;
    const order = this.orderedClosure([code]);
    let last: GpuTexture | null = null;
    for (const c of order) last = await this.computeNode(c, 'x', resOf, token);
    const out = this.cache.get(this.nodeKey(code, 'x', resOf));
    if (!out && !last) throw new Error(`No se pudo renderizar ${code}`);
    return out ?? last!;
  }

  stats() {
    return this.cache.stats();
  }

  dispose(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.cache.clear();
  }
}
