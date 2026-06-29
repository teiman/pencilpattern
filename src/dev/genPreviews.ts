// Generador de thumbnails de PREVIEW para el browser de modificadores.
//
// Expone (solo dev) helpers en window para que un script de Playwright los
// conduzca y guarde los PNG en public/previews/. También se puede usar a mano:
//   await __genPreviews()            // descarga todos
//   await __renderPreview('wood')    // devuelve dataURL de uno
//
// - Generadores (inputArity 0): se renderizan con sus params por defecto.
// - Filtros (inputArity ≥ 1): se aplican sobre una textura de MUESTRA común
//   (un fbm con gradient-map) para que se vea su efecto real.
import { Engine } from '../engine/engine';
import { MODIFIERS, DEFAULT_RESOLUTION } from '../engine/modifiers/registry';
import { defaultParams } from '../engine/graph/types';
import type { Project, State } from '../engine/graph/types';

const PREVIEW_RES = 128;

function st(code: string, modifierId: string, inputs: string[]): State {
  return {
    code,
    bandId: 'b',
    modifierId,
    inputs,
    params: defaultParams(MODIFIERS.find((m) => m.id === modifierId)!),
    resolution: DEFAULT_RESOLUTION,
  };
}

/** Proyecto que contiene la muestra base + un nodo por modificador. */
function buildPreviewProject(): { project: Project; codes: Map<string, string> } {
  const states: Record<string, State> = {};
  const stops: string[] = [];
  const codes = new Map<string, string>(); // modifierId -> code del nodo

  // Muestra base para filtros: fbm → gradient-map (algo con relieve y color).
  states['sample0'] = st('sample0', 'fbm', []);
  states['sample'] = st('sample', 'gradient-map', ['sample0']);
  stops.push('sample0', 'sample');

  let n = 0;
  for (const m of MODIFIERS) {
    if (m.imageSource) continue; // la fuente-imagen no se puede previsualizar sin archivo
    const code = `p${n++}`;
    const inputs: string[] = [];
    for (let i = 0; i < m.inputArity; i++) inputs.push('sample');
    states[code] = st(code, m.id, inputs);
    stops.push(code);
    codes.set(m.id, code);
  }

  return {
    project: { bands: [{ id: 'b', name: 'preview', stops }], states, version: 1 },
    codes,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('read error'));
    r.readAsDataURL(blob);
  });
}

let enginePromise: Promise<{ engine: Engine; codes: Map<string, string>; backend: string }> | null = null;

/** Inicializa (una vez) el motor con el proyecto de previews. */
async function ensureEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const engine = new Engine();
      const res = await engine.init();
      const { project, codes } = buildPreviewProject();
      await engine.loadProject(project);
      return { engine, codes, backend: res.backend };
    })();
  }
  return enginePromise;
}

/** IDs de los modificadores con preview (sin la fuente-imagen) + su aridad. */
export async function listPreviewIds(): Promise<{
  ids: string[];
  filters: string[];
  backend: string;
}> {
  const { codes, backend } = await ensureEngine();
  const ids = [...codes.keys()];
  const filters = ids.filter((id) => (MODIFIERS.find((m) => m.id === id)?.inputArity ?? 0) >= 1);
  return { ids, filters, backend };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('img load'));
    img.src = dataUrl;
  });
}

async function exportDataUrl(code: string): Promise<string> {
  const { engine } = await ensureEngine();
  return blobToDataUrl(await engine.exportPng(code, PREVIEW_RES));
}

/**
 * Compone una preview "antes/después" partida por la diagonal ↙ (TR→BL):
 *   triángulo superior-izquierdo = muestra SIN filtro,
 *   triángulo inferior-derecho   = muestra CON el filtro.
 */
async function diagonalComposite(sampleUrl: string, filteredUrl: string): Promise<string> {
  const [sample, filtered] = await Promise.all([loadImage(sampleUrl), loadImage(filteredUrl)]);
  const S = PREVIEW_RES;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  // Inferior-derecho: con filtro (fondo completo).
  ctx.drawImage(filtered, 0, 0, S, S);

  // Superior-izquierdo: muestra sin filtro, recortada al triángulo TL.
  // Diagonal ↙ va de (S,0) a (0,S); el lado TL es x + y < S.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(S, 0);
  ctx.lineTo(0, S);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(sample, 0, 0, S, S);
  ctx.restore();

  // Línea divisoria sutil sobre la diagonal.
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(S, 0);
  ctx.lineTo(0, S);
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

/** Renderiza un modificador y devuelve su PNG como dataURL.
 *  Filtros (inputArity ≥ 1): preview diagonal antes/después. */
export async function renderPreview(modId: string): Promise<string> {
  const { codes } = await ensureEngine();
  const code = codes.get(modId);
  if (!code) throw new Error(`modificador desconocido: ${modId}`);
  const mod = MODIFIERS.find((m) => m.id === modId)!;
  if (mod.inputArity >= 1) {
    const [sampleUrl, filteredUrl] = await Promise.all([exportDataUrl('sample'), exportDataUrl(code)]);
    return diagonalComposite(sampleUrl, filteredUrl);
  }
  return exportDataUrl(code);
}

function download(name: string, dataUrl: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name;
  a.click();
}

/** Descarga todos (uso manual). */
export async function genPreviews(): Promise<void> {
  const { ids, backend } = await listPreviewIds();
  if (backend === 'none') {
    console.error('[genPreviews] sin backend');
    return;
  }
  for (const id of ids) {
    try {
      download(`${id}.png`, await renderPreview(id));
      console.log(`[genPreviews] ${id} ✓`);
      await new Promise((r) => setTimeout(r, 150));
    } catch (e) {
      console.warn(`[genPreviews] ${id} ✗`, e);
    }
  }
  console.log('[genPreviews] listo. Coloca los PNG en public/previews/');
}

/* ------------------------------------------------------------------ *
 * Validación de EJEMPLOS (dev): renderiza el nodo final de un ejemplo
 * en un motor desechable y devuelve un resumen de su histograma para que
 * un script Playwright detecte texturas degeneradas (negro, blanco, sólido).
 * ------------------------------------------------------------------ */

interface ExampleStats {
  id: string;
  ok: boolean;
  reason?: string;
  /** Código del nodo final evaluado. */
  finalCode: string;
  meanL: number; // luminancia media 0..1
  stdL: number; // desviación típica de la luminancia 0..1
  uniqueBuckets: number; // nº de cubos de luminancia (de 16) con peso
}

async function statsOfDataUrl(dataUrl: string): Promise<{ meanL: number; stdL: number; uniqueBuckets: number }> {
  const img = await loadImage(dataUrl);
  const S = 96;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, S, S);
  const d = ctx.getImageData(0, 0, S, S).data;
  let sum = 0;
  const ls: number[] = [];
  const buckets = new Array(16).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    const L = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    ls.push(L);
    sum += L;
    buckets[Math.min(15, Math.floor(L * 16))]++;
  }
  const meanL = sum / ls.length;
  let varsum = 0;
  for (const L of ls) varsum += (L - meanL) * (L - meanL);
  const stdL = Math.sqrt(varsum / ls.length);
  const uniqueBuckets = buckets.filter((b) => b > ls.length * 0.005).length;
  return { meanL, stdL, uniqueBuckets };
}

/** Renderiza el nodo final de un ejemplo y juzga si la textura es "buena". */
export async function validateExample(id: string, project: import('../engine/graph/types').Project, finalCode: string): Promise<ExampleStats> {
  const engine = new Engine();
  await engine.init();
  try {
    await engine.loadProject(project);
    const blob = await engine.exportPng(finalCode, 128);
    const dataUrl = await blobToDataUrl(blob);
    const { meanL, stdL, uniqueBuckets } = await statsOfDataUrl(dataUrl);
    // Heurística de degeneración:
    //  - casi todo negro / casi todo blanco
    //  - sólido (sin variación): std muy baja Y pocos cubos
    let ok = true;
    let reason: string | undefined;
    if (meanL < 0.03) {
      ok = false;
      reason = 'casi negro';
    } else if (meanL > 0.97) {
      ok = false;
      reason = 'casi blanco';
    } else if (stdL < 0.02 && uniqueBuckets <= 1) {
      ok = false;
      reason = 'sólido (sin detalle)';
    }
    return { id, ok, reason, finalCode, meanL, stdL, uniqueBuckets };
  } finally {
    await engine.dispose();
  }
}

/** Valida TODOS los ejemplos registrados; devuelve solo los problemáticos +
 *  un recuento. El nodo final = último stop de la última banda (el output). */
export async function validateAllExamples(): Promise<{ total: number; bad: ExampleStats[] }> {
  const { EXAMPLES } = await import('../engine/examples');
  const bad: ExampleStats[] = [];
  for (const e of EXAMPLES) {
    const project = e.build();
    const lastBand = project.bands[project.bands.length - 1];
    const finalCode = lastBand.stops[lastBand.stops.length - 1];
    try {
      const s = await validateExample(e.id, project, finalCode);
      if (!s.ok) bad.push(s);
    } catch (err) {
      bad.push({ id: e.id, ok: false, reason: `error: ${(err as Error)?.message ?? err}`, finalCode, meanL: 0, stdL: 0, uniqueBuckets: 0 });
    }
  }
  return { total: EXAMPLES.length, bad };
}

// Exponer en dev.
if (import.meta.env?.DEV) {
  const w = window as unknown as Record<string, unknown>;
  w['__genPreviews'] = genPreviews;
  w['__listPreviewIds'] = listPreviewIds;
  w['__renderPreview'] = renderPreview;
  w['__validateExample'] = validateExample;
  w['__validateAllExamples'] = validateAllExamples;
}
