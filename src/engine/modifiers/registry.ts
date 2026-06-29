import type { ModifierDef, Project, State } from '../graph/types';
import { defaultParams } from '../graph/types';
import { fbmNoise, perlinNoise, worleyNoise } from './noise';
import { gradientShape, brick } from './generators';
import { wood, corrosion, crystal, fabric, brushedMetal } from './materials';
import { levels, curveMod, gradientMap, colorize, invert, hsv } from './tone';
import { blend, blur, threshold, displace, copyMod, luminanceMix, noOp, maskBlend } from './filters';
import { orderedDither, hatching, normalFromHeight, sharpen, edgeDetect, emboss, aoFromHeight } from './stylize';
import { resample, quakePalette, makeSeamless } from './special';
import { imageSource } from './source';

/** Catálogo de modificadores disponibles (Fase 4). */
export const MODIFIERS: ModifierDef[] = [
  fbmNoise,
  perlinNoise,
  worleyNoise,
  gradientShape,
  brick,
  wood,
  corrosion,
  crystal,
  fabric,
  brushedMetal,
  levels,
  curveMod,
  gradientMap,
  colorize,
  hsv,
  invert,
  copyMod,
  noOp,
  blend,
  luminanceMix,
  maskBlend,
  blur,
  threshold,
  displace,
  sharpen,
  edgeDetect,
  emboss,
  orderedDither,
  hatching,
  normalFromHeight,
  aoFromHeight,
  resample,
  quakePalette,
  makeSeamless,
  imageSource,
];

/** Generadores PROCEDURALES = imágenes de origen (excluye la imagen subida). */
export const GENERATORS = MODIFIERS.filter((m) => m.inputArity === 0 && !m.imageSource);
/** Filtros = modificadores (van en las flechas entre celdas). */
export const FILTERS = MODIFIERS.filter((m) => m.inputArity >= 1);

const BY_ID = new Map(MODIFIERS.map((m) => [m.id, m]));

export function getModifier(id: string): ModifierDef {
  const m = BY_ID.get(id);
  if (!m) throw new Error(`Unknown modifier: ${id}`);
  return m;
}

export function hasModifier(id: string): boolean {
  return BY_ID.has(id);
}

/** ¿El modificador tiene el parámetro «tileable» (ruidos periódicos)? */
export function hasTileableParam(id: string): boolean {
  const m = BY_ID.get(id);
  return !!m && m.params.some((p) => p.key === 'tileable');
}

/** Tamaños de textura ofrecidos en el selector. */
export const RESOLUTIONS = [64, 128, 512, 1024] as const;
export const DEFAULT_RESOLUTION = 512;

function mk(code: string, bandId: string, modId: string, inputs: string[], alias?: string): State {
  return {
    code,
    bandId,
    modifierId: modId,
    inputs,
    alias,
    params: defaultParams(getModifier(modId)),
    resolution: DEFAULT_RESOLUTION,
  };
}

/**
 * Proyecto de arranque. Un nodo es imagen O modificador (nunca ambos).
 *  - Los carriles "Material" y "Patrón" empiezan por un modificador GENERADOR.
 *  - El carril "Salida" empieza por un modificador (blend) que REFERENCIA las
 *    salidas de los otros dos carriles (madera + trama). Una banda puede empezar
 *    por un modificador.
 */
export function defaultProject(): Project {
  const states: State[] = [
    mk('w1', 'b1', 'wood', [], 'board'),
    mk('l1', 'b1', 'levels', ['w1']),
    mk('gm', 'b1', 'gradient-map', ['l1'], 'wood'),
    mk('n1', 'b2', 'fbm', [], 'noise'),
    mk('c1', 'b2', 'curve', ['n1']),
    mk('d1', 'b2', 'ordered-dither', ['c1'], 'pattern'),
    mk('o1', 'b3', 'blend', ['gm', 'd1'], 'output'),
  ];
  const byCode: Record<string, State> = {};
  for (const s of states) byCode[s.code] = s;
  byCode['o1'].params = { ...byCode['o1'].params, mode: 'multiply', opacity: 0.85 };
  return {
    bands: [
      { id: 'b1', name: 'Material', stops: ['w1', 'l1', 'gm'] },
      { id: 'b2', name: 'Pattern', stops: ['n1', 'c1', 'd1'] },
      { id: 'b3', name: 'Output', stops: ['o1'] },
    ],
    states: byCode,
    version: 1,
  };
}
