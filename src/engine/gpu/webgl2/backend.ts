// Backend WebGL2 (fallback de WebGPU). Misma interfaz GpuBackend: ejecuta cada
// modificador como pasada(s) full-screen usando el cuerpo GLSL del modificador.
// Uniformes vía UBO std140 (igual layout que WebGPU); ping-pong con FBOs.
import type { ModifierDef } from '../../graph/types';
import type { GpuBackend, GpuTexture, CreateResult } from '../types';
import { COMMON_GLSL, MAIN_GLSL, VERT_GLSL, UNIFORM_FLOATS } from '../shaders/common';
import { looksRendered, SMOKE_MOD } from '../selftest';
import { decodeToBitmap } from '../image';
import { buildPaletteRGBA } from '../palette';

const BLIT_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_tex;
void main() { fragColor = texture(u_tex, v_uv); }
`;

class GLTex implements GpuTexture {
  constructor(
    readonly tex: WebGLTexture,
    readonly width: number,
    readonly height: number,
    private gl: WebGL2RenderingContext,
  ) {}
  get bytes(): number {
    return this.width * this.height * 4;
  }
  destroy(): void {
    this.gl.deleteTexture(this.tex);
  }
}

export async function createWebGl2Backend(): Promise<CreateResult> {
  let canvas: OffscreenCanvas;
  try {
    canvas = new OffscreenCanvas(64, 64);
  } catch (e) {
    return { ok: false, error: `No OffscreenCanvas: ${String(e)}` };
  }
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, antialias: false });
  if (!gl) return { ok: false, error: 'WebGL2 not available' };
  const backend = new WebGl2Backend(canvas, gl);
  try {
    if (!(await backend.selfTest())) {
      backend.destroy();
      return { ok: false, error: 'WebGL2 started but the self-test came out black/empty' };
    }
  } catch (e) {
    backend.destroy();
    return { ok: false, error: `WebGL2 self-test threw: ${String(e)}` };
  }
  return { ok: true, backend };
}

class WebGl2Backend implements GpuBackend {
  readonly kind = 'webgl2' as const;

  private vao: WebGLVertexArrayObject;
  private ubo: WebGLBuffer;
  private uniformData = new Float32Array(UNIFORM_FLOATS);
  private fbo: WebGLFramebuffer;
  private dummy: WebGLTexture;
  private palette: WebGLTexture;
  private programs = new Map<string, WebGLProgram>();
  private blit: WebGLProgram;

  constructor(
    private canvas: OffscreenCanvas,
    private gl: WebGL2RenderingContext,
  ) {
    const g = gl;
    // Triángulo full-screen.
    this.vao = g.createVertexArray()!;
    g.bindVertexArray(this.vao);
    const vbo = g.createBuffer()!;
    g.bindBuffer(g.ARRAY_BUFFER, vbo);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
    g.enableVertexAttribArray(0);
    g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
    g.bindVertexArray(null);

    this.ubo = g.createBuffer()!;
    g.bindBuffer(g.UNIFORM_BUFFER, this.ubo);
    g.bufferData(g.UNIFORM_BUFFER, UNIFORM_FLOATS * 4, g.DYNAMIC_DRAW);
    g.bindBufferBase(g.UNIFORM_BUFFER, 0, this.ubo);

    this.fbo = g.createFramebuffer()!;
    this.dummy = this.makeTex(1, 1);
    // Paleta de Quake (256×1) como textura de datos (dataTex, unidad 4).
    this.palette = this.makeTex(256, 1);
    g.bindTexture(g.TEXTURE_2D, this.palette);
    g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, 256, 1, g.RGBA, g.UNSIGNED_BYTE, buildPaletteRGBA());
    this.blit = this.makeProgram(VERT_GLSL, BLIT_FS);
    g.useProgram(this.blit);
    g.uniform1i(g.getUniformLocation(this.blit, 'u_tex'), 0);
  }

  async selfTest(): Promise<boolean> {
    // Camino REAL (preludio GLSL + programa): si el GLSL no compila, makeProgram lanza.
    const tex = await this.renderModifier(SMOKE_MOD, {}, [], 16);
    const rgba = await this.readPixels(tex);
    tex.destroy();
    return looksRendered(rgba);
  }

  private compile(type: number, src: string): WebGLShader {
    const g = this.gl;
    const sh = g.createShader(type)!;
    g.shaderSource(sh, src);
    g.compileShader(sh);
    if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) {
      const log = g.getShaderInfoLog(sh);
      g.deleteShader(sh);
      throw new Error(`Error compilando shader GLSL: ${log}`);
    }
    return sh;
  }

  private makeProgram(vs: string, fs: string): WebGLProgram {
    const g = this.gl;
    const prog = g.createProgram()!;
    g.attachShader(prog, this.compile(g.VERTEX_SHADER, vs));
    g.attachShader(prog, this.compile(g.FRAGMENT_SHADER, fs));
    g.bindAttribLocation(prog, 0, 'a_pos');
    g.linkProgram(prog);
    if (!g.getProgramParameter(prog, g.LINK_STATUS)) {
      throw new Error(`Error enlazando programa GLSL: ${g.getProgramInfoLog(prog)}`);
    }
    const blockIdx = g.getUniformBlockIndex(prog, 'U');
    if (blockIdx !== g.INVALID_INDEX) g.uniformBlockBinding(prog, blockIdx, 0);
    // Samplers tex0..tex3 -> unidades 0..3.
    g.useProgram(prog);
    for (let i = 0; i < 4; i++) {
      const loc = g.getUniformLocation(prog, `tex${i}`);
      if (loc) g.uniform1i(loc, i);
    }
    const dloc = g.getUniformLocation(prog, 'dataTex');
    if (dloc) g.uniform1i(dloc, 4);
    return prog;
  }

  private getProgram(mod: ModifierDef): WebGLProgram {
    const key = `${mod.id}#${mod.shaderVersion}`;
    let p = this.programs.get(key);
    if (p) return p;
    if (!mod.glsl) throw new Error(`Modifier ${mod.id} has no GLSL body (WebGL2 fallback)`);
    p = this.makeProgram(VERT_GLSL, COMMON_GLSL + '\n' + mod.glsl + '\n' + MAIN_GLSL);
    this.programs.set(key, p);
    return p;
  }

  private makeTex(w: number, h: number): WebGLTexture {
    const g = this.gl;
    const t = g.createTexture()!;
    g.bindTexture(g.TEXTURE_2D, t);
    g.texStorage2D(g.TEXTURE_2D, 1, g.RGBA8, w, h);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.REPEAT);
    g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.REPEAT);
    return t;
  }

  private writeUniform(res: number, pass: number, packed: number[]): void {
    const d = this.uniformData;
    d[0] = res;
    d[1] = 0;
    d[2] = 0;
    d[3] = pass;
    for (let i = 0; i < 32; i++) d[4 + i] = packed[i] ?? 0;
    const g = this.gl;
    g.bindBuffer(g.UNIFORM_BUFFER, this.ubo);
    g.bufferSubData(g.UNIFORM_BUFFER, 0, d);
  }

  private runPass(
    prog: WebGLProgram,
    target: WebGLTexture,
    inputs: (WebGLTexture | null)[],
    res: number,
    pass: number,
    packed: number[],
  ): void {
    const g = this.gl;
    g.bindFramebuffer(g.FRAMEBUFFER, this.fbo);
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, target, 0);
    g.viewport(0, 0, res, res);
    g.useProgram(prog);
    g.bindVertexArray(this.vao);
    this.writeUniform(res, pass, packed);
    for (let i = 0; i < 4; i++) {
      g.activeTexture(g.TEXTURE0 + i);
      g.bindTexture(g.TEXTURE_2D, inputs[i] ?? this.dummy);
    }
    g.activeTexture(g.TEXTURE0 + 4);
    g.bindTexture(g.TEXTURE_2D, this.palette);
    g.drawArrays(g.TRIANGLES, 0, 3);
  }

  async renderModifier(
    mod: ModifierDef,
    params: Record<string, unknown>,
    inputs: GpuTexture[],
    res: number,
  ): Promise<GpuTexture> {
    const prog = this.getProgram(mod);
    const packed = mod.pack(params);
    const passes = mod.passes ?? 1;
    const inTex: (WebGLTexture | null)[] = [null, null, null, null];
    for (let i = 0; i < 4; i++) inTex[i] = (inputs[i] as GLTex | undefined)?.tex ?? null;

    if (passes === 1) {
      const out = this.makeTex(res, res);
      this.runPass(prog, out, inTex, res, 0, packed);
      return new GLTex(out, res, res, this.gl);
    }

    let src = inTex[0];
    const out = this.makeTex(res, res);
    let tmp: WebGLTexture | null = null;
    for (let pass = 0; pass < passes; pass++) {
      const target = pass === passes - 1 ? out : this.makeTex(res, res);
      this.runPass(prog, target, [src, inTex[1], inTex[2], inTex[3]], res, pass, packed);
      if (pass < passes - 1) {
        if (tmp) this.gl.deleteTexture(tmp);
        tmp = target;
        src = target;
      }
    }
    if (tmp) this.gl.deleteTexture(tmp);
    return new GLTex(out, res, res, this.gl);
  }

  async toImageBitmap(tex: GpuTexture, size: number): Promise<ImageBitmap> {
    const g = this.gl;
    const t = tex as GLTex;
    if (this.canvas.width !== size || this.canvas.height !== size) {
      this.canvas.width = size;
      this.canvas.height = size;
    }
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.viewport(0, 0, size, size);
    g.useProgram(this.blit);
    g.bindVertexArray(this.vao);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, t.tex);
    g.drawArrays(g.TRIANGLES, 0, 3);
    return this.canvas.transferToImageBitmap();
  }

  async readPixels(tex: GpuTexture): Promise<Uint8ClampedArray> {
    const g = this.gl;
    const t = tex as GLTex;
    const w = t.width;
    const h = t.height;
    g.bindFramebuffer(g.FRAMEBUFFER, this.fbo);
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, t.tex, 0);
    const buf = new Uint8Array(w * h * 4);
    g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, buf);
    // WebGL tiene origen abajo-izquierda: volteamos verticalmente para PNG (arriba-izquierda).
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      out.set(buf.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4);
    }
    return out;
  }

  async imageToTexture(src: string, res: number): Promise<GpuTexture> {
    const g = this.gl;
    const bmp = await decodeToBitmap(src, res);
    const t = this.makeTex(res, res);
    g.bindTexture(g.TEXTURE_2D, t);
    if (bmp) {
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true);
      g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, res, res, g.RGBA, g.UNSIGNED_BYTE, bmp);
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, false);
      bmp.close();
    } else {
      const px = new Uint8Array(res * res * 4);
      for (let i = 0; i < px.length; i += 4) {
        px[i] = 106;
        px[i + 1] = 106;
        px[i + 2] = 114;
        px[i + 3] = 255;
      }
      g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, res, res, g.RGBA, g.UNSIGNED_BYTE, px);
    }
    return new GLTex(t, res, res, g);
  }

  destroy(): void {
    const g = this.gl;
    g.deleteBuffer(this.ubo);
    g.deleteFramebuffer(this.fbo);
    g.deleteTexture(this.dummy);
    g.deleteTexture(this.palette);
    for (const p of this.programs.values()) g.deleteProgram(p);
    g.deleteProgram(this.blit);
  }
}
