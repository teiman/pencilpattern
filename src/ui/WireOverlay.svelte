<script lang="ts">
  import { store } from '../state/projectStore.svelte';

  // Capa SVG superpuesta sobre el área de bandas que dibuja, como curvas bezier,
  // SOLO las conexiones "interesantes": entradas cross-lane (de otra banda) y
  // referencias rotas (en rojo). Las entradas adyacentes izq→der del mismo carril
  // se omiten (ya las cuenta la disposición visual). Es read-only: no interactúa.
  let { host }: { host: HTMLElement | null } = $props();

  interface Wire {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    broken: boolean;
  }

  let wires = $state<Wire[]>([]);
  let w = $state(0);
  let h = $state(0);

  // Centro del borde derecho (salida) y del izquierdo (entrada) de una celda,
  // en coordenadas del SVG (relativas al host con su scroll ya incorporado).
  function edges(code: string, hostRect: DOMRect) {
    const el = host?.querySelector<HTMLElement>(`.cell[data-code="${CSS.escape(code)}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      outX: r.right - hostRect.left,
      outY: r.top + r.height / 2 - hostRect.top,
      inX: r.left - hostRect.left,
      inY: r.top + r.height / 2 - hostRect.top,
    };
  }

  function recompute() {
    if (!host) {
      wires = [];
      return;
    }
    const hostRect = host.getBoundingClientRect();
    w = host.clientWidth;
    h = host.clientHeight;
    const out: Wire[] = [];
    const states = store.project.states;
    for (const code of Object.keys(states)) {
      const node = states[code];
      const target = edges(code, hostRect);
      if (!target) continue;
      for (const src of node.inputs) {
        if (!src) continue;
        const srcNode = states[src];
        // Solo dibujamos cross-lane (otra banda) o referencias rotas.
        if (srcNode && srcNode.bandId === node.bandId) continue;
        const broken = !srcNode;
        const from = srcNode ? edges(src, hostRect) : null;
        if (!from) {
          // Fuente fuera de pantalla o inexistente: marca un muñón rojo a la izq.
          if (broken) out.push({ x1: target.inX - 24, y1: target.inY, x2: target.inX, y2: target.inY, broken: true });
          continue;
        }
        out.push({ x1: from.outX, y1: from.outY, x2: target.inX, y2: target.inY, broken: false });
      }
    }
    wires = out;
  }

  function pathOf(wire: Wire): string {
    const dx = Math.max(24, Math.abs(wire.x2 - wire.x1) * 0.4);
    return `M ${wire.x1} ${wire.y1} C ${wire.x1 + dx} ${wire.y1}, ${wire.x2 - dx} ${wire.y2}, ${wire.x2} ${wire.y2}`;
  }

  // Reacciona a cambios de estructura (version) y de selección/estado.
  $effect(() => {
    void store.project.version;
    void store.project.bands.length;
    void Object.keys(store.project.states).length;
    // tras el render, mide.
    requestAnimationFrame(recompute);
  });

  // Reacciona a scroll (lanes + bands) y resize.
  $effect(() => {
    if (!host) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recompute);
    };
    host.addEventListener('scroll', schedule, true); // captura el scroll de las lanes anidadas
    window.addEventListener('resize', schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    schedule();
    return () => {
      cancelAnimationFrame(raf);
      host.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
    };
  });
</script>

<svg class="wires" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
  {#each wires as wire, i (i)}
    <path class="wire" class:broken={wire.broken} d={pathOf(wire)} />
    {#if !wire.broken}
      <circle class="dot" cx={wire.x1} cy={wire.y1} r="2.5" />
      <circle class="dot" cx={wire.x2} cy={wire.y2} r="2.5" />
    {/if}
  {/each}
</svg>

<style>
  .wires {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none; /* read-only: no captura clics */
    /* Capa intermedia: por ENCIMA del fondo opaco de las lanes (.band, en flujo
       sin z-index) pero por DEBAJO de las celdas (.cell, z-index:2). El zoom va
       en un portal a <body>, así no lo atrapa el contexto de apilado de la celda. */
    z-index: 1;
    overflow: hidden;
  }
  .wire {
    fill: none;
    stroke: var(--muted);
    stroke-width: 1.5;
    opacity: 0.85;
  }
  .wire.broken {
    stroke: var(--status-error);
    stroke-dasharray: 4 3;
  }
  .dot {
    fill: var(--muted);
  }
</style>
