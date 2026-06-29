<script lang="ts">
  import { store } from '../state/projectStore.svelte';
  import { GENERATORS, FILTERS, getModifier, RESOLUTIONS } from '../engine/modifiers/registry';
  import type { ParamSpec } from '../engine/graph/types';
  import CurveEditor from './CurveEditor.svelte';

  const sel = $derived(store.selected);
  // Banda del nodo seleccionado: el sidebar muestra todos sus nodos.
  const band = $derived(sel ? store.bandOf(sel.code) : undefined);
  const stops = $derived(band ? band.stops.filter((c) => store.project.states[c]) : []);

  // ---- helpers por nodo ----
  function stateOf(code: string) {
    return store.project.states[code];
  }
  function modOf(code: string) {
    const s = stateOf(code);
    return s ? getModifier(s.modifierId) : undefined;
  }
  function isImageNode(code: string): boolean {
    return stateOf(code)?.modifierId === 'image';
  }
  function kindLabel(code: string): string {
    if (isImageNode(code)) return 'Uploaded image';
    const m = modOf(code);
    return m && m.inputArity === 0 ? 'Generator' : 'Modifier';
  }
  // Todos los slots de entrada (0..inputArity-1): todos editables.
  function inputSlots(code: string): number[] {
    const m = modOf(code);
    if (!m) return [];
    return Array.from({ length: m.inputArity }, (_, i) => i);
  }
  // Etiqueta del slot: usa el nombre semántico del modificador (inputLabels:
  // p.ej. "Base (under)" / "Top (over)") si existe; si no, genérico. El slot 0
  // de un nodo no-primero indica además que viene del carril (⟵).
  function slotLabel(code: string, slot: number): string {
    const named = modOf(code)?.inputLabels?.[slot];
    const fromLane = slot === 0 && !store.isFirst(code);
    if (named) return fromLane ? `⟵ ${named}` : named;
    return fromLane ? '⟵ from lane' : `input ${slot + 1}`;
  }
  // Valor efectivo del slot: si el slot 0 está vacío en un no-primero, el motor
  // usa el nodo anterior del carril; reflejarlo en el select.
  function slotValue(code: string, slot: number): string {
    const v = stateOf(code)?.inputs[slot] ?? '';
    if (v) return v;
    if (slot === 0 && !store.isFirst(code)) return store.prevStop(code) ?? '';
    return '';
  }
  function others(code: string): string[] {
    return Object.keys(store.project.states).filter((c) => c !== code);
  }
  function aliasOf(c: string): string {
    return store.displayName(c);
  }
  // Secciones expandidas (colapso por nodo, independiente de la selección).
  let expanded = $state<Set<string>>(new Set());
  // Abre la sección SOLO cuando la selección CAMBIA a un nodo nuevo (no en cada
  // re-render), para no reabrir lo que el usuario acaba de colapsar a mano.
  let lastSelected = $state<string | null>(null);
  $effect(() => {
    const c = store.selected?.code ?? null;
    if (c !== lastSelected) {
      lastSelected = c;
      if (c && !expanded.has(c)) {
        const next = new Set(expanded);
        next.add(c);
        expanded = next;
      }
    }
  });
  // Clic en la cabecera = toggle. Si la abre, además selecciona ese nodo.
  function toggleSection(code: string) {
    const next = new Set(expanded);
    if (next.has(code)) {
      next.delete(code);
    } else {
      next.add(code);
      if (isImageNode(code)) store.selectImage(code);
      else store.selectModifier(code);
    }
    expanded = next;
  }

  function setNum(code: string, key: string, raw: string, int: boolean) {
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return; // ignora entrada vacía/inválida del campo numérico
    store.setParam(code, key, int ? Math.round(n) : n);
  }
  function knots(code: string): number[] {
    return (stateOf(code)?.params['knots'] as number[]) ?? [0, 0.25, 0.5, 0.75, 1];
  }

  // Decimales a mostrar derivados del step (mata el ruido 0.3000000004).
  function decimalsOf(step: number): number {
    if (!Number.isFinite(step) || step <= 0) return 2;
    const s = String(step);
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
  }
  function fmtNum(v: number, step: number): string {
    if (!Number.isFinite(v)) return '0';
    return Number(v.toFixed(decimalsOf(step))).toString();
  }
  // ¿el parámetro difiere de su valor por defecto?
  function isModified(code: string, p: ParamSpec): boolean {
    const v = stateOf(code)?.params[p.key];
    if (p.kind === 'curve') {
      const def = (p.default as number[]) ?? [];
      const cur = Array.isArray(v) ? (v as number[]) : [];
      return def.length !== cur.length || def.some((d, i) => d !== cur[i]);
    }
    return v !== p.default;
  }
  // Doble clic en la etiqueta → restaura el valor por defecto.
  function resetParam(code: string, p: ParamSpec) {
    store.setParam(code, p.key, p.default);
  }
  // Restaura todos los parámetros a su default en un solo paso de undo.
  function resetAll(code: string, params: ParamSpec[]) {
    store.batch(() => {
      for (const p of params) store.setParam(code, p.key, p.default);
    });
  }
  function savePresetPrompt(code: string) {
    const modName = (modOf(code)?.name ?? 'modifier').toLowerCase();
    const name = window.prompt(`Save these ${modName} settings as a preset. Name:`);
    if (name && name.trim()) store.savePreset(code, name.trim());
  }
</script>

{#snippet paramControl(code: string, p: ParamSpec)}
  {@const s = stateOf(code)}
  {#if s}
    {@const modified = isModified(code, p)}
    <div class="row param">
      <span
        class="plabel"
        class:modified
        title={modified ? 'Double-click to reset to default' : p.help}
        ondblclick={() => resetParam(code, p)}
        role="button"
        tabindex="-1"
      >{p.label}</span>
      {#if p.kind === 'float' || p.kind === 'int'}
        {@const step = p.step ?? (p.kind === 'int' ? 1 : 0.01)}
        <div class="slider">
          <input
            type="range"
            min={p.min ?? 0}
            max={p.max ?? 1}
            {step}
            value={Number(s.params[p.key])}
            oninput={(e) => setNum(code, p.key, e.currentTarget.value, p.kind === 'int')}
          />
          <input
            class="numfield"
            type="number"
            min={p.min ?? undefined}
            max={p.max ?? undefined}
            {step}
            value={fmtNum(Number(s.params[p.key]), step)}
            oninput={(e) => setNum(code, p.key, e.currentTarget.value, p.kind === 'int')}
          />
          {#if p.key === 'seed'}
            <button class="seedbtn" title="Reroll this seed" aria-label="Reroll seed" onclick={() => store.setSeed(code, Math.floor(Math.random() * 100))}>🎲</button>
            <button class="seedbtn" class:on={store.isSeedLocked(code)} title={store.isSeedLocked(code) ? 'Seed locked (Randomize skips it)' : 'Lock seed'} aria-pressed={store.isSeedLocked(code)} onclick={() => store.toggleSeedLock(code)}>{store.isSeedLocked(code) ? '🔒' : '🔓'}</button>
          {/if}
        </div>
      {:else if p.kind === 'bool'}
        <input type="checkbox" checked={Boolean(s.params[p.key])} onchange={(e) => store.setParam(code, p.key, e.currentTarget.checked)} />
      {:else if p.kind === 'enum'}
        <select value={String(s.params[p.key])} onchange={(e) => store.setParam(code, p.key, e.currentTarget.value)}>
          {#each p.options ?? [] as o (o)}<option value={o}>{o}</option>{/each}
        </select>
      {:else if p.kind === 'color'}
        <input type="color" value={String(s.params[p.key] ?? '#000000')} oninput={(e) => store.setParam(code, p.key, e.currentTarget.value)} />
      {:else if p.kind === 'curve'}
        <CurveEditor value={knots(code)} onChange={(v) => store.setParam(code, p.key, v)} />
      {/if}
    </div>
  {/if}
{/snippet}

<!-- Controles completos de un nodo (alias, tipo, tamaño, entradas, parámetros). -->
{#snippet nodeControls(code: string)}
  {@const s = stateOf(code)}
  {@const m = modOf(code)}
  {#if s && m}
    <label class="row"><span>Alias</span><input value={s.alias ?? ''} oninput={(e) => store.setAlias(code, e.currentTarget.value)} placeholder={store.generatedAlias(code)} /></label>

    {#if isImageNode(code)}
      <div class="actions">
        <button onclick={() => store.replaceImageFile(code)}>⬆ Replace file</button>
        <button onclick={() => store.replaceImagePaste(code)}>📋 Paste</button>
      </div>
    {:else}
      <label class="row">
        <span>Type</span>
        <select value={s.modifierId} onchange={(e) => store.setModifier(code, e.currentTarget.value)}>
          <optgroup label="Generators (image)">
            {#each GENERATORS as g (g.id)}<option value={g.id}>{g.name}</option>{/each}
          </optgroup>
          <optgroup label="Filters">
            {#each FILTERS as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
          </optgroup>
        </select>
      </label>
      {#if m.description}<p class="mdesc">{m.description}</p>{/if}
    {/if}

    {#if s.modifierId === 'resample'}
      <label class="row">
        <span title="Output resolution (px) of this Change-resolution node. The texture is resampled up or down to this size. Default 512.">Size</span>
        <select value={String(s.resolution ?? 512)} onchange={(e) => store.setResolution(code, parseInt(e.currentTarget.value, 10))}>
          {#each RESOLUTIONS as r (r)}<option value={r}>{r}×{r}</option>{/each}
        </select>
      </label>
    {/if}

    {#if m.inputArity > 0}
      <div class="group">
        Inputs
        {#if m.inputArity >= 2}
          <button
            class="swap"
            onclick={() => store.swapInputs(code)}
            title={m.inputLabels && m.inputLabels.length >= 2
              ? `Swap ${m.inputLabels[0]} and ${m.inputLabels[1]} (order matters for asymmetric modes or opacity < 1)`
              : 'Swap the first two inputs (matters for asymmetric modes or opacity < 1)'}
          >⇄ Swap</button>
        {/if}
      </div>
      {#each inputSlots(code) as slot (slot)}
        <label class="row">
          <span>{slotLabel(code, slot)}</span>
          <select value={slotValue(code, slot)} onchange={(e) => store.setInput(code, slot, e.currentTarget.value)}>
            <option value="">(none)</option>
            {#each others(code) as c (c)}<option value={c}>{aliasOf(c)}</option>{/each}
          </select>
        </label>
      {/each}
    {/if}

    {#if m.params.length > 0}
      <div class="group">
        Parameters
        <span class="group-actions">
          <button class="swap" onclick={() => store.copyParams(code)} title="Copy these parameters">⧉ Copy</button>
          {#if store.canPasteParams(code)}
            <button class="swap" onclick={() => store.pasteParams(code)} title="Paste copied parameters">⧉ Paste</button>
          {/if}
          {#if m.params.some((p) => isModified(code, p))}
            <button class="swap" onclick={() => resetAll(code, m.params)} title="Reset all parameters to defaults">↺ Reset</button>
          {/if}
        </span>
      </div>
      {#if store.presetsFor(code).length > 0 || !isImageNode(code)}
        <div class="row preset-row">
          <span>Preset</span>
          <div class="preset-ctl">
            <select
              value=""
              onchange={(e) => {
                const idx = e.currentTarget.value;
                if (idx !== '') store.applyPreset(code, store.presetsFor(code)[Number(idx)]);
                e.currentTarget.value = '';
              }}
            >
              <option value="">Apply preset…</option>
              {#each store.presetsFor(code) as ps, i (ps.name)}
                <option value={i}>{ps.builtin ? `★ ${ps.name}` : ps.name}</option>
              {/each}
            </select>
            <button class="swap" title="Save these parameter values as a reusable preset for this modifier type" onclick={() => savePresetPrompt(code)}>Save preset…</button>
          </div>
        </div>
      {/if}
      {#each m.params as p (p.key)}{@render paramControl(code, p)}{/each}
    {/if}

    <button class="danger" onclick={() => store.removeStop(code)}>Remove {isImageNode(code) ? 'from lane' : 'modifier'}</button>
  {/if}
{/snippet}

<div class="inspector">
  {#if !sel || !band}
    <p class="muted">Select an image (box) or a modifier (chip).</p>
  {:else}
    <div class="band-title">{band.name}</div>
    {#each stops as code (code)}
      {@const isSel = sel.code === code}
      <details class="section" open={expanded.has(code)}>
        <summary
          class:sel={isSel}
          onclick={(e) => {
            e.preventDefault();
            toggleSection(code);
          }}
        >
          <span class="node-name">{store.displayName(code)}</span>
          <span class="node-kind">{kindLabel(code)}</span>
        </summary>
        <div class="section-body">
          {@render nodeControls(code)}
        </div>
      </details>
    {/each}
  {/if}
</div>

<style>
  .inspector {
    padding: 10px 12px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .muted {
    color: var(--muted);
  }
  .band-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
    padding-bottom: 4px;
    border-bottom: 1px solid var(--line);
  }
  .section {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel-2);
    overflow: hidden;
  }
  summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  summary::before {
    content: '▸';
    color: var(--muted);
    font-size: 10px;
    transition: transform 0.12s;
  }
  details[open] > summary::before {
    transform: rotate(90deg);
  }
  summary.sel {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
  summary.sel .node-name {
    color: var(--accent);
  }
  .node-name {
    font-weight: 600;
    color: var(--text);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .node-kind {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--muted);
    flex-shrink: 0;
  }
  .section-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 10px 10px;
    border-top: 1px solid var(--line);
    background: var(--panel);
  }
  .group {
    margin-top: 6px;
    font-weight: 600;
    color: var(--accent);
    border-bottom: 1px solid var(--line);
    padding-bottom: 2px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .group-actions {
    display: flex;
    gap: 4px;
  }
  .preset-ctl {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .preset-ctl select {
    flex: 1;
    min-width: 0;
  }
  .preset-ctl .swap {
    flex-shrink: 0;
  }
  .swap {
    font-size: 11px;
    font-weight: 600;
    padding: 1px 8px;
    color: var(--text);
  }
  .row {
    display: grid;
    grid-template-columns: 96px 1fr;
    align-items: center;
    gap: 8px;
  }
  .row > span {
    color: var(--muted);
    font-size: 12px;
  }
  /* Cuando el panel se arrastra estrecho (~300px), el control se queda sin sitio
     (el editor de curva con varios sliders inline es lo primero que rompe): apila
     etiqueta sobre control. Container query porque el ancho lo decide el arrastre,
     no el dispositivo. */
  @container panel (max-width: 300px) {
    .row {
      grid-template-columns: 1fr;
      align-items: start;
      gap: 3px;
    }
  }
  .plabel {
    cursor: default;
    position: relative;
  }
  .plabel.modified::after {
    content: '';
    position: absolute;
    top: 50%;
    right: -2px;
    transform: translateY(-50%);
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent);
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .mdesc {
    margin: 0;
    font-size: 11px;
    line-height: 1.35;
    color: var(--muted);
  }
  input,
  select {
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 5px;
    padding: 3px 6px;
    width: 100%;
  }
  input[type='range'] {
    padding: 0;
  }
  input[type='checkbox'] {
    width: auto;
  }
  .slider {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .slider input[type='range'] {
    flex: 1;
    min-width: 0;
  }
  .seedbtn {
    flex: 0 0 auto;
    padding: 2px 5px;
    font-size: 12px;
    line-height: 1;
  }
  .seedbtn.on {
    border-color: var(--accent);
  }
  .numfield {
    flex: 0 0 56px;
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    text-align: right;
    padding: 2px 4px;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .numfield::-webkit-outer-spin-button,
  .numfield::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .danger {
    margin-top: 10px;
    border-color: var(--danger-border);
    color: var(--danger);
  }
</style>
