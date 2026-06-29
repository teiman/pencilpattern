import type { ModifierDef } from '../graph/types';
import { num, flag, enumIndex, color, curve, pad32 } from './_util';

export const levels: ModifierDef = {
  id: 'levels',
  name: 'Levels',
  category: 'tone',
  description: 'Remaps tones by stretching black, white and gamma, the quickest way to boost or tame the contrast of a texture.',
  inputArity: 1,
  shaderVersion: 1,
  params: [
    { key: 'inBlack', label: 'Input black', kind: 'float', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'inWhite', label: 'Input white', kind: 'float', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'gamma', label: 'Gamma', kind: 'float', min: 0.1, max: 4, step: 0.01, default: 1, help: 'Brightens (>1) or darkens (<1) the midtones without clipping black or white.' },
    { key: 'outBlack', label: 'Output black', kind: 'float', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'outWhite', label: 'Output white', kind: 'float', min: 0, max: 1, step: 0.01, default: 1 },
  ],
  pack: (p) => pad32([num(p, 'inBlack', 0), num(p, 'inWhite', 1), num(p, 'gamma', 1), num(p, 'outBlack', 0), num(p, 'outWhite', 1)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = samp0(uv);
  var v = (c.rgb - vec3<f32>(P(0))) / max(P(1) - P(0), 1e-4);
  v = clamp(v, vec3<f32>(0.0), vec3<f32>(1.0));
  v = pow(v, vec3<f32>(1.0 / max(P(2), 1e-4)));
  v = mix(vec3<f32>(P(3)), vec3<f32>(P(4)), v);
  return vec4<f32>(v, c.a);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  vec4 c = samp0(uv);
  vec3 v = (c.rgb - vec3(P(0))) / max(P(1) - P(0), 1e-4);
  v = clamp(v, 0.0, 1.0);
  v = pow(v, vec3(1.0 / max(P(2), 1e-4)));
  v = mix(vec3(P(3)), vec3(P(4)), v);
  return vec4(v, c.a);
}`,
};

export const curveMod: ModifierDef = {
  id: 'curve',
  name: 'Curve',
  category: 'tone',
  description: 'Remaps tones through a 5-point curve, letting you shape highlights and shadows by hand.',
  inputArity: 1,
  shaderVersion: 1,
  params: [{ key: 'knots', label: 'Curve', kind: 'curve', default: [0, 0.25, 0.5, 0.75, 1], help: 'Drag the points to bend the tonal response; up brightens, down darkens.' }],
  pack: (p) => pad32(curve(p, 'knots')),
  wgsl: /* wgsl */ `
fn curveEval(x: f32) -> f32 {
  let t = clamp(x, 0.0, 1.0) * 4.0;
  let i = i32(floor(t));
  let f = fract(t);
  var y0 = P(0); var y1 = P(1);
  if (i == 1) { y0 = P(1); y1 = P(2); }
  else if (i == 2) { y0 = P(2); y1 = P(3); }
  else if (i >= 3) { y0 = P(3); y1 = P(4); }
  return mix(y0, y1, f);
}
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = samp0(uv);
  return vec4<f32>(curveEval(c.r), curveEval(c.g), curveEval(c.b), c.a);
}`,
  glsl: /* glsl */ `
float curveEval(float x) {
  float t = clamp(x, 0.0, 1.0) * 4.0;
  int i = int(floor(t));
  float f = fract(t);
  float y0 = P(0), y1 = P(1);
  if (i == 1) { y0 = P(1); y1 = P(2); }
  else if (i == 2) { y0 = P(2); y1 = P(3); }
  else if (i >= 3) { y0 = P(3); y1 = P(4); }
  return mix(y0, y1, f);
}
vec4 fs(vec2 uv) {
  vec4 c = samp0(uv);
  return vec4(curveEval(c.r), curveEval(c.g), curveEval(c.b), c.a);
}`,
};

export const gradientMap: ModifierDef = {
  id: 'gradient-map',
  name: 'Gradient map',
  category: 'tone',
  description: 'Turns a grayscale texture into color by mapping dark-to-light through two colors, the most common way to colorize.',
  inputArity: 1,
  outputsColor: true,
  shaderVersion: 1,
  params: [
    { key: 'colorA', label: 'Dark color', kind: 'color', default: '#1a1208', help: 'Color mapped to the darkest (black) input tones.' },
    { key: 'colorB', label: 'Light color', kind: 'color', default: '#e8dcc0', help: 'Color mapped to the brightest (white) input tones.' },
    { key: 'bias', label: 'Bias', kind: 'float', min: 0, max: 1, step: 0.01, default: 0.5 },
  ],
  pack: (p) => {
    const a = color(p, 'colorA', '#1a1208');
    const b = color(p, 'colorB', '#e8dcc0');
    return pad32([a[0], a[1], a[2], b[0], b[1], b[2], num(p, 'bias', 0.5)]);
  },
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = samp0(uv);
  let g = lum(c.rgb);
  let e = mix(2.0, 0.5, P(6));
  let t = pow(g, e);
  let a = vec3<f32>(P(0), P(1), P(2));
  let b = vec3<f32>(P(3), P(4), P(5));
  return vec4<f32>(mix(a, b, t), c.a);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  vec4 c = samp0(uv);
  float g = lum(c.rgb);
  float t = pow(g, mix(2.0, 0.5, P(6)));
  vec3 a = vec3(P(0), P(1), P(2));
  vec3 b = vec3(P(3), P(4), P(5));
  return vec4(mix(a, b, t), c.a);
}`,
};

const COLORIZE_MODES = ['Multiply', 'Mix', 'Luminosity'] as const;
export const colorize: ModifierDef = {
  id: 'colorize',
  name: 'Colorize',
  category: 'tone',
  description: 'Tints a texture with a single color while keeping its brightness, a more direct alternative to a gradient map.',
  inputArity: 1,
  outputsColor: true,
  shaderVersion: 1,
  params: [
    { key: 'color', label: 'Color', kind: 'color', default: '#c08048' },
    { key: 'mode', label: 'Mode', kind: 'enum', options: [...COLORIZE_MODES], default: 'Luminosity' },
    { key: 'strength', label: 'Strength', kind: 'float', min: 0, max: 1, step: 0.01, default: 1 },
  ],
  pack: (p) => {
    const c = color(p, 'color', '#c08048');
    return pad32([c[0], c[1], c[2], enumIndex(p, 'mode', COLORIZE_MODES, 2), num(p, 'strength', 1)]);
  },
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = samp0(uv);
  let col = vec3<f32>(P(0), P(1), P(2));
  let mode = i32(P(3));
  var r = c.rgb;
  if (mode == 0) { r = c.rgb * col; }
  else if (mode == 1) { r = col; }
  else { r = col * (lum(c.rgb) / max(lum(col), 0.001)); }
  return vec4<f32>(clamp(mix(c.rgb, r, P(4)), vec3<f32>(0.0), vec3<f32>(1.0)), c.a);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  vec4 c = samp0(uv);
  vec3 col = vec3(P(0), P(1), P(2));
  int mode = int(P(3));
  vec3 r = c.rgb;
  if (mode == 0) r = c.rgb * col;
  else if (mode == 1) r = col;
  else r = col * (lum(c.rgb) / max(lum(col), 0.001));
  return vec4(clamp(mix(c.rgb, r, P(4)), 0.0, 1.0), c.a);
}`,
};

export const hsv: ModifierDef = {
  id: 'hsv',
  name: 'Hue / Saturation',
  category: 'tone',
  description: 'Shifts the hue and scales the saturation and value (brightness) of a color texture, the quickest way to recolor a material.',
  inputArity: 1,
  outputsColor: true,
  shaderVersion: 2,
  params: [
    { key: 'hue', label: 'Hue shift', kind: 'float', min: -0.5, max: 0.5, step: 0.005, default: 0, help: 'Rotates all hues around the color wheel (±0.5 = ±180°).' },
    { key: 'sat', label: 'Saturation', kind: 'float', min: 0, max: 2, step: 0.01, default: 1, help: '0 = grayscale, 1 = unchanged, >1 = more vivid.' },
    { key: 'val', label: 'Value', kind: 'float', min: 0, max: 2, step: 0.01, default: 1, help: 'Scales brightness.' },
  ],
  pack: (p) => pad32([num(p, 'hue', 0), num(p, 'sat', 1), num(p, 'val', 1)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = samp0(uv);
  var h = rgb2hsv(c.rgb);
  h.x = fract(h.x + P(0));
  h.y = clamp(h.y * P(1), 0.0, 1.0);
  h.z = clamp(h.z * P(2), 0.0, 1.0);
  return vec4<f32>(hsv2rgb(h), c.a);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  vec4 c = samp0(uv);
  vec3 h = rgb2hsv(c.rgb);
  h.x = fract(h.x + P(0));
  h.y = clamp(h.y * P(1), 0.0, 1.0);
  h.z = clamp(h.z * P(2), 0.0, 1.0);
  return vec4(hsv2rgb(h), c.a);
}`,
};

export const invert: ModifierDef = {
  id: 'invert',
  name: 'Invert',
  category: 'tone',
  description: 'Inverts the colors so light becomes dark and vice versa; Amount blends between the original and the negative.',
  inputArity: 1,
  shaderVersion: 1,
  params: [{ key: 'amount', label: 'Amount', kind: 'float', min: 0, max: 1, step: 0.01, default: 1 }],
  pack: (p) => pad32([num(p, 'amount', 1)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = samp0(uv);
  return vec4<f32>(mix(c.rgb, 1.0 - c.rgb, P(0)), c.a);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  vec4 c = samp0(uv);
  return vec4(mix(c.rgb, 1.0 - c.rgb, P(0)), c.a);
}`,
};
