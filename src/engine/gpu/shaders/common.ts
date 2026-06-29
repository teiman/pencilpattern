// Preludio de shaders compartido por todos los modificadores.
//
// Bloque uniforme (igual en WGSL y GLSL std140):
//   head = (res, time, seed, pass)
//   p[8] = 32 floats de parámetros  -> accesibles con P(i), i en [0,31]
//
// Cada modificador aporta solo el cuerpo `fs(uv) -> vec4`. El backend concatena
// PRELUDIO + cuerpo del modificador (+ main, en GLSL).

export const UNIFORM_FLOATS = 36; // 4 (head) + 32 (params)
export const MAX_INPUTS = 4;

/* ------------------------------- WGSL ------------------------------- */

export const COMMON_WGSL = /* wgsl */ `
struct U {
  res: f32,
  time: f32,
  seed: f32,
  passIndex: f32,
  p: array<vec4<f32>, 8>,
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex0: texture_2d<f32>;
@group(0) @binding(3) var tex1: texture_2d<f32>;
@group(0) @binding(4) var tex2: texture_2d<f32>;
@group(0) @binding(5) var tex3: texture_2d<f32>;
@group(0) @binding(6) var dataTex: texture_2d<f32>;

fn P(i: i32) -> f32 { return u.p[i / 4][i % 4]; }
fn RES() -> f32 { return u.res; }
fn SEED() -> f32 { return u.seed; }
fn PASS() -> f32 { return u.passIndex; }
fn TX(uv: vec2<f32>) -> f32 { return 1.0 / u.res; }

fn samp0(uv: vec2<f32>) -> vec4<f32> { return textureSampleLevel(tex0, samp, uv, 0.0); }
fn samp1(uv: vec2<f32>) -> vec4<f32> { return textureSampleLevel(tex1, samp, uv, 0.0); }
fn samp2(uv: vec2<f32>) -> vec4<f32> { return textureSampleLevel(tex2, samp, uv, 0.0); }
fn samp3(uv: vec2<f32>) -> vec4<f32> { return textureSampleLevel(tex3, samp, uv, 0.0); }

fn lum(c: vec3<f32>) -> f32 { return dot(c, vec3<f32>(0.299, 0.587, 0.114)); }

fn rot2(a: f32) -> mat2x2<f32> {
  let s = sin(a); let c = cos(a);
  return mat2x2<f32>(c, -s, s, c);
}

fn hash21(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
fn hash22(p: vec2<f32>) -> vec2<f32> {
  var p3 = fract(vec3<f32>(p.xyx) * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

fn vnoise(p: vec2<f32>) -> f32 {
  let i = floor(p); let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash21(i + vec2<f32>(0.0, 0.0));
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

fn perlin(p: vec2<f32>) -> f32 {
  let i = floor(p); let f = fract(p);
  let w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let ga = normalize(hash22(i + vec2<f32>(0.0, 0.0)) * 2.0 - 1.0);
  let gb = normalize(hash22(i + vec2<f32>(1.0, 0.0)) * 2.0 - 1.0);
  let gc = normalize(hash22(i + vec2<f32>(0.0, 1.0)) * 2.0 - 1.0);
  let gd = normalize(hash22(i + vec2<f32>(1.0, 1.0)) * 2.0 - 1.0);
  let va = dot(ga, f - vec2<f32>(0.0, 0.0));
  let vb = dot(gb, f - vec2<f32>(1.0, 0.0));
  let vc = dot(gc, f - vec2<f32>(0.0, 1.0));
  let vd = dot(gd, f - vec2<f32>(1.0, 1.0));
  let n = mix(mix(va, vb, w.x), mix(vc, vd, w.x), w.y);
  return n * 0.5 + 0.5;
}

fn fbm(p0: vec2<f32>, oct: i32, lac: f32, gain: f32) -> f32 {
  var p = p0; var amp = 0.5; var sum = 0.0; var norm = 0.0;
  for (var i = 0; i < 8; i = i + 1) {
    if (i >= oct) { break; }
    sum += amp * vnoise(p);
    norm += amp;
    p = p * lac;
    amp *= gain;
  }
  return sum / max(norm, 1e-4);
}

fn worley(p: vec2<f32>, jitter: f32) -> vec2<f32> {
  let ip = floor(p); let fp = fract(p);
  var f1 = 8.0; var f2 = 8.0;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let g = vec2<f32>(f32(x), f32(y));
      let o = hash22(ip + g) * jitter;
      let r = g + o - fp;
      let d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return sqrt(vec2<f32>(f1, f2));
}

fn bayer4(c: vec2<u32>) -> f32 {
  var m = array<f32, 16>(
    0.0 / 16.0, 8.0 / 16.0, 2.0 / 16.0, 10.0 / 16.0,
    12.0 / 16.0, 4.0 / 16.0, 14.0 / 16.0, 6.0 / 16.0,
    3.0 / 16.0, 11.0 / 16.0, 1.0 / 16.0, 9.0 / 16.0,
    15.0 / 16.0, 7.0 / 16.0, 13.0 / 16.0, 5.0 / 16.0,
  );
  let idx = (c.y % 4u) * 4u + (c.x % 4u);
  return m[idx];
}

fn hsv2rgb(c: vec3<f32>) -> vec3<f32> {
  let k = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let pp = abs(fract(vec3<f32>(c.x) + k.xyz) * 6.0 - vec3<f32>(k.w));
  return c.z * mix(vec3<f32>(k.x), clamp(pp - vec3<f32>(k.x), vec3<f32>(0.0), vec3<f32>(1.0)), c.y);
}
fn rgb2hsv(c: vec3<f32>) -> vec3<f32> {
  let k = vec4<f32>(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  let p = mix(vec4<f32>(c.bg, k.wz), vec4<f32>(c.gb, k.xy), select(0.0, 1.0, c.b >= c.g));
  let q = mix(vec4<f32>(p.xyw, c.r), vec4<f32>(c.r, p.yzx), select(0.0, 1.0, c.r >= p.x));
  let d = q.x - min(q.w, q.y);
  let e = 1e-10;
  return vec3<f32>(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// --- ruido TILEABLE (periódico): envuelve las esquinas/celdas mod 'per' ---
fn modp2(v: vec2<f32>, per: f32) -> vec2<f32> { return v - floor(v / per) * per; }
fn periodOf(freq: f32) -> f32 { return max(floor(freq + 0.5), 1.0); }

fn vnoiseP(p: vec2<f32>, per: f32) -> f32 {
  let i = floor(p); let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash21(modp2(i + vec2<f32>(0.0, 0.0), per));
  let b = hash21(modp2(i + vec2<f32>(1.0, 0.0), per));
  let c = hash21(modp2(i + vec2<f32>(0.0, 1.0), per));
  let d = hash21(modp2(i + vec2<f32>(1.0, 1.0), per));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}
fn modp2v(v: vec2<f32>, per: vec2<f32>) -> vec2<f32> { return v - floor(v / per) * per; }
fn vnoiseP2(p: vec2<f32>, per: vec2<f32>) -> f32 {
  let i = floor(p); let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash21(modp2v(i + vec2<f32>(0.0, 0.0), per));
  let b = hash21(modp2v(i + vec2<f32>(1.0, 0.0), per));
  let c = hash21(modp2v(i + vec2<f32>(0.0, 1.0), per));
  let d = hash21(modp2v(i + vec2<f32>(1.0, 1.0), per));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}
fn perlinP(p: vec2<f32>, per: f32) -> f32 {
  let i = floor(p); let f = fract(p);
  let w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let ga = normalize(hash22(modp2(i + vec2<f32>(0.0, 0.0), per)) * 2.0 - 1.0);
  let gb = normalize(hash22(modp2(i + vec2<f32>(1.0, 0.0), per)) * 2.0 - 1.0);
  let gc = normalize(hash22(modp2(i + vec2<f32>(0.0, 1.0), per)) * 2.0 - 1.0);
  let gd = normalize(hash22(modp2(i + vec2<f32>(1.0, 1.0), per)) * 2.0 - 1.0);
  let va = dot(ga, f - vec2<f32>(0.0, 0.0));
  let vb = dot(gb, f - vec2<f32>(1.0, 0.0));
  let vc = dot(gc, f - vec2<f32>(0.0, 1.0));
  let vd = dot(gd, f - vec2<f32>(1.0, 1.0));
  return mix(mix(va, vb, w.x), mix(vc, vd, w.x), w.y) * 0.5 + 0.5;
}
fn worleyP(p: vec2<f32>, per: f32, jitter: f32) -> vec2<f32> {
  let ip = floor(p); let fp = fract(p);
  var f1 = 8.0; var f2 = 8.0;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let g = vec2<f32>(f32(x), f32(y));
      let o = hash22(modp2(ip + g, per)) * jitter;
      let r = g + o - fp;
      let d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return sqrt(vec2<f32>(f1, f2));
}

// Versiones "tile-aware": si tile>0.5, periódicas con frecuencia entera (snap).
fn fbmT(uv: vec2<f32>, freq: f32, oct: i32, lac: f32, gain: f32, tile: f32) -> f32 {
  if (tile > 0.5) {
    var per = periodOf(freq);
    var p = uv * per; var amp = 0.5; var sum = 0.0; var norm = 0.0;
    for (var i = 0; i < 8; i = i + 1) {
      if (i >= oct) { break; }
      sum += amp * vnoiseP(p, per);
      norm += amp; p = p * 2.0; per = per * 2.0; amp *= gain;
    }
    return sum / max(norm, 1e-4);
  }
  return fbm(uv * freq, oct, lac, gain);
}
fn vnoiseT(uv: vec2<f32>, freq: f32, tile: f32) -> f32 {
  if (tile > 0.5) { let per = periodOf(freq); return vnoiseP(uv * per, per); }
  return vnoise(uv * freq);
}
fn perlinT(uv: vec2<f32>, freq: f32, tile: f32) -> f32 {
  if (tile > 0.5) { let per = periodOf(freq); return perlinP(uv * per, per); }
  return perlin(uv * freq);
}
fn worleyT(uv: vec2<f32>, freq: f32, jitter: f32, tile: f32) -> vec2<f32> {
  if (tile > 0.5) { let per = periodOf(freq); return worleyP(uv * per, per, jitter); }
  return worley(uv * freq, jitter);
}

struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var pts = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o: VOut;
  let xy = pts[vi];
  o.pos = vec4<f32>(xy, 0.0, 1.0);
  o.uv = xy * 0.5 + 0.5;
  return o;
}
`;

/* ------------------------------- GLSL ------------------------------- */

export const VERT_GLSL = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const COMMON_GLSL = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

layout(std140) uniform U {
  vec4 head;     // res, time, seed, pass
  vec4 p[8];
};
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D tex2;
uniform sampler2D tex3;
uniform sampler2D dataTex;

float P(int i) { return p[i / 4][i % 4]; }
float RES() { return head.x; }
float SEED() { return head.z; }
float PASS() { return head.w; }

vec4 samp0(vec2 uv) { return texture(tex0, uv); }
vec4 samp1(vec2 uv) { return texture(tex1, uv); }
vec4 samp2(vec2 uv) { return texture(tex2, uv); }
vec4 samp3(vec2 uv) { return texture(tex3, uv); }

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
mat2 rot2(float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c); }

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1, 0));
  float c = hash21(i + vec2(0, 1)), d = hash21(i + vec2(1, 1));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}
float perlin(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 ga = normalize(hash22(i) * 2.0 - 1.0);
  vec2 gb = normalize(hash22(i + vec2(1, 0)) * 2.0 - 1.0);
  vec2 gc = normalize(hash22(i + vec2(0, 1)) * 2.0 - 1.0);
  vec2 gd = normalize(hash22(i + vec2(1, 1)) * 2.0 - 1.0);
  float va = dot(ga, f), vb = dot(gb, f - vec2(1, 0));
  float vc = dot(gc, f - vec2(0, 1)), vd = dot(gd, f - vec2(1, 1));
  return mix(mix(va, vb, w.x), mix(vc, vd, w.x), w.y) * 0.5 + 0.5;
}
float fbm(vec2 p, int oct, float lac, float gain) {
  float amp = 0.5, sum = 0.0, norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    sum += amp * vnoise(p);
    norm += amp; p *= lac; amp *= gain;
  }
  return sum / max(norm, 1e-4);
}
vec2 worley(vec2 p, float jitter) {
  vec2 ip = floor(p), fp = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = hash22(ip + g) * jitter;
    vec2 r = g + o - fp;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return sqrt(vec2(f1, f2));
}
float bayer4(uvec2 c) {
  float m[16] = float[16](
    0.0/16.0, 8.0/16.0, 2.0/16.0, 10.0/16.0,
    12.0/16.0, 4.0/16.0, 14.0/16.0, 6.0/16.0,
    3.0/16.0, 11.0/16.0, 1.0/16.0, 9.0/16.0,
    15.0/16.0, 7.0/16.0, 13.0/16.0, 5.0/16.0);
  return m[int((c.y % 4u) * 4u + (c.x % 4u))];
}
vec3 hsv2rgb(vec3 c) {
  vec4 k = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 pp = abs(fract(vec3(c.x) + k.xyz) * 6.0 - k.www);
  return c.z * mix(k.xxx, clamp(pp - k.xxx, 0.0, 1.0), c.y);
}
vec3 rgb2hsv(vec3 c) {
  vec4 k = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, k.wz), vec4(c.gb, k.xy), step(c.g, c.b));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec2 modp2(vec2 v, float per) { return v - floor(v / per) * per; }
float periodOf(float freq) { return max(floor(freq + 0.5), 1.0); }
float vnoiseP(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  float a = hash21(modp2(i, per));
  float b = hash21(modp2(i + vec2(1, 0), per));
  float c = hash21(modp2(i + vec2(0, 1), per));
  float d = hash21(modp2(i + vec2(1, 1), per));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}
vec2 modp2v(vec2 v, vec2 per) { return v - floor(v / per) * per; }
float vnoiseP2(vec2 p, vec2 per) {
  vec2 i = floor(p), f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  float a = hash21(modp2v(i, per));
  float b = hash21(modp2v(i + vec2(1, 0), per));
  float c = hash21(modp2v(i + vec2(0, 1), per));
  float d = hash21(modp2v(i + vec2(1, 1), per));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}
float perlinP(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  vec2 w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 ga = normalize(hash22(modp2(i, per)) * 2.0 - 1.0);
  vec2 gb = normalize(hash22(modp2(i + vec2(1, 0), per)) * 2.0 - 1.0);
  vec2 gc = normalize(hash22(modp2(i + vec2(0, 1), per)) * 2.0 - 1.0);
  vec2 gd = normalize(hash22(modp2(i + vec2(1, 1), per)) * 2.0 - 1.0);
  float va = dot(ga, f), vb = dot(gb, f - vec2(1, 0));
  float vc = dot(gc, f - vec2(0, 1)), vd = dot(gd, f - vec2(1, 1));
  return mix(mix(va, vb, w.x), mix(vc, vd, w.x), w.y) * 0.5 + 0.5;
}
vec2 worleyP(vec2 p, float per, float jitter) {
  vec2 ip = floor(p), fp = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = hash22(modp2(ip + g, per)) * jitter;
    vec2 r = g + o - fp;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return sqrt(vec2(f1, f2));
}
float fbmT(vec2 uv, float freq, int oct, float lac, float gain, float tile) {
  if (tile > 0.5) {
    float per = periodOf(freq);
    vec2 p = uv * per; float amp = 0.5, sum = 0.0, norm = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= oct) break;
      sum += amp * vnoiseP(p, per);
      norm += amp; p *= 2.0; per *= 2.0; amp *= gain;
    }
    return sum / max(norm, 1e-4);
  }
  return fbm(uv * freq, oct, lac, gain);
}
float vnoiseT(vec2 uv, float freq, float tile) {
  if (tile > 0.5) { float per = periodOf(freq); return vnoiseP(uv * per, per); }
  return vnoise(uv * freq);
}
float perlinT(vec2 uv, float freq, float tile) {
  if (tile > 0.5) { float per = periodOf(freq); return perlinP(uv * per, per); }
  return perlin(uv * freq);
}
vec2 worleyT(vec2 uv, float freq, float jitter, float tile) {
  if (tile > 0.5) { float per = periodOf(freq); return worleyP(uv * per, per, jitter); }
  return worley(uv * freq, jitter);
}
`;

export const MAIN_GLSL = /* glsl */ `
void main() { fragColor = fs(v_uv); }
`;
