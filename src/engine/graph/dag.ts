// Algoritmos sobre el DAG: orden topológico, descendientes (para invalidación en
// cascada) y cierre de dependencias (para calcular un nodo concreto).
import type { Project, StateCode } from './types';

export class CycleError extends Error {
  constructor(public readonly cycle: StateCode[]) {
    super(`El grafo contiene un ciclo: ${cycle.join(' → ')}`);
    this.name = 'CycleError';
  }
}

/** Hijos directos de `code`: estados que lo usan como entrada. */
export function childrenOf(project: Project, code: StateCode): StateCode[] {
  const out: StateCode[] = [];
  for (const s of Object.values(project.states)) {
    if (s.inputs.includes(code)) out.push(s.code);
  }
  return out;
}

/** Orden topológico (Kahn). Lanza CycleError si hay ciclos. Ignora entradas inexistentes. */
export function topoOrder(project: Project): StateCode[] {
  const codes = Object.keys(project.states);
  const indeg = new Map<StateCode, number>();
  const adj = new Map<StateCode, StateCode[]>(); // input -> [estados que dependen de él]

  for (const c of codes) {
    indeg.set(c, 0);
    adj.set(c, []);
  }
  for (const s of Object.values(project.states)) {
    for (const inp of s.inputs) {
      if (!project.states[inp]) continue; // entrada colgante: se trata como ausente
      adj.get(inp)!.push(s.code);
      indeg.set(s.code, (indeg.get(s.code) ?? 0) + 1);
    }
  }

  const queue = codes.filter((c) => (indeg.get(c) ?? 0) === 0);
  const order: StateCode[] = [];
  while (queue.length) {
    const c = queue.shift()!;
    order.push(c);
    for (const child of adj.get(c) ?? []) {
      const d = (indeg.get(child) ?? 0) - 1;
      indeg.set(child, d);
      if (d === 0) queue.push(child);
    }
  }

  if (order.length !== codes.length) {
    const stuck = codes.filter((c) => !order.includes(c));
    throw new CycleError(stuck);
  }
  return order;
}

/** Todos los descendientes (transitivos) de `code`, sin incluirlo. */
export function descendants(project: Project, code: StateCode): Set<StateCode> {
  const seen = new Set<StateCode>();
  const stack = [code];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of childrenOf(project, cur)) {
      if (!seen.has(child)) {
        seen.add(child);
        stack.push(child);
      }
    }
  }
  return seen;
}

/** Cierre de dependencias de `code` (todo lo necesario para calcularlo), en orden topológico. */
export function requiredClosure(project: Project, code: StateCode): StateCode[] {
  const needed = new Set<StateCode>();
  const stack = [code];
  while (stack.length) {
    const cur = stack.pop()!;
    if (needed.has(cur)) continue;
    needed.add(cur);
    const s = project.states[cur];
    if (s) for (const inp of s.inputs) if (project.states[inp]) stack.push(inp);
  }
  return topoOrder(project).filter((c) => needed.has(c));
}
