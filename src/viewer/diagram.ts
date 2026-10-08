import { ViewportController } from './controller';
import { Lifetime } from './lifetime';
import { nativeSize } from './math';

export class DiagramViewer {
  readonly inline: ViewportController;
  readonly marker: Comment;
  readonly lifetime = new Lifetime();
  private closeModal: (() => void) | null = null;
  private readonly originalStyle: string | null;
  constructor(readonly svg: SVGSVGElement, openLink?: (href: string, newLeaf: boolean) => void) {
    const parent = svg.parentNode;
    const native = nativeSize(svg);
    if (!parent || !native) throw new Error('Cannot wrap an unmeasurable or detached SVG.');
    this.originalStyle = svg.getAttribute('style');
    this.marker = svg.ownerDocument.createComment('mermaid-viewer: original position');
    parent.insertBefore(this.marker, svg);
    this.inline = new ViewportController(svg, { mode: 'width', nativeMermaidParent: svg.parentElement?.classList.contains('mermaid') === true, open: () => this.open(), openLink }, native);
    this.marker.after(this.inline.root);
  }
  open(): void {
    if (this.lifetime.disposed || this.closeModal) return;
    const doc = this.svg.ownerDocument;
    const previousFocus = doc.activeElement as HTMLElement | null;
    const dialog = doc.createElement('dialog');
    dialog.className = 'kmv-dialog';
    dialog.setAttribute('aria-label', 'Mermaid diagram lightbox');
    const header = doc.createElement('div'); header.className = 'kmv-dialog-header';
    const title = doc.createElement('h2'); title.textContent = 'Diagram';
    const subtitle = doc.createElement('span'); subtitle.textContent = 'Pan and zoom'; subtitle.className = 'kmv-dialog-subtitle';
    const close = doc.createElement('button'); close.type = 'button'; close.className = 'kmv-button kmv-close';
    close.textContent = 'Close ×'; close.setAttribute('aria-label', 'Close diagram lightbox');
    header.append(title, subtitle, close);
    const life = new Lifetime();
    this.inline.suspend();
    // Move the original SVG, never clone or re-parse it: IDs and direct link listeners survive.
    const modal = new ViewportController(this.svg, { mode: 'contain', nativeMermaidParent: this.inline.options.nativeMermaidParent, openLink: this.inline.options.openLink }, this.inline.native);
    dialog.append(header, modal.root); doc.body.append(dialog);
    const finish = (): void => {
      if (!this.closeModal) return;
      this.closeModal = null;
      life.dispose();
      this.inline.resume(); // Return the same node and restore the independent inline state.
      modal.dispose();
      if (dialog.open) dialog.close();
      dialog.remove();
      if (previousFocus?.isConnected && !this.lifetime.disposed) previousFocus.focus({ preventScroll: true });
    };
    this.closeModal = finish;
    life.listen(close, 'click', finish);
    life.listen(dialog, 'cancel', e => { e.preventDefault(); finish(); });
    life.listen(dialog, 'close', finish);
    // A backdrop gesture must begin and end on the backdrop, not merely end there after a drag.
    let backdropDown = false;
    life.listen(dialog, 'pointerdown', e => { backdropDown = e.target === dialog; });
    life.listen(dialog, 'click', e => { if (e.target === dialog && backdropDown) finish(); backdropDown = false; });
    try { dialog.showModal(); close.focus({ preventScroll: true }); }
    catch (error) { finish(); throw error; }
  }
  dispose(): void {
    if (this.lifetime.disposed) return;
    this.lifetime.dispose(); this.closeModal?.();
    if (this.originalStyle === null) this.svg.removeAttribute('style'); else this.svg.setAttribute('style', this.originalStyle);
    // Do not resurrect a removed/rerendered block.
    if (this.marker.parentNode && this.inline.root.parentNode === this.marker.parentNode) this.marker.replaceWith(this.svg);
    else this.marker.remove();
    this.inline.dispose();
  }
}
