/** Observe a rendered viewport's first valid paint; no polling and no arbitrary RAF count. */
export function waitForViewportReady(root: HTMLElement, timeoutMs = 5000): Promise<void> {
  const ready = (): boolean => {
    const scale = Number(root.dataset.scale);
    return root.isConnected && root.dataset.ready === 'true' && Number.isFinite(scale) && scale > 0;
  };
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const win = root.ownerDocument.defaultView!;
    const observer = new MutationObserver(() => { if (ready()) finish(); });
    const timer = win.setTimeout(() => finish(new Error('Viewer did not reach a finite positive painted scale.')), timeoutMs);
    const finish = (error?: Error): void => { observer.disconnect(); win.clearTimeout(timer); if (error) reject(error); else resolve(); };
    observer.observe(root, { attributes: true, attributeFilter: ['data-ready', 'data-scale'] });
    if (ready()) finish();
  });
}
