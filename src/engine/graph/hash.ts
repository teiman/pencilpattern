// Hashing canónico, rápido y síncrono (FNV-1a 32-bit) para claves de caché.
// No es criptográfico: solo necesitamos baja colisión y determinismo.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function hashString(str: string, seed = FNV_OFFSET): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

/** Combina varios números en un hash (orden significativo). */
export function hashNumbers(nums: readonly number[], seed = FNV_OFFSET): number {
  let h = seed >>> 0;
  const buf = new ArrayBuffer(4);
  const f = new Float32Array(buf);
  const u = new Uint32Array(buf);
  for (let i = 0; i < nums.length; i++) {
    f[0] = nums[i];
    h ^= u[0];
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
}

export function toHex(h: number): string {
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Hash de un array de floats devuelto como hex (clave de parámetros). */
export function hashParams(packed: readonly number[]): string {
  return toHex(hashNumbers(packed));
}
