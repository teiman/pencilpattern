<script lang="ts">
  import { store } from '../state/projectStore.svelte';
  import { createShapeViewer, type Shape, type ShapeViewer } from './shape3d';

  type Mode = 'flat' | 'tile2' | 'tile4' | 'sphere' | 'cylinder' | 'cube';
  const MODES: { id: Mode; label: string }[] = [
    { id: 'flat', label: 'Flat' },
    { id: 'tile2', label: 'Tile 2×2' },
    { id: 'tile4', label: 'Tile 4×4' },
    { id: 'sphere', label: 'Sphere' },
    { id: 'cylinder', label: 'Cylinder' },
    { id: 'cube', label: 'Cube' },
  ];

  let mode = $state<Mode>('flat');

  let canvas2d: HTMLCanvasElement | undefined = $state();
  let canvas3d: HTMLCanvasElement | undefined = $state();

  const code = $derived(store.selected?.code ?? null);
  const cell = $derived(code ? store.cells[code] : undefined);
  const node = $derived(code ? store.project.states[code] : undefined);

  const is3d = $derived(mode === 'sphere' || mode === 'cylinder' || mode === 'cube');
  const tileN = $derived(mode === 'tile4' ? 4 : mode === 'tile2' ? 2 : 1);

  // ---- preview 2D (plano o mosaico) ----
  $effect(() => {
    const bmp = cell?.thumb;
    if (is3d || !canvas2d || !bmp) return;
    const ctx = canvas2d.getContext('2d');
    if (!ctx) return;
    const W = canvas2d.width;
    const H = canvas2d.height;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, W, H);
    const n = tileN;
    const tw = W / n;
    const th = H / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        ctx.drawImage(bmp, x * tw, y * th, tw, th);
      }
    }
  });

  // ---- preview 3D (esfera / cilindro / cubo) ----
  let viewer3d: ShapeViewer | null = null;
  let viewer3dBmp: ImageBitmap | null = null;

  function disposeViewer() {
    viewer3d?.dispose();
    viewer3d = null;
    viewer3dBmp = null;
  }

  $effect(() => {
    const bmp = cell?.thumb;
    const shape = mode as Shape;
    if (!is3d || !canvas3d || !bmp) {
      disposeViewer();
      return;
    }
    if (viewer3d && viewer3dBmp === bmp) {
      viewer3d.setShape(shape);
      return;
    }
    disposeViewer();
    try {
      viewer3d = createShapeViewer(canvas3d, bmp, shape);
      viewer3dBmp = bmp;
    } catch {
      viewer3d = null;
    }
  });

  // Teardown al destruir el componente.
  $effect(() => () => disposeViewer());
</script>

<div class="viewport">
  <div class="head">
    <span>{code ? store.displayName(code) : '—'}</span>
    <select class="mode" bind:value={mode} title="Preview mode">
      {#each MODES as m (m.id)}
        <option value={m.id}>{m.label}</option>
      {/each}
    </select>
    <span class="status">{cell?.status ?? ''}</span>
  </div>
  <div class="stage">
    <canvas bind:this={canvas2d} width="256" height="256" class:hidden={is3d}></canvas>
    <canvas bind:this={canvas3d} width="256" height="256" class:hidden={!is3d}></canvas>
  </div>
</div>

<style>
  .viewport {
    padding: 10px;
    border-bottom: 1px solid var(--line);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
    margin-bottom: 8px;
    color: var(--muted);
  }
  .mode {
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 5px;
    color: var(--text);
    font-size: 12px;
    padding: 2px 6px;
  }
  .status {
    flex-shrink: 0;
  }
  .stage {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
  }
  .stage canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
    border-radius: 8px;
    background: #15171c;
    border: 1px solid var(--line);
  }
  .stage canvas.hidden {
    display: none;
  }
</style>
