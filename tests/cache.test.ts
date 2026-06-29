import { describe, it, expect } from 'vitest';
import { TextureCache } from '../src/engine/graph/cache';
import type { GpuTexture } from '../src/engine/gpu/types';

function tex(bytes: number): GpuTexture & { destroyed: boolean } {
  return {
    width: 1,
    height: 1,
    bytes,
    destroyed: false,
    destroy() {
      this.destroyed = true;
    },
  };
}

describe('TextureCache', () => {
  it('almacena y recupera', () => {
    const c = new TextureCache(1000);
    const t = tex(100);
    c.set('k', t);
    expect(c.get('k')).toBe(t);
    expect(c.stats().hits).toBe(1);
  });

  it('cuenta misses', () => {
    const c = new TextureCache(1000);
    expect(c.get('nope')).toBeUndefined();
    expect(c.stats().misses).toBe(1);
  });

  it('trim desaloja por LRU bajo presupuesto', () => {
    const c = new TextureCache(250);
    const a = tex(100);
    const b = tex(100);
    const d = tex(100);
    c.set('a', a);
    c.set('b', b);
    c.set('d', d); // 300 > 250
    c.get('b'); // 'b' pasa a ser el más reciente
    c.trim();
    // 'a' (más frío) debe haberse desalojado primero
    expect(a.destroyed).toBe(true);
    expect(c.has('b')).toBe(true);
    expect(c.stats().bytes).toBeLessThanOrEqual(250);
  });

  it('keep evita desalojar claves protegidas', () => {
    const c = new TextureCache(150);
    const a = tex(100);
    const b = tex(100);
    c.set('a', a);
    c.set('b', b);
    c.trim(new Set(['a']));
    expect(a.destroyed).toBe(false);
    expect(c.has('b')).toBe(false);
  });

  it('reemplazar una clave destruye la textura previa', () => {
    const c = new TextureCache(1000);
    const a = tex(100);
    const a2 = tex(100);
    c.set('k', a);
    c.set('k', a2);
    expect(a.destroyed).toBe(true);
    expect(c.get('k')).toBe(a2);
  });
});
