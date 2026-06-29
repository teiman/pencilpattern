import type { ModifierDef } from '../graph/types';
import { num, flag, enumIndex, pad32 } from './_util';

const TILE: { key: string; label: string; kind: 'bool'; default: boolean } = {
  key: 'tileable',
  label: 'Tileable',
  kind: 'bool',
  default: true,
};

export const fbmNoise: ModifierDef = {
  id: 'fbm',
  name: 'FBM Noise',
  category: 'noise',
  description: 'Layered fractal noise (fractal Brownian motion) that serves as the base for almost any procedural texture; raise Octaves for finer detail.',
  inputArity: 0,
  shaderVersion: 2,
  params: [
    { key: 'scale', label: 'Scale', kind: 'float', min: 1, max: 32, step: 0.1, default: 6 },
    { key: 'octaves', label: 'Octaves', kind: 'int', min: 1, max: 8, step: 1, default: 5 },
    { key: 'lacunarity', label: 'Lacunarity', kind: 'float', min: 1.5, max: 3, step: 0.05, default: 2 },
    { key: 'gain', label: 'Gain', kind: 'float', min: 0.3, max: 0.7, step: 0.01, default: 0.5 },
    { key: 'seed', label: 'Seed', kind: 'float', min: 0, max: 100, step: 1, default: 0 },
    { key: 'contrast', label: 'Contrast', kind: 'float', min: 0, max: 1, step: 0.01, default: 0 },
    TILE,
  ],
  pack: (p) =>
    pad32([num(p, 'scale', 6), num(p, 'octaves', 5), num(p, 'lacunarity', 2), num(p, 'gain', 0.5), num(p, 'seed'), num(p, 'contrast'), flag(p, 'tileable', true)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let uvs = uv + vec2<f32>(P(4) * 0.137, P(4) * 0.071);
  var n = fbmT(uvs, P(0), i32(P(1)), P(2), P(3), P(6));
  n = clamp((n - 0.5) * (1.0 + P(5) * 3.0) + 0.5, 0.0, 1.0);
  return vec4<f32>(vec3<f32>(n), 1.0);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  vec2 uvs = uv + vec2(P(4) * 0.137, P(4) * 0.071);
  float n = fbmT(uvs, P(0), int(P(1)), P(2), P(3), P(6));
  n = clamp((n - 0.5) * (1.0 + P(5) * 3.0) + 0.5, 0.0, 1.0);
  return vec4(vec3(n), 1.0);
}`,
};

export const perlinNoise: ModifierDef = {
  id: 'perlin',
  name: 'Perlin Noise',
  category: 'noise',
  description: 'Smooth gradient noise with optional domain warp that deforms the pattern for a more organic look; good for clouds, marble and flow.',
  inputArity: 0,
  shaderVersion: 2,
  params: [
    { key: 'scale', label: 'Scale', kind: 'float', min: 1, max: 32, step: 0.1, default: 5 },
    { key: 'warp', label: 'Warp', kind: 'float', min: 0, max: 1, step: 0.01, default: 0, help: 'Domain warp: bends the pattern for a more organic, less regular look.' },
    { key: 'seed', label: 'Seed', kind: 'float', min: 0, max: 100, step: 1, default: 0 },
    TILE,
  ],
  pack: (p) => pad32([num(p, 'scale', 5), num(p, 'warp'), num(p, 'seed'), flag(p, 'tileable', true)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let tile = P(3);
  let uvs = uv + vec2<f32>(P(2) * 0.13, P(2) * 0.29);
  let w = P(1) * 0.2;
  let wo = vec2<f32>(perlinT(uvs, P(0), tile) - 0.5, perlinT(uvs + vec2<f32>(5.2, 1.3), P(0), tile) - 0.5);
  return vec4<f32>(vec3<f32>(perlinT(uvs + wo * w, P(0), tile)), 1.0);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  float tile = P(3);
  vec2 uvs = uv + vec2(P(2) * 0.13, P(2) * 0.29);
  float w = P(1) * 0.2;
  vec2 wo = vec2(perlinT(uvs, P(0), tile) - 0.5, perlinT(uvs + vec2(5.2, 1.3), P(0), tile) - 0.5);
  return vec4(vec3(perlinT(uvs + wo * w, P(0), tile)), 1.0);
}`,
};

const WORLEY_MODES = ['F1', 'F2', 'F2-F1'] as const;
export const worleyNoise: ModifierDef = {
  id: 'worley',
  name: 'Worley Noise (cellular)',
  category: 'noise',
  description: 'Cellular (Voronoi) noise; the F2-F1 mode highlights the edges between cells, ideal for scales, cracks and skin.',
  inputArity: 0,
  shaderVersion: 2,
  params: [
    { key: 'scale', label: 'Scale', kind: 'float', min: 1, max: 32, step: 0.1, default: 6 },
    { key: 'jitter', label: 'Jitter', kind: 'float', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'mode', label: 'Mode', kind: 'enum', options: [...WORLEY_MODES], default: 'F1', help: 'F1 = filled cells, F2-F1 = edges between cells (cracks, scales).' },
    { key: 'invert', label: 'Invert', kind: 'bool', default: false },
    { key: 'seed', label: 'Seed', kind: 'float', min: 0, max: 100, step: 1, default: 0 },
    TILE,
  ],
  pack: (p) =>
    pad32([num(p, 'scale', 6), num(p, 'jitter', 1), enumIndex(p, 'mode', WORLEY_MODES, 0), flag(p, 'invert'), num(p, 'seed'), flag(p, 'tileable', true)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let uvs = uv + vec2<f32>(P(4) * 0.21, P(4) * 0.13);
  let w = worleyT(uvs, P(0), P(1), P(5));
  var v = w.x;
  let mode = i32(P(2));
  if (mode == 1) { v = w.y; } else if (mode == 2) { v = w.y - w.x; }
  v = clamp(v, 0.0, 1.0);
  if (P(3) > 0.5) { v = 1.0 - v; }
  return vec4<f32>(vec3<f32>(v), 1.0);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  vec2 uvs = uv + vec2(P(4) * 0.21, P(4) * 0.13);
  vec2 w = worleyT(uvs, P(0), P(1), P(5));
  float v = w.x;
  int mode = int(P(2));
  if (mode == 1) v = w.y; else if (mode == 2) v = w.y - w.x;
  v = clamp(v, 0.0, 1.0);
  if (P(3) > 0.5) v = 1.0 - v;
  return vec4(vec3(v), 1.0);
}`,
};
