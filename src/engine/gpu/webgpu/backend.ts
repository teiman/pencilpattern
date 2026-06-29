// Backend WebGPU: ejecuta cada modificador como 1+ pasadas full-screen.
// Detección de errores: los pipelines se crean con createRenderPipelineAsync
// (RECHAZA si el shader es inválido) y hay listener de 'uncapturederror'. Antes
// de usarse, el backend pasa un AUTO-TEST (render de degradado + readback).
import type { ModifierDef } from '../../graph/types';
import type { GpuBackend, GpuTexture, CreateResult } from '../types';
import { COMMON_WGSL, UNIFORM_FLOATS } from '../shaders/common';
import { looksRendered, SMOKE_MOD } from '../selftest';
import { decodeToBitmap } from '../image';
import { buildPaletteRGBA } from '../palette';
import { requestDevice } from './device';

const FORMAT: GPUTextureFormat = 'rgba8unorm';

class WTex implements GpuTexture {
  constructor(
    readonly texture: GPUTexture,
    readonly width: number,
    readonly height: number,
  ) {}
  get bytes(): number {
    return this.width * this.height * 4;
  }
  destroy(): void {
    this.texture.destroy();
  }
}

const BLIT_WGSL = /* wgsl */ `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var pts = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o: VOut;
  let xy = pts[vi];
  o.pos = vec4<f32>(xy, 0.0, 1.0);
  o.uv = xy * 0.5 + 0.5;
  return o;
}
@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  return textureSampleLevel(tex, samp, uv, 0.0);
}`;

export async function createWebGpuBackend(): Promise<CreateResult> {
  const device = await requestDevice();
  if (!device) return { ok: false, error: 'WebGPU not available (no adapter/device)' };
  const backend = new WebGpuBackend(device);
  try {
    if (!(await backend.selfTest())) {
      backend.destroy();
      return { ok: false, error: 'WebGPU started but the self-test came out black/empty' };
    }
  } catch (e) {
    backend.destroy();
    return { ok: false, error: `WebGPU self-test threw: ${String(e)}` };
  }
  return { ok: true, backend };
}

class WebGpuBackend implements GpuBackend {
  readonly kind = 'webgpu' as const;
  lastError: string | null = null;

  private sampler: GPUSampler;
  private dummy: GPUTexture;
  private dummyView: GPUTextureView;
  private palette: GPUTexture;
  private paletteView: GPUTextureView;
  private bgl: GPUBindGroupLayout;
  private layout: GPUPipelineLayout;
  private uniform: GPUBuffer;
  private uniformData = new Float32Array(UNIFORM_FLOATS);
  private pipelines = new Map<string, Promise<GPURenderPipeline>>();

  private canvas: OffscreenCanvas | null = null;
  private ctx: GPUCanvasContext | null = null;
  private canvasFormat: GPUTextureFormat;
  private blitPipeline: GPURenderPipeline | null = null;
  private blitBgl: GPUBindGroupLayout;

  constructor(private device: GPUDevice) {
    device.addEventListener?.('uncapturederror', (ev: Event) => {
      const e = ev as GPUUncapturedErrorEvent;
      this.lastError = e.error.message;
      console.error('[WebGPU uncaptured error]', e.error.message);
    });

    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
    });
    this.dummy = device.createTexture({
      size: [1, 1],
      format: FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.dummyView = this.dummy.createView();

    // Textura de datos: paleta de Quake (256×1), accesible como dataTex en todos los shaders.
    this.palette = device.createTexture({
      size: [256, 1],
      format: FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: this.palette },
      buildPaletteRGBA(),
      { bytesPerRow: 256 * 4, rowsPerImage: 1 },
      { width: 256, height: 1 },
    );
    this.paletteView = this.palette.createView();

    this.bgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
    this.layout = device.createPipelineLayout({ bindGroupLayouts: [this.bgl] });
    this.uniform = device.createBuffer({
      size: UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.blitBgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
  }

  async selfTest(): Promise<boolean> {
    // Renderiza un modificador de prueba por el camino REAL (preludio + pipeline):
    // si el preludio o el pipeline fallan, renderModifier lanza y este backend se descarta.
    const tex = await this.renderModifier(SMOKE_MOD, {}, [], 16);
    const rgba = await this.readPixels(tex);
    tex.destroy();
    return looksRendered(rgba);
  }

  private getPipeline(mod: ModifierDef): Promise<GPURenderPipeline> {
    const key = `${mod.id}#${mod.shaderVersion}`;
    let p = this.pipelines.get(key);
    if (p) return p;
    const module = this.device.createShaderModule({ code: COMMON_WGSL + '\n' + mod.wgsl });
    p = this.device.createRenderPipelineAsync({
      layout: this.layout,
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: FORMAT }] },
      primitive: { topology: 'triangle-list' },
    });
    this.pipelines.set(key, p);
    return p;
  }

  private newTarget(res: number): GPUTexture {
    return this.device.createTexture({
      size: [res, res],
      format: FORMAT,
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });
  }

  private bindGroup(views: (GPUTextureView | null)[]): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.bgl,
      entries: [
        { binding: 0, resource: { buffer: this.uniform } },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: views[0] ?? this.dummyView },
        { binding: 3, resource: views[1] ?? this.dummyView },
        { binding: 4, resource: views[2] ?? this.dummyView },
        { binding: 5, resource: views[3] ?? this.dummyView },
        { binding: 6, resource: this.paletteView },
      ],
    });
  }

  private writeUniform(res: number, pass: number, packed: number[]): void {
    const d = this.uniformData;
    d[0] = res;
    d[1] = 0;
    d[2] = 0;
    d[3] = pass;
    for (let i = 0; i < 32; i++) d[4 + i] = packed[i] ?? 0;
    this.device.queue.writeBuffer(this.uniform, 0, d);
  }

  private runPass(
    pipe: GPURenderPipeline,
    out: GPUTexture,
    inputViews: (GPUTextureView | null)[],
    res: number,
    pass: number,
    packed: number[],
  ): void {
    this.writeUniform(res, pass, packed);
    const bg = this.bindGroup(inputViews);
    const enc = this.device.createCommandEncoder();
    const rp = enc.beginRenderPass({
      colorAttachments: [
        { view: out.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } },
      ],
    });
    rp.setPipeline(pipe);
    rp.setBindGroup(0, bg);
    rp.draw(3);
    rp.end();
    this.device.queue.submit([enc.finish()]);
  }

  async renderModifier(
    mod: ModifierDef,
    params: Record<string, unknown>,
    inputs: GpuTexture[],
    res: number,
  ): Promise<GpuTexture> {
    const pipe = await this.getPipeline(mod); // RECHAZA si el shader es inválido
    const packed = mod.pack(params);
    const passes = mod.passes ?? 1;

    const inViews: (GPUTextureView | null)[] = [null, null, null, null];
    for (let i = 0; i < 4; i++) {
      const t = inputs[i] as WTex | undefined;
      inViews[i] = t ? t.texture.createView() : null;
    }

    if (passes === 1) {
      const out = this.newTarget(res);
      this.runPass(pipe, out, inViews, res, 0, packed);
      return new WTex(out, res, res);
    }

    let src = inViews[0];
    const outTex = this.newTarget(res);
    let tmp: GPUTexture | null = null;
    for (let pass = 0; pass < passes; pass++) {
      const target = pass === passes - 1 ? outTex : this.newTarget(res);
      this.runPass(pipe, target, [src, inViews[1], inViews[2], inViews[3]], res, pass, packed);
      if (pass < passes - 1) {
        if (tmp) tmp.destroy();
        tmp = target;
        src = target.createView();
      }
    }
    if (tmp) tmp.destroy();
    return new WTex(outTex, res, res);
  }

  private newImageTarget(res: number): GPUTexture {
    return this.device.createTexture({
      size: [res, res],
      format: FORMAT,
      usage:
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC,
    });
  }

  async imageToTexture(src: string, res: number): Promise<GpuTexture> {
    const bmp = await decodeToBitmap(src, res);
    const tex = this.newImageTarget(res);
    if (!bmp) {
      const enc = this.device.createCommandEncoder();
      const rp = enc.beginRenderPass({
        colorAttachments: [
          { view: tex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0.41, g: 0.41, b: 0.45, a: 1 } },
        ],
      });
      rp.end();
      this.device.queue.submit([enc.finish()]);
      return new WTex(tex, res, res);
    }
    this.device.queue.copyExternalImageToTexture({ source: bmp }, { texture: tex }, [res, res]);
    bmp.close();
    return new WTex(tex, res, res);
  }

  private ensureCanvas(size: number): void {
    if (!this.canvas) {
      this.canvas = new OffscreenCanvas(size, size);
      this.ctx = this.canvas.getContext('webgpu');
      if (!this.ctx) throw new Error('OffscreenCanvas WebGPU not available');
    }
    if (this.canvas.width !== size || this.canvas.height !== size) {
      this.canvas.width = size;
      this.canvas.height = size;
    }
    this.ctx!.configure({ device: this.device, format: this.canvasFormat, alphaMode: 'opaque' });
    if (!this.blitPipeline) {
      const module = this.device.createShaderModule({ code: BLIT_WGSL });
      this.blitPipeline = this.device.createRenderPipeline({
        layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.blitBgl] }),
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format: this.canvasFormat }] },
        primitive: { topology: 'triangle-list' },
      });
    }
  }

  async toImageBitmap(tex: GpuTexture, size: number): Promise<ImageBitmap> {
    const wt = tex as WTex;
    this.ensureCanvas(size);
    const bg = this.device.createBindGroup({
      layout: this.blitBgl,
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: wt.texture.createView() },
      ],
    });
    const enc = this.device.createCommandEncoder();
    const rp = enc.beginRenderPass({
      colorAttachments: [
        { view: this.ctx!.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } },
      ],
    });
    rp.setPipeline(this.blitPipeline!);
    rp.setBindGroup(0, bg);
    rp.draw(3);
    rp.end();
    this.device.queue.submit([enc.finish()]);
    // Espera a que la GPU termine ANTES de capturar el canvas (si no, sale negro).
    await this.device.queue.onSubmittedWorkDone();
    return this.canvas!.transferToImageBitmap();
  }

  async readPixels(tex: GpuTexture): Promise<Uint8ClampedArray> {
    const wt = tex as WTex;
    const w = wt.width;
    const h = wt.height;
    const bytesPerRow = Math.ceil((w * 4) / 256) * 256;
    const buffer = this.device.createBuffer({
      size: bytesPerRow * h,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const enc = this.device.createCommandEncoder();
    enc.copyTextureToBuffer(
      { texture: wt.texture },
      { buffer, bytesPerRow, rowsPerImage: h },
      { width: w, height: h },
    );
    this.device.queue.submit([enc.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const padded = new Uint8Array(buffer.getMappedRange());
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      const srcOff = y * bytesPerRow;
      out.set(padded.subarray(srcOff, srcOff + w * 4), y * w * 4);
    }
    buffer.unmap();
    buffer.destroy();
    return out;
  }

  destroy(): void {
    this.uniform.destroy();
    this.dummy.destroy();
    this.device.destroy();
  }
}
