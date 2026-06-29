// Utilidades compartidas para construir ejemplos del tutorial.
import type { Project, State } from './graph/types';
import { defaultParams } from './graph/types';
import { getModifier, DEFAULT_RESOLUTION } from './modifiers/registry';

export interface NodeSpec {
  code: string;
  mod: string;
  inputs?: string[];
  alias?: string;
  note?: string;
  params?: Record<string, unknown>;
  res?: number;
}
export interface LaneSpec {
  id: string;
  name: string;
  nodes: NodeSpec[];
}
export interface Example {
  id: string;
  title: string;
  description: string;
  build(): Project;
}

export function buildProject(lanes: LaneSpec[]): Project {
  const states: Record<string, State> = {};
  const bands = lanes.map((l) => {
    const stops: string[] = [];
    for (const n of l.nodes) {
      const mod = getModifier(n.mod);
      states[n.code] = {
        code: n.code,
        bandId: l.id,
        modifierId: n.mod,
        inputs: n.inputs ?? [],
        alias: n.alias,
        note: n.note,
        params: { ...defaultParams(mod), ...(n.params ?? {}) },
        resolution: n.res ?? DEFAULT_RESOLUTION,
      };
      stops.push(n.code);
    }
    return { id: l.id, name: l.name, stops };
  });
  return { bands, states, version: 1 };
}

export function ex(id: string, title: string, description: string, lanes: LaneSpec[]): Example {
  return { id, title, description, build: () => buildProject(lanes) };
}

/** Carril único (id 'b'). */
export function lane(name: string, nodes: NodeSpec[]): LaneSpec {
  return { id: 'b', name, nodes };
}
