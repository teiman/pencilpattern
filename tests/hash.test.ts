import { describe, it, expect } from 'vitest';
import { hashString, hashNumbers, hashParams, toHex } from '../src/engine/graph/hash';

describe('hash', () => {
  it('es determinista para strings', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });

  it('hashNumbers depende del orden', () => {
    expect(hashNumbers([1, 2, 3])).not.toBe(hashNumbers([3, 2, 1]));
    expect(hashNumbers([1, 2, 3])).toBe(hashNumbers([1, 2, 3]));
  });

  it('hashParams devuelve hex de 8 dígitos', () => {
    const h = hashParams([0.5, 1, 2]);
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });

  it('toHex rellena a 8', () => {
    expect(toHex(0xff)).toBe('000000ff');
  });
});
