<script lang="ts">
  import { store } from '../state/projectStore.svelte';
  import { createShapeViewer, type Shape, type ShapeViewer } from './shape3d';

  // Visualizador anclado abajo (dock). Muestra el nodo anclado (store.dock) con
  // su modo (x1/x2/x4, tile, sphere/cylinder/cube). La textura es la copia propia
  // del dock (store.dock.url), que el store re-exporta en vivo al recalcularse el
  // nodo anclado — independiente de la selección actual.
  type Mode = 'x1' | 'x2' | 'x4' | 'tile2' | 'tile4' | 'sphere' | 'cylinder' | 'cube';
  const TABS: { id: Mode; label: string }[] = [
    { id: 'x1', label: '1×' },
    { id: 'x2', label: '2×' },
    { id: 'x4', label: '4×' },
    { id: 'tile2', label: 'Tile 2×2' },
    { id: 'tile4', label: 'Tile 4×4' },
    { id: 'sphere', label: 'Sphere' },
    { id: 'cylinder', label: 'Cylinder' },
    { id: 'cube', label: 'Cube' },
  ];

  const d = $derived(store.dock);
  const url = $derived(d?.url ?? null);
  const mode = $derived((d?.mode ?? 'x1') as Mode);
  const title = $derived(d ? store.displayName(d.code) : '');

  // Navegación por flechas en el tablist (roving tabindex): mueve foco + selección.
  function onTabsKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === mode);
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : (i - 1 + TABS.length) % TABS.length;
    store.setDockMode(TABS[next].id);
    const btns = (e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('.tab');
    btns[next]?.focus();
  }

  const scale = $derived(mode === 'x2' ? 2 : mode === 'x4' ? 4 : 1);
  const tileN = $derived(mode === 'tile4' ? 4 : mode === 'tile2' ? 2 : 1);
  const isTile = $derived(mode === 'tile2' || mode === 'tile4');
  const is3d = $derived(mode === 'sphere' || mode === 'cylinder' || mode === 'cube');

  let canvas2d: HTMLCanvasElement | undefined = $state();
  let canvas3d: HTMLCanvasElement | undefined = $state();

  // Carga la url propia del dock como Image (fuente común para 2D y 3D).
  let img = $state<HTMLImageElement | null>(null);
  $effect(() => {
    const u = url;
    if (!u) {
      img = null;
      return;
    }
    const el = new Image();
    el.src = u;
    let alive = true;
    el.decode().then(
      () => {
        if (alive && store.dock?.url === u) img = el;
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  });

  // ---- preview 2D (zoom o mosaico) ----
  $effect(() => {
    const im = img;
    const n = tileN;
    void scale;
    if (is3d || !canvas2d || !im) return;
    const ctx = canvas2d.getContext('2d');
    if (!ctx) return;
    const W = canvas2d.width;
    const H = canvas2d.height;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    const tw = W / n;
    const th = H / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) ctx.drawImage(im, x * tw, y * th, tw, th);
    }
  });

  // ---- preview 3D ----
  let viewer3d: ShapeViewer | null = null;
  let viewer3dImg: HTMLImageElement | null = null;

  function disposeViewer() {
    viewer3d?.dispose();
    viewer3d = null;
    viewer3dImg = null;
  }

  $effect(() => {
    const im = img;
    const shape = mode as Shape;
    if (!is3d || !canvas3d || !im) {
      disposeViewer();
      return;
    }
    if (viewer3d && viewer3dImg === im) {
      viewer3d.setShape(shape);
      return;
    }
    disposeViewer();
    try {
      viewer3d = createShapeViewer(canvas3d, im, shape);
      viewer3dImg = im;
    } catch {
      viewer3d = null;
    }
  });

  $effect(() => () => disposeViewer());

  // ---- altura arrastrable, acotada al alto de la ventana ----
  const MIN_H = 120;
  let windowH = $state(typeof window !== 'undefined' ? window.innerHeight : 800);
  // Tope: nunca más de 640px ni más del 60% de la ventana (deja sitio a las bandas).
  const maxH = $derived(Math.max(MIN_H, Math.min(640, Math.round(windowH * 0.6))));
  let height = $state(320);

  // Re-clamp al encoger la ventana de escritorio.
  $effect(() => {
    const onResize = () => {
      windowH = window.innerHeight;
      if (height > maxH) height = maxH;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  function startResize(e: PointerEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const onMove = (ev: PointerEvent) => {
      // Arrastrar hacia arriba agranda el dock.
      const next = startH + (startY - ev.clientY);
      height = Math.min(maxH, Math.max(MIN_H, next));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
</script>

{#if d}
  <div class="dock" style:height={`${height}px`}>
    <div
      class="resizer"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize visualizer"
      title="Drag to resize"
      onpointerdown={startResize}
    ></div>
    <div class="bar">
      <span class="title">{title}</span>
      <div class="tabs" role="tablist" tabindex="-1" aria-label="Visualizer mode" onkeydown={onTabsKey}>
        {#each TABS as t (t.id)}
          <button
            class="tab"
            class:active={mode === t.id}
            role="tab"
            aria-selected={mode === t.id}
            tabindex={mode === t.id ? 0 : -1}
            onclick={() => store.setDockMode(t.id)}
          >{t.label}</button>
        {/each}
      </div>
      <button
        class="pin"
        class:on={d.pinned}
        onclick={() => store.toggleDockPin()}
        title={d.pinned
          ? 'Pinned to this texture. The dock stays put when you select other nodes. Click to follow the selection again.'
          : 'Following the selection: the dock shows the last texture you click. Click to pin it to the current texture.'}
        aria-pressed={d.pinned}
      >📌 {d.pinned ? 'Pinned' : 'Pin'}</button>
      <button class="close" onclick={() => store.closeDock()} title="Undock">×</button>
    </div>
    <div class="stage" class:tiled={isTile}>
      {#if is3d}
        <canvas bind:this={canvas3d} width="512" height="512" class="c3d"></canvas>
      {:else}
        <canvas
          bind:this={canvas2d}
          width="512"
          height="512"
          class="c2d"
          style:width={isTile ? '100%' : `${d.size * scale}px`}
        ></canvas>
      {/if}
    </div>
  </div>
{/if}

<style>
  .dock {
    position: relative;
    border-top: 1px solid var(--line);
    background: var(--panel);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }
  .resizer {
    position: absolute;
    top: -3px;
    left: 0;
    right: 0;
    height: 7px;
    cursor: ns-resize;
    z-index: 2;
    touch-action: none;
  }
  .resizer:hover {
    background: var(--accent);
    opacity: 0.5;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border-bottom: 1px solid var(--line);
    background: var(--panel-2);
  }
  .pin {
    flex-shrink: 0;
    padding: 2px 9px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    border-radius: 5px;
    opacity: 0.7;
  }
  .pin.on {
    opacity: 1;
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
  .pin:hover {
    opacity: 1;
  }
  .title {
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
  }
  .tabs {
    display: flex;
    gap: 4px;
    flex: 1;
    overflow-x: auto;
  }
  .tab {
    font-size: 11px;
    padding: 2px 8px;
  }
  .tab.active {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
  .close {
    font-size: 16px;
    line-height: 1;
    padding: 2px 8px;
    flex-shrink: 0;
  }
  .stage {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--canvas-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
  }
  .c2d {
    image-rendering: pixelated;
    background: var(--texture-bg);
    border: 1px solid var(--line);
    flex: 0 0 auto;
    align-self: center;
  }
  .stage.tiled {
    padding: 0;
  }
  .stage.tiled .c2d {
    height: 100%;
    border: none;
    object-fit: cover;
  }
  .c3d {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
