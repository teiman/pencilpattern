// Modelo de datos del grafo de PencilPattern.
// Terminología: banda (lane) → estado (cuadradito) → modificador.
// El conjunto de estados forma un DAG: un modificador puede leer varias entradas
// (referenciadas por el CÓDIGO ÚNICO de otros estados, incluso de otras bandas).

export type StateCode = string;

export type ParamKind = 'float' | 'int' | 'bool' | 'enum' | 'color' | 'curve';

export interface ParamSpec {
  key: string;
  label: string;
  kind: ParamKind;
  min?: number;
  max?: number;
  step?: number;
  default: unknown;
  options?: string[]; // para 'enum'
  help?: string; // ayuda corta (tooltip de la etiqueta en el Inspector)
}

/** Un estado = un nodo del DAG = un cuadradito en una banda. */
export interface State {
  code: StateCode; // único en todo el proyecto
  alias?: string; // legible y referenciable
  bandId: string;
  modifierId: string; // qué modificador lo produce
  inputs: StateCode[]; // entradas (por código), en orden; multi-input
  params: Record<string, unknown>;
  resolution?: number; // tamaño de la textura (px, cuadrada). Por defecto 512.
  note?: string; // comentario flotante (tutorial / ayuda)
}

export interface Band {
  id: string;
  name: string;
  /** Orden del carril (izq→der). El modificador de stops[i] (i≥1) es la
   *  "transición" desde stops[i-1]: su entrada primaria es el stop anterior. */
  stops: StateCode[];
}

export interface Project {
  name?: string; // nombre legible del proyecto (editable por el usuario)
  bands: Band[];
  states: Record<StateCode, State>;
  version: number;
  /** Tileado seamless del proyecto. Por defecto activo: los generadores que
   *  soportan «Tileable» se mantienen periódicos sin que el usuario lo pida.
   *  Se desactiva solo si expresamente se quiere una textura no-tileable. */
  seamless?: boolean;
}

export type ModifierCategory = 'noise' | 'material' | 'filter' | 'tone' | 'stylize';

/**
 * Definición de un tipo de modificador (entrada del registro).
 * Cada modificador aporta el cuerpo de su fragment shader (WGSL y, opcionalmente,
 * GLSL para el fallback WebGL2) y una función `pack` que serializa sus parámetros
 * a los 32 floats del bloque uniforme `u.p[0..7]`.
 */
export interface ModifierDef {
  id: string;
  name: string;
  category: ModifierCategory;
  description?: string; // qué hace, para el browser y tooltips
  inputLabels?: string[]; // etiquetas de las entradas (p.ej. ['Base (under)','Top (over)'])
  inputArity: number; // 0..4
  params: ParamSpec[];
  shaderVersion: number; // entra en la clave de caché
  passes?: number; // nº de pasadas (p.ej. blur separable = 2); por defecto 1
  outputsColor?: boolean;
  imageSource?: boolean; // fuente = imagen subida (params.src = dataURL); no usa shader
  wgsl: string; // cuerpo del fragment: fn fs(uv) -> vec4
  glsl?: string; // equivalente GLSL ES 3.00 (fallback WebGL2)
  pack: (params: Record<string, unknown>) => number[];
}

export function defaultParams(mod: ModifierDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of mod.params) out[p.key] = p.default;
  return out;
}

export function emptyProject(): Project {
  return { bands: [], states: {}, version: 1 };
}
