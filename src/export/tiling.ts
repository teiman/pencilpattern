// Export de resoluciones grandes por tiles.
//
// ESTADO: el motor v1 renderiza el grafo siempre sobre el
// rango UV completo [0,1]. Un tiling correcto requiere una "ventana UV" por tile
// (uniform `uvMin/uvMax`) y *halos* de solape para los filtros con vecindad
// (blur, displace, normal-from-height) y coordenadas globales deterministas en el
// ruido para evitar costuras. Eso es una extensión acotada del runner GPU.
//
// Hasta entonces, `exportPng` exporta de una sola pasada hasta `maxTextureDimension2D`.
// Esta función documenta la interfaz objetivo para no perder el diseño.

export interface TileSpec {
  index: number;
  x: number;
  y: number;
  size: number; // lado del tile en px (interior, sin halo)
  halo: number; // px de solape a cada lado
  uvMin: [number, number];
  uvMax: [number, number];
}

export function planTiles(total: number, tileSize: number, halo: number): TileSpec[] {
  const tiles: TileSpec[] = [];
  const n = Math.ceil(total / tileSize);
  let index = 0;
  for (let ty = 0; ty < n; ty++) {
    for (let tx = 0; tx < n; tx++) {
      const x = tx * tileSize;
      const y = ty * tileSize;
      tiles.push({
        index: index++,
        x,
        y,
        size: Math.min(tileSize, total - x),
        halo,
        uvMin: [x / total, y / total],
        uvMax: [Math.min(x + tileSize, total) / total, Math.min(y + tileSize, total) / total],
      });
    }
  }
  return tiles;
}
