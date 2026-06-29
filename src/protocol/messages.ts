// Contrato entre la UI (hilo principal) y el motor (Web Worker, vía Comlink).
// El mismo interfaz se usa si el motor cae al hilo principal (fallback sin worker).
import type { Project } from '../engine/graph/types';
import type { CacheStats } from '../engine/graph/cache';

export type CellStatus = 'clean' | 'dirty' | 'computing' | 'preview' | 'final' | 'error';

export interface CellUpdate {
  code: string;
  status: CellStatus;
  thumb?: ImageBitmap;
  color?: boolean;
  error?: string;
}

export type CellListener = (u: CellUpdate) => void;

/** Pixeles RGBA crudos (8 bits por canal) de un nodo renderizado. */
export interface RawPixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
export type BackendKind = 'webgpu' | 'webgl2' | 'cpu' | 'none';

/** Registro de cada backend intentado en el arranque (para diagnóstico/transparencia). */
export interface BackendAttempt {
  kind: BackendKind;
  ok: boolean;
  error?: string;
}

export interface InitResult {
  backend: BackendKind;
  attempts: BackendAttempt[];
}

export interface EngineAPI {
  /** Prueba backends en orden (WebGPU→WebGL2→CPU) con auto-test; devuelve el activo y el log. */
  init(): Promise<InitResult>;
  loadProject(p: Project): Promise<void>;
  setParam(code: string, key: string, value: unknown): Promise<void>;
  setStructure(p: Project): Promise<void>;
  setViewport(visible: string[], active: string | null): Promise<void>;
  refresh(): Promise<void>;
  exportPng(code: string, res: number): Promise<Blob>;
  /** Devuelve los pixeles RGBA crudos de un nodo (para channel-packing / análisis). */
  readPixels(code: string, res: number): Promise<RawPixels>;
  onCell(listener: CellListener): Promise<void>;
  stats(): Promise<CacheStats>;
  dispose(): Promise<void>;
}

export type { CacheStats };
