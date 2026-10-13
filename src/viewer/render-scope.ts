import { DiagramViewer } from './diagram';
import { nativeSize } from './math';
import type { DiagramSource } from './source';

/** One Obsidian render child, one small subtree. No whole-vault scan, timer, or render cache. */
export class RenderScope {
  private readonly viewers = new Map<SVGSVGElement, DiagramViewer>();
  private observer: MutationObserver;
  private disposed = false;
  constructor(readonly element: HTMLElement, private openLink?: (href: string, newLeaf: boolean) => void, private sourceFor?: (svg: SVGSVGElement) => DiagramSource) {
    this.observer = new MutationObserver(records => {
      if (this.disposed) return;
      for (const [svg, viewer] of this.viewers) {
        if (!this.element.contains(viewer.inline.root)) { viewer.dispose(); this.viewers.delete(svg); }
      }
      for (const record of records) {
        for (const node of record.addedNodes) if (node.nodeType === 1) this.scan(node as Element);
        if (record.type === 'attributes') this.scan(record.target as Element);
      }
    });
    this.observer.observe(element, { childList: true, subtree: true, attributes: true, attributeFilter: ['viewBox', 'width', 'height'] });
    this.scan(element);
  }
  private scan(root: Element): void {
    if (!this.element.contains(root) || root.closest('.kmv-viewer, .kmv-dialog')) return;
    const candidates = root.matches('svg') ? [root] : [...root.querySelectorAll('svg')];
    for (const candidate of candidates) {
      const svg = candidate as SVGSVGElement;
      if (!this.element.contains(svg) || this.viewers.has(svg) || svg.closest('.kmv-viewer, .kmv-dialog') || !svg.closest('.mermaid, .block-language-mermaid') || !nativeSize(svg)) continue;
      // An enclosing render scope may already own this SVG. The wrapper above is its ownership marker.
      const viewer = new DiagramViewer(svg, this.openLink, this.sourceFor?.(svg));
      this.viewers.set(svg, viewer);
    }
  }
  get count(): number { return this.viewers.size; }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.observer.disconnect();
    for (const viewer of this.viewers.values()) viewer.dispose();
    this.viewers.clear();
  }
}
