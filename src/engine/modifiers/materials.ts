import type { ModifierDef, ParamSpec } from '../graph/types';
import { num, flag, pad32 } from './_util';

const TILE: ParamSpec = { key: 'tileable', label: 'Tileable', kind: 'bool', default: true };

export const wood: ModifierDef = {
  id: 'wood',
  name: 'Wood',
  category: 'material',
  description: 'Procedural wood grain with concentric rings; use Warp to make the rings wavy instead of straight for a natural board look.',
  inputArity: 0,
  shaderVersion: 2,
  params: [
    { key: 'grain', label: 'Grain (X)', kind: 'float', min: 1, max: 24, step: 0.1, default: 8 },
    { key: 'rings', label: 'Rings', kind: 'float', min: 1, max: 24, step: 0.1, default: 6, help: 'Number of grain rings across the texture.' },
    { key: 'warp', label: 'Warp', kind: 'float', min: 0, max: 1, step: 0.01, default: 0.4, help: 'Makes the rings wavy instead of straight.' },
    { key: 'seed', label: 'Seed', kind: 'float', min: 0, max: 100, step: 1, default: 0 },
    TILE,
  ],
  pack: (p) => pad32([num(p, 'grain', 8), num(p, 'rings', 6), num(p, 'warp', 0.4), num(p, 'seed'), flag(p, 'tileable', true)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let tile = P(4);
  let uvs = uv + vec2<f32>(P(3) * 0.13, P(3) * 0.27);
  let grain = select(P(0), max(floor(P(0) + 0.5), 1.0), tile > 0.5);
  let ringn = select(P(1), max(floor(P(1) + 0.5), 1.0), tile > 0.5);
  let wf = vec2<f32>(fbmT(uvs, 3.0, 4, 2.0, 0.5, tile) - 0.5, fbmT(uvs + vec2<f32>(7.3, 2.1), 3.0, 4, 2.0, 0.5, tile) - 0.5);
  let px = uvs.x * grain + wf.x * P(2) * 0.12;
  let rings = fract(px * ringn + (fbmT(uvs, 4.0, 3, 2.0, 0.5, tile) - 0.5) * 2.0);
  let g = 0.35 + 0.6 * abs(rings * 2.0 - 1.0);
  return vec4<f32>(vec3<f32>(clamp(g, 0.0, 1.0)), 1.0);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  float tile = P(4);
  vec2 uvs = uv + vec2(P(3) * 0.13, P(3) * 0.27);
  float grain = tile > 0.5 ? max(floor(P(0) + 0.5), 1.0) : P(0);
  float ringn = tile > 0.5 ? max(floor(P(1) + 0.5), 1.0) : P(1);
  vec2 wf = vec2(fbmT(uvs, 3.0, 4, 2.0, 0.5, tile) - 0.5, fbmT(uvs + vec2(7.3, 2.1), 3.0, 4, 2.0, 0.5, tile) - 0.5);
  float px = uvs.x * grain + wf.x * P(2) * 0.12;
  float rings = fract(px * ringn + (fbmT(uvs, 4.0, 3, 2.0, 0.5, tile) - 0.5) * 2.0);
  float g = 0.35 + 0.6 * abs(rings * 2.0 - 1.0);
  return vec4(vec3(clamp(g, 0.0, 1.0)), 1.0);
}`,
};

export const corrosion: ModifierDef = {
  id: 'corrosion',
  name: 'Rust / corrosion',
  category: 'material',
  description: 'Patchy rust and oxidation breaking up a metal surface; Coverage controls how much of the surface corrodes.',
  inputArity: 0,
  shaderVersion: 2,
  params: [
    { key: 'scale', label: 'Scale', kind: 'float', min: 1, max: 24, step: 0.1, default: 5 },
    { key: 'coverage', label: 'Coverage', kind: 'float', min: 0, max: 1, step: 0.01, default: 0.5, help: 'How much of the surface is covered by rust.' },
    { key: 'seed', label: 'Seed', kind: 'float', min: 0, max: 100, step: 1, default: 0 },
    TILE,
  ],
  pack: (p) => pad32([num(p, 'scale', 5), num(p, 'coverage', 0.5), num(p, 'seed'), flag(p, 'tileable', true)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let tile = P(3);
  let uvs = uv + vec2<f32>(P(2) * 0.17, P(2) * 0.07);
  let base = fbmT(uvs, P(0), 6, 2.0, 0.55, tile);
  let spots = fbmT(uvs + vec2<f32>(2.3, 5.1), P(0) * 2.0, 5, 2.0, 0.5, tile);
  let m = smoothstep(1.0 - P(1), 1.0 - P(1) + 0.25, base * 0.6 + spots * 0.6);
  let detail = fbmT(uvs, P(0) * 4.0, 4, 2.0, 0.5, tile);
  return vec4<f32>(vec3<f32>(clamp(m * (0.6 + 0.4 * detail), 0.0, 1.0)), 1.0);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  float tile = P(3);
  vec2 uvs = uv + vec2(P(2) * 0.17, P(2) * 0.07);
  float base = fbmT(uvs, P(0), 6, 2.0, 0.55, tile);
  float spots = fbmT(uvs + vec2(2.3, 5.1), P(0) * 2.0, 5, 2.0, 0.5, tile);
  float m = smoothstep(1.0 - P(1), 1.0 - P(1) + 0.25, base * 0.6 + spots * 0.6);
  float detail = fbmT(uvs, P(0) * 4.0, 4, 2.0, 0.5, tile);
  return vec4(vec3(clamp(m * (0.6 + 0.4 * detail), 0.0, 1.0)), 1.0);
}`,
};

export const crystal: ModifierDef = {
  id: 'crystal',
  name: 'Crystal / facets',
  category: 'material',
  description: 'Faceted, gem-like cells derived from Worley noise; raise Edge sharpness to harden the borders between facets.',
  inputArity: 0,
  shaderVersion: 2,
  params: [
    { key: 'scale', label: 'Scale', kind: 'float', min: 1, max: 24, step: 0.1, default: 5 },
    { key: 'jitter', label: 'Jitter', kind: 'float', min: 0, max: 1, step: 0.01, default: 0.9 },
    { key: 'sharp', label: 'Edge sharpness', kind: 'float', min: 0, max: 1, step: 0.01, default: 0.5, help: 'Sharpens the borders between facets.' },
    { key: 'seed', label: 'Seed', kind: 'float', min: 0, max: 100, step: 1, default: 0 },
    TILE,
  ],
  pack: (p) => pad32([num(p, 'scale', 5), num(p, 'jitter', 0.9), num(p, 'sharp', 0.5), num(p, 'seed'), flag(p, 'tileable', true)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let tile = P(4);
  let uvs = uv + vec2<f32>(P(3) * 0.19, P(3) * 0.11);
  let w = worleyT(uvs, P(0), P(1), tile);
  let edge = smoothstep(0.0, 0.08 + 0.3 * (1.0 - P(2)), w.y - w.x);
  let v = mix(1.0, w.x, 0.6) * mix(0.45, 1.0, edge);
  return vec4<f32>(vec3<f32>(clamp(v, 0.0, 1.0)), 1.0);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  float tile = P(4);
  vec2 uvs = uv + vec2(P(3) * 0.19, P(3) * 0.11);
  vec2 w = worleyT(uvs, P(0), P(1), tile);
  float edge = smoothstep(0.0, 0.08 + 0.3 * (1.0 - P(2)), w.y - w.x);
  float v = mix(1.0, w.x, 0.6) * mix(0.45, 1.0, edge);
  return vec4(vec3(clamp(v, 0.0, 1.0)), 1.0);
}`,
};

export const fabric: ModifierDef = {
  id: 'fabric',
  name: 'Fabric / wool',
  category: 'material',
  description: 'Woven cloth with interlaced warp and weft threads; Threads sets the weave density and Fuzz adds fine fibre noise.',
  inputArity: 0,
  shaderVersion: 2,
  params: [
    { key: 'scale', label: 'Threads', kind: 'float', min: 4, max: 64, step: 1, default: 24, help: 'Weave density: number of threads across the texture.' },
    { key: 'variation', label: 'Variation', kind: 'float', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'fuzz', label: 'Fuzz', kind: 'float', min: 0, max: 1, step: 0.01, default: 0.3, help: 'Adds fine fibre noise on top of the weave.' },
    { key: 'seed', label: 'Seed', kind: 'float', min: 0, max: 100, step: 1, default: 0 },
    TILE,
  ],
  pack: (p) => pad32([num(p, 'scale', 24), num(p, 'variation', 0.5), num(p, 'fuzz', 0.3), num(p, 'seed'), flag(p, 'tileable', true)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let tile = P(4);
  let s = select(P(0), max(floor(P(0) * 0.5 + 0.5) * 2.0, 2.0), tile > 0.5);
  let uvs = uv + vec2<f32>(P(3) * 0.05, P(3) * 0.05);
  let g = uvs * s;
  let cell = floor(g);
  let f = fract(g);
  let warpV = abs(sin(f.x * 3.14159));
  let weftV = abs(sin(f.y * 3.14159));
  let over = step(0.5, fract((cell.x + cell.y) * 0.5));
  var v = mix(weftV, warpV, over);
  v = mix(v, v * (0.7 + 0.3 * hash21(modp2(cell, s))), P(1));
  v = clamp(v + P(2) * (fbmT(uvs, 4.0, 3, 2.0, 0.5, tile) - 0.5), 0.0, 1.0);
  return vec4<f32>(vec3<f32>(v), 1.0);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  float tile = P(4);
  float s = tile > 0.5 ? max(floor(P(0) * 0.5 + 0.5) * 2.0, 2.0) : P(0);
  vec2 uvs = uv + vec2(P(3) * 0.05, P(3) * 0.05);
  vec2 g = uvs * s;
  vec2 cell = floor(g);
  vec2 f = fract(g);
  float warpV = abs(sin(f.x * 3.14159));
  float weftV = abs(sin(f.y * 3.14159));
  float over = step(0.5, fract((cell.x + cell.y) * 0.5));
  float v = mix(weftV, warpV, over);
  v = mix(v, v * (0.7 + 0.3 * hash21(modp2(cell, s))), P(1));
  v = clamp(v + P(2) * (fbmT(uvs, 4.0, 3, 2.0, 0.5, tile) - 0.5), 0.0, 1.0);
  return vec4(vec3(v), 1.0);
}`,
};

export const brushedMetal: ModifierDef = {
  id: 'brushed-metal',
  name: 'Brushed metal',
  category: 'material',
  description: 'Strongly anisotropic noise that reads as horizontal brushing streaks on metal; Anisotropy stretches the streaks.',
  inputArity: 0,
  shaderVersion: 2,
  params: [
    { key: 'scale', label: 'Scale', kind: 'float', min: 20, max: 400, step: 1, default: 200 },
    { key: 'anisotropy', label: 'Anisotropy', kind: 'float', min: 0, max: 0.99, step: 0.01, default: 0.95, help: 'Stretches the noise into horizontal streaks.' },
    { key: 'seed', label: 'Seed', kind: 'float', min: 0, max: 100, step: 1, default: 0 },
    TILE,
  ],
  pack: (p) => pad32([num(p, 'scale', 200), num(p, 'anisotropy', 0.95), num(p, 'seed'), flag(p, 'tileable', true)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let tile = P(3);
  let uvs = uv + vec2<f32>(P(2) * 0.03, 0.0);
  let fx = max(floor(P(0) + 0.5), 1.0);
  let fy = max(floor(P(0) * (1.0 - P(1)) + 0.5), 1.0);
  var n = 0.0;
  var streak = 0.0;
  if (tile > 0.5) {
    n = vnoiseP2(uvs * vec2<f32>(fx, fy), vec2<f32>(fx, fy));
    streak = vnoiseP2(uvs * vec2<f32>(fx * 2.0, 2.0), vec2<f32>(fx * 2.0, 2.0)) * 0.15;
  } else {
    n = vnoise(vec2<f32>(uvs.x * P(0), uvs.y * P(0) * (1.0 - P(1))));
    streak = vnoise(vec2<f32>(uvs.x * P(0) * 2.0, uvs.y * 2.0)) * 0.15;
  }
  return vec4<f32>(vec3<f32>(clamp(0.45 + 0.5 * n + streak, 0.0, 1.0)), 1.0);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  float tile = P(3);
  vec2 uvs = uv + vec2(P(2) * 0.03, 0.0);
  float fx = max(floor(P(0) + 0.5), 1.0);
  float fy = max(floor(P(0) * (1.0 - P(1)) + 0.5), 1.0);
  float n = 0.0;
  float streak = 0.0;
  if (tile > 0.5) {
    n = vnoiseP2(uvs * vec2(fx, fy), vec2(fx, fy));
    streak = vnoiseP2(uvs * vec2(fx * 2.0, 2.0), vec2(fx * 2.0, 2.0)) * 0.15;
  } else {
    n = vnoise(vec2(uvs.x * P(0), uvs.y * P(0) * (1.0 - P(1))));
    streak = vnoise(vec2(uvs.x * P(0) * 2.0, uvs.y * 2.0)) * 0.15;
  }
  return vec4(vec3(clamp(0.45 + 0.5 * n + streak, 0.0, 1.0)), 1.0);
}`,
};
