<script lang="ts">
  // Editor visual de curva tonal: 5 knots con X fija (0, .25, .5, .75, 1) y Y
  // arrastrable (0..1). Reescribe el mismo array de 5 valores que ya usa el motor
  // (curveEval interpola linealmente), sin cambiar el esquema de parámetros.
  let { value, onChange }: { value: number[]; onChange: (v: number[]) => void } = $props();

  const W = 200;
  const H = 110;
  const PAD = 8;
  const N = 5;

  const knots = $derived(
    value.length === N ? value : [0, 0.25, 0.5, 0.75, 1],
  );

  function kx(i: number): number {
    return PAD + (i / (N - 1)) * (W - 2 * PAD);
  }
  function ky(v: number): number {
    return H - PAD - Math.min(1, Math.max(0, v)) * (H - 2 * PAD);
  }
  // Path lineal que une los knots (coincide con la interpolación del shader).
  const path = $derived(knots.map((v, i) => `${i === 0 ? 'M' : 'L'} ${kx(i)} ${ky(v)}`).join(' '));

  let svgEl = $state<SVGSVGElement | null>(null);
  let dragging = $state<number | null>(null);

  function valueFromEvent(e: PointerEvent): number {
    if (!svgEl) return 0;
    const r = svgEl.getBoundingClientRect();
    const y = ((e.clientY - r.top) / r.height) * H;
    const v = (H - PAD - y) / (H - 2 * PAD);
    return Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
  }
  function startDrag(i: number, e: PointerEvent) {
    e.preventDefault();
    dragging = i;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    move(e);
  }
  function move(e: PointerEvent) {
    if (dragging === null) return;
    const next = [...knots];
    next[dragging] = valueFromEvent(e);
    onChange(next);
  }
  function end() {
    dragging = null;
  }
  // Teclado: flechas mueven el knot enfocado.
  function onKey(i: number, e: KeyboardEvent) {
    let d = 0;
    if (e.key === 'ArrowUp') d = 0.05;
    else if (e.key === 'ArrowDown') d = -0.05;
    else return;
    e.preventDefault();
    const next = [...knots];
    next[i] = Math.round(Math.min(1, Math.max(0, next[i] + d)) * 100) / 100;
    onChange(next);
  }
</script>

<svg
  bind:this={svgEl}
  class="curve-svg"
  viewBox={`0 0 ${W} ${H}`}
  role="group"
  aria-label="Tone curve editor"
  onpointermove={move}
  onpointerup={end}
  onpointerleave={end}
>
  <!-- rejilla -->
  <line class="grid" x1={PAD} y1={ky(0.5)} x2={W - PAD} y2={ky(0.5)} />
  <line class="grid" x1={kx(2)} y1={PAD} x2={kx(2)} y2={H - PAD} />
  <!-- diagonal de referencia (identidad) -->
  <line class="ref" x1={kx(0)} y1={ky(0)} x2={kx(4)} y2={ky(1)} />
  <!-- curva -->
  <path class="line" d={path} />
  <!-- knots -->
  {#each knots as v, i (i)}
    <circle
      class="knot"
      class:active={dragging === i}
      cx={kx(i)}
      cy={ky(v)}
      r="5"
      role="slider"
      tabindex="0"
      aria-label={`Knot ${i + 1}`}
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={1}
      onpointerdown={(e) => startDrag(i, e)}
      onkeydown={(e) => onKey(i, e)}
    />
  {/each}
</svg>

<style>
  .curve-svg {
    width: 100%;
    height: auto;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 6px;
    touch-action: none;
    display: block;
  }
  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }
  .ref {
    stroke: var(--line);
    stroke-width: 1;
    stroke-dasharray: 3 3;
    opacity: 0.7;
  }
  .line {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2;
  }
  .knot {
    fill: var(--panel);
    stroke: var(--accent);
    stroke-width: 2;
    cursor: ns-resize;
  }
  .knot:hover,
  .knot.active,
  .knot:focus-visible {
    fill: var(--accent);
    outline: none;
  }
</style>
