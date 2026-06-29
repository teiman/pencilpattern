// Backend de CPU (JavaScript puro). Última vía: si WebGPU y WebGL2 fallan, esto
// SIEMPRE produce algo no negro. Implementa en JS los modificadores del demo y,
// para el resto, pasa la entrada (o gris medio) — nunca negro. Es lento; su papel
// es ser el suelo garantizado, no el camino rápido.
import type { ModifierDef } from '../../graph/types';
import type { GpuBackend, GpuTexture, CreateResult } from '../types';
import { decodeToBitmap } from '../image';

class CpuTex implements GpuTexture {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
  get bytes(): number {
    return this.width * this.height * 4;
  }
  destroy(): void {}
}

export async function createCpuBackend(): Promise<CreateResult> {
  if (typeof OffscreenCanvas === 'undefined') {
    return { ok: false, error: 'OffscreenCanvas not available (no CPU backend)' };
  }
  return { ok: true, backend: new CpuBackend() };
}

// ---- helpers numéricos ----
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const fract = (x: number) => x - Math.floor(x);
const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / Math.max(e1 - e0, 1e-6));
  return t * t * (3 - 2 * t);
}
function num(p: Record<string, unknown>, k: string, d: number): number {
  const v = p[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}
function str(p: Record<string, unknown>, k: string, d: string): string {
  const v = p[k];
  return typeof v === 'string' ? v : d;
}
function enumIdx(p: Record<string, unknown>, k: string, opts: readonly string[], d: number): number {
  const i = opts.indexOf(str(p, k, ''));
  return i >= 0 ? i : d;
}
function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0.5, 0.5, 0.5];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function hash2(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return mix(mix(a, b, ux), mix(c, d, ux), uy);
}
function fbm(x: number, y: number, oct = 5): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < oct && i < 8; i++) {
    sum += amp * vnoise(x, y);
    norm += amp;
    x *= 2;
    y *= 2;
    amp *= 0.5;
  }
  return sum / Math.max(norm, 1e-4);
}
function worley(x: number, y: number): [number, number] {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let f1 = 8;
  let f2 = 8;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const ox = hash2(ix + i, iy + j);
      const oy = hash2(ix + i + 7.1, iy + j + 3.7);
      const rx = i + ox - (x - ix);
      const ry = j + oy - (y - iy);
      const d = rx * rx + ry * ry;
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) f2 = d;
    }
  return [Math.sqrt(f1), Math.sqrt(f2)];
}
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);
const bayer4 = (x: number, y: number) => BAYER4[(y & 3) * 4 + (x & 3)];

const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'add', 'subtract', 'difference', 'darken', 'lighten'];
function blendOp(mode: number, a: number, b: number): number {
  switch (mode) {
    case 1: return a * b;
    case 2: return 1 - (1 - a) * (1 - b);
    case 3: return a > 0.5 ? 1 - 2 * (1 - a) * (1 - b) : 2 * a * b;
    case 4: return a + b;
    case 5: return a - b;
    case 6: return Math.abs(a - b);
    case 7: return Math.min(a, b);
    case 8: return Math.max(a, b);
    default: return b;
  }
}
function rgb2hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return [h, max <= 0 ? 0 : d / max, max];
}
function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}
function curveEval(c: number, k: number[]): number {
  const t = clamp01(c) * 4;
  const i = Math.floor(t);
  const f = t - i;
  const idx = Math.min(Math.max(i, 0), 3);
  return mix(k[idx], k[idx + 1], f);
}

function generator(id: string, u: number, v: number, p: Record<string, unknown>): number {
  const scale = num(p, 'scale', id === 'wood' ? 8 : id === 'brushed-metal' ? 200 : id === 'fabric' ? 24 : 5);
  switch (id) {
    case 'gradient-shape': {
      const shape = enumIdx(p, 'shape', ['Linear', 'Radial', 'Angular', 'Diamond'], 0);
      const ang = num(p, 'angle', 0);
      const sc = Math.max(num(p, 'scale', 1), 1e-3);
      const cx = u - 0.5;
      const cy = v - 0.5;
      let val: number;
      if (shape === 0) val = (u - 0.5) * Math.cos(ang) + (v - 0.5) * Math.sin(ang) + 0.5;
      else if (shape === 1) val = (Math.hypot(cx, cy) * 2) / sc;
      else if (shape === 2) val = fract((Math.atan2(cy, cx) - ang) / (2 * Math.PI) + 1);
      else val = ((Math.abs(cx) + Math.abs(cy)) * 2) / sc;
      val = clamp01(val);
      return p['invert'] ? 1 - val : val;
    }
    case 'brick': {
      const rows = Math.max(num(p, 'rows', 12), 1);
      const ry = v * rows;
      const row = Math.floor(ry);
      const shift = (row % 2) * num(p, 'offset', 0.5);
      const cols = Math.max(num(p, 'cols', 6), 1);
      const cxb = fract(u * cols + shift);
      const cyb = fract(ry);
      const m = num(p, 'mortar', 0.08);
      const bv = Math.max(num(p, 'bevel', 0.06), 1e-4);
      const dx = Math.min(smoothstep(0, bv, cxb - m * 0.5), smoothstep(0, bv, 1 - m * 0.5 - cxb));
      const dy = Math.min(smoothstep(0, bv, cyb - m * 0.5), smoothstep(0, bv, 1 - m * 0.5 - cyb));
      return Math.min(dx, dy);
    }
    case 'worley':
      return clamp01(worley(u * scale, v * scale)[0]);
    case 'crystal': {
      const w = worley(u * scale, v * scale);
      return clamp01(0.5 * w[0] + 0.5 * smoothstep(0, 0.2, w[1] - w[0]));
    }
    case 'wood': {
      const rings = fract(u * num(p, 'rings', 6) + fbm(u * 8, v * 8) * 1.0);
      return clamp01(0.35 + 0.6 * Math.abs(rings * 2 - 1));
    }
    case 'fabric':
      return clamp01(0.5 * Math.abs(Math.sin(fract(u * scale) * Math.PI)) + 0.5 * Math.abs(Math.sin(fract(v * scale) * Math.PI)));
    case 'brushed-metal':
      return clamp01(0.45 + 0.5 * vnoise(u * scale, v * scale * 0.05));
    case 'corrosion':
      return clamp01(smoothstep(0, 1, (fbm(u * scale, v * scale, 6) - 0.4) * 3));
    default:
      return clamp01(fbm(u * scale, v * scale, Math.round(num(p, 'octaves', 5))));
  }
}

function cpuRender(
  mod: ModifierDef,
  params: Record<string, unknown>,
  inputs: GpuTexture[],
  res: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(res * res * 4);
  const inA = (inputs[0] as CpuTex | undefined)?.data;
  const inB = (inputs[1] as CpuTex | undefined)?.data;
  const inC = (inputs[2] as CpuTex | undefined)?.data;
  const id = mod.id;
  const isGen = mod.inputArity === 0;

  const knots = Array.isArray(params['knots']) ? (params['knots'] as number[]) : [0, 0.25, 0.5, 0.75, 1];
  const ca = hexToRgb(str(params, 'colorA', '#1a1208'));
  const cb = hexToRgb(str(params, 'colorB', '#e8dcc0'));

  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const i = (y * res + x) * 4;
      const u = x / res;
      const v = y / res;
      let r = 0.5;
      let g = 0.5;
      let b = 0.5;

      if (isGen) {
        r = g = b = generator(id, u, v, params);
      } else {
        let ar = 0.5;
        let ag = 0.5;
        let ab = 0.5;
        if (inA) {
          ar = inA[i] / 255;
          ag = inA[i + 1] / 255;
          ab = inA[i + 2] / 255;
        }
        const L = lum(ar, ag, ab);
        switch (id) {
          case 'invert': {
            const a = num(params, 'amount', 1);
            r = mix(ar, 1 - ar, a);
            g = mix(ag, 1 - ag, a);
            b = mix(ab, 1 - ab, a);
            break;
          }
          case 'levels': {
            const ib = num(params, 'inBlack', 0);
            const iw = num(params, 'inWhite', 1);
            const gm = num(params, 'gamma', 1);
            const ob = num(params, 'outBlack', 0);
            const ow = num(params, 'outWhite', 1);
            const f = (c: number) => mix(ob, ow, Math.pow(clamp01((c - ib) / Math.max(iw - ib, 1e-4)), 1 / Math.max(gm, 1e-4)));
            r = f(ar);
            g = f(ag);
            b = f(ab);
            break;
          }
          case 'threshold': {
            let t = smoothstep(num(params, 'level', 0.5) - num(params, 'softness', 0.02), num(params, 'level', 0.5) + num(params, 'softness', 0.02), L);
            if (params['invert']) t = 1 - t;
            r = g = b = t;
            break;
          }
          case 'gradient-map': {
            const t = Math.pow(L, mix(2, 0.5, num(params, 'bias', 0.5)));
            r = mix(ca[0], cb[0], t);
            g = mix(ca[1], cb[1], t);
            b = mix(ca[2], cb[2], t);
            break;
          }
          case 'curve':
            r = curveEval(ar, knots);
            g = curveEval(ag, knots);
            b = curveEval(ab, knots);
            break;
          case 'ordered-dither': {
            const levels = Math.max(num(params, 'levels', 2), 2);
            const d = L + (bayer4(x, y) - 0.5) * (1 / levels) * num(params, 'strength', 1);
            const q = clamp01(Math.round(d * (levels - 1)) / (levels - 1));
            r = g = b = q;
            break;
          }
          case 'blend': {
            let br = ar;
            let bg = ag;
            let bb = ab;
            if (inB) {
              br = inB[i] / 255;
              bg = inB[i + 1] / 255;
              bb = inB[i + 2] / 255;
            }
            const mode = enumIdx(params, 'mode', BLEND_MODES, 0);
            const op = num(params, 'opacity', 1);
            r = clamp01(mix(ar, blendOp(mode, ar, br), op));
            g = clamp01(mix(ag, blendOp(mode, ag, bg), op));
            b = clamp01(mix(ab, blendOp(mode, ab, bb), op));
            break;
          }
          case 'mask-blend': {
            let tr = ar;
            let tg = ag;
            let tb = ab;
            if (inB) {
              tr = inB[i] / 255;
              tg = inB[i + 1] / 255;
              tb = inB[i + 2] / 255;
            }
            // Máscara desde el 3er input (luminancia); sin él, sin efecto.
            let mk = 0;
            if (inC) mk = lum(inC[i] / 255, inC[i + 1] / 255, inC[i + 2] / 255);
            mk = clamp01((mk - num(params, 'inLow', 0)) / Math.max(num(params, 'inHigh', 1) - num(params, 'inLow', 0), 1e-4));
            if (params['invert']) mk = 1 - mk;
            const op = mk * num(params, 'opacity', 1);
            r = mix(ar, tr, op);
            g = mix(ag, tg, op);
            b = mix(ab, tb, op);
            break;
          }
          case 'hsv': {
            const [h0, s0, v0] = rgb2hsv(ar, ag, ab);
            const [nr, ng, nb] = hsv2rgb(
              fract(h0 + num(params, 'hue', 0)),
              clamp01(s0 * num(params, 'sat', 1)),
              clamp01(v0 * num(params, 'val', 1)),
            );
            r = nr;
            g = ng;
            b = nb;
            break;
          }
          default:
            // Sin port CPU específico (blur, displace, normal, hatching, sharpen…):
            // pasa la entrada. Nunca negro.
            r = ar;
            g = ag;
            b = ab;
        }
      }

      out[i] = r * 255;
      out[i + 1] = g * 255;
      out[i + 2] = b * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

class CpuBackend implements GpuBackend {
  readonly kind = 'cpu' as const;

  async renderModifier(
    mod: ModifierDef,
    params: Record<string, unknown>,
    inputs: GpuTexture[],
    res: number,
  ): Promise<GpuTexture> {
    return new CpuTex(cpuRender(mod, params, inputs, res), res, res);
  }

  async toImageBitmap(tex: GpuTexture, size: number): Promise<ImageBitmap> {
    const t = tex as CpuTex;
    const src = new OffscreenCanvas(t.width, t.height);
    const sctx = src.getContext('2d')!;
    const img = new ImageData(t.width, t.height);
    img.data.set(t.data);
    sctx.putImageData(img, 0, 0);
    const dst = new OffscreenCanvas(size, size);
    const dctx = dst.getContext('2d')!;
    dctx.imageSmoothingEnabled = true;
    dctx.drawImage(src, 0, 0, size, size);
    return dst.transferToImageBitmap();
  }

  async readPixels(tex: GpuTexture): Promise<Uint8ClampedArray> {
    return (tex as CpuTex).data;
  }

  async imageToTexture(src: string, res: number): Promise<GpuTexture> {
    const bmp = await decodeToBitmap(src, res);
    const canvas = new OffscreenCanvas(res, res);
    const ctx = canvas.getContext('2d')!;
    if (bmp) {
      ctx.drawImage(bmp, 0, 0, res, res);
      bmp.close();
    } else {
      ctx.fillStyle = '#6a6a72';
      ctx.fillRect(0, 0, res, res);
    }
    const data = ctx.getImageData(0, 0, res, res).data;
    return new CpuTex(new Uint8ClampedArray(data), res, res);
  }

  destroy(): void {}
}
