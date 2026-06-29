import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../src/engine/graph/scheduler';
import { TextureCache } from '../src/engine/graph/cache';
import type { Executor } from '../src/engine/graph/executor';
import type { GpuBackend, GpuTexture } from '../src/engine/gpu/types';
import type { State, Project } from '../src/engine/graph/types';
import { defaultParams } from '../src/engine/graph/types';
import { getModifier } from '../src/engine/modifiers/registry';

function fakeTex(): GpuTexture {
  return { width: 1, height: 1, bytes: 4, destroy() {} };
}

// Executor falso: cuenta cuántas veces se calcula cada nodo.
class CountingExecutor implements Executor {
  counts = new Map<string, number>();
  run(node: State): Promise<GpuTexture> {
    this.counts.set(node.code, (this.counts.get(node.code) ?? 0) + 1);
    return Promise.resolve(fakeTex());
  }
}

const fakeBackend: GpuBackend = {
  kind: 'webgpu',
  renderModifier: async () => fakeTex(),
  imageToTexture: async () => fakeTex(),
  toImageBitmap: async () => ({}) as unknown as ImageBitmap,
  readPixels: async () => new Uint8ClampedArray(4),
  destroy() {},
};

function mk(code: string, modId: string, inputs: string[]): State {
  return { code, bandId: 'b', modifierId: modId, inputs, params: defaultParams(getModifier(modId)) };
}
function chainProject(): Project {
  const states = [mk('a', 'fbm', []), mk('b', 'levels', ['a']), mk('c', 'invert', ['b'])];
  const byCode: Record<string, State> = {};
  for (const s of states) byCode[s.code] = s;
  return { bands: [{ id: 'b', name: 'b', stops: states.map((s) => s.code) }], states: byCode, version: 1 };
}

describe('Scheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calcula la cadena y cachea (cascada solo aguas abajo)', async () => {
    const exec = new CountingExecutor();
    const sch = new Scheduler(fakeBackend, exec, new TextureCache(1e9));
    sch.setProject(chainProject());
    await vi.runAllTimersAsync();

    // Cada nodo se calcula a 2 resoluciones (preview+final).
    expect(exec.counts.get('a')).toBe(2);
    expect(exec.counts.get('b')).toBe(2);
    expect(exec.counts.get('c')).toBe(2);

    // Editar 'b' invalida b y c, pero NO 'a' (cache hit).
    sch.setParam('b', 'gamma', 1.5);
    await vi.runAllTimersAsync();

    expect(exec.counts.get('a')).toBe(2); // sin recálculo
    expect(exec.counts.get('b')).toBe(4); // +2
    expect(exec.counts.get('c')).toBe(4); // +2
  });

  it('un cambio sin efecto reusa la caché completa', async () => {
    const exec = new CountingExecutor();
    const sch = new Scheduler(fakeBackend, exec, new TextureCache(1e9));
    sch.setProject(chainProject());
    await vi.runAllTimersAsync();
    const before = exec.counts.get('c');

    // Re-set del mismo valor por defecto -> misma clave -> sin recálculo de c.
    sch.refresh();
    await vi.runAllTimersAsync();
    expect(exec.counts.get('c')).toBe(before);
  });
});
