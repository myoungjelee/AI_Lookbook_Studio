export function downloadDataUrl(dataUrl: string, filename: string) {
  try {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (e) {
    console.error('downloadDataUrl failed', e);
  }
}

export async function captureNodeToPng(node: HTMLElement, filename: string, scale = 2): Promise<boolean> {
  try {
    const mod = await import('html2canvas').catch(() => null as any);
    const html2canvas = mod?.default || mod;
    if (!html2canvas) return false;
    const canvas = await html2canvas(node, {
      scale,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      allowTaint: true,
    });
    downloadDataUrl(canvas.toDataURL('image/png'), filename);
    return true;
  } catch (e) {
    console.warn('captureNodeToPng fallback', e);
    return false;
  }
}

export async function shareOrDownloadResult(containerSelector: string, fallbackDataUrl: string | undefined, filename = defaultFileName()): Promise<void> {
  const node = document.querySelector(containerSelector) as HTMLElement | null;
  if (node) {
    const ok = await captureNodeToPng(node, filename, 2);
    if (ok) return;
  }
  if (fallbackDataUrl) downloadDataUrl(fallbackDataUrl, filename);
}

export function defaultFileName(prefix: string = 'tryon') {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const name = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${prefix}-${name}.png`;
}

