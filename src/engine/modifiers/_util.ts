// Utilidades para empaquetar parámetros en los 32 floats de `u.p[0..7]`.
export function num(p: Record<string, unknown>, k: string, d = 0): number {
  const v = p[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

export function flag(p: Record<string, unknown>, k: string, d = false): number {
  const v = p[k];
  return (typeof v === 'boolean' ? v : d) ? 1 : 0;
}

export function enumIndex(
  p: Record<string, unknown>,
  k: string,
  options: readonly string[],
  d = 0,
): number {
  const v = p[k];
  const i = typeof v === 'string' ? options.indexOf(v) : -1;
  return i >= 0 ? i : d;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function color(p: Record<string, unknown>, k: string, d = '#000000'): [number, number, number] {
  const v = p[k];
  return hexToRgb(typeof v === 'string' ? v : d);
}

export function curve(
  p: Record<string, unknown>,
  k: string,
  d: number[] = [0, 0.25, 0.5, 0.75, 1],
): number[] {
  const v = p[k];
  if (Array.isArray(v) && v.length === 5 && v.every((x) => typeof x === 'number')) {
    return v as number[];
  }
  return d;
}

export function pad32(vals: number[]): number[] {
  const a = vals.slice(0, 32);
  while (a.length < 32) a.push(0);
  return a;
}
