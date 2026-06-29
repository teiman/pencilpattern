<script lang="ts">
  import { store } from '../state/projectStore.svelte';
  import type { CellStatus } from '../protocol/messages';

  // CAJA = cuadradito = imagen/estado de textura. Clic → opciones de la imagen.
  let { code }: { code: string } = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  const cell = $derived(store.cells[code]);
  const node = $derived(store.project.states[code]);
  const isImage = $derived(node?.modifierId === 'image');
  const isSel = $derived(store.selected?.code === code && store.selected?.kind === 'image');

  // Color de borde: comunica SOLO lo excepcional. Un estado "todo bien" (clean,
  // preview, final) no debe gritar → borde neutro como el resto del UI. Solo
  // recalculando (naranja sutil) o error (rojo) destacan.
  const STATUS_COLOR: Record<CellStatus, string> = {
    clean: 'var(--line)', // neutro: ya está
    final: 'var(--line)', // neutro: ya está
    preview: 'var(--line)', // neutro: resultado intermedio válido
    dirty: 'var(--status-busy)', // naranja sutil: pendiente de recalcular
    computing: 'var(--status-busy)', // naranja sutil: recalculando
    error: 'var(--status-error)', // rojo: algo falló
  };
  // Glifo redundante (no solo color) para lo EXCEPCIONAL. Los estados "todo bien"
  // (clean/preview/final) no muestran nada; solo error (y el spinner de computing).
  const STATUS_GLYPH: Record<CellStatus, string> = {
    clean: '',
    dirty: '',
    computing: '', // el spinner ya es el indicador
    preview: '',
    final: '',
    error: '⚠',
  };
  const STATUS_LABEL: Record<CellStatus, string> = {
    clean: 'up to date',
    dirty: 'pending recompute',
    computing: 'computing…',
    preview: 'preview',
    final: 'final',
    error: 'error',
  };

  const status = $derived<CellStatus>(cell?.status ?? 'clean');
  const glyph = $derived(STATUS_GLYPH[status]);
  // Color-vs-grayscale: dato ya emitido por el motor (cell.color).
  const isColor = $derived(cell?.color === true);
  // Entrada requerida sin conectar / rota.
  const dangling = $derived(store.hasDanglingInput(code));
  const title = $derived.by(() => {
    let t = `${store.displayName(code)} (${code}) — ${STATUS_LABEL[status]}`;
    if (status === 'error' && cell?.error) t += `: ${cell.error}`;
    if (dangling) t += ' · missing input';
    t += isColor ? ' · RGB' : ' · grayscale';
    return t;
  });

  // Hover-zoom: amplía el thumb a ~256px sin re-renderizar (usa cell.thumb).
  // El popup se renderiza con position:fixed para ESCAPAR del overflow del lane
  // (overflow-x:auto) que de otro modo lo recortaría; por eso calculamos su
  // posición desde el rect de la celda en pantalla.
  // Mueve el nodo a <body> para que el zoom (position:fixed) escape del contexto
  // de apilado de la celda (.cell tiene z-index) y se dibuje por encima de todo.
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  const ZOOM = 256;
  let hover = $state(false);
  let cellBtn = $state<HTMLButtonElement | undefined>(undefined);
  let zoomCanvas: HTMLCanvasElement | undefined = $state();
  let zoomPos = $state<{ left: number; top: number }>({ left: 0, top: 0 });

  function openZoom() {
    hover = true;
    if (!cellBtn) return;
    const r = cellBtn.getBoundingClientRect();
    // Centrado horizontalmente sobre la celda, encima de ella; con clamp al viewport.
    let left = r.left + r.width / 2 - ZOOM / 2;
    left = Math.max(6, Math.min(left, window.innerWidth - ZOOM - 6));
    let top = r.top - ZOOM - 10; // arriba de la celda
    if (top < 6) top = r.bottom + 10; // si no cabe arriba, debajo
    zoomPos = { left, top };
  }

  $effect(() => {
    const bmp = cell?.thumb;
    if (hover && zoomCanvas && bmp) {
      const ctx = zoomCanvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bmp, 0, 0, zoomCanvas.width, zoomCanvas.height);
      }
    }
  });

  $effect(() => {
    const bmp = cell?.thumb;
    if (canvas && bmp) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    }
  });

  // Soltar una imagen sobre un nodo imagen reemplaza su fuente.
  let dropping = $state(false);
  function onDragOver(e: DragEvent) {
    if (!isImage || !e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    dropping = true;
  }
  function onDrop(e: DragEvent) {
    if (!isImage) return;
    dropping = false;
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    void store.handleDropOnImage(code, files);
  }
</script>

<button
  class="cell"
  class:sel={isSel}
  class:dropping
  style:--status={STATUS_COLOR[status]}
  class:dangling
  class:loading={!cell?.thumb}
  onclick={() => store.selectImage(code)}
  ondblclick={() => store.openViewer(code)}
  bind:this={cellBtn}
  data-code={code}
  onpointerenter={openZoom}
  onpointerleave={() => (hover = false)}
  oncontextmenu={(e) => {
    e.preventDefault();
    store.selectImage(code);
    store.openContextMenu(e.clientX, e.clientY, store.cellMenu(code));
  }}
  ondragover={onDragOver}
  ondragleave={() => (dropping = false)}
  ondrop={onDrop}
  {title}
  aria-label={title}
>
  <canvas bind:this={canvas} width="84" height="84"></canvas>
  <span class="badge">{#if isImage}🖼 {/if}{store.displayName(code)}</span>
  <span class="chan" class:rgb={isColor} aria-hidden="true">{isColor ? 'RGB' : 'L'}</span>
  {#if dangling}<span class="dangle" title="A required input is missing" aria-hidden="true">⚠</span>{/if}
  {#if hover && cell?.thumb}
    <span class="zoom" use:portal aria-hidden="true" style:left={`${zoomPos.left}px`} style:top={`${zoomPos.top}px`}>
      <canvas bind:this={zoomCanvas} width="256" height="256"></canvas>
    </span>
  {/if}
  {#if cell?.status === 'computing'}
    <span class="spin" aria-hidden="true"></span>
  {:else if glyph}
    <span class="glyph" class:err={status === 'error'} aria-hidden="true">{glyph}</span>
  {/if}
</button>

<style>
  .cell {
    position: relative;
    z-index: 2; /* por encima del WireOverlay (z-index:1); el zoom va en portal a <body> */
    width: 96px;
    height: 96px;
    padding: 4px;
    border: 2px solid var(--status);
    border-radius: 8px;
    background: var(--canvas-bg);
    display: grid;
    place-items: center;
    flex: 0 0 auto;
  }
  .cell.sel {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .cell.dropping {
    outline: 2px dashed var(--accent);
    outline-offset: 1px;
  }
  .cell.dangling {
    border-color: var(--status-error);
  }
  .cell.loading canvas {
    background:
      linear-gradient(100deg, var(--texture-bg) 40%, var(--panel-2) 50%, var(--texture-bg) 60%)
      var(--texture-bg);
    background-size: 200% 100%;
    animation: shimmer 1.3s ease-in-out infinite;
  }
  @media (prefers-reduced-motion: reduce) {
    .cell.loading canvas {
      animation: none;
    }
  }
  @keyframes shimmer {
    to {
      background-position: -200% 0;
    }
  }
  .dangle {
    position: absolute;
    left: 5px;
    bottom: 22px;
    font-size: 11px;
    color: var(--status-error);
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
  }
  .zoom {
    position: fixed;
    z-index: 1000;
    padding: 4px;
    background: var(--panel-2);
    border: 1px solid var(--accent);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
    pointer-events: none;
  }
  .zoom canvas {
    display: block;
    width: 256px;
    height: 256px;
    image-rendering: pixelated;
    border-radius: 3px;
    background: var(--texture-bg);
  }
  canvas {
    width: 84px;
    height: 84px;
    border-radius: 5px;
    background: var(--texture-bg);
    display: block;
  }
  .badge {
    position: absolute;
    left: 5px;
    bottom: 4px;
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.65);
    color: var(--text);
    max-width: 84px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chan {
    position: absolute;
    left: 5px;
    top: 4px;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.3px;
    padding: 0 4px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.6);
    color: var(--muted);
  }
  .chan.rgb {
    color: #d8c08f;
  }
  .glyph {
    position: absolute;
    top: 3px;
    right: 5px;
    font-size: 12px;
    line-height: 1;
    color: var(--status);
    text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
  }
  .glyph.err {
    color: var(--status-error);
  }
  .spin {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 10px;
    height: 10px;
    border: 2px solid var(--status-busy);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
