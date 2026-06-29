<script lang="ts">
  import { store } from '../state/projectStore.svelte';
  import { createShapeViewer, type Shape, type ShapeViewer } from './shape3d';

  // Visor de textura (doble clic en una caja). Inspirado en el modal de texturas
  // de modelcatalog: pestañas de zoom (x1/x2/x4), mosaicos (Tile) y vistas 3D
  // (esfera/cilindro/cubo) con la textura aplicada.
  type Mode = 'fit' | 'x1' | 'x2' | 'x4' | 'tile2' | 'tile4' | 'sphere' | 'cylinder' | 'cube';
  let mode = $state<Mode>('fit');

  const v = $derived(store.viewer);
  const node = $derived(v ? store.project.states[v.code] : undefined);
  const title = $derived(v ? store.displayName(v.code) : '');

  const TABS: { id: Mode; label: string }[] = [
    { id: 'fit', label: 'Fit' },
    { id: 'x1', label: '1×' },
    { id: 'x2', label: '2×' },
    { id: 'x4', label: '4×' },
    { id: 'tile2', label: 'Tile 2×2' },
    { id: 'tile4', label: 'Tile 4×4' },
    { id: 'sphere', label: 'Sphere' },
    { id: 'cylinder', label: 'Cylinder' },
    { id: 'cube', label: 'Cube' },
  ];

  function onTabsKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === mode);
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : (i - 1 + TABS.length) % TABS.length;
    mode = TABS[next].id;
    const btns = (e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('.tab');
    btns[next]?.focus();
  }

  const scale = $derived(mode === 'x2' ? 2 : mode === 'x4' ? 4 : 1);
  const isTile = $derived(mode === 'tile2' || mode === 'tile4');
  const tileN = $derived(mode === 'tile4' ? 4 : 2);
  const is3d = $derived(mode === 'sphere' || mode === 'cylinder' || mode === 'cube');

  // ---- vista 3D (WebGL) ----
  let canvas = $state<HTMLCanvasElement | null>(null);
  let viewer3d: ShapeViewer | null = null;
  let viewer3dUrl: string | null = null;

  async function ensureViewer(url: string, shape: Shape) {
    if (viewer3d && viewer3dUrl === url) {
      viewer3d.setShape(shape);
      return;
    }
    disposeViewer();
    if (!canvas) return;
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      return;
    }
    // El modal pudo cerrarse o cambiar de tab mientras cargaba la imagen.
    if (!canvas || !is3d || store.viewer?.url !== url) return;
    viewer3d = createShapeViewer(canvas, img, shape);
    viewer3dUrl = url;
  }

  function disposeViewer() {
    viewer3d?.dispose();
    viewer3d = null;
    viewer3dUrl = null;
  }

  // Crea/actualiza/destruye el visor 3D según el modo y la textura activa.
  $effect(() => {
    const url = v?.url;
    const shape = mode as Shape;
    if (is3d && url && canvas) {
      void ensureViewer(url, shape);
    } else {
      disposeViewer();
    }
  });

  // Teardown al destruir el componente (cierre del modal).
  $effect(() => () => disposeViewer());

  // Ancla la textura actual en el visualizador inferior con el modo actual.
  // 'fit' del popup no existe en el dock → se mapea a '1×'.
  function dockHere() {
    if (!v) return;
    const dockMode = mode === 'fit' ? 'x1' : mode;
    void store.dockViewer(v.code, dockMode);
    store.closeViewer();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') store.closeViewer();
  }
</script>

<svelte:window onkeydown={onKey} />

{#if v}
  <div
    class="overlay"
    role="dialog"
    tabindex="-1"
    onmousedown={(e) => {
      if (e.target === e.currentTarget) store.closeViewer();
    }}
  >
    <div class="modal">
      <div class="head">
        <h2>{title}</h2>
        <div class="actions">
          <button onclick={() => dockHere()} title="Dock below as a visualizer">Dock visualizer</button>
          <button onclick={() => store.downloadPng(v.code)}>Download PNG</button>
          <button class="close" onclick={() => store.closeViewer()} title="Close (Esc)">×</button>
        </div>
      </div>
      <div class="tabs" role="tablist" tabindex="-1" aria-label="Viewer mode" onkeydown={onTabsKey}>
        {#each TABS as t (t.id)}
          <button
            class="tab"
            class:active={mode === t.id}
            role="tab"
            aria-selected={mode === t.id}
            tabindex={mode === t.id ? 0 : -1}
            onclick={() => (mode = t.id)}
          >{t.label}</button>
        {/each}
      </div>
      <div class="viewport">
        {#if is3d}
          <canvas bind:this={canvas} class="canvas3d"></canvas>
        {:else if isTile}
          <div
            class="tiled"
            style:background-image={`url(${v.url})`}
            style:background-size={`${100 / tileN}% ${100 / tileN}%`}
          ></div>
        {:else if mode === 'fit'}
          <img class="img fit" src={v.url} alt={title} />
        {:else}
          <img class="img zoom" src={v.url} alt={title} style:width={`${v.size * scale}px`} style:height={`${v.size * scale}px`} />
        {/if}
      </div>
      <div class="foot">{node && node.modifierId !== 'image' ? 'Modifier' : 'Image'} · {v.code} · {v.size}px</div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.78);
    display: grid;
    place-items: center;
    z-index: 100;
  }
  .modal {
    width: min(1100px, 94vw);
    height: 90vh;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--line);
    background: var(--panel-2);
  }
  .head h2 {
    margin: 0;
    font-size: 15px;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .close {
    font-size: 18px;
    line-height: 1;
    padding: 2px 9px;
  }
  .tabs {
    display: flex;
    gap: 6px;
    padding: 8px 14px;
    flex-shrink: 0;
  }
  .tab {
    font-size: 12px;
    padding: 4px 12px;
  }
  .tab.active {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
  .viewport {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--canvas-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px;
  }
  .img {
    image-rendering: pixelated;
    background: var(--texture-bg);
    border: 1px solid var(--line);
  }
  .img.fit {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    image-rendering: auto;
  }
  .img.zoom {
    flex: 0 0 auto;
  }
  .tiled {
    width: 100%;
    height: 100%;
    background-repeat: repeat;
    image-rendering: pixelated;
  }
  .canvas3d {
    width: 100%;
    height: 100%;
    display: block;
  }
  .foot {
    padding: 6px 14px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 11px;
    flex-shrink: 0;
  }
</style>
