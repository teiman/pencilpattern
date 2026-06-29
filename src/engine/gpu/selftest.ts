import type { ModifierDef } from '../graph/types';

// Modificador de prueba que USA el preludio real (struct U, P(), PASS()): si el
// preludio no compila (p.ej. un nombre reservado), el auto-test falla y el backend
// se descarta -> entra el fallback en vez de quedarse en negro.
export const SMOKE_MOD: ModifierDef = {
  id: '__smoke',
  name: 'smoke',
  category: 'noise',
  inputArity: 0,
  shaderVersion: 1,
  params: [],
  pack: () => [],
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(uv.x, uv.y, 0.5 + PASS() * 0.0 + P(0) * 0.0, 1.0);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  return vec4(uv.x, uv.y, 0.5 + PASS() * 0.0 + P(0) * 0.0, 1.0);
}`,
};

// Heurística de auto-test: ¿el backend ha renderizado algo real (no negro/vacío)?
// Se ejecuta sobre los píxeles de un degradado conocido tras un render+readback.
export function looksRendered(rgba: Uint8ClampedArray): boolean {
  if (rgba.length === 0) return false;
  let min = 255;
  let max = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    if (r < min) min = r;
    if (r > max) max = r;
  }
  // Debe haber brillo y variación (un degradado): descarta "todo negro" y "plano".
  return max > 12 && max - min > 8;
}
