// Decodifica un dataURL a ImageBitmap re-escalado a res×res. Devuelve null si
// falla o está vacío (el backend pinta un gris de relleno → nunca negro).
export async function decodeToBitmap(src: string, res: number): Promise<ImageBitmap | null> {
  if (!src) return null;
  try {
    const blob = await (await fetch(src)).blob();
    return await createImageBitmap(blob, {
      resizeWidth: res,
      resizeHeight: res,
      resizeQuality: 'high',
    });
  } catch {
    return null;
  }
}
