// Store reactivo (Svelte 5 runes) que conecta la UI con el motor.
//
// Un nodo es IMAGEN (bitmap subido/pegado, modifierId 'image') o MODIFICADOR
// (procedural: generador o filtro). Nunca ambos. La selección es solo el código
// del nodo; el inspector decide qué mostrar según el tipo del nodo.
import * as Comlink from 'comlink';
import type {
  EngineAPI,
  BackendKind,
  BackendAttempt,
  InitResult,
  CellStatus,
  CellUpdate,
} from '../protocol/messages';
import type { Project, State } from '../engine/graph/types';
import { defaultParams } from '../engine/graph/types';
import { ZipBuilder } from '../export/zip';
import { Engine } from '../engine/engine';
import { defaultProject, getModifier, hasTileableParam, DEFAULT_RESOLUTION } from '../engine/modifiers/registry';
import {
  saveProject,
  loadProjectByName,
  listProjects,
  deleteProject,
  clearProjects,
  persistStorage,
  type SavedMeta,
} from '../persistence/idb';
import { EXAMPLES, exampleById, type Example } from '../engine/examples';

export interface CellView {
  status: CellStatus;
  thumb?: ImageBitmap;
  color?: boolean;
  error?: string;
}

/** Selección: una imagen (caja) o un modificador (chip). Ambos referencian un estado. */
export type Selection = { code: string; kind: 'image' | 'modifier' };

/** Entrada de un menú contextual: acción, separador o submenú simple. */
export type ContextItem =
  | { kind: 'sep' }
  | { kind: 'item'; label: string; action: () => void; danger?: boolean; disabled?: boolean };

const AUTOSAVE = 'autosave';

/** Nombre por defecto sencillo, p.ej. "Project #322". */
function generateProjectName(): string {
  return `Project #${100 + Math.floor(Math.random() * 900)}`;
}

/** Lista de ids persistida en localStorage (recientes / favoritos). */
function loadIds(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function saveIds(key: string, ids: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* ignore (modo privado / sin storage) */
  }
}

/** Preset de parámetros de un modificador (nombre + snapshot de params). */
export interface ParamPreset {
  name: string;
  params: Record<string, unknown>;
  builtin?: boolean;
}

const PRESETS_KEY = 'pp.presets';

/** Presets built-in por modificador (se muestran junto a los del usuario). */
const BUILTIN_PRESETS: Record<string, ParamPreset[]> = {
  fbm: [
    { name: 'Clouds', params: { scale: 4, octaves: 6, gain: 0.55, contrast: 0.1 }, builtin: true },
    { name: 'Rough rock', params: { scale: 9, octaves: 7, gain: 0.5, contrast: 0.4 }, builtin: true },
    { name: 'Soft', params: { scale: 3, octaves: 3, gain: 0.6, contrast: -0.2 }, builtin: true },
  ],
  worley: [
    { name: 'Cells', params: { scale: 6, jitter: 1, mode: 'F1' }, builtin: true },
    { name: 'Cracks / scales', params: { scale: 7, jitter: 1, mode: 'F2-F1' }, builtin: true },
  ],
  wood: [
    { name: 'Tight grain', params: { rings: 10, grain: 12, warp: 0.25 }, builtin: true },
    { name: 'Wavy planks', params: { rings: 5, grain: 6, warp: 0.6 }, builtin: true },
  ],
};

function loadPresets(): Record<string, ParamPreset[]> {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}
function savePresets(p: Record<string, ParamPreset[]>): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

// ---- plantillas de carril (cadenas de nodos reutilizables) ----
const TEMPLATES_KEY = 'pp.laneTemplates';

/** Plantilla = nombre + stops serializados con códigos portables (t0, t1…). */
export interface LaneTemplate {
  name: string;
  states: State[]; // codes/inputs ya remapeados a t0,t1,… (solo refs internas)
}

function loadTemplates(): LaneTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function saveTemplates(t: LaneTemplate[]): void {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

function loadTheme(): 'dark' | 'light' | 'hc' {
  try {
    const t = localStorage.getItem('pp.theme');
    if (t === 'light' || t === 'hc' || t === 'dark') return t;
  } catch {
    /* ignore */
  }
  return 'dark';
}

function normalize(p: Project): Project {
  const codes = Object.keys(p.states);
  for (const b of p.bands) {
    const stops = Array.isArray(b.stops) ? b.stops.filter((c) => p.states[c]) : [];
    for (const c of codes) {
      if (p.states[c].bandId === b.id && !stops.includes(c)) stops.push(c);
    }
    b.stops = stops;
  }
  if (!p.name || !p.name.trim()) p.name = generateProjectName();
  return p;
}

class ProjectStore {
  project = $state<Project>(normalize(defaultProject()));
  cells = $state<Record<string, CellView>>({});
  selected = $state<Selection | null>({ code: 'o1', kind: 'modifier' });
  backend = $state<BackendKind>('none');
  diagnostics = $state<BackendAttempt[]>([]);
  ready = $state(false);
  stats = $state<{ entries: number; bytes: number } | null>(null);
  notice = $state<string | null>(null);
  /** Visor popup (doble clic en una caja): URL de la textura renderizada a alta res. */
  viewer = $state<{ code: string; url: string; size: number } | null>(null);
  /** Visualizador anclado abajo (dock): nodo + modo + su propia textura exportada.
   *  La url es una copia independiente (no el thumb compartido), y se re-exporta
   *  cuando el nodo anclado se recalcula, así se actualiza en vivo sin contaminarse
   *  con la textura de otros nodos al cambiar de selección. */
  dock = $state<{ code: string; mode: string; url: string; size: number; pinned: boolean } | null>(null);
  /** Browser de modificadores abierto para añadir uno al carril `bandId`. */
  modifierBrowser = $state<{ bandId: string } | null>(null);
  /** Modificadores usados recientemente y favoritos (persistidos en localStorage). */
  recentModifierIds = $state<string[]>(loadIds('pp.recentMods'));
  favoriteModifierIds = $state<string[]>(loadIds('pp.favMods'));
  canUndo = $state(false);
  canRedo = $state(false);
  showNotes = $state(false);
  currentExample = $state<string | null>(null);
  ttsEnabled = $state(false);
  /** Estado del autosave para el chip del header. */
  saveState = $state<'idle' | 'saving' | 'saved'>('idle');
  /** Tema de la interfaz (persistido en localStorage, aplicado al <html>). */
  theme = $state<'dark' | 'light' | 'hc'>(loadTheme());
  /** Si en el arranque se restauró un proyecto guardado (no es primera visita). */
  loadedFromAutosave = $state(false);
  /** Portapapeles de parámetros (copiar/pegar entre nodos). */
  paramClipboard = $state<{ modifierId: string; params: Record<string, unknown> } | null>(null);
  /** Semillas bloqueadas (el randomize no las toca). */
  lockedSeeds = $state<Set<string>>(new Set());
  /** Presets de parámetros del usuario, por modifierId (persistidos). */
  userPresets = $state<Record<string, ParamPreset[]>>(loadPresets());
  /** Plantillas de carril del usuario (cadenas de nodos reutilizables, persistidas). */
  laneTemplates = $state<LaneTemplate[]>(loadTemplates());
  /** Menú contextual abierto (posición + acciones). */
  contextMenu = $state<{ x: number; y: number; items: ContextItem[] } | null>(null);

  private api: EngineAPI | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private history: Project[] = [];
  private future: Project[] = [];
  private lastUndoTag = '';
  private lastUndoTime = 0;
  // Transacción de undo: agrupa varias ediciones en un solo paso de historial.
  private batchDepth = 0;

  async boot(): Promise<void> {
    this.applyTheme();
    let api: EngineAPI;
    let result: InitResult;
    try {
      const worker = new Worker(new URL('../engine/worker.ts', import.meta.url), { type: 'module' });
      const remote = Comlink.wrap<EngineAPI>(worker);
      result = await remote.init();
      if (result.backend === 'none') throw new Error('worker without backend');
      api = remote;
      if (result.backend === 'cpu') {
        try {
          const main = new Engine();
          const r2 = await main.init();
          if (r2.backend === 'webgpu' || r2.backend === 'webgl2') {
            api = main;
            result = r2;
          } else {
            await main.dispose();
          }
        } catch {
          /* nos quedamos con el worker en CPU */
        }
      }
    } catch {
      const engine = new Engine();
      result = await engine.init();
      api = engine;
    }
    this.api = api;
    this.backend = result.backend;
    this.diagnostics = result.attempts;
    if (this.backend !== 'webgpu') {
      console.warn('[PencilPattern] backend activo:', this.backend, '· intentos:', result.attempts);
    }

    const saved = await loadProjectByName(AUTOSAVE).catch(() => undefined);
    if (saved && saved.states && Object.keys(saved.states).length) {
      this.project = normalize(saved);
      this.loadedFromAutosave = true;
    }
    if (!this.selected || !this.project.states[this.selected.code]) {
      const first = Object.keys(this.project.states)[0];
      this.selected = first ? { code: first, kind: this.isImage(first) ? 'image' : 'modifier' } : null;
    }

    await api.onCell(Comlink.proxy((u: CellUpdate) => this.onCell(u)));
    await persistStorage();
    await api.loadProject(this.snapshot());
    this.pushViewport();
    this.ready = true;
    void this.pollStats();
  }

  private snapshot(): Project {
    return $state.snapshot(this.project) as Project;
  }

  private onCell(u: CellUpdate): void {
    const prev = this.cells[u.code];
    this.cells[u.code] = {
      status: u.status,
      thumb: u.thumb ?? prev?.thumb,
      color: u.color ?? prev?.color,
      error: u.status === 'error' ? u.error : undefined,
    };
    // Actualización en vivo del dock: si el nodo anclado se recalculó (llega un
    // thumb nuevo), re-exportamos su textura propia.
    if (this.dock?.code === u.code && u.thumb) void this.refreshDock();
  }

  private async pollStats(): Promise<void> {
    if (!this.api) return;
    try {
      const s = await this.api.stats();
      this.stats = { entries: s.entries, bytes: s.bytes };
    } catch {
      /* ignore */
    }
    setTimeout(() => void this.pollStats(), 1000);
  }

  private autosave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveState = 'saving';
    this.saveTimer = setTimeout(async () => {
      await saveProject(AUTOSAVE, this.snapshot());
      this.saveState = 'saved';
    }, 500);
  }

  private pushViewport(): void {
    void this.api?.setViewport(Object.keys(this.project.states), this.selected?.code ?? null);
  }

  private syncStructure(): void {
    void this.api?.setStructure(this.snapshot());
    this.pushViewport();
    this.autosave();
  }

  // ---- consultas ----

  isImage(code: string): boolean {
    return this.project.states[code]?.modifierId === 'image';
  }
  bandOf(code: string): Project['bands'][number] | undefined {
    return this.project.bands.find((b) => b.stops.includes(code));
  }
  indexInBand(code: string): number {
    return this.bandOf(code)?.stops.indexOf(code) ?? -1;
  }
  /** Alias generado (cuando el nodo no tiene uno propio): "<banda>#<índice>",
   *  con el nombre de banda en estilo unixname. P.ej. "band_1#3". */
  generatedAlias(code: string): string {
    const band = this.bandOf(code);
    if (!band) return code;
    const slug =
      band.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'band';
    return `${slug}#${band.stops.indexOf(code) + 1}`;
  }
  /** Nombre a mostrar: el alias propio si existe, si no el generado. */
  displayName(code: string): string {
    const a = this.project.states[code]?.alias;
    return a && a.trim() ? a : this.generatedAlias(code);
  }
  isFirst(code: string): boolean {
    return this.indexInBand(code) === 0;
  }
  prevStop(code: string): string | undefined {
    const b = this.bandOf(code);
    if (!b) return undefined;
    const i = b.stops.indexOf(code);
    return i > 0 ? b.stops[i - 1] : undefined;
  }
  /** ¿Algún slot de entrada requerido no resuelve a un nodo existente? El slot 0
   *  de un nodo no-primero hereda del carril (prevStop), así que no cuenta como
   *  colgante si hay un nodo anterior. */
  hasDanglingInput(code: string): boolean {
    const s = this.project.states[code];
    if (!s || s.modifierId === 'image') return false;
    const mod = getModifier(s.modifierId);
    for (let i = 0; i < mod.inputArity; i++) {
      const ref = s.inputs[i];
      if (ref) {
        if (!this.project.states[ref]) return true; // referencia rota
      } else if (i === 0 && !this.isFirst(code) && this.prevStop(code)) {
        // slot 0 vacío pero hereda del carril → OK
      } else {
        return true; // slot requerido sin conectar
      }
    }
    return false;
  }

  // ---- selección ----

  /** Clic en una CAJA (imagen/estado): muestra opciones de la imagen. */
  selectImage(code: string): void {
    this.selected = { code, kind: 'image' };
    this.pushViewport();
    this.followDock(code);
  }
  /** Clic en un CHIP (modificador entre cajas): muestra opciones del modificador. */
  selectModifier(code: string): void {
    this.selected = { code, kind: 'modifier' };
    this.pushViewport();
    this.followDock(code);
  }

  // ---- deshacer / rehacer (Ctrl+Z), 100 niveles ----

  private recordUndo(tag = ''): void {
    // Dentro de una transacción ya capturamos el estado inicial en beginBatch();
    // las ediciones intermedias no apilan, así todo el lote es un solo undo.
    if (this.batchDepth > 0) return;
    const now = performance.now();
    // Coalesce ediciones continuas al mismo destino (arrastrar un slider = 1 paso).
    if (tag && tag === this.lastUndoTag && now - this.lastUndoTime < 700) {
      this.lastUndoTime = now;
      return;
    }
    this.pushHistory();
    this.lastUndoTag = tag;
    this.lastUndoTime = now;
    this.updateUndoState();
  }

  /** Apila el estado ACTUAL como punto de undo y limpia el redo. */
  private pushHistory(): void {
    this.history.push(this.snapshot());
    if (this.history.length > 100) this.history.shift();
    this.future = [];
  }

  /** Abre una transacción de undo: captura un único snapshot; las ediciones
   *  internas (recordUndo) no apilan hasta commitBatch(). Soporta anidamiento. */
  beginBatch(): void {
    if (this.batchDepth === 0) {
      this.pushHistory();
      this.lastUndoTag = '';
      this.updateUndoState();
    }
    this.batchDepth++;
  }
  /** Cierra la transacción abierta por beginBatch(). */
  commitBatch(): void {
    if (this.batchDepth > 0) this.batchDepth--;
  }
  /** Ejecuta `fn` como una sola transacción de undo (commit garantizado). */
  batch<T>(fn: () => T): T {
    this.beginBatch();
    try {
      return fn();
    } finally {
      this.commitBatch();
    }
  }

  private updateUndoState(): void {
    this.canUndo = this.history.length > 0;
    this.canRedo = this.future.length > 0;
  }

  undo(): void {
    if (!this.history.length) return;
    const prev = this.history.pop()!;
    this.future.push(this.snapshot());
    if (this.future.length > 100) this.future.shift();
    this.applyRestored(prev);
    this.updateUndoState();
  }

  redo(): void {
    if (!this.future.length) return;
    const next = this.future.pop()!;
    this.history.push(this.snapshot());
    this.applyRestored(next);
    this.updateUndoState();
  }

  /** Reemplaza el proyecto (undo/redo/abrir/ejemplo) y resincroniza el motor. */
  private applyRestored(p: Project): void {
    this.project = normalize(p);
    for (const code of Object.keys(this.cells)) {
      if (!this.project.states[code]) delete this.cells[code];
    }
    if (!this.selected || !this.project.states[this.selected.code]) {
      const first = Object.keys(this.project.states)[0];
      this.selected = first ? { code: first, kind: this.isImage(first) ? 'image' : 'modifier' } : null;
    }
    if (this.dock && !this.project.states[this.dock.code]) this.closeDock();
    this.lastUndoTag = '';
    this.batchDepth = 0;
    this.lockedSeeds = new Set();
    void this.api?.setStructure(this.snapshot());
    this.pushViewport();
    this.autosave();
  }

  // ---- guardar / abrir / ejemplos ----

  examples(): Example[] {
    return EXAMPLES;
  }
  toggleNotes(): void {
    this.showNotes = !this.showNotes;
  }

  async saveAs(name: string): Promise<void> {
    const n = name.trim();
    if (n) await saveProject(n, this.snapshot());
  }
  /** Guarda rápido bajo el nombre actual del proyecto. */
  async quickSave(): Promise<void> {
    const name = (this.project.name ?? '').trim();
    if (!name) return;
    await saveProject(name, this.snapshot());
    this.toast(`Saved "${name}".`);
  }
  async listSaved(): Promise<SavedMeta[]> {
    return listProjects(['autosave']);
  }
  async openSaved(name: string): Promise<void> {
    const p = await loadProjectByName(name);
    if (!p) return;
    this.recordUndo('');
    this.showNotes = false;
    this.currentExample = null;
    this.applyRestored(p);
  }
  async deleteSaved(name: string): Promise<void> {
    await deleteProject(name);
  }

  loadExample(id: string): void {
    const e = exampleById(id);
    if (!e) return;
    this.recordUndo('');
    this.applyRestored(e.build());
    this.showNotes = true;
    this.currentExample = id;
    if (this.ttsEnabled) this.speak(this.buildNarration());
  }

  /** Empieza un proyecto nuevo en blanco con una banda vacía. */
  newProject(): void {
    this.recordUndo('');
    this.showNotes = false;
    this.currentExample = null;
    this.applyRestored({
      name: generateProjectName(),
      bands: [{ id: 'b1', name: 'Band 1', stops: [] }],
      states: {},
      version: 1,
    });
  }

  // ---- voz (TTS) opcional de las demos ----

  toggleTts(): void {
    this.ttsEnabled = !this.ttsEnabled;
    if (!this.ttsEnabled) this.stopTts();
    else if (this.currentExample) this.replayNarration();
  }
  replayNarration(): void {
    this.speak(this.buildNarration());
  }
  stopTts(): void {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }
  private buildNarration(): string {
    // Solo las notas de los nodos (sin título ni descripción).
    const parts: string[] = [];
    for (const band of this.project.bands) {
      for (const code of band.stops) {
        const n = this.project.states[code]?.note;
        if (n) parts.push(n);
      }
    }
    return parts.join('. ');
  }
  private speak(text: string): void {
    if (typeof speechSynthesis === 'undefined' || !this.ttsEnabled || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1;
    const voice = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('en'));
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  }
  nextExample(): void {
    if (EXAMPLES.length === 0) return;
    const i = EXAMPLES.findIndex((e) => e.id === this.currentExample);
    this.loadExample(EXAMPLES[(i + 1 + EXAMPLES.length) % EXAMPLES.length].id);
  }
  prevExample(): void {
    if (EXAMPLES.length === 0) return;
    const i = EXAMPLES.findIndex((e) => e.id === this.currentExample);
    const ni = i < 0 ? 0 : (i - 1 + EXAMPLES.length) % EXAMPLES.length;
    this.loadExample(EXAMPLES[ni].id);
  }
  exampleIndex(): number {
    return EXAMPLES.findIndex((e) => e.id === this.currentExample);
  }
  exampleCount(): number {
    return EXAMPLES.length;
  }
  currentExampleTitle(): string {
    return exampleById(this.currentExample ?? '')?.title ?? '';
  }
  exitTutorial(): void {
    this.currentExample = null;
    this.showNotes = false;
    this.stopTts();
  }

  exportFile(): void {
    const data = JSON.stringify({ format: 'pencilpattern', version: 1, savedAt: Date.now(), project: this.snapshot() });
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'composition.pencilpattern.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async importFile(): Promise<void> {
    const text = await this.pickTextFile();
    if (text) this.loadProjectFromText(text);
  }

  /** Carga un proyecto desde el texto JSON de un .pencilpattern (file picker o drop). */
  loadProjectFromText(text: string): void {
    try {
      const data = JSON.parse(text);
      const proj = (data?.project ?? data) as Project;
      if (proj && proj.states) {
        this.recordUndo('');
        this.showNotes = false;
        this.currentExample = null;
        this.applyRestored(proj);
      } else {
        this.toast('The file is not a PencilPattern composition.');
      }
    } catch {
      this.toast('Could not read the file.');
    }
  }

  private pickTextFile(): Promise<string | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        const r = new FileReader();
        r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
        r.onerror = () => resolve(null);
        r.readAsText(file);
      };
      input.click();
    });
  }

  // ---- ediciones ----

  setParam(code: string, key: string, value: unknown): void {
    const s = this.project.states[code];
    if (!s) return;
    this.recordUndo(`p:${code}:${key}`);
    s.params[key] = value;
    void this.api?.setParam(code, key, value);
    this.autosave();
  }

  // ---- semillas (seeds) ----

  /** ¿El modificador del nodo expone un parámetro 'seed'? */
  hasSeed(code: string): boolean {
    const s = this.project.states[code];
    if (!s || s.modifierId === 'image') return false;
    return getModifier(s.modifierId).params.some((p) => p.key === 'seed');
  }
  /** Bloquea/desbloquea la semilla de un nodo (el randomize no la tocará). */
  toggleSeedLock(code: string): void {
    if (this.lockedSeeds.has(code)) this.lockedSeeds.delete(code);
    else this.lockedSeeds.add(code);
    // Reasignar para disparar reactividad de Svelte sobre el Set.
    this.lockedSeeds = new Set(this.lockedSeeds);
  }
  isSeedLocked(code: string): boolean {
    return this.lockedSeeds.has(code);
  }
  /** Nº de nodos con semilla que se reasignarían (no bloqueados). */
  randomizableSeedCount(): number {
    return Object.keys(this.project.states).filter((c) => this.hasSeed(c) && !this.lockedSeeds.has(c)).length;
  }
  /** Asigna una semilla nueva a cada generador no bloqueado, en UN solo paso de
   *  undo y una sola sincronización (sin N round-trips). Determinista de cara al
   *  guardado: la semilla queda en params y se persiste con el proyecto. */
  randomizeSeeds(): void {
    const targets = Object.keys(this.project.states).filter((c) => this.hasSeed(c) && !this.lockedSeeds.has(c));
    if (targets.length === 0) {
      this.toast('No generators with a seed to randomize (or all are locked).');
      return;
    }
    this.batch(() => {
      for (const code of targets) {
        const seed = Math.floor(Math.random() * 100); // rango del parámetro (0..100)
        this.setParam(code, 'seed', seed);
      }
    });
    this.toast(`Randomized ${targets.length} seed${targets.length > 1 ? 's' : ''}.`);
  }
  /** Asigna una semilla concreta a un nodo (para reproducir/explorar a mano). */
  setSeed(code: string, seed: number): void {
    if (this.hasSeed(code)) this.setParam(code, 'seed', seed);
  }

  // ---- tileado seamless del proyecto ----

  /** ¿El proyecto está en modo seamless? (por defecto sí). */
  get seamless(): boolean {
    return this.project.seamless !== false;
  }
  /** Activa/desactiva el seamless del proyecto. Al cambiarlo, fuerza el parámetro
   *  «tileable» de TODOS los generadores que lo soporten en un solo paso de undo;
   *  así el tileado es correcto sin que el usuario toque cada nodo. */
  setSeamless(on: boolean): void {
    this.project.seamless = on;
    const targets = Object.keys(this.project.states).filter((c) => hasTileableParam(this.project.states[c].modifierId));
    this.batch(() => {
      for (const code of targets) this.setParam(code, 'tileable', on);
    });
    this.toast(on ? 'Seamless tiling on (generators kept periodic).' : 'Seamless tiling off.');
  }

  // ---- presets de parámetros ----

  /** Presets disponibles para el modificador de un nodo (built-in + usuario). */
  presetsFor(code: string): ParamPreset[] {
    const modId = this.project.states[code]?.modifierId;
    if (!modId) return [];
    return [...(BUILTIN_PRESETS[modId] ?? []), ...(this.userPresets[modId] ?? [])];
  }
  /** Guarda los params actuales del nodo como preset con nombre. */
  savePreset(code: string, name: string): void {
    const s = this.project.states[code];
    const n = name.trim();
    if (!s || !n) return;
    const params = $state.snapshot(s.params) as Record<string, unknown>;
    const list = this.userPresets[s.modifierId] ?? [];
    // Reemplaza si ya existe un preset de usuario con el mismo nombre.
    const next = [...list.filter((p) => p.name !== n), { name: n, params }];
    this.userPresets = { ...this.userPresets, [s.modifierId]: next };
    savePresets(this.userPresets);
    this.toast(`Preset "${n}" saved.`);
  }
  /** Aplica un preset al nodo (solo claves que el modificador tiene), un solo undo. */
  applyPreset(code: string, preset: ParamPreset): void {
    const s = this.project.states[code];
    if (!s) return;
    this.batch(() => {
      for (const [k, v] of Object.entries(preset.params)) {
        if (k in s.params) this.setParam(code, k, v);
      }
    });
  }
  /** Borra un preset de usuario. */
  deletePreset(modifierId: string, name: string): void {
    const list = this.userPresets[modifierId];
    if (!list) return;
    this.userPresets = { ...this.userPresets, [modifierId]: list.filter((p) => p.name !== name) };
    savePresets(this.userPresets);
  }
  isBuiltinPreset(code: string, name: string): boolean {
    const modId = this.project.states[code]?.modifierId ?? '';
    return (BUILTIN_PRESETS[modId] ?? []).some((p) => p.name === name);
  }

  // ---- tema ----

  /** Aplica el tema actual al elemento raíz (data-theme). */
  applyTheme(): void {
    if (typeof document === 'undefined') return;
    if (this.theme === 'dark') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = this.theme;
  }
  setTheme(t: 'dark' | 'light' | 'hc'): void {
    this.theme = t;
    try {
      localStorage.setItem('pp.theme', t);
    } catch {
      /* ignore */
    }
    this.applyTheme();
  }
  /** Cicla dark → light → hc → dark. */
  cycleTheme(): void {
    this.setTheme(this.theme === 'dark' ? 'light' : this.theme === 'light' ? 'hc' : 'dark');
  }

  setAlias(code: string, alias: string): void {
    const s = this.project.states[code];
    if (!s) return;
    this.recordUndo(`a:${code}`);
    s.alias = alias || undefined;
    this.autosave();
  }

  /** Cambia el modificador del nodo conservando la entrada primaria del carril. */
  setModifier(code: string, modifierId: string): void {
    const s = this.project.states[code];
    if (!s) return;
    this.recordUndo();
    const mod = getModifier(modifierId);
    const prev = this.prevStop(code);
    const inputs: string[] = [];
    if (mod.inputArity >= 1 && prev) inputs.push(prev);
    s.modifierId = modifierId;
    s.params = defaultParams(mod);
    s.inputs = inputs.slice(0, mod.inputArity);
    this.syncStructure();
  }

  setInput(code: string, index: number, src: string): void {
    const s = this.project.states[code];
    if (!s) return;
    this.recordUndo();
    const inputs = [...s.inputs];
    inputs[index] = src;
    s.inputs = inputs;
    this.syncStructure();
  }

  /** Intercambia dos entradas (p.ej. base ⇄ extra en un Blend). El orden importa
   *  en modos asimétricos (normal/overlay/subtract) o con opacidad < 1. */
  swapInputs(code: string, i = 0, j = 1): void {
    const s = this.project.states[code];
    if (!s || i === j) return;
    const mod = getModifier(s.modifierId);
    if (mod.inputArity < 2) return;
    this.recordUndo();
    const inputs = [...s.inputs];
    while (inputs.length < mod.inputArity) inputs.push('');
    [inputs[i], inputs[j]] = [inputs[j] ?? '', inputs[i] ?? ''];
    s.inputs = inputs;
    this.syncStructure();
  }

  setResolution(code: string, res: number): void {
    const s = this.project.states[code];
    if (!s) return;
    this.recordUndo();
    s.resolution = res;
    this.syncStructure();
  }

  /** Duplica un nodo: copia profunda de params/inputs/etc., lo inserta justo
   *  después del original en su carril, y lo selecciona. */
  duplicateStop(code: string): void {
    const s = this.project.states[code];
    const band = this.bandOf(code);
    if (!s || !band) return;
    this.recordUndo();
    const copy = $state.snapshot(s) as State;
    const newCode = this.freshCode();
    copy.code = newCode;
    if (copy.alias) copy.alias = `${copy.alias} copy`;
    this.project.states[newCode] = copy;
    const idx = band.stops.indexOf(code);
    band.stops.splice(idx + 1, 0, newCode);
    this.selected = { code: newCode, kind: this.isImage(newCode) ? 'image' : 'modifier' };
    this.syncStructure();
  }

  /** Duplica un carril completo con sus nodos. Las referencias internas se
   *  remapean a los nodos nuevos; las externas (a otras bandas) se conservan. */
  duplicateBand(bandId: string): void {
    const band = this.project.bands.find((b) => b.id === bandId);
    if (!band) return;
    this.recordUndo();
    const remap = new Map<string, string>();
    for (const oldCode of band.stops) {
      if (this.project.states[oldCode]) remap.set(oldCode, this.freshCode());
    }
    const n = this.project.bands.length + 1;
    const newBandId = `b${n}_${Object.keys(this.project.states).length}`;
    const newStops: string[] = [];
    for (const oldCode of band.stops) {
      const src = this.project.states[oldCode];
      if (!src) continue;
      const newCode = remap.get(oldCode)!;
      const copy = $state.snapshot(src) as State;
      copy.code = newCode;
      copy.bandId = newBandId;
      copy.inputs = copy.inputs.map((i) => remap.get(i) ?? i); // remapea internas
      this.project.states[newCode] = copy;
      newStops.push(newCode);
    }
    const idx = this.project.bands.findIndex((b) => b.id === bandId);
    this.project.bands.splice(idx + 1, 0, { id: newBandId, name: `${band.name} copy`, stops: newStops });
    if (newStops[0]) this.selected = { code: newStops[0], kind: this.isImage(newStops[0]) ? 'image' : 'modifier' };
    this.syncStructure();
  }

  /** Guarda los nodos de un carril como plantilla reutilizable (en localStorage).
   *  Los códigos se remapean a t0,t1,… y las entradas que apunten a otra banda se
   *  sueltan (la plantilla es autónoma: solo conserva sus referencias internas). */
  saveLaneAsTemplate(bandId: string, name?: string): void {
    const band = this.project.bands.find((b) => b.id === bandId);
    if (!band) return;
    const stops = band.stops.filter((c) => this.project.states[c]);
    if (stops.length === 0) {
      this.toast('The lane is empty — nothing to save.');
      return;
    }
    const remap = new Map<string, string>();
    stops.forEach((c, i) => remap.set(c, `t${i}`));
    const states: State[] = stops.map((c) => {
      const src = $state.snapshot(this.project.states[c]) as State;
      src.code = remap.get(c)!;
      src.bandId = ''; // se asigna al insertar
      src.inputs = src.inputs.map((i) => remap.get(i) ?? ''); // suelta refs externas
      return src;
    });
    const tname = (name ?? band.name)?.trim() || `Lane ${this.laneTemplates.length + 1}`;
    // reemplaza una plantilla con el mismo nombre, si existe
    this.laneTemplates = [...this.laneTemplates.filter((t) => t.name !== tname), { name: tname, states }];
    saveTemplates(this.laneTemplates);
    this.toast(`Saved lane template "${tname}".`);
  }

  /** Inserta una plantilla como una banda nueva (en un solo paso de undo). */
  insertTemplate(name: string): void {
    const tpl = this.laneTemplates.find((t) => t.name === name);
    if (!tpl || tpl.states.length === 0) return;
    this.recordUndo();
    const remap = new Map<string, string>();
    for (const s of tpl.states) remap.set(s.code, this.freshCode());
    const n = this.project.bands.length + 1;
    const newBandId = `b${n}_${Object.keys(this.project.states).length}`;
    const newStops: string[] = [];
    for (const s of tpl.states) {
      const newCode = remap.get(s.code)!;
      const copy = structuredClone(s) as State;
      copy.code = newCode;
      copy.bandId = newBandId;
      copy.inputs = copy.inputs.map((i) => remap.get(i) ?? '').filter((i) => i !== '');
      this.project.states[newCode] = copy;
      newStops.push(newCode);
    }
    this.project.bands.push({ id: newBandId, name: tpl.name, stops: newStops });
    if (newStops[0]) this.selected = { code: newStops[0], kind: this.isImage(newStops[0]) ? 'image' : 'modifier' };
    this.syncStructure();
    this.toast(`Inserted template "${tpl.name}".`);
  }

  /** Borra una plantilla guardada. */
  deleteTemplate(name: string): void {
    this.laneTemplates = this.laneTemplates.filter((t) => t.name !== name);
    saveTemplates(this.laneTemplates);
  }

  /** Copia los parámetros del nodo a un portapapeles interno. */
  copyParams(code: string): void {
    const s = this.project.states[code];
    if (!s) return;
    this.paramClipboard = { modifierId: s.modifierId, params: $state.snapshot(s.params) as Record<string, unknown> };
    this.toast('Parameters copied.');
  }

  // ---- menú contextual ----

  openContextMenu(x: number, y: number, items: ContextItem[]): void {
    this.contextMenu = { x, y, items };
  }
  closeContextMenu(): void {
    this.contextMenu = null;
  }
  /** Menú para una CAJA (imagen/estado): puro dispatch sobre métodos existentes. */
  cellMenu(code: string): ContextItem[] {
    const items: ContextItem[] = [
      { kind: 'item', label: 'Duplicate', action: () => this.duplicateStop(code) },
      { kind: 'item', label: 'Open viewer', action: () => void this.openViewer(code) },
      { kind: 'item', label: 'Dock visualizer', action: () => void this.dockViewer(code, this.dock?.mode ?? 'x1') },
      { kind: 'sep' },
      { kind: 'item', label: 'Copy parameters', action: () => this.copyParams(code) },
      { kind: 'item', label: 'Paste parameters', action: () => this.pasteParams(code), disabled: !this.canPasteParams(code) },
    ];
    if (this.isImage(code)) {
      items.push(
        { kind: 'sep' },
        { kind: 'item', label: 'Replace image…', action: () => void this.replaceImageFile(code) },
        { kind: 'item', label: 'Paste image', action: () => void this.replaceImagePaste(code) },
      );
    }
    items.push(
      { kind: 'sep' },
      { kind: 'item', label: 'Delete', action: () => this.removeStop(code), danger: true },
    );
    return items;
  }
  /** Menú para un CHIP (modificador). */
  chipMenu(code: string): ContextItem[] {
    const items: ContextItem[] = [
      { kind: 'item', label: 'Duplicate', action: () => this.duplicateStop(code) },
      { kind: 'item', label: 'Copy parameters', action: () => this.copyParams(code) },
      { kind: 'item', label: 'Paste parameters', action: () => this.pasteParams(code), disabled: !this.canPasteParams(code) },
    ];
    const mod = getModifier(this.project.states[code]?.modifierId ?? '');
    if (mod.inputArity >= 2) {
      items.push({ kind: 'item', label: 'Swap inputs', action: () => this.swapInputs(code) });
    }
    items.push(
      { kind: 'sep' },
      { kind: 'item', label: 'Delete', action: () => this.removeStop(code), danger: true },
    );
    return items;
  }
  /** Menú para la cabecera de un CARRIL. */
  laneMenu(bandId: string): ContextItem[] {
    const items: ContextItem[] = [
      { kind: 'item', label: 'Add modifier…', action: () => this.openModifierBrowser(bandId) },
      { kind: 'item', label: 'Upload image…', action: () => void this.addUploadedImage(bandId) },
      { kind: 'item', label: 'Paste image', action: () => void this.addPastedImage(bandId) },
      { kind: 'sep' },
      { kind: 'item', label: 'Duplicate lane', action: () => this.duplicateBand(bandId) },
      { kind: 'item', label: 'Save lane as template', action: () => this.saveLaneAsTemplate(bandId) },
    ];
    // Insertar plantillas guardadas como bandas nuevas.
    for (const t of this.laneTemplates) {
      items.push({ kind: 'item', label: `Insert template: ${t.name}`, action: () => this.insertTemplate(t.name) });
    }
    items.push({ kind: 'sep' });
    items.push({ kind: 'item', label: 'Delete lane', action: () => this.removeBand(bandId), danger: true });
    return items;
  }
  canPasteParams(code: string): boolean {
    return !!this.paramClipboard && !!this.project.states[code];
  }
  /** Pega los parámetros copiados sobre un nodo (en una sola transacción de undo). */
  pasteParams(code: string): void {
    const clip = this.paramClipboard;
    const s = this.project.states[code];
    if (!clip || !s) return;
    this.batch(() => {
      for (const [k, v] of Object.entries(clip.params)) {
        if (k in s.params) this.setParam(code, k, v);
      }
    });
  }

  /** Añade un MODIFICADOR. Si el carril ya tiene nodos y el modificador toma
   *  entrada, su entrada primaria es el último nodo (la textura "corre"). */
  addModifier(bandId: string, modifierId = 'fbm'): void {
    const band = this.project.bands.find((b) => b.id === bandId);
    if (!band) return;
    this.recordUndo();
    const prev = band.stops[band.stops.length - 1];
    const mod = getModifier(modifierId);
    const code = this.freshCode();
    const inputs = mod.inputArity >= 1 && prev ? [prev] : [];
    this.project.states[code] = {
      code,
      bandId,
      modifierId,
      inputs: inputs.slice(0, mod.inputArity),
      params: defaultParams(mod),
      resolution: DEFAULT_RESOLUTION,
    };
    band.stops.push(code);
    this.selected = { code, kind: 'modifier' };
    this.syncStructure();
  }

  /** Abre el browser de modificadores para el carril dado. */
  openModifierBrowser(bandId: string): void {
    this.modifierBrowser = { bandId };
  }
  closeModifierBrowser(): void {
    this.modifierBrowser = null;
  }
  /** Elige un modificador del browser: lo añade al carril y cierra el browser. */
  pickModifier(modifierId: string): void {
    const b = this.modifierBrowser;
    if (!b) return;
    this.addModifier(b.bandId, modifierId);
    this.recordRecentModifier(modifierId);
    this.modifierBrowser = null;
  }
  /** Registra un modificador como usado recientemente (al frente, dedup, máx 8). */
  private recordRecentModifier(id: string): void {
    const next = [id, ...this.recentModifierIds.filter((x) => x !== id)].slice(0, 8);
    this.recentModifierIds = next;
    saveIds('pp.recentMods', next);
  }
  /** Marca/desmarca un modificador como favorito. */
  toggleFavoriteModifier(id: string): void {
    const has = this.favoriteModifierIds.includes(id);
    const next = has ? this.favoriteModifierIds.filter((x) => x !== id) : [...this.favoriteModifierIds, id];
    this.favoriteModifierIds = next;
    saveIds('pp.favMods', next);
  }
  isFavoriteModifier(id: string): boolean {
    return this.favoriteModifierIds.includes(id);
  }

  // ---- imágenes subidas (archivo / portapapeles) ----

  addImageState(bandId: string, src: string): void {
    const band = this.project.bands.find((b) => b.id === bandId);
    if (!band) return;
    this.recordUndo();
    const code = this.freshCode();
    this.project.states[code] = {
      code,
      bandId,
      modifierId: 'image',
      inputs: [],
      params: { src },
      resolution: DEFAULT_RESOLUTION,
    };
    band.stops.push(code);
    this.selected = { code, kind: 'image' };
    this.syncStructure();
  }

  setImageSrc(code: string, src: string): void {
    const s = this.project.states[code];
    if (!s) return;
    this.recordUndo();
    s.params = { ...s.params, src };
    this.syncStructure();
  }

  async addUploadedImage(bandId: string): Promise<void> {
    const src = await this.pickFileDataUrl();
    if (src) this.addImageState(bandId, src);
  }
  async addPastedImage(bandId: string): Promise<void> {
    const src = await this.clipboardDataUrl();
    if (src) this.addImageState(bandId, src);
    else this.toast('No image found in the clipboard (copy an image first).');
  }
  async replaceImageFile(code: string): Promise<void> {
    const src = await this.pickFileDataUrl();
    if (src) this.setImageSrc(code, src);
  }

  /** Arrastrar y soltar: imagen → nuevo nodo imagen en el carril; .pencilpattern → abrir. */
  async handleDrop(bandId: string, files: FileList | File[]): Promise<void> {
    const list = Array.from(files);
    if (!list.length) return;
    const img = list.find((f) => f.type.startsWith('image/'));
    if (img) {
      const src = await this.blobToDataUrl(img);
      if (src) this.addImageState(bandId, src);
      return;
    }
    const json = list.find((f) => f.name.endsWith('.json') || f.name.endsWith('.pencilpattern'));
    if (json) {
      const text = await json.text();
      this.loadProjectFromText(text);
      return;
    }
    this.toast('Drop an image or a .pencilpattern file.');
  }
  /** Soltar una imagen sobre un nodo imagen existente → reemplaza su fuente. */
  async handleDropOnImage(code: string, files: FileList | File[]): Promise<void> {
    const img = Array.from(files).find((f) => f.type.startsWith('image/'));
    if (!img) return;
    const src = await this.blobToDataUrl(img);
    if (src) this.setImageSrc(code, src);
  }
  async replaceImagePaste(code: string): Promise<void> {
    const src = await this.clipboardDataUrl();
    if (src) this.setImageSrc(code, src);
    else this.toast('No image found in the clipboard.');
  }

  private pickFileDataUrl(): Promise<string | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        const r = new FileReader();
        r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
        r.onerror = () => resolve(null);
        r.readAsDataURL(file);
      };
      input.click();
    });
  }

  private async clipboardDataUrl(): Promise<string | null> {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith('image/'));
        if (type) return this.blobToDataUrl(await it.getType(type));
      }
    } catch (e) {
      console.warn('[clipboard]', e);
    }
    return null;
  }

  private blobToDataUrl(blob: Blob): Promise<string | null> {
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  }

  private toast(msg: string): void {
    this.notice = msg;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => (this.notice = null), 4000);
  }

  removeStop(code: string): void {
    this.recordUndo();
    const band = this.bandOf(code);
    if (band) {
      const idx = band.stops.indexOf(code);
      const prev = band.stops[idx - 1];
      const next = band.stops[idx + 1];
      band.stops.splice(idx, 1);
      if (next && this.project.states[next]) {
        const inp = [...this.project.states[next].inputs];
        inp[0] = prev ?? '';
        this.project.states[next].inputs = inp;
      }
    }
    delete this.project.states[code];
    for (const s of Object.values(this.project.states)) {
      s.inputs = s.inputs.map((i) => (i === code ? '' : i));
    }
    this.fixSelection(code);
    this.syncStructure();
  }

  addBand(): void {
    this.recordUndo();
    const n = this.project.bands.length + 1;
    this.project.bands.push({
      id: `b${n}_${Object.keys(this.project.states).length}`,
      name: `Band ${n}`,
      stops: [],
    });
    this.autosave();
  }

  renameProject(name: string): void {
    const n = name.trim();
    this.recordUndo('project:name');
    this.project.name = n || generateProjectName();
    this.autosave();
  }

  renameBand(bandId: string, name: string): void {
    const b = this.project.bands.find((x) => x.id === bandId);
    if (!b) return;
    this.recordUndo(`b:${bandId}`);
    b.name = name;
    this.autosave();
  }

  removeBand(bandId: string): void {
    const band = this.project.bands.find((b) => b.id === bandId);
    if (!band) return;
    this.recordUndo();
    const removed = [...band.stops];
    for (const code of removed) delete this.project.states[code];
    this.project.bands = this.project.bands.filter((b) => b.id !== bandId);
    for (const s of Object.values(this.project.states)) {
      s.inputs = s.inputs.map((i) => (this.project.states[i] ? i : ''));
    }
    for (const code of removed) this.fixSelection(code);
    this.syncStructure();
  }

  private fixSelection(removedCode: string): void {
    if (this.dock?.code === removedCode) this.closeDock();
    if (this.selected?.code !== removedCode) return;
    const first = Object.keys(this.project.states)[0];
    this.selected = first ? { code: first, kind: this.isImage(first) ? 'image' : 'modifier' } : null;
  }

  private freshCode(): string {
    let n = Object.keys(this.project.states).length + 1;
    let code = `s${n}`;
    while (this.project.states[code]) code = `s${++n}`;
    return code;
  }

  /** Restaura el demo y borra la caché (IndexedDB + service worker), luego recarga. */
  async resetDemo(): Promise<void> {
    try {
      await clearProjects();
    } catch {
      /* ignore */
    }
    try {
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      /* ignore */
    }
    location.reload();
  }

  /** Resolución de trabajo del nodo (la elegida en el inspector). */
  resolutionOf(code: string): number {
    return this.project.states[code]?.resolution ?? DEFAULT_RESOLUTION;
  }

  async downloadPng(code: string, res?: number): Promise<void> {
    if (!this.api) return;
    const blob = await this.api.exportPng(code, res ?? this.resolutionOf(code));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.displayName(code)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async exportActive(): Promise<void> {
    if (this.selected) await this.downloadPng(this.selected.code);
  }

  // ---- export por lotes / bundle PBR ----

  private projectSlug(): string {
    return (this.project.name ?? 'texture').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'texture';
  }
  private downloadBlob(name: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /** Exporta varios nodos a PNG (a `res` o su resolución) y los empaqueta en un zip. */
  async exportZip(codes: string[], res?: number): Promise<void> {
    if (!this.api || codes.length === 0) return;
    const zip = new ZipBuilder();
    const used = new Set<string>();
    for (const code of codes) {
      if (!this.project.states[code]) continue;
      try {
        const blob = await this.api.exportPng(code, res ?? this.resolutionOf(code));
        let name = this.displayName(code).replace(/[^a-z0-9]+/gi, '_');
        while (used.has(name)) name += '_';
        used.add(name);
        zip.add(`${name}.png`, await blob.arrayBuffer());
      } catch (e) {
        console.warn('[exportZip]', code, e);
      }
    }
    this.downloadBlob(`${this.projectSlug()}.zip`, zip.blob());
  }

  /** Exporta TODOS los nodos del proyecto a un zip (cola batch). */
  async exportAll(res?: number): Promise<void> {
    await this.exportZip(Object.keys(this.project.states), res);
    this.toast('Exported all nodes to a zip.');
  }

  /** Mapea aliases conocidos a nombres de canal PBR estándar. */
  private pbrChannelFor(code: string): string | null {
    const a = (this.project.states[code]?.alias ?? '').toLowerCase();
    if (!a) return null;
    if (/(basecolor|albedo|base_color|diffuse|color)/.test(a)) return 'BaseColor';
    if (/normal/.test(a)) return 'Normal';
    if (/rough/.test(a)) return 'Roughness';
    if (/metal/.test(a)) return 'Metallic';
    if (/height|disp/.test(a)) return 'Height';
    if (/(ao|occlusion|ambient)/.test(a)) return 'AO';
    return null;
  }
  /** ¿Hay nodos con alias de canal PBR para empaquetar? */
  pbrChannels(): { code: string; channel: string }[] {
    const out: { code: string; channel: string }[] = [];
    const seen = new Set<string>();
    for (const code of Object.keys(this.project.states)) {
      const ch = this.pbrChannelFor(code);
      if (ch && !seen.has(ch)) {
        seen.add(ch);
        out.push({ code, channel: ch });
      }
    }
    return out;
  }
  /** Empaqueta un set PBR a partir de los nodos con alias de canal conocido. */
  async exportPbrBundle(res?: number): Promise<void> {
    if (!this.api) return;
    const channels = this.pbrChannels();
    if (channels.length === 0) {
      this.toast('No PBR channels found. Alias nodes as "albedo", "normal", "roughness"…');
      return;
    }
    const slug = this.projectSlug();
    const zip = new ZipBuilder();
    for (const { code, channel } of channels) {
      try {
        const blob = await this.api.exportPng(code, res ?? this.resolutionOf(code));
        zip.add(`${slug}_${channel}.png`, await blob.arrayBuffer());
      } catch (e) {
        console.warn('[exportPbrBundle]', code, e);
      }
    }
    this.downloadBlob(`${slug}_PBR.zip`, zip.blob());
    this.toast(`Exported PBR bundle (${channels.length} maps).`);
  }

  /** Busca el nodo cuyo canal PBR coincide (AO/Roughness/Metallic) para el packing. */
  private channelCode(channel: string): string | undefined {
    return this.pbrChannels().find((c) => c.channel === channel)?.code;
  }
  /** ¿Hay al menos un nodo de AO / Roughness / Metallic para empaquetar ORM? */
  canPackOrm(): boolean {
    return !!(this.channelCode('AO') || this.channelCode('Roughness') || this.channelCode('Metallic'));
  }
  /** Channel-packing ORM: AO→R, Roughness→G, Metallic→B en un solo PNG.
   *  Usa readPixels (RGBA crudo) y compone por luminancia de cada mapa. */
  async exportOrmPack(res?: number): Promise<void> {
    if (!this.api) return;
    const ao = this.channelCode('AO');
    const rough = this.channelCode('Roughness');
    const metal = this.channelCode('Metallic');
    if (!ao && !rough && !metal) {
      this.toast('No AO / Roughness / Metallic nodes to pack. Alias them accordingly.');
      return;
    }
    const size = res ?? Math.max(this.resolutionOf(ao ?? rough ?? metal!), 64);
    // Lee la luminancia (8-bit) de un canal o, si no existe, un valor por defecto.
    const lumOf = async (code: string | undefined, fallback: number): Promise<Uint8ClampedArray> => {
      const px = new Uint8ClampedArray(size * size);
      if (!code) {
        px.fill(fallback);
        return px;
      }
      const raw = await this.api!.readPixels(code, size);
      const { data, width, height } = raw;
      // Reescala si el render salió a otro tamaño (defensivo).
      for (let i = 0; i < size * size; i++) {
        const x = Math.min(width - 1, Math.floor((i % size) * (width / size)));
        const y = Math.min(height - 1, Math.floor(Math.floor(i / size) * (height / size)));
        const o = (y * width + x) * 4;
        px[i] = Math.round(0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]);
      }
      return px;
    };
    const [r, g, b] = await Promise.all([
      lumOf(ao, 255), // sin AO → blanco (sin oclusión)
      lumOf(rough, 128), // sin roughness → medio
      lumOf(metal, 0), // sin metallic → no metálico
    ]);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      img.data[i * 4] = r[i];
      img.data[i * 4 + 1] = g[i];
      img.data[i * 4 + 2] = b[i];
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) this.downloadBlob(`${this.projectSlug()}_ORM.png`, blob);
    }, 'image/png');
    this.toast('Exported ORM channel-packed map (AO·Rough·Metal → R·G·B).');
  }

  // ---- visor popup ----

  /** Abre el visor: renderiza el nodo a su resolución y crea una URL de imagen. */
  async openViewer(code: string): Promise<void> {
    if (!this.api || !this.project.states[code]) return;
    const size = this.resolutionOf(code);
    const blob = await this.api.exportPng(code, size);
    if (this.viewer) URL.revokeObjectURL(this.viewer.url);
    this.viewer = { code, url: URL.createObjectURL(blob), size };
  }

  closeViewer(): void {
    if (this.viewer) URL.revokeObjectURL(this.viewer.url);
    this.viewer = null;
  }

  /** Abre el visualizador inferior (dock) con un modo. Sin chincheta sigue la
   *  selección; con chincheta se queda fijo en su nodo. Exporta su propia textura. */
  async dockViewer(code: string, mode: string): Promise<void> {
    if (!this.api || !this.project.states[code]) return;
    await this.showDockFor(code, mode, this.dock?.pinned ?? false);
  }
  /** Carga la textura de `code` en el dock (export propio). */
  private async showDockFor(code: string, mode: string, pinned: boolean): Promise<void> {
    if (!this.api || !this.project.states[code]) return;
    const size = this.resolutionOf(code);
    const blob = await this.api.exportPng(code, size);
    if (this.dock?.code === code && this.dock.mode === mode) {
      // mismo nodo/modo: solo refresca la imagen
      URL.revokeObjectURL(this.dock.url);
      this.dock = { ...this.dock, url: URL.createObjectURL(blob), size, pinned };
      return;
    }
    if (this.dock) URL.revokeObjectURL(this.dock.url);
    this.dock = { code, mode, url: URL.createObjectURL(blob), size, pinned };
  }
  /** Alterna la chincheta: fija el dock al nodo actual o lo libera para seguir la selección. */
  toggleDockPin(): void {
    if (!this.dock) return;
    const pinned = !this.dock.pinned;
    this.dock = { ...this.dock, pinned };
    // Al soltar la chincheta, salta de inmediato al nodo seleccionado.
    if (!pinned && this.selected && this.selected.code !== this.dock.code) {
      void this.showDockFor(this.selected.code, this.dock.mode, false);
    }
  }
  /** Si el dock no está fijado, lo hace seguir al nodo `code` (llamado al seleccionar). */
  private followDock(code: string): void {
    if (!this.dock || this.dock.pinned || this.dock.code === code) return;
    if (!this.project.states[code]) return;
    void this.showDockFor(code, this.dock.mode, false);
  }
  /** Cambia solo el modo del visualizador anclado (x2, tile, sphere…). */
  setDockMode(mode: string): void {
    if (this.dock) this.dock = { ...this.dock, mode };
  }
  closeDock(): void {
    if (this.dock) URL.revokeObjectURL(this.dock.url);
    this.dock = null;
  }
  /** Re-exporta la textura del nodo anclado tras recalcularse (actualización en vivo). */
  private async refreshDock(): Promise<void> {
    const d = this.dock;
    if (!this.api || !d || !this.project.states[d.code]) return;
    const blob = await this.api.exportPng(d.code, d.size);
    // El dock pudo cambiar mientras exportábamos.
    if (this.dock?.code !== d.code) return;
    URL.revokeObjectURL(d.url);
    this.dock = { ...this.dock, url: URL.createObjectURL(blob) };
  }
}

export const store = new ProjectStore();
