import type { ModifierDef } from '../graph/types';
import { num, flag, pad32 } from './_util';

export const orderedDither: ModifierDef = {
  id: 'ordered-dither',
  name: 'Ordered dither (Bayer)',
  category: 'stylize',
  description: 'Reduces the image to a few tones with a Bayer screen for an engraving or retro ink look; Levels sets the number of tones.',
  inputArity: 1,
  outputsColor: true,
  shaderVersion: 2,
  params: [
    { key: 'levels', label: 'Levels', kind: 'int', min: 2, max: 8, step: 1, default: 2, help: 'Number of output tones; 2 gives pure black and white.' },
    { key: 'strength', label: 'Strength', kind: 'float', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'monochrome', label: 'Monochrome (B/W)', kind: 'bool', default: false },
  ],
  pack: (p) => pad32([num(p, 'levels', 2), num(p, 'strength', 1), flag(p, 'monochrome', false)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let src = samp0(uv);
  let coord = vec2<u32>(uv * RES());
  let amt = (bayer4(coord) - 0.5) * (1.0 / max(P(0), 2.0)) * P(1);
  let levels = max(P(0), 2.0);
  var rgb = src.rgb;
  if (P(2) > 0.5) {
    let q = floor((lum(src.rgb) + amt) * (levels - 1.0) + 0.5) / (levels - 1.0);
    rgb = vec3<f32>(clamp(q, 0.0, 1.0));
  } else {
    rgb = clamp(floor((src.rgb + vec3<f32>(amt)) * (levels - 1.0) + 0.5) / (levels - 1.0), vec3<f32>(0.0), vec3<f32>(1.0));
  }
  return vec4<f32>(rgb, src.a);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  vec4 src = samp0(uv);
  uvec2 coord = uvec2(uv * RES());
  float amt = (bayer4(coord) - 0.5) * (1.0 / max(P(0), 2.0)) * P(1);
  float levels = max(P(0), 2.0);
  vec3 rgb = src.rgb;
  if (P(2) > 0.5) {
    float q = floor((lum(src.rgb) + amt) * (levels - 1.0) + 0.5) / (levels - 1.0);
    rgb = vec3(clamp(q, 0.0, 1.0));
  } else {
    rgb = clamp(floor((src.rgb + vec3(amt)) * (levels - 1.0) + 0.5) / (levels - 1.0), 0.0, 1.0);
  }
  return vec4(rgb, src.a);
}`,
};

export const hatching: ModifierDef = {
  id: 'hatching',
  name: 'Hatching (pencil/ink)',
  category: 'stylize',
  description: 'Shades the image with pencil/ink hatch lines driven by brightness; extra Layers add cross-hatching in the dark areas.',
  inputArity: 1,
  shaderVersion: 1,
  params: [
    { key: 'frequency', label: 'Frequency', kind: 'float', min: 10, max: 200, step: 1, default: 80, help: 'Density of the hatch lines (higher = finer, closer lines).' },
    { key: 'angle', label: 'Angle', kind: 'float', min: 0, max: 3.1416, step: 0.01, default: 0.785, help: 'Direction of the hatch lines, in radians.' },
    { key: 'layers', label: 'Layers (cross-hatch)', kind: 'int', min: 1, max: 3, step: 1, default: 2 },
    { key: 'darkness', label: 'Intensity', kind: 'float', min: 0, max: 1, step: 0.01, default: 1 },
  ],
  pack: (p) => pad32([num(p, 'frequency', 80), num(p, 'angle', 0.785), num(p, 'layers', 2), num(p, 'darkness', 1)]),
  wgsl: /* wgsl */ `
fn hatchLine(uv: vec2<f32>, ang: f32, freq: f32) -> f32 {
  let r = rot2(ang) * uv;
  let s = abs(fract(r.y * freq) - 0.5) * 2.0;
  return smoothstep(0.0, 0.35, s);
}
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let g = lum(samp0(uv).rgb);
  let freq = P(0); let ang = P(1); let layers = i32(P(2));
  var v = 1.0;
  if (g < 0.8) { v = min(v, hatchLine(uv, ang, freq)); }
  if (g < 0.55 && layers >= 2) { v = min(v, hatchLine(uv, ang + 1.5708, freq)); }
  if (g < 0.3 && layers >= 3) { v = min(v, hatchLine(uv, ang + 0.785, freq)); }
  v = mix(1.0, v, P(3));
  v = min(v, smoothstep(0.0, 0.25, g));
  return vec4<f32>(vec3<f32>(clamp(v, 0.0, 1.0)), 1.0);
}`,
  glsl: /* glsl */ `
float hatchLine(vec2 uv, float ang, float freq) {
  vec2 r = rot2(ang) * uv;
  float s = abs(fract(r.y * freq) - 0.5) * 2.0;
  return smoothstep(0.0, 0.35, s);
}
vec4 fs(vec2 uv) {
  float g = lum(samp0(uv).rgb);
  float freq = P(0); float ang = P(1); int layers = int(P(2));
  float v = 1.0;
  if (g < 0.8) v = min(v, hatchLine(uv, ang, freq));
  if (g < 0.55 && layers >= 2) v = min(v, hatchLine(uv, ang + 1.5708, freq));
  if (g < 0.3 && layers >= 3) v = min(v, hatchLine(uv, ang + 0.785, freq));
  v = mix(1.0, v, P(3));
  v = min(v, smoothstep(0.0, 0.25, g));
  return vec4(vec3(clamp(v, 0.0, 1.0)), 1.0);
}`,
};

export const sharpen: ModifierDef = {
  id: 'sharpen',
  name: 'Sharpen',
  category: 'filter',
  description: 'Accentuates edges and fine detail with an unsharp-mask kernel; raise Amount for a crisper, higher-contrast surface.',
  inputArity: 1,
  outputsColor: true,
  shaderVersion: 1,
  params: [{ key: 'amount', label: 'Amount', kind: 'float', min: 0, max: 4, step: 0.05, default: 1, help: 'Strength of the edge enhancement.' }],
  pack: (p) => pad32([num(p, 'amount', 1)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let e = 1.0 / RES();
  let c = samp0(uv);
  let n = samp0(uv + vec2<f32>(e, 0.0)).rgb + samp0(uv - vec2<f32>(e, 0.0)).rgb
        + samp0(uv + vec2<f32>(0.0, e)).rgb + samp0(uv - vec2<f32>(0.0, e)).rgb;
  let rgb = clamp(c.rgb + (c.rgb * 4.0 - n) * (P(0) * 0.25), vec3<f32>(0.0), vec3<f32>(1.0));
  return vec4<f32>(rgb, c.a);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  float e = 1.0 / RES();
  vec4 c = samp0(uv);
  vec3 n = samp0(uv + vec2(e, 0.0)).rgb + samp0(uv - vec2(e, 0.0)).rgb
         + samp0(uv + vec2(0.0, e)).rgb + samp0(uv - vec2(0.0, e)).rgb;
  vec3 rgb = clamp(c.rgb + (c.rgb * 4.0 - n) * (P(0) * 0.25), 0.0, 1.0);
  return vec4(rgb, c.a);
}`,
};

export const edgeDetect: ModifierDef = {
  id: 'edge-detect',
  name: 'Edge detect (Sobel)',
  category: 'filter',
  description: 'Finds edges with a Sobel operator and outputs their strength as a grayscale map; good for masks, outlines and wear.',
  inputArity: 1,
  shaderVersion: 1,
  params: [
    { key: 'strength', label: 'Strength', kind: 'float', min: 0.1, max: 8, step: 0.1, default: 2, help: 'Scales how strong detected edges appear.' },
    { key: 'invert', label: 'Invert', kind: 'bool', default: false, help: 'White edges on black, or black edges on white.' },
  ],
  pack: (p) => pad32([num(p, 'strength', 2), flag(p, 'invert')]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let e = 1.0 / RES();
  let tl = lum(samp0(uv + vec2<f32>(-e, -e)).rgb); let t = lum(samp0(uv + vec2<f32>(0.0, -e)).rgb); let tr = lum(samp0(uv + vec2<f32>(e, -e)).rgb);
  let l = lum(samp0(uv + vec2<f32>(-e, 0.0)).rgb); let rr = lum(samp0(uv + vec2<f32>(e, 0.0)).rgb);
  let bl = lum(samp0(uv + vec2<f32>(-e, e)).rgb); let b = lum(samp0(uv + vec2<f32>(0.0, e)).rgb); let br = lum(samp0(uv + vec2<f32>(e, e)).rgb);
  let gx = (tr + 2.0 * rr + br) - (tl + 2.0 * l + bl);
  let gy = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);
  var m = clamp(sqrt(gx * gx + gy * gy) * P(0), 0.0, 1.0);
  if (P(1) > 0.5) { m = 1.0 - m; }
  return vec4<f32>(vec3<f32>(m), 1.0);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  float e = 1.0 / RES();
  float tl = lum(samp0(uv + vec2(-e, -e)).rgb), t = lum(samp0(uv + vec2(0.0, -e)).rgb), tr = lum(samp0(uv + vec2(e, -e)).rgb);
  float l = lum(samp0(uv + vec2(-e, 0.0)).rgb), rr = lum(samp0(uv + vec2(e, 0.0)).rgb);
  float bl = lum(samp0(uv + vec2(-e, e)).rgb), b = lum(samp0(uv + vec2(0.0, e)).rgb), br = lum(samp0(uv + vec2(e, e)).rgb);
  float gx = (tr + 2.0 * rr + br) - (tl + 2.0 * l + bl);
  float gy = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);
  float m = clamp(sqrt(gx * gx + gy * gy) * P(0), 0.0, 1.0);
  if (P(1) > 0.5) m = 1.0 - m;
  return vec4(vec3(m), 1.0);
}`,
};

export const emboss: ModifierDef = {
  id: 'emboss',
  name: 'Emboss',
  category: 'filter',
  description: 'Turns the input into a directional relief, as if carved, by lighting its gradient from one Angle.',
  inputArity: 1,
  shaderVersion: 1,
  params: [
    { key: 'angle', label: 'Angle', kind: 'float', min: 0, max: 6.2832, step: 0.01, default: 0.785, help: 'Direction the relief is lit from, in radians.' },
    { key: 'amount', label: 'Amount', kind: 'float', min: 0, max: 8, step: 0.1, default: 3, help: 'Depth of the embossing.' },
  ],
  pack: (p) => pad32([num(p, 'angle', 0.785), num(p, 'amount', 3)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let e = 1.0 / RES();
  let d = vec2<f32>(cos(P(0)), sin(P(0))) * e;
  let a = lum(samp0(uv - d).rgb);
  let b = lum(samp0(uv + d).rgb);
  let v = clamp(0.5 + (b - a) * P(1), 0.0, 1.0);
  return vec4<f32>(vec3<f32>(v), 1.0);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  float e = 1.0 / RES();
  vec2 d = vec2(cos(P(0)), sin(P(0))) * e;
  float a = lum(samp0(uv - d).rgb);
  float b = lum(samp0(uv + d).rgb);
  float v = clamp(0.5 + (b - a) * P(1), 0.0, 1.0);
  return vec4(vec3(v), 1.0);
}`,
};

// Oclusión ambiental aproximada a partir de un height map: las zonas hundidas
// (más bajas que su vecindario) se oscurecen. Complementa a normal-from-height.
export const aoFromHeight: ModifierDef = {
  id: 'ao-from-height',
  name: 'AO from height',
  category: 'stylize',
  description: 'Approximates ambient occlusion from a grayscale height map by darkening cavities (areas lower than their surroundings).',
  inputArity: 1,
  shaderVersion: 1,
  params: [
    { key: 'radius', label: 'Radius', kind: 'float', min: 1, max: 16, step: 0.5, default: 4, help: 'How far to sample when comparing heights (in pixels).' },
    { key: 'strength', label: 'Strength', kind: 'float', min: 0, max: 4, step: 0.05, default: 1.5, help: 'How dark the occluded cavities become.' },
  ],
  pack: (p) => pad32([num(p, 'radius', 4), num(p, 'strength', 1.5)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let e = (1.0 / RES()) * P(0);
  let h = lum(samp0(uv).rgb);
  var occ = 0.0;
  for (var i = 0; i < 8; i = i + 1) {
    let a = f32(i) * 0.7853982;
    let o = vec2<f32>(cos(a), sin(a)) * e;
    occ += max(lum(samp0(uv + o).rgb) - h, 0.0);
  }
  let ao = clamp(1.0 - (occ / 8.0) * P(1) * 4.0, 0.0, 1.0);
  return vec4<f32>(vec3<f32>(ao), 1.0);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  float e = (1.0 / RES()) * P(0);
  float h = lum(samp0(uv).rgb);
  float occ = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    vec2 o = vec2(cos(a), sin(a)) * e;
    occ += max(lum(samp0(uv + o).rgb) - h, 0.0);
  }
  float ao = clamp(1.0 - (occ / 8.0) * P(1) * 4.0, 0.0, 1.0);
  return vec4(vec3(ao), 1.0);
}`,
};

export const normalFromHeight: ModifierDef = {
  id: 'normal-from-height',
  name: 'Normal from height',
  category: 'stylize',
  description: 'Converts a grayscale height map into a tangent-space normal map to light up relief in a 3D engine; Strength scales the bumpiness.',
  inputArity: 1,
  outputsColor: true,
  shaderVersion: 1,
  params: [{ key: 'strength', label: 'Strength', kind: 'float', min: 0.1, max: 8, step: 0.1, default: 2, help: 'Scales how pronounced the surface relief appears.' }],
  pack: (p) => pad32([num(p, 'strength', 2)]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let e = 1.0 / RES();
  let hl = lum(samp0(uv - vec2<f32>(e, 0.0)).rgb);
  let hr = lum(samp0(uv + vec2<f32>(e, 0.0)).rgb);
  let hd = lum(samp0(uv - vec2<f32>(0.0, e)).rgb);
  let hu = lum(samp0(uv + vec2<f32>(0.0, e)).rgb);
  let n = normalize(vec3<f32>((hl - hr) * P(0), (hd - hu) * P(0), 1.0));
  return vec4<f32>(n * 0.5 + 0.5, 1.0);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  float e = 1.0 / RES();
  float hl = lum(samp0(uv - vec2(e, 0.0)).rgb);
  float hr = lum(samp0(uv + vec2(e, 0.0)).rgb);
  float hd = lum(samp0(uv - vec2(0.0, e)).rgb);
  float hu = lum(samp0(uv + vec2(0.0, e)).rgb);
  vec3 n = normalize(vec3((hl - hr) * P(0), (hd - hu) * P(0), 1.0));
  return vec4(n * 0.5 + 0.5, 1.0);
}`,
};
