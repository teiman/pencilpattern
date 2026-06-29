// Inicialización de WebGPU (funciona en hilo principal o en Web Worker).
export async function requestDevice(): Promise<GPUDevice | null> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    return device;
  } catch {
    return null;
  }
}
