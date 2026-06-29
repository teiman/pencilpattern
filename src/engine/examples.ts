// Tutorial examples — a CURATED catalog. Each recipe combines several modifiers
// to make something useful (a finished material, a PBR map, a stylized look),
// because the point is learning how filters work TOGETHER, not in isolation.
// Notes float next to the key nodes when an example is loaded.
//
// Validated with scripts/validate-examples.mjs (no black / white / solid output).
import { ex, lane, type Example } from './examplesUtil';

export type { Example };

export const EXAMPLES: Example[] = [
  // ============================================================= //
  //  FOUNDATIONS — how nodes chain and combine                     //
  // ============================================================= //
  ex('foundations-chain', '1 · Chain: noise → contrast → color', 'How a lane reads left to right.', [
    lane('Lane', [
      { code: 'a', mod: 'fbm', params: { scale: 6, octaves: 6 }, alias: 'noise', note: 'A lane reads left → right: each node takes the previous one as its input. Start with a generator.' },
      { code: 'l', mod: 'levels', inputs: ['a'], params: { inBlack: 0.3, inWhite: 0.7 }, note: '«Levels» stretches the contrast of the noise so the next step has something to bite on.' },
      { code: 'g', mod: 'gradient-map', inputs: ['l'], params: { colorA: '#1a2a3a', colorB: '#e0d0a0' }, alias: 'result', note: '«Gradient map» turns the gray into color (dark→light). This three-step chain is the backbone of most materials.' },
    ]),
  ]),
  ex('foundations-blend', '2 · Combine two lanes (blend)', 'A node can read from any band.', [
    { id: 'm', name: 'Wood', nodes: [
      { code: 'w', mod: 'wood', params: { rings: 7, warp: 0.5 } },
      { code: 'wg', mod: 'gradient-map', inputs: ['w'], params: { colorA: '#3a2410', colorB: '#b08850' }, alias: 'wood' },
    ] },
    { id: 'p', name: 'Grime', nodes: [
      { code: 'n', mod: 'fbm', params: { scale: 9 } },
      { code: 't', mod: 'ordered-dither', inputs: ['n'], params: { levels: 3 }, alias: 'grime' },
    ] },
    { id: 's', name: 'Output', nodes: [
      { code: 'o', mod: 'blend', inputs: ['wg', 't'], params: { mode: 'multiply', opacity: 0.6 }, alias: 'output', note: '«Blend» combines TWO lanes: dirty wood = wood × grime (multiply). A lane can start with a node that references others — that is how you composite.' },
    ] },
  ]),
  ex('foundations-mask', '3 · Pick where with a mask', 'mask-blend = A over B by a mask.', [
    { id: 'base', name: 'Stone', nodes: [
      { code: 'r', mod: 'worley', params: { scale: 7, mode: 'F1' } },
      { code: 'rg', mod: 'gradient-map', inputs: ['r'], params: { colorA: '#3a3a38', colorB: '#9a9a92' }, alias: 'stone' },
    ] },
    { id: 'top', name: 'Moss', nodes: [
      { code: 'm', mod: 'fbm', params: { scale: 16 } },
      { code: 'mg', mod: 'gradient-map', inputs: ['m'], params: { colorA: '#243410', colorB: '#6a8a36' }, alias: 'moss' },
    ] },
    { id: 'k', name: 'Mask', nodes: [
      { code: 'msk', mod: 'fbm', params: { scale: 3, contrast: 0.4 }, alias: 'mask' },
    ] },
    { id: 's', name: 'Output', nodes: [
      { code: 'o', mod: 'mask-blend', inputs: ['rg', 'mg', 'msk'], params: { inLow: 0.4, inHigh: 0.6 }, alias: 'mossy-stone', note: '«Mask blend» shows the Top (moss) over the Base (stone) only where the third input — the Mask — is bright. This is the core compositing idiom: A over B controlled by an arbitrary map.' },
    ] },
  ]),

  // ============================================================= //
  //  COMPLETE MATERIALS — several filters toward one surface       //
  // ============================================================= //
  ex('mat-marble', '4 · Polished marble', 'Veins, contrast, sheen.', [
    lane('Marble', [
      { code: 'a', mod: 'perlin', params: { scale: 4, warp: 0.9 } },
      { code: 'l', mod: 'levels', inputs: ['a'], params: { inBlack: 0.35, inWhite: 0.6, gamma: 1.4 } },
      { code: 'g', mod: 'gradient-map', inputs: ['l'], params: { colorA: '#e8e6e0', colorB: '#2a2a30' } },
      { code: 's', mod: 'sharpen', inputs: ['g'], params: { amount: 1.5 }, alias: 'marble', note: 'Marble: warped Perlin makes the veins, «Levels» thins them, the gradient sets the stone color, and «Sharpen» crisps the veins for a polished look.' },
    ]),
  ]),
  ex('mat-rusty-metal', '5 · Rusty painted metal', 'Two materials joined by a mask.', [
    { id: 'metal', name: 'Metal', nodes: [
      { code: 'bm', mod: 'brushed-metal', params: { scale: 120 } },
      { code: 'mg', mod: 'gradient-map', inputs: ['bm'], params: { colorA: '#3a4048', colorB: '#aab0b8' }, alias: 'metal' },
    ] },
    { id: 'rust', name: 'Rust', nodes: [
      { code: 'c', mod: 'corrosion', params: { coverage: 0.6 } },
      { code: 'rg', mod: 'gradient-map', inputs: ['c'], params: { colorA: '#2a1408', colorB: '#a8542a' }, alias: 'rust' },
    ] },
    { id: 's', name: 'Output', nodes: [
      { code: 'o', mod: 'mask-blend', inputs: ['mg', 'rg', 'c'], params: { inLow: 0.35, inHigh: 0.7 }, alias: 'rusty-metal', note: 'Rusty metal: clean metal as the Base, rust as the Top, and the corrosion pattern itself as the Mask — so the rust appears exactly where it is corroded. Reusing one map as both color and mask is a common trick.' },
    ] },
  ]),
  ex('mat-cobblestone', '6 · Cobblestone (color + relief)', 'One height drives color, AO and normal.', [
    { id: 'h', name: 'Stones', nodes: [
      { code: 'w', mod: 'worley', params: { scale: 7, jitter: 0.35, mode: 'F1', invert: true } },
      { code: 'b', mod: 'blur', inputs: ['w'], params: { radius: 2 }, alias: 'height' },
    ] },
    { id: 'c', name: 'Color', nodes: [
      { code: 'g', mod: 'gradient-map', inputs: ['b'], params: { colorA: '#3a3834', colorB: '#8a8680' } },
      { code: 'ao', mod: 'ao-from-height', inputs: ['b'], params: { radius: 6, strength: 2 } },
      { code: 'col', mod: 'mask-blend', inputs: ['g', 'g', 'ao'], params: { opacity: 0 }, alias: 'cobble' },
    ] },
    { id: 'n', name: 'Normal', nodes: [
      { code: 'nm', mod: 'normal-from-height', inputs: ['b'], params: { strength: 4 }, alias: 'normal', note: 'Cobblestone: ONE height map (rounded Worley stones) feeds everything — the color gradient, the «AO from height» that darkens the gaps, and the «Normal» map for 3D relief. Build the height once, derive the rest.' },
    ] },
  ]),
  ex('mat-brick-wall', '7 · Brick wall (full PBR-ish)', 'Brick generator → color + AO + normal.', [
    { id: 'h', name: 'Bricks', nodes: [
      { code: 'br', mod: 'brick', params: { cols: 5, rows: 10, mortar: 0.09, bevel: 0.08 }, alias: 'height' },
    ] },
    { id: 'c', name: 'Color', nodes: [
      { code: 'noise', mod: 'fbm', params: { scale: 14 } },
      { code: 'g', mod: 'gradient-map', inputs: ['noise'], params: { colorA: '#7a2e1c', colorB: '#b86a44' } },
      { code: 'm', mod: 'mask-blend', inputs: ['g', 'g', 'br'], params: { opacity: 0 } },
      { code: 'ao', mod: 'ao-from-height', inputs: ['br'], params: { radius: 4, strength: 2.5 } },
      { code: 'col', mod: 'blend', inputs: ['m', 'ao'], params: { mode: 'multiply', opacity: 0.8 }, alias: 'brick-color', note: 'Brick wall: the «Brick» generator gives the height; varied FBM colors the faces, and the AO (from the same bricks) darkens the mortar gaps by multiply.' },
    ] },
    { id: 'n', name: 'Normal', nodes: [
      { code: 'nm', mod: 'normal-from-height', inputs: ['br'], params: { strength: 3 }, alias: 'brick-normal', note: 'Normal map from the brick height — the relief that lights up in 3D.' },
    ] },
  ]),
  ex('mat-wood-planks', '8 · Wood planks (recolorable)', 'Build once, retint with HSV.', [
    lane('Planks', [
      { code: 'a', mod: 'wood', params: { grain: 10, rings: 12, warp: 0.6 } },
      { code: 'l', mod: 'levels', inputs: ['a'], params: { inBlack: 0.2, inWhite: 0.8 } },
      { code: 'g', mod: 'gradient-map', inputs: ['l'], params: { colorA: '#3a2410', colorB: '#c8a060' } },
      { code: 'h', mod: 'hsv', inputs: ['g'], params: { hue: -0.04, sat: 1.2 }, alias: 'planks', note: 'Wood planks: the chain builds an oak, then «Hue / Saturation» retints the whole thing — drag «Hue» toward red for mahogany or down in «Saturation» for weathered gray. Recolor without rebuilding.' },
    ]),
  ]),
  ex('mat-lava', '9 · Cooling lava', 'Glowing cracks between dark plates.', [
    lane('Lava', [
      { code: 'w', mod: 'worley', params: { scale: 5, mode: 'F2-F1' } },
      { code: 'i', mod: 'invert', inputs: ['w'] },
      { code: 'l', mod: 'levels', inputs: ['i'], params: { inBlack: 0.45, inWhite: 0.85, gamma: 0.8 } },
      { code: 'g', mod: 'gradient-map', inputs: ['l'], params: { colorA: '#1a0a05', colorB: '#ffb000', bias: 0.65 }, alias: 'lava', note: 'Lava: Worley «F2-F1» edges, inverted so the cracks go dark and the plates bright, then «Levels» crushes the plates toward black before a black→orange gradient — leaving glowing seams between cooled rock.' },
    ]),
  ]),
  ex('mat-fabric', '10 · Dyed fabric', 'Weave + tint + sheen.', [
    lane('Fabric', [
      { code: 'a', mod: 'fabric', params: { scale: 20 } },
      { code: 'c', mod: 'colorize', inputs: ['a'], params: { color: '#7a2a4a', mode: 'Luminosity' } },
      { code: 'h', mod: 'hsv', inputs: ['c'], params: { sat: 1.3, val: 1.1 }, alias: 'fabric', note: 'Dyed fabric: the weave is colorized, then «Hue / Saturation» pumps the saturation and brightness for a rich dyed look. Change the colorize color for another bolt of cloth.' },
    ]),
  ]),

  // ============================================================= //
  //  PBR MAP SET — derive maps from one shared height              //
  // ============================================================= //
  ex('pbr-set', '11 · PBR set from one height', 'Height → Albedo · Normal · Rough · AO.', [
    { id: 'h', name: 'Height', nodes: [
      { code: 'n1', mod: 'fbm', params: { scale: 5, octaves: 6 } },
      { code: 'w', mod: 'worley', params: { scale: 9, mode: 'F2-F1' } },
      { code: 'hb', mod: 'blend', inputs: ['n1', 'w'], params: { mode: 'multiply' }, alias: 'height', note: 'Height: FBM × Worley edges = the master grayscale. Every other map below is derived from THIS one node.' },
    ] },
    { id: 'a', name: 'Albedo', nodes: [
      { code: 'g', mod: 'gradient-map', inputs: ['hb'], params: { colorA: '#2a2620', colorB: '#a89878' }, alias: 'albedo', note: 'Albedo: the base color, from the height through a gradient.' },
    ] },
    { id: 'nm', name: 'Normal', nodes: [
      { code: 'nn', mod: 'normal-from-height', inputs: ['hb'], params: { strength: 3 }, alias: 'normal', note: 'Normal: the relief, from the same height.' },
    ] },
    { id: 'r', name: 'Rough', nodes: [
      { code: 'rr', mod: 'levels', inputs: ['hb'], params: { inBlack: 0.3, inWhite: 0.7, outBlack: 0.4, outWhite: 0.9 }, alias: 'rough', note: 'Roughness: the height flattened to the mid gray range.' },
    ] },
    { id: 'ao', name: 'AO', nodes: [
      { code: 'aa', mod: 'ao-from-height', inputs: ['hb'], params: { radius: 6, strength: 2 }, alias: 'ao', note: 'AO: «AO from height» darkens the cavities directly — no manual blur-and-subtract. Alias these four nodes and use «Export PBR» to bundle them.' },
    ] },
  ]),
  ex('pbr-curvature', '12 · Edge wear (curvature mask)', 'Find edges, wear the metal.', [
    { id: 'h', name: 'Shape', nodes: [
      { code: 'w', mod: 'worley', params: { scale: 7, jitter: 0.4, mode: 'F1', invert: true } },
      { code: 'b', mod: 'blur', inputs: ['w'], params: { radius: 2 }, alias: 'shape' },
    ] },
    { id: 'wear', name: 'Wear mask', nodes: [
      { code: 'e', mod: 'edge-detect', inputs: ['b'], params: { strength: 3 }, alias: 'wear' },
    ] },
    { id: 's', name: 'Output', nodes: [
      { code: 'base', mod: 'gradient-map', inputs: ['b'], params: { colorA: '#2a2c30', colorB: '#5a5e64' } },
      { code: 'shine', mod: 'gradient-map', inputs: ['b'], params: { colorA: '#909498', colorB: '#eef2f6' } },
      { code: 'o', mod: 'mask-blend', inputs: ['base', 'shine', 'e'], params: { inLow: 0.2, inHigh: 0.8 }, alias: 'worn', note: 'Edge wear: «Edge detect» on the shape finds the raised borders; that becomes a mask that reveals bright bare metal exactly on the edges, over the darker painted base.' },
    ] },
  ]),

  // ============================================================= //
  //  STYLIZED LOOKS — combinations for non-photoreal output        //
  // ============================================================= //
  ex('style-engraving', '13 · Ink engraving', 'Hatching + edges for line art.', [
    { id: 'a', name: 'Tone', nodes: [
      { code: 'n', mod: 'perlin', params: { scale: 4, warp: 0.5 } },
      { code: 'h', mod: 'hatching', inputs: ['n'], params: { frequency: 60, layers: 3, darkness: 0.9 } },
    ] },
    { id: 'b', name: 'Outline', nodes: [
      { code: 'n2', mod: 'perlin', params: { scale: 4, warp: 0.5 } },
      { code: 'e', mod: 'edge-detect', inputs: ['n2'], params: { strength: 3, invert: true } },
    ] },
    { id: 's', name: 'Output', nodes: [
      { code: 'o', mod: 'blend', inputs: ['h', 'e'], params: { mode: 'multiply' }, alias: 'engraving', note: 'Ink engraving: cross-hatching gives the shading and inverted «Edge detect» adds dark outlines; multiplying them stacks ink on ink for a woodcut/engraving look.' },
    ] },
  ]),
  ex('style-emboss-leather', '14 · Stamped leather', 'Emboss a pattern into a hide.', [
    { id: 'a', name: 'Hide', nodes: [
      { code: 'n', mod: 'fbm', params: { scale: 18 } },
      { code: 'hg', mod: 'gradient-map', inputs: ['n'], params: { colorA: '#3a2014', colorB: '#7a4a2a' }, alias: 'hide' },
    ] },
    { id: 'b', name: 'Stamp', nodes: [
      { code: 'w', mod: 'worley', params: { scale: 6, jitter: 0.2, mode: 'F2-F1' } },
      { code: 'em', mod: 'emboss', inputs: ['w'], params: { angle: 0.785, amount: 3 }, alias: 'stamp' },
    ] },
    { id: 's', name: 'Output', nodes: [
      { code: 'o', mod: 'blend', inputs: ['hg', 'em'], params: { mode: 'overlay', opacity: 0.6 }, alias: 'leather', note: 'Stamped leather: «Emboss» turns a Worley pattern into raised relief, then overlay presses it into the dyed hide. Overlay keeps the leather color while adding the embossed shading.' },
    ] },
  ]),
  ex('style-vignette', '15 · Framed poster (gradient mask)', 'gradient-shape as a vignette.', [
    { id: 'img', name: 'Art', nodes: [
      { code: 'n', mod: 'perlin', params: { scale: 5, warp: 0.6 } },
      { code: 'lc', mod: 'levels', inputs: ['n'], params: { inBlack: 0.35, inWhite: 0.65 } },
      { code: 'd', mod: 'ordered-dither', inputs: ['lc'], params: { levels: 3, strength: 0 } },
      { code: 'g', mod: 'gradient-map', inputs: ['d'], params: { colorA: '#7a1a14', colorB: '#e8d8b0' }, alias: 'art' },
    ] },
    { id: 'v', name: 'Vignette', nodes: [
      { code: 'rad', mod: 'gradient-shape', params: { shape: 'Radial', scale: 2.6, invert: true } },
      { code: 'lv', mod: 'levels', inputs: ['rad'], params: { outBlack: 0.45 }, alias: 'vignette' },
    ] },
    { id: 's', name: 'Output', nodes: [
      { code: 'o', mod: 'blend', inputs: ['g', 'lv'], params: { mode: 'multiply', opacity: 0.85 }, alias: 'poster', note: 'Vignette: «Gradient / Shape» (radial, inverted) is a dark-edged mask; «Levels» lifts its black so it only dims — not kills — the corners. Multiplied over the posterized art it frames it like an old print. Try Linear/Angular shapes for other framing.' },
    ] },
  ]),
  ex('style-crt', '16 · Retro CRT screen', 'Posterize + tint + scanlines.', [
    { id: 'a', name: 'Image', nodes: [
      { code: 'n', mod: 'fbm', params: { scale: 6 } },
      { code: 'd', mod: 'ordered-dither', inputs: ['n'], params: { levels: 2 } },
      { code: 'c', mod: 'colorize', inputs: ['d'], params: { color: '#30ff70', mode: 'Multiply' } },
    ] },
    { id: 'b', name: 'Scanlines', nodes: [
      { code: 'h', mod: 'hatching', inputs: ['c'], params: { frequency: 120, angle: 0, layers: 1, darkness: 0.4 } },
    ] },
    { id: 's', name: 'Output', nodes: [
      { code: 'o', mod: 'blend', inputs: ['c', 'h'], params: { mode: 'multiply', opacity: 0.5 }, alias: 'crt', note: 'CRT screen: 1-bit dither + green phosphor tint, then horizontal hatching as scanlines multiplied on top. Swap the colorize color for an amber monitor.' },
    ] },
  ]),
  ex('style-camo', '17 · Camouflage (posterized blobs)', 'Layered noise into flat patches.', [
    { id: 'a', name: 'Blobs', nodes: [
      { code: 'n1', mod: 'fbm', params: { scale: 5, seed: 2 } },
      { code: 'n2', mod: 'worley', params: { scale: 4, jitter: 1, mode: 'F1' } },
      { code: 'm', mod: 'blend', inputs: ['n1', 'n2'], params: { mode: 'overlay', opacity: 0.5 } },
      { code: 'd', mod: 'ordered-dither', inputs: ['m'], params: { levels: 4, strength: 0 } },
      { code: 'g', mod: 'gradient-map', inputs: ['d'], params: { colorA: '#2e3320', colorB: '#8a9060' }, alias: 'camo', note: 'Camouflage: two noises overlaid, then posterized to 4 flat levels and mapped to muted greens — the posterize is what turns soft noise into hard military patches.' },
    ] },
  ]),

  // ============================================================= //
  //  TILING / SEAMLESS — make it repeat                            //
  // ============================================================= //
  ex('tile-procedural', '18 · Seamless procedural', 'Tileable on, verify with the viewer.', [
    lane('Tileable', [
      { code: 'a', mod: 'worley', params: { scale: 6, mode: 'F2-F1', tileable: true } },
      { code: 'g', mod: 'gradient-map', inputs: ['a'], params: { colorA: '#102a30', colorB: '#80d0c0' }, alias: 'tile', note: 'Procedural textures tile natively when «Tileable» is on (it is on by default for the whole project). Double-click → Tile 4×4 to verify there are no seams.' },
    ]),
  ]),
  ex('tile-seamless-filter', '19 · Make an image seamless', 'Wrap-blend a non-tiling source.', [
    lane('Image', [
      { code: 'a', mod: 'image', note: 'Upload a photo with «Upload» on an empty lane — bitmaps from outside do NOT tile on their own.' },
      { code: 's', mod: 'make-seamless', inputs: ['a'], params: { blend: 0.18 }, alias: 'seamless', note: '«Make seamless» wraps each edge into its opposite so an uploaded bitmap repeats with no visible seam. For procedurals use the generator’s «Tileable» instead.' },
    ]),
  ]),

  // ============================================================= //
  //  GEMS & EXTRAS — short but still multi-step                    //
  // ============================================================= //
  ex('gem-emerald', '20 · Faceted emerald', 'Crystal facets, sharpen, tint.', [
    lane('Emerald', [
      { code: 'a', mod: 'crystal', params: { scale: 5, sharp: 0.8 } },
      { code: 'l', mod: 'levels', inputs: ['a'], params: { inBlack: 0.25, inWhite: 0.85, outBlack: 0.2 } },
      { code: 's', mod: 'sharpen', inputs: ['l'], params: { amount: 1.5 } },
      { code: 'g', mod: 'gradient-map', inputs: ['s'], params: { colorA: '#0a4028', colorB: '#70ffc0', bias: 0.65 } },
      { code: 'h', mod: 'hsv', inputs: ['g'], params: { sat: 1.3 }, alias: 'emerald', note: 'Emerald: crystal facets, lifted with «Levels» so the green reads, sharpened to crisp the edges, colored, then «Hue / Saturation» deepens the saturation for a gem-like punch.' },
    ]),
  ]),
  ex('extra-circuit', '21 · Sci-fi circuit panel', 'Worley traces glowing on dark.', [
    { id: 'a', name: 'Traces', nodes: [
      { code: 'w', mod: 'worley', params: { scale: 8, jitter: 0.2, mode: 'F2-F1' } },
      { code: 't', mod: 'threshold', inputs: ['w'], params: { level: 0.12, invert: true } },
      { code: 'e', mod: 'emboss', inputs: ['t'], params: { amount: 2, angle: 2.3 } },
    ] },
    { id: 's', name: 'Output', nodes: [
      { code: 'g', mod: 'gradient-map', inputs: ['t'], params: { colorA: '#0a1a12', colorB: '#30ff80' } },
      { code: 'o', mod: 'blend', inputs: ['g', 'e'], params: { mode: 'screen', opacity: 0.5 }, alias: 'circuit', note: 'Circuit panel: the Worley grid thresholded into traces, colored tech-green, with a faint embossed bevel screened on top for a raised, lit look.' },
    ] },
  ]),
  ex('extra-terrain', '22 · Stylized terrain map', 'Height banded into terrain colors.', [
    { id: 'a', name: 'Land', nodes: [
      { code: 'n', mod: 'fbm', params: { scale: 3, octaves: 7 } },
      { code: 'd', mod: 'ordered-dither', inputs: ['n'], params: { levels: 6, strength: 0 } },
      { code: 'g', mod: 'gradient-map', inputs: ['d'], params: { colorA: '#1a4a6a', colorB: '#e8e0c0' } },
    ] },
    { id: 'b', name: 'Relief', nodes: [
      { code: 'em', mod: 'emboss', inputs: ['n'], params: { amount: 2, angle: 0.6 } },
    ] },
    { id: 's', name: 'Output', nodes: [
      { code: 'o', mod: 'blend', inputs: ['g', 'em'], params: { mode: 'overlay', opacity: 0.4 }, alias: 'terrain', note: 'Terrain map: FBM posterized into 6 elevation bands (sea→peaks), with a low-angle «Emboss» overlaid as subtle hill-shading. The dither bands are the contour levels.' },
    ] },
  ]),
];

export function exampleById(id: string): Example | undefined {
  return EXAMPLES.find((e) => e.id === id);
}
