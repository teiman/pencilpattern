import type { ModifierDef } from '../graph/types';
import { num, flag, enumIndex, pad32 } from './_util';

const GRADIENT_SHAPES = ['Linear', 'Radial', 'Angular', 'Diamond'] as const;

// Generador de gradiente/forma paramétrico (no ruido). Base para máscaras,
// viñetas, rampas de altura y compositing con mask-blend.
export const gradientShape: ModifierDef = {
  id: 'gradient-shape',
  name: 'Gradient / Shape',
  category: 'noise',
  description: 'Generates a clean gradient or shape (linear, radial, angular, diamond) as a grayscale map; ideal as a mask or a height ramp.',
  inputArity: 0,
  shaderVersion: 1,
  params: [
    { key: 'shape', label: 'Shape', kind: 'enum', options: [...GRADIENT_SHAPES], default: 'Linear', help: 'Linear ramp, radial/diamond falloff, or angular sweep around the center.' },
    { key: 'angle', label: 'Angle', kind: 'float', min: 0, max: 6.2832, step: 0.01, default: 0, help: 'Direction of the linear/angular gradient, in radians.' },
    { key: 'scale', label: 'Scale', kind: 'float', min: 0.1, max: 4, step: 0.01, default: 1, help: 'Size of the radial/diamond shape.' },
    { key: 'invert', label: 'Invert', kind: 'bool', default: false },
  ],
  pack: (p) => pad32([enumIndex(p, 'shape', GRADIENT_SHAPES, 0), num(p, 'angle', 0), num(p, 'scale', 1), flag(p, 'invert')]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let shape = i32(P(0));
  let c = uv - vec2<f32>(0.5);
  var v = 0.0;
  if (shape == 0) {
    let dir = vec2<f32>(cos(P(1)), sin(P(1)));
    v = dot(uv - vec2<f32>(0.5), dir) + 0.5;
  } else if (shape == 1) {
    v = clamp(length(c) * 2.0 / max(P(2), 1e-3), 0.0, 1.0);
  } else if (shape == 2) {
    v = fract((atan2(c.y, c.x) - P(1)) / 6.2831853 + 1.0);
  } else {
    v = clamp((abs(c.x) + abs(c.y)) * 2.0 / max(P(2), 1e-3), 0.0, 1.0);
  }
  v = clamp(v, 0.0, 1.0);
  if (P(3) > 0.5) { v = 1.0 - v; }
  return vec4<f32>(vec3<f32>(v), 1.0);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  int shape = int(P(0));
  vec2 c = uv - vec2(0.5);
  float v = 0.0;
  if (shape == 0) {
    vec2 dir = vec2(cos(P(1)), sin(P(1)));
    v = dot(uv - vec2(0.5), dir) + 0.5;
  } else if (shape == 1) {
    v = clamp(length(c) * 2.0 / max(P(2), 1e-3), 0.0, 1.0);
  } else if (shape == 2) {
    v = fract((atan(c.y, c.x) - P(1)) / 6.2831853 + 1.0);
  } else {
    v = clamp((abs(c.x) + abs(c.y)) * 2.0 / max(P(2), 1e-3), 0.0, 1.0);
  }
  v = clamp(v, 0.0, 1.0);
  if (P(3) > 0.5) v = 1.0 - v;
  return vec4(vec3(v), 1.0);
}`,
};

// Patrón de ladrillo/baldosa paramétrico (no ruido). Tilea de forma nativa por
// construcción (todo es fract sobre la rejilla → periódico).
export const brick: ModifierDef = {
  id: 'brick',
  name: 'Brick / Tile',
  category: 'noise',
  description: 'Parametric brick or tile pattern with adjustable counts, mortar gap and row offset; tiles seamlessly by construction.',
  inputArity: 0,
  shaderVersion: 1,
  params: [
    { key: 'cols', label: 'Columns', kind: 'float', min: 1, max: 32, step: 1, default: 6 },
    { key: 'rows', label: 'Rows', kind: 'float', min: 1, max: 32, step: 1, default: 12 },
    { key: 'mortar', label: 'Mortar', kind: 'float', min: 0, max: 0.4, step: 0.005, default: 0.08, help: 'Width of the gap between bricks.' },
    { key: 'offset', label: 'Row offset', kind: 'float', min: 0, max: 1, step: 0.01, default: 0.5, help: 'How far each row is shifted (0.5 = running bond).' },
    { key: 'bevel', label: 'Bevel', kind: 'float', min: 0, max: 0.5, step: 0.005, default: 0.06, help: 'Softness of the brick edges (relief for a height map).' },
  ],
  pack: (p) => pad32([num(p, 'cols', 6), num(p, 'rows', 12), num(p, 'mortar', 0.08), num(p, 'offset', 0.5), num(p, 'bevel', 0.06)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let rows = max(P(1), 1.0);
  let ry = uv.y * rows;
  let row = floor(ry);
  let shift = (row % 2.0) * P(3);
  let cols = max(P(0), 1.0);
  let cx = fract(uv.x * cols + shift);
  let cy = fract(ry);
  let m = P(2);
  let bv = max(P(4), 1e-4);
  let dx = min(smoothstep(0.0, bv, cx - m * 0.5), smoothstep(0.0, bv, 1.0 - m * 0.5 - cx));
  let dy = min(smoothstep(0.0, bv, cy - m * 0.5), smoothstep(0.0, bv, 1.0 - m * 0.5 - cy));
  let v = min(dx, dy);
  return vec4<f32>(vec3<f32>(v), 1.0);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  float rows = max(P(1), 1.0);
  float ry = uv.y * rows;
  float row = floor(ry);
  float shift = mod(row, 2.0) * P(3);
  float cols = max(P(0), 1.0);
  float cx = fract(uv.x * cols + shift);
  float cy = fract(ry);
  float m = P(2);
  float bv = max(P(4), 1e-4);
  float dx = min(smoothstep(0.0, bv, cx - m * 0.5), smoothstep(0.0, bv, 1.0 - m * 0.5 - cx));
  float dy = min(smoothstep(0.0, bv, cy - m * 0.5), smoothstep(0.0, bv, 1.0 - m * 0.5 - cy));
  float v = min(dx, dy);
  return vec4(vec3(v), 1.0);
}`,
};
