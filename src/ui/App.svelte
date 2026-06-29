<script lang="ts">
  import { store } from '../state/projectStore.svelte';
  import Band from './Band.svelte';
  import Inspector from './Inspector.svelte';
  import ViewerModal from './ViewerModal.svelte';
  import ProjectsModal from './ProjectsModal.svelte';
  import DockViewer from './DockViewer.svelte';
  import ModifierBrowser from './ModifierBrowser.svelte';
  import ContextMenu from './ContextMenu.svelte';
  import CommandPalette from './CommandPalette.svelte';
  import WelcomeModal from './WelcomeModal.svelte';
  import WireOverlay from './WireOverlay.svelte';

  let projectsOpen = $state(false);
  let projectsTab = $state<'guardados' | 'ejemplos'>('guardados');
  let tutorialsOnly = $state(false);
  let commandPaletteOpen = $state(false);
  let welcomeOpen = $state(false);
  let bandsEl = $state<HTMLElement | null>(null);

  // Bienvenida de primera visita: cuando el motor está listo, no había proyecto
  // guardado, y el usuario no la ha visto antes.
  $effect(() => {
    if (
      store.ready &&
      !store.loadedFromAutosave &&
      localStorage.getItem('pp.seenWelcome') !== '1'
    ) {
      welcomeOpen = true;
    }
  });
  function closeWelcome() {
    welcomeOpen = false;
    localStorage.setItem('pp.seenWelcome', '1');
  }

  // Ancho/colapso del Inspector (preferencia de escritorio, persistida).
  const PANEL_MIN = 280;
  const PANEL_MAX = 560;
  let panelW = $state(loadPanelW());
  let panelCollapsed = $state(localStorage.getItem('pp.panelCollapsed') === '1');

  function loadPanelW(): number {
    const n = parseInt(localStorage.getItem('pp.panelW') ?? '', 10);
    return Number.isFinite(n) ? Math.min(PANEL_MAX, Math.max(PANEL_MIN, n)) : 360;
  }
  function togglePanel() {
    panelCollapsed = !panelCollapsed;
    localStorage.setItem('pp.panelCollapsed', panelCollapsed ? '1' : '0');
  }
  function startPanelResize(e: PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelW;
    const onMove = (ev: PointerEvent) => {
      // El panel está a la derecha: arrastrar a la izquierda lo agranda.
      panelW = Math.min(PANEL_MAX, Math.max(PANEL_MIN, startW + (startX - ev.clientX)));
    };
    const onUp = () => {
      localStorage.setItem('pp.panelW', String(panelW));
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function openProjects(tab: 'guardados' | 'ejemplos') {
    projectsTab = tab;
    tutorialsOnly = tab === 'ejemplos';
    projectsOpen = true;
  }

  function fmtBytes(b: number): string {
    return (b / 1048576).toFixed(1) + ' MB';
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    const sel = store.selected;
    const mod = e.ctrlKey || e.metaKey;

    // --- Atajos con Ctrl/Cmd ---
    if (mod && !typing) {
      const k = e.key.toLowerCase();
      switch (k) {
        case 'z':
          e.preventDefault();
          if (e.shiftKey) store.redo();
          else store.undo();
          return;
        case 'y':
          e.preventDefault();
          store.redo();
          return;
        case 's':
          e.preventDefault();
          void store.quickSave();
          return;
        case 'e':
          e.preventDefault();
          void store.exportActive();
          return;
        case 'b':
          e.preventDefault();
          store.addBand();
          return;
        case 'k':
          e.preventDefault();
          commandPaletteOpen = true;
          return;
        case 'd':
          if (sel) {
            e.preventDefault();
            store.duplicateStop(sel.code);
          }
          return;
        case 'c':
          if (sel && !window.getSelection()?.toString()) {
            e.preventDefault();
            store.copyParams(sel.code);
          }
          return;
        case 'v':
          if (sel && store.canPasteParams(sel.code)) {
            e.preventDefault();
            store.pasteParams(sel.code);
          }
          return;
      }
      return;
    }

    if (typing) return;

    // --- Verbos sin modificador (con un nodo seleccionado) ---
    if (!sel) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      store.removeStop(sel.code);
    } else if (e.key === 'Enter') {
      // Evita doble-fire: si el foco está en la propia celda (un <button>), su
      // handler nativo ya abre el viewer; solo actuamos si el foco está fuera.
      const onButton = t?.tagName === 'BUTTON';
      if (!onButton) {
        e.preventDefault();
        void store.openViewer(sel.code);
      }
    }
  }
  const failures = $derived(store.diagnostics.filter((a) => !a.ok));
  const fellBack = $derived(store.backend === 'webgl2' || store.backend === 'cpu');
</script>

<svelte:window onkeydown={onKey} />

<div class="app">
  <header>
    <h1>PencilPattern</h1>
    <span class="chip" class:warn={store.backend !== 'webgpu'}>{store.backend.toUpperCase()}</span>
    <div class="spacer"></div>
    {#if store.saveState !== 'idle'}
      <span class="savechip" class:saving={store.saveState === 'saving'} title="Autosave status">
        {store.saveState === 'saving' ? 'Saving…' : 'Saved'}
      </span>
    {/if}
    <button onclick={() => store.randomizeSeeds()} title="Randomize all generator seeds (locked ones are kept)">🎲 Randomize</button>
    <button onclick={() => store.quickSave()} title="Save this project">Save project</button>
    <button onclick={() => openProjects('guardados')}>Saved projects</button>
    <button onclick={() => openProjects('ejemplos')}>Tutorials</button>
    <button class="reset" onclick={() => store.resetDemo()} title="Restore the demo and clear the cache">
      Reset demo
    </button>
    <button class="icon" class:on={store.seamless} onclick={() => store.setSeamless(!store.seamless)} title={store.seamless ? 'Seamless tiling: on (click to allow non-tiling)' : 'Seamless tiling: off'} aria-pressed={store.seamless} aria-label="Toggle seamless tiling">🔁</button>
    <button class="icon" onclick={() => store.cycleTheme()} title={`Theme: ${store.theme} (click to cycle)`} aria-label="Cycle theme">{store.theme === 'light' ? '☀' : store.theme === 'hc' ? '◐' : '🌙'}</button>
    <button class="icon" class:on={!panelCollapsed} onclick={togglePanel} title={panelCollapsed ? 'Show inspector' : 'Hide inspector'} aria-pressed={!panelCollapsed}>⊟</button>
  </header>

  {#if store.ready && (fellBack || failures.length > 0)}
    <div class="banner" class:cpu={store.backend === 'cpu'}>
      <strong>
        {#if store.backend === 'cpu'}
          CPU rendering (no GPU) — works but slow.
        {:else if store.backend === 'webgl2'}
          Using WebGL2 (WebGPU unavailable or failed the self-test).
        {:else}
          Backend warning.
        {/if}
      </strong>
      {#if failures.length > 0}
        <ul>
          {#each failures as f (f.kind)}
            <li><b>{f.kind}</b>: {f.error}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  {#if store.notice}
    <div class="notice">{store.notice}</div>
  {/if}

  {#if store.ready && store.currentExample}
    <div class="tutbar">
      <button onclick={() => store.prevExample()}>◂ Previous</button>
      <span class="pos">{store.exampleIndex() + 1} / {store.exampleCount()} · {store.currentExampleTitle()}</span>
      <button onclick={() => store.nextExample()}>Next ▸</button>
      <div class="spacer"></div>
      <button class:on={store.ttsEnabled} onclick={() => store.toggleTts()} title="Read the notes aloud (TTS)">🔊 Voice</button>
      {#if store.ttsEnabled}<button onclick={() => store.replayNarration()} title="Repeat narration">↻</button>{/if}
      <button onclick={() => openProjects('ejemplos')} title="See the list of examples">List</button>
      <button onclick={() => store.exitTutorial()}>Exit tutorial</button>
    </div>
  {/if}

  {#if !store.ready}
    <div class="loading">Initializing engine…</div>
  {:else if store.backend === 'none'}
    <div class="loading err">
      <p>No backend available (WebGPU, WebGL2 or CPU).</p>
      {#each failures as f (f.kind)}
        <p class="why">{f.kind}: {f.error}</p>
      {/each}
    </div>
  {:else}
    <main style:--panel-w={panelCollapsed ? '0px' : `${panelW}px`}>
      <div class="bands-col">
        <section class="bands" bind:this={bandsEl}>
          <input
            class="project-name"
            value={store.project.name ?? ''}
            placeholder="Project name"
            onchange={(e) => store.renameProject((e.currentTarget as HTMLInputElement).value)}
          />
          {#each store.project.bands as b (b.id)}
            <Band band={b} />
          {/each}
          <button class="add-band" onclick={() => store.addBand()}>+ Band</button>
        </section>
        <WireOverlay host={bandsEl} />
        <DockViewer />
      </div>
      {#if !panelCollapsed}
        <aside class="panel">
          <div
            class="panel-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize inspector"
            title="Drag to resize"
            onpointerdown={startPanelResize}
          ></div>
          <Inspector />
          {#if store.stats}
            <footer>cache: {store.stats.entries} textures · {fmtBytes(store.stats.bytes)}</footer>
          {/if}
        </aside>
      {/if}
    </main>
  {/if}

  <ViewerModal />
  {#if projectsOpen}<ProjectsModal initialTab={projectsTab} {tutorialsOnly} onClose={() => (projectsOpen = false)} />{/if}
  {#if store.modifierBrowser}<ModifierBrowser />{/if}
  {#if commandPaletteOpen}<CommandPalette onClose={() => (commandPaletteOpen = false)} />{/if}
  {#if welcomeOpen}<WelcomeModal onClose={closeWelcome} />{/if}
  <ContextMenu />
</div>

<style>
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
    flex-shrink: 0;
  }
  h1 {
    font-size: 15px;
    margin: 0;
    letter-spacing: 0.3px;
  }
  .chip {
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 999px;
    background: #1d3a24;
    color: #8fe0a0;
    border: 1px solid #2c5a38;
  }
  .savechip {
    font-size: 11px;
    color: var(--muted);
    min-width: 52px;
    text-align: right;
  }
  .savechip.saving {
    color: var(--accent-2);
  }
  .chip.warn {
    background: #3a1d1d;
    color: #e0b98f;
    border-color: #5a4a2c;
  }
  .reset {
    border-color: #5a4a2c;
    color: #e0c98f;
  }
  .icon {
    padding: 4px 9px;
    font-size: 14px;
    line-height: 1;
  }
  button.on {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
  }
  .spacer {
    flex: 1;
  }
  .banner {
    flex-shrink: 0;
    max-height: 40vh;
    overflow-y: auto;
    padding: 8px 14px;
    background: #2a2410;
    border-bottom: 1px solid #5a4a2c;
    color: #e7d9a8;
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .banner.cpu {
    background: #2a1810;
    border-color: #5a3a2c;
    color: #e7c0a8;
  }
  .notice {
    flex-shrink: 0;
    padding: 7px 14px;
    background: #10243a;
    border-bottom: 1px solid #2c4a5a;
    color: #a8d0e7;
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .tutbar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 14px;
    background: #1a2410;
    border-bottom: 1px solid #445a2c;
    color: #cfe7a8;
    font-size: 12px;
    flex-wrap: wrap;
  }
  .tutbar .pos {
    font-weight: 600;
  }
  .banner ul {
    margin: 4px 0 0;
    padding-left: 18px;
  }
  main {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--panel-w);
    min-height: 0;
  }
  .bands-col {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
  }
  .bands {
    flex: 1;
    min-height: 0;
    padding: 14px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .add-band {
    align-self: flex-start;
    flex-shrink: 0;
  }
  .project-name {
    flex-shrink: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    color: var(--text);
    font-size: 16px;
    font-weight: 600;
    padding: 4px 6px;
    margin: -4px -6px 0;
  }
  .project-name:hover {
    border-color: var(--line);
  }
  .project-name:focus {
    border-color: var(--accent);
    background: var(--panel-2);
  }
  .panel {
    position: relative;
    border-left: 1px solid var(--line);
    background: var(--panel);
    display: flex;
    flex-direction: column;
    min-height: 0;
    /* Contenedor para las container queries del Inspector: cuando el panel se
       arrastra estrecho, las filas etiqueta/control se apilan (ver Inspector). */
    container-type: inline-size;
    container-name: panel;
  }
  .panel-resizer {
    position: absolute;
    top: 0;
    bottom: 0;
    left: -3px;
    width: 7px;
    cursor: ew-resize;
    z-index: 3;
    touch-action: none;
  }
  .panel-resizer:hover {
    background: var(--accent);
    opacity: 0.5;
  }
  footer {
    margin-top: auto;
    padding: 8px 12px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 11px;
  }
  .loading {
    flex: 1;
    display: grid;
    place-items: center;
    color: var(--muted);
    text-align: center;
  }
  .loading.err {
    color: var(--danger);
  }
  .why {
    font-size: 12px;
    color: var(--muted);
  }
</style>
