/** Every browser resource belongs to a single render instance. Cleanup is idempotent. */
export class Lifetime {
  private cleanups: (() => void)[] = [];
  disposed = false;
  add(cleanup: () => void): void { if (this.disposed) cleanup(); else this.cleanups.push(cleanup); }
  listen(target: EventTarget, type: string, callback: EventListener, options?: AddEventListenerOptions | boolean): void {
    target.addEventListener(type, callback, options);
    this.add(() => target.removeEventListener(type, callback, options));
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
  }
}
