// Codifica RGBA8 a PNG usando un canvas 2D fuera de pantalla.
export async function pngBlobFromRGBA(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear contexto 2D para export');
  const img = new ImageData(width, height);
  img.data.set(rgba);
  ctx.putImageData(img, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}
