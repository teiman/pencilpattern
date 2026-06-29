import type { ModifierDef } from '../graph/types';
import { num, enumIndex, pad32 } from './_util';
import { QUAKE_NO_FULLBRIGHT_COUNT } from '../gpu/palette';

/** Cambiar resolución: passthrough. El tamaño de salida = la "Tamaño" del nodo. */
export const resample: ModifierDef = {
  id: 'resample',
  name: 'Change resolution',
  category: 'filter',
  description: 'Passes the input through at the node\'s own Size, resampling the texture up or down (for example from 1024 to 128).',
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

const QUAKE_VARIANTS = ['Full', 'No fullbrights'] as const;

/** Mapea cada píxel al color más cercano de la paleta de Quake (256 colores). */
export const quakePalette: ModifierDef = {
  id: 'quake-palette',
  name: 'Quake palette',
  category: 'stylize',
  description: 'Quantizes each pixel to the nearest color of the 256-color Quake 1 palette for a retro look; «No fullbrights» excludes the glowing colors.',
  inputArity: 1,
  outputsColor: true,
  shaderVersion: 1,
  params: [{ key: 'variant', label: 'Palette', kind: 'enum', options: [...QUAKE_VARIANTS], default: 'Full', help: '«No fullbrights» drops the colors that glow at full brightness.' }],
  pack: (p) => pad32([enumIndex(p, 'variant', QUAKE_VARIANTS, 0) === 1 ? QUAKE_NO_FULLBRIGHT_COUNT : 256]),
  wgsl: /* wgsl */ `
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let src = samp0(uv);
  let c = src.rgb;
  let count = i32(P(0));
  var best = 0;
  var bestD = 1e9;
  for (var i = 0; i < 256; i = i + 1) {
    if (i >= count) { break; }
    let pc = textureLoad(dataTex, vec2<i32>(i, 0), 0).rgb;
    let diff = c - pc;
    let d = dot(diff, diff);
    if (d < bestD) { bestD = d; best = i; }
  }
  let outc = textureLoad(dataTex, vec2<i32>(best, 0), 0).rgb;
  return vec4<f32>(outc, src.a);
}`,
  glsl: /* glsl */ `
vec4 fs(vec2 uv) {
  vec4 src = samp0(uv);
  vec3 c = src.rgb;
  int count = int(P(0));
  int best = 0;
  float bestD = 1e9;
  for (int i = 0; i < 256; i++) {
    if (i >= count) break;
    vec3 pc = texelFetch(dataTex, ivec2(i, 0), 0).rgb;
    vec3 diff = c - pc;
    float d = dot(diff, diff);
    if (d < bestD) { bestD = d; best = i; }
  }
  vec3 outc = texelFetch(dataTex, ivec2(best, 0), 0).rgb;
  return vec4(outc, src.a);
}`,
};

/**
 * Hacer seamless (para IMÁGENES subidas no periódicas).
 *
 * Algoritmo wrap-aware: en lugar de mezclar con una única copia desplazada media
 * textura (que dejaba "fantasma" en las esquinas), cada borde se funde con su
 * borde OPUESTO envuelto, ponderado por la distancia al borde de forma
 * independiente en X e Y. Así la costura izquierda casa con la derecha y la
 * superior con la inferior sin duplicar el contenido del centro. El peso usa un
 * coseno suave (sin "banding") y se anula en el centro de la textura.
 *
 * Es paramétrico solo en la anchura de la banda; sigue una línea Heitz-lite
 * (preservar contenido local, fundir solo los bordes) sin pedirle al usuario que
 * pelee con la costura.
 */
export const makeSeamless: ModifierDef = {
  id: 'make-seamless',
  name: 'Make seamless',
  category: 'filter',
  description: 'Makes an uploaded, non-tiling bitmap repeat by wrap-blending each edge with its opposite one; for procedural generators use their «Tileable» option instead.',
  inputArity: 1,
  outputsColor: true,
  shaderVersion: 2,
  params: [{ key: 'blend', label: 'Blend width', kind: 'float', min: 0.02, max: 0.5, step: 0.01, default: 0.15, help: 'Width of the band near the edges where the copies are blended.' }],
  pack: (p) => pad32([num(p, 'blend', 0.15)]),
  wgsl: /* wgsl */ `
// Peso del borde: 1 en el borde (dist 0), 0 al alcanzar la anchura w. Coseno suave.
fn edgeWeight(d: f32, w: f32) -> f32 {
  let t = clamp(d / max(w, 1e-3), 0.0, 1.0);
  return 0.5 * (1.0 + cos(t * 3.14159265)) * 0.5; // máx 0.5 en el borde → mezcla equilibrada
}
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let c = samp0(uv);
  let w = max(P(0), 0.001);
  // muestras envueltas: el lado opuesto en cada eje.
  let sx = samp0(vec2<f32>(fract(uv.x + 0.5), uv.y));
  let sy = samp0(vec2<f32>(uv.x, fract(uv.y + 0.5)));
  let wx = edgeWeight(min(uv.x, 1.0 - uv.x), w);
  let wy = edgeWeight(min(uv.y, 1.0 - uv.y), w);
  var r = mix(c, sx, wx);
  r = mix(r, sy, wy);
  return r;
}`,
  glsl: /* glsl */ `
float edgeWeight(float d, float w) {
  float t = clamp(d / max(w, 1e-3), 0.0, 1.0);
  return 0.5 * (1.0 + cos(t * 3.14159265)) * 0.5;
}
vec4 fs(vec2 uv) {
  vec4 c = samp0(uv);
  float w = max(P(0), 0.001);
  vec4 sx = samp0(vec2(fract(uv.x + 0.5), uv.y));
  vec4 sy = samp0(vec2(uv.x, fract(uv.y + 0.5)));
  float wx = edgeWeight(min(uv.x, 1.0 - uv.x), w);
  float wy = edgeWeight(min(uv.y, 1.0 - uv.y), w);
  vec4 r = mix(c, sx, wx);
  r = mix(r, sy, wy);
  return r;
}`,
};
