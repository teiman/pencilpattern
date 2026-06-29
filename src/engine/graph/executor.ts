// Executor: ejecuta UN nodo. Interfaz intercambiable para permitir, en el futuro,
// un RemoteExecutor (servidor) sin tocar la lógica del DAG/scheduler.
import type { State } from './types';
import type { GpuBackend, GpuTexture } from '../gpu/types';
import { getModifier } from '../modifiers/registry';

export interface Executor {
  run(node: State, inputs: GpuTexture[], res: number, signal: AbortSignal): Promise<GpuTexture>;
}

export class LocalGpuExecutor implements Executor {
  constructor(private backend: GpuBackend) {}

  run(node: State, inputs: GpuTexture[], res: number): Promise<GpuTexture> {
    const mod = getModifier(node.modifierId);
    if (mod.imageSource) {
      return this.backend.imageToTexture(String(node.params['src'] ?? ''), res);
    }
    return Promise.resolve(this.backend.renderModifier(mod, node.params, inputs, res));
  }
}
