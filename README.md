# PencilPattern

A **client-first** procedural texture generator that runs entirely in the browser. No server, no account, no upload — the rendering engine picks the fastest available backend (**WebGPU → WebGL2 → CPU**) and computes everything locally.

Build materials by chaining parameterized **modifiers** into a node graph, derive full PBR map sets, and export ready-to-use PNGs.

## Highlights

- **Node graph, organized in lanes.** Each texture is a chain of boxes (*states*) connected by modifiers, forming a DAG — a modifier can read several inputs, even from other lanes, so you can composite freely.
- **Three-tier rendering with automatic fallback.** WebGPU (WGSL) → WebGL2 (GLSL) → a pure-JS CPU backend. Each backend runs a self-test on startup; one that initializes but renders black is discarded, so the fallbacks actually kick in. A header chip tells you which backend is live.
- **Fast and incremental.** Content-addressed cache, cascade invalidation of only the affected subtree, background compute in a Web Worker, and progressive preview→final rendering.
- **34 modifiers** across generators, materials, tone/color, filters and stylization (full list below).
- **Seamless by default.** Procedural generators tile natively; uploaded bitmaps can be made seamless with a wrap-aware filter. Verify any texture with the built-in 2×2 / 4×4 tile and 3D (sphere/cylinder/cube) previews.
- **PBR export.** Alias your nodes (albedo, normal, roughness, metallic, AO, height) and export a bundled PBR set as a zip, or channel-pack AO·Roughness·Metallic into a single ORM map.
- **Productivity.** Command palette (Ctrl+K), undo/redo with batched transactions, parameter presets, reusable lane templates, seed randomization, drag-and-drop images, context menus, and a resizable/collapsible inspector.
- **Theming & a11y.** Dark / light / high-contrast themes, visible focus rings, `prefers-reduced-motion`, ARIA tablists, and keyboard navigation.
- **Guided tutorials.** A curated set of recipes that teach how modifiers combine into finished materials, PBR maps and stylized looks — loaded with floating notes on the key nodes.
- **Offline.** Installable PWA with autosave to IndexedDB.

## Requirements

- A browser with **WebGPU** (current Chrome / Edge / Firefox; recent Safari). Without it, the app falls back automatically to **WebGL2**, and ultimately to a CPU backend.
- For development: **Node ≥ 20** and **pnpm ≥ 10.16**.

## Getting started

```bash
pnpm install
pnpm dev         # http://localhost:5173
```

Other commands:

```bash
pnpm build       # type-check (svelte-check) + production build to dist/
pnpm preview     # serve dist/ (installable / offline PWA)
pnpm test        # unit tests (Vitest): DAG, hash, cache, scheduler
pnpm check       # type-check only
pnpm format      # Prettier
```

> **Supply chain.** `pnpm-workspace.yaml` sets `minimumReleaseAge: 7200` (minutes = 5 days), so pnpm won't install versions published less than 5 days ago. The lockfile may therefore stay slightly behind the latest releases.

## Modifiers

- **Generators:** FBM noise, Perlin (with domain warp), Worley / cellular, gradient / shape (linear · radial · angular · diamond), brick / tile.
- **Materials:** wood, rust / corrosion, crystal, fabric, brushed metal.
- **Tone & color:** levels, curve, gradient map, colorize, hue / saturation, invert.
- **Compositing:** blend (9 modes), luminance mix, mask blend (A over B by a third mask input), copy, no-op.
- **Filters:** blur (separable gaussian), threshold, displace / warp, sharpen, edge detect (Sobel), emboss.
- **Stylization & maps:** ordered dither (Bayer), hatching / cross-hatch, normal from height, AO from height, change resolution, Quake palette, make seamless.
- **Sources:** uploaded image.

## Architecture

```
UI (Svelte, main thread)  →  Web Worker (Comlink)
  · never computes pixels      · graph + scheduler (cache, cascade, epochs, debounce)
  · draws thumbnails           · GPU backend: WebGPU (WGSL) | WebGL2 (GLSL) | CPU
```

The engine (`src/engine/engine.ts`) is environment-agnostic: it runs in a Worker and, if the Worker has no GPU, falls back to the main thread and ultimately to the pure-JS CPU backend. Every modifier ships its fragment-shader body in **both** WGSL and GLSL, plus a `pack()` that serializes its parameters; the CPU backend reimplements the common ones in JS as a guaranteed never-black floor.

```
src/
  engine/        graph model, scheduler, cache, GPU backends, modifiers, examples
  state/         Svelte store (project, undo, autosave, export, presets, templates)
  ui/            components (graph, inspector, dock viewer, modals, command palette)
  export/        PNG / zip / PBR packing
scripts/         dev tooling (Playwright preview & example validation)
```

## License

No license is currently specified; all rights reserved.
