import { describe, it, expect } from 'vitest';
import { topoOrder, descendants, requiredClosure, childrenOf, CycleError } from '../src/engine/graph/dag';
import type { Project, State } from '../src/engine/graph/types';

function st(code: string, inputs: string[]): State {
  return { code, bandId: 'b', modifierId: 'fbm', inputs, params: {} };
}
function proj(states: State[]): Project {
  const byCode: Record<string, State> = {};
  for (const s of states) byCode[s.code] = s;
  return { bands: [{ id: 'b', name: 'b', stops: states.map((s) => s.code) }], states: byCode, version: 1 };
}

describe('dag', () => {
  // a -> b -> c, y a -> c (multi-input)
  const p = proj([st('a', []), st('b', ['a']), st('c', ['b', 'a'])]);

  it('orden topológico respeta dependencias', () => {
    const order = topoOrder(p);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });

  it('childrenOf', () => {
    expect(childrenOf(p, 'a').sort()).toEqual(['b', 'c']);
  });

  it('descendants en cascada', () => {
    expect([...descendants(p, 'a')].sort()).toEqual(['b', 'c']);
    expect([...descendants(p, 'b')]).toEqual(['c']);
    expect([...descendants(p, 'c')]).toEqual([]);
  });

  it('requiredClosure de c incluye a,b,c en orden', () => {
    const c = requiredClosure(p, 'c');
    expect(c).toContain('a');
    expect(c).toContain('b');
    expect(c[c.length - 1]).toBe('c');
  });

  it('detecta ciclos', () => {
    const cyc = proj([st('x', ['y']), st('y', ['x'])]);
    expect(() => topoOrder(cyc)).toThrow(CycleError);
  });

  it('ignora entradas colgantes', () => {
    const dangling = proj([st('a', ['ghost'])]);
    expect(topoOrder(dangling)).toEqual(['a']);
  });
});
