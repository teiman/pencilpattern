import type { ModifierDef } from '../graph/types';

/** Textura opaca gestionada por un backend concreto (WebGPU, WebGL2 o CPU). */
export interface GpuTexture {
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  destroy(): void;
}

/**
 * Abstracción de cómputo. El DAG/scheduler son agnósticos del backend; solo
 * hablan con esta interfaz. Permite añadir un RemoteExecutor (servidor) en el
 * futuro sin tocar la lógica del grafo.
 */
export interface GpuBackend {
  readonly kind: 'webgpu' | 'webgl2' | 'cpu';
  /** Renderiza un modificador (1+ pasadas) a una textura nueva de res×res. */
  renderModifier(
    mod: ModifierDef,
    params: Record<string, unknown>,
    inputs: GpuTexture[],
    res: number,
  ): Promise<GpuTexture>;
  /** Sube una imagen (dataURL) como textura res×res. Si falla/vacío, gris (nunca negro). */
  imageToTexture(src: string, res: number): Promise<GpuTexture>;
  /** Convierte una textura en ImageBitmap (re-escalado a `size`) para thumbnails/viewport. */
  toImageBitmap(tex: GpuTexture, size: number): Promise<ImageBitmap>;
  /** Lee los píxeles RGBA8 (para export PNG y auto-test). */
  readPixels(tex: GpuTexture): Promise<Uint8ClampedArray>;
  destroy(): void;
}

/** Resultado de intentar crear un backend (con motivo de fallo para diagnóstico). */
export type CreateResult = { ok: true; backend: GpuBackend } | { ok: false; error: string };
