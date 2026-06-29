import type { ModifierDef } from '../graph/types';
import { num, flag, enumIndex, pad32 } from './_util';

export const copyMod: ModifierDef = {
  id: 'copy',
  name: 'Copy from…',
  category: 'filter',
  description: 'Passes a texture through unchanged. Useful to reference another node (even from another band) as an input.',
  inputArity: 1,
  outputsColor: true,
  shaderVersion: 1,
  params: [],
  pack: () => [],
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return samp0(uv);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  return samp0(uv);
}`,
};

export const noOp: ModifierDef = {
  id: 'no-op',
  name: 'No-op (passthrough)',
  category: 'filter',
  description: 'Does nothing — passes the input through completely unchanged. Useful as a placeholder, a toggle point, or to keep a slot in a chain.',
  inputArity: 1,
  outputsColor: true,
  shaderVersion: 1,
  params: [],
  pack: () => [],
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return samp0(uv);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  return samp0(uv);
}`,
};

const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'add',
  'subtract',
  'difference',
  'darken',
  'lighten',
] as const;

export const blend: ModifierDef = {
  id: 'blend',
  name: 'Blend',
  category: 'filter',
  description: 'Combines two textures with a blend mode (multiply, screen, overlay…). Base is the layer underneath, Top goes over it.',
  inputLabels: ['Base (under)', 'Top (over)'],
  inputArity: 2,
  outputsColor: true,
  shaderVersion: 1,
  params: [
    { key: 'mode', label: 'Mode', kind: 'enum', options: [...BLEND_MODES], default: 'normal', help: 'How Top is combined with Base. Some modes (normal, overlay, subtract) depend on order.' },
    { key: 'opacity', label: 'Opacity', kind: 'float', min: 0, max: 1, step: 0.01, default: 1, help: 'How much of the blended result mixes over the Base (1 = full effect).' },
  ],
  pack: (p) => pad32([enumIndex(p, 'mode', BLEND_MODES, 0), num(p, 'opacity', 1)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let base = samp0(uv);
  let top = samp1(uv);
  let a = base.rgb; let b = top.rgb;
  var r = b;
  let mode = i32(P(0));
  if (mode == 1) { r = a * b; }
  else if (mode == 2) { r = 1.0 - (1.0 - a) * (1.0 - b); }
  else if (mode == 3) { r = select(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), a > vec3<f32>(0.5)); }
  else if (mode == 4) { r = a + b; }
  else if (mode == 5) { r = a - b; }
  else if (mode == 6) { r = abs(a - b); }
  else if (mode == 7) { r = min(a, b); }
  else if (mode == 8) { r = max(a, b); }
  r = clamp(mix(a, r, P(1)), vec3<f32>(0.0), vec3<f32>(1.0));
  return vec4<f32>(r, base.a);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  vec4 base = samp0(uv);
  vec4 top = samp1(uv);
  vec3 a = base.rgb, b = top.rgb;
  vec3 r = b;
  int mode = int(P(0));
  if (mode == 1) r = a * b;
  else if (mode == 2) r = 1.0 - (1.0 - a) * (1.0 - b);
  else if (mode == 3) r = mix(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), step(vec3(0.5), a));
  else if (mode == 4) r = a + b;
  else if (mode == 5) r = a - b;
  else if (mode == 6) r = abs(a - b);
  else if (mode == 7) r = min(a, b);
  else if (mode == 8) r = max(a, b);
  r = clamp(mix(a, r, P(1)), 0.0, 1.0);
  return vec4(r, base.a);
}`,
};

export const blur: ModifierDef = {
  id: 'blur',
  name: 'Blur (gaussian)',
  category: 'filter',
  description: 'Softens the input with a separable Gaussian blur. Higher radius = blurrier.',
  inputArity: 1,
  passes: 2,
  shaderVersion: 1,
  params: [{ key: 'radius', label: 'Radius', kind: 'float', min: 0, max: 16, step: 0.5, default: 4, help: 'Blur strength in pixels.' }],
  pack: (p) => pad32([num(p, 'radius', 4)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let dir = select(vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), PASS() < 0.5);
  let r = i32(clamp(P(0), 0.0, 16.0));
  let texel = 1.0 / RES();
  let sigma = max(P(0) * 0.5, 0.5);
  var sum = vec4<f32>(0.0);
  var wsum = 0.0;
  for (var i = -16; i <= 16; i = i + 1) {
    if (i < -r || i > r) { continue; }
    let fi = f32(i);
    let w = exp(-(fi * fi) / (2.0 * sigma * sigma));
    sum += w * samp0(uv + dir * texel * fi);
    wsum += w;
  }
  return sum / max(wsum, 1e-4);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  vec2 dir = PASS() < 0.5 ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  int r = int(clamp(P(0), 0.0, 16.0));
  float texel = 1.0 / RES();
  float sigma = max(P(0) * 0.5, 0.5);
  vec4 sum = vec4(0.0);
  float wsum = 0.0;
  for (int i = -16; i <= 16; i++) {
    if (i < -r || i > r) continue;
    float fi = float(i);
    float w = exp(-(fi * fi) / (2.0 * sigma * sigma));
    sum += w * samp0(uv + dir * texel * fi);
    wsum += w;
  }
  return sum / max(wsum, 1e-4);
}`,
};

export const threshold: ModifierDef = {
  id: 'threshold',
  name: 'Threshold',
  category: 'filter',
  description: 'Turns the input into black & white at a brightness cutoff. Good for masks and hard edges.',
  inputArity: 1,
  shaderVersion: 1,
  params: [
    { key: 'level', label: 'Level', kind: 'float', min: 0, max: 1, step: 0.01, default: 0.5, help: 'Brightness cutoff: pixels above turn white, below turn black.' },
    { key: 'softness', label: 'Softness', kind: 'float', min: 0, max: 0.5, step: 0.005, default: 0.02, help: 'Width of the gradient around the cutoff (0 = hard edge).' },
    { key: 'invert', label: 'Invert', kind: 'bool', default: false, help: 'Swap black and white.' },
  ],
  pack: (p) => pad32([num(p, 'level', 0.5), num(p, 'softness', 0.02), flag(p, 'invert')]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let g = lum(samp0(uv).rgb);
  var v = smoothstep(P(0) - P(1), P(0) + P(1), g);
  if (P(2) > 0.5) { v = 1.0 - v; }
  return vec4<f32>(vec3<f32>(v), 1.0);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  float g = lum(samp0(uv).rgb);
  float v = smoothstep(P(0) - P(1), P(0) + P(1), g);
  if (P(2) > 0.5) v = 1.0 - v;
  return vec4(vec3(v), 1.0);
}`,
};

// Mezcla dos texturas usando la LUMINANCIA de una como máscara. Pensado para
// "dejar asomar" una textura por las zonas oscuras de otra (p.ej. óxido con
// agujeros negros sobre madera): donde el top es oscuro se ve la base.
//   base = samp0 (la que asoma por debajo) · top = samp1 (la de encima)
//   máscara = lum(source) con umbral suave → mix(base, top, mask)
export const luminanceMix: ModifierDef = {
  id: 'luminance-mix',
  name: 'Luminance mix (mask)',
  category: 'filter',
  description: "Blends two textures using the brightness of one as a mask. Lets one texture show through the dark areas of another (e.g. wood through the black holes of rust).",
  inputLabels: ['Base (shows through)', 'Top (with dark areas)'],
  inputArity: 2,
  outputsColor: true,
  shaderVersion: 1,
  params: [
    { key: 'level', label: 'Threshold', kind: 'float', min: 0, max: 1, step: 0.01, default: 0.12, help: 'Below this brightness the Base shows through; above it the Top is shown.' },
    { key: 'softness', label: 'Softness', kind: 'float', min: 0, max: 0.5, step: 0.005, default: 0.08, help: 'How soft the transition between the two textures is.' },
    { key: 'source', label: 'Mask from', kind: 'enum', options: ['top', 'base'], default: 'top', help: 'Which input the mask is derived from.' },
    { key: 'invert', label: 'Invert mask', kind: 'bool', default: false, help: 'Swap which texture shows through.' },
  ],
  pack: (p) => pad32([num(p, 'level', 0.12), num(p, 'softness', 0.08), enumIndex(p, 'source', ['top', 'base'], 0), flag(p, 'invert')]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let base = samp0(uv);
  let top = samp1(uv);
  let g = lum(select(top.rgb, base.rgb, P(2) > 0.5));
  var mask = smoothstep(P(0) - P(1), P(0) + P(1), g);
  if (P(3) > 0.5) { mask = 1.0 - mask; }
  let rgb = mix(base.rgb, top.rgb, mask);
  return vec4<f32>(rgb, 1.0);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  vec4 base = samp0(uv);
  vec4 top = samp1(uv);
  vec3 src = (P(2) > 0.5) ? base.rgb : top.rgb;
  float g = lum(src);
  float mask = smoothstep(P(0) - P(1), P(0) + P(1), g);
  if (P(3) > 0.5) mask = 1.0 - mask;
  vec3 rgb = mix(base.rgb, top.rgb, mask);
  return vec4(rgb, 1.0);
}`,
};

// Mezcla Base y Top usando una TERCERA entrada como máscara (su luminancia).
// Es el idioma central de Substance: "blend A sobre B según la máscara C".
// inputArity:3 → samp0=base, samp1=top, samp2=mask.
export const maskBlend: ModifierDef = {
  id: 'mask-blend',
  name: 'Mask blend',
  category: 'filter',
  description: 'Blends Base and Top using a third texture as the mask: where the mask is white you see Top, where it is black you see Base.',
  inputLabels: ['Base (under)', 'Top (over)', 'Mask'],
  inputArity: 3,
  outputsColor: true,
  shaderVersion: 1,
  params: [
    { key: 'opacity', label: 'Opacity', kind: 'float', min: 0, max: 1, step: 0.01, default: 1, help: 'Overall strength of the Top over the Base.' },
    { key: 'inLow', label: 'Mask low', kind: 'float', min: 0, max: 1, step: 0.01, default: 0, help: 'Mask brightness mapped to fully Base.' },
    { key: 'inHigh', label: 'Mask high', kind: 'float', min: 0, max: 1, step: 0.01, default: 1, help: 'Mask brightness mapped to fully Top.' },
    { key: 'invert', label: 'Invert mask', kind: 'bool', default: false, help: 'Swap which side the mask reveals.' },
  ],
  pack: (p) => pad32([num(p, 'opacity', 1), num(p, 'inLow', 0), num(p, 'inHigh', 1), flag(p, 'invert')]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let base = samp0(uv);
  let top = samp1(uv);
  var m = lum(samp2(uv).rgb);
  m = clamp((m - P(1)) / max(P(2) - P(1), 1e-4), 0.0, 1.0);
  if (P(3) > 0.5) { m = 1.0 - m; }
  let rgb = mix(base.rgb, top.rgb, m * P(0));
  return vec4<f32>(rgb, base.a);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  vec4 base = samp0(uv);
  vec4 top = samp1(uv);
  float m = lum(samp2(uv).rgb);
  m = clamp((m - P(1)) / max(P(2) - P(1), 1e-4), 0.0, 1.0);
  if (P(3) > 0.5) m = 1.0 - m;
  vec3 rgb = mix(base.rgb, top.rgb, m * P(0));
  return vec4(rgb, base.a);
}`,
};

export const displace: ModifierDef = {
  id: 'displace',
  name: 'Displace (warp)',
  category: 'filter',
  description: 'Warps the Image by pushing its pixels around according to a Displacement map (its brightness gradient).',
  inputLabels: ['Image', 'Displacement map'],
  inputArity: 2,
  outputsColor: true,
  shaderVersion: 1,
  params: [{ key: 'amount', label: 'Amount', kind: 'float', min: 0, max: 0.2, step: 0.001, default: 0.04, help: 'How far pixels are pushed by the displacement map.' }],
  pack: (p) => pad32([num(p, 'amount', 0.04)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let e = 0.004;
  let m = lum(samp1(uv).rgb);
  let mx = lum(samp1(uv + vec2<f32>(e, 0.0)).rgb);
  let my = lum(samp1(uv + vec2<f32>(0.0, e)).rgb);
  let off = vec2<f32>(mx - m, my - m) * P(0) * 50.0;
  return samp0(uv + off);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  float e = 0.004;
  float m = lum(samp1(uv).rgb);
  float mx = lum(samp1(uv + vec2(e, 0.0)).rgb);
  float my = lum(samp1(uv + vec2(0.0, e)).rgb);
  vec2 off = vec2(mx - m, my - m) * P(0) * 50.0;
  return samp0(uv + off);
}`,
};
