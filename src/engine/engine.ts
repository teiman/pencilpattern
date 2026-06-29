// Motor de PencilPattern. Agnóstico del entorno: se instancia dentro de un Web
// Worker (vía Comlink) o, como fallback, en el hilo principal.
//
// Selección de backend ROBUSTA: prueba WebGPU → WebGL2 → CPU y, para cada uno,
// ejecuta un AUTO-TEST (render de un degradado + readback). Un backend que
// "inicia" pero no renderiza (p.ej. WebGPU que devuelve negro) se DESCARTA y se
// pasa al siguiente. Así los fallbacks realmente entran.
import type { Project } from './graph/types';
import type { BackendKind, BackendAttempt, InitResult, CellListener, EngineAPI, CacheStats, RawPixels } from '../protocol/messages';
import type { GpuBackend, CreateResult } from './gpu/types';
import { TextureCache } from './graph/cache';
import { LocalGpuExecutor } from './graph/executor';
import { Scheduler } from './graph/scheduler';
import { createWebGpuBackend } from './gpu/webgpu/backend';
import { createWebGl2Backend } from './gpu/webgl2/backend';
import { createCpuBackend } from './gpu/cpu/backend';
import { pngBlobFromRGBA } from '../export/png';

const CACHE_BUDGET = 256 * 1024 * 1024;
const EXPORT_MAX = 2048;

export class Engine implements EngineAPI {
  private backend: GpuBackend | null = null;
  private scheduler: Scheduler | null = null;
  private kind: BackendKind = 'none';
  private attempts: BackendAttempt[] = [];

  async init(): Promise<InitResult> {
    if (this.scheduler) return { backend: this.kind, attempts: this.attempts };

    const makers: Array<[BackendKind, () => Promise<CreateResult>]> = [
      ['webgpu', createWebGpuBackend],
      ['webgl2', createWebGl2Backend],
      ['cpu', createCpuBackend],
    ];

    const attempts: BackendAttempt[] = [];
    let chosen: GpuBackend | null = null;
    for (const [kind, make] of makers) {
      try {
        const r = await make();
        if (r.ok) {
          attempts.push({ kind, ok: true });
          chosen = r.backend;
          break;
        }
        attempts.push({ kind, ok: false, error: r.error });
      } catch (e) {
        attempts.push({ kind, ok: false, error: String(e) });
      }
    }
    this.attempts = attempts;

    if (!chosen) {
      this.kind = 'none';
      return { backend: 'none', attempts };
    }
    this.backend = chosen;
    this.kind = chosen.kind;
    const cache = new TextureCache(CACHE_BUDGET);
    const executor = new LocalGpuExecutor(chosen);
    this.scheduler = new Scheduler(chosen, executor, cache);
    return { backend: this.kind, attempts };
  }

  private get sch(): Scheduler {
    if (!this.scheduler) throw new Error('Engine no inicializado (llama a init primero)');
    return this.scheduler;
  }

  async loadProject(p: Project): Promise<void> {
    this.sch.setProject(p);
  }
  async setParam(code: string, key: string, value: unknown): Promise<void> {
    this.sch.setParam(code, key, value);
  }
  async setStructure(p: Project): Promise<void> {
    this.sch.setStructure(p);
  }
  async setViewport(visible: string[], active: string | null): Promise<void> {
    this.sch.setViewport(visible, active);
  }
  async refresh(): Promise<void> {
    this.sch.refresh();
  }
  async onCell(listener: CellListener): Promise<void> {
    this.sch.setListener(listener);
  }
  async stats(): Promise<CacheStats> {
    return this.sch.stats();
  }
  async dispose(): Promise<void> {
    this.scheduler?.dispose();
    this.backend?.destroy();
  }

  async exportPng(code: string, res: number): Promise<Blob> {
    if (!this.backend) throw new Error('Engine no inicializado');
    const r = Math.min(Math.max(Math.floor(res), 64), EXPORT_MAX);
    const tex = await this.sch.renderTo(code, r);
    const rgba = await this.backend.readPixels(tex);
    return pngBlobFromRGBA(rgba, tex.width, tex.height);
  }

  async readPixels(code: string, res: number): Promise<RawPixels> {
    if (!this.backend) throw new Error('Engine no inicializado');
    const r = Math.min(Math.max(Math.floor(res), 64), EXPORT_MAX);
    const tex = await this.sch.renderTo(code, r);
    const data = await this.backend.readPixels(tex);
    return { data, width: tex.width, height: tex.height };
  }
}
