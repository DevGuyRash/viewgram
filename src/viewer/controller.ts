import { center, constrain, fitted, nativeSize, parsePercent, resized, validSize, zoomAt, type Size, type ViewState } from './math';
import { Lifetime } from './lifetime';

export interface ViewerOptions {
  mode: 'width' | 'contain';
  label?: string;
  nativeMermaidParent?: boolean;
  open?: () => void;
  openLink?: (href: string, newLeaf: boolean) => void;
}
const interactive = 'a, button, input, textarea, select, [role="button"], [contenteditable="true"]';
function element(doc: Document, tag: string, className: string, text?: string): HTMLElement {
  const el = doc.createElement(tag); el.className = className; if (text) el.textContent = text; return el;
}
export class ViewportController {
  readonly root: HTMLElement;
  readonly viewport: HTMLElement;
  readonly surface: HTMLElement;
  readonly native: Size;
  readonly zoomInput: HTMLInputElement;
  readonly lifetime = new Lifetime();
  state: ViewState = { scale: 1, x: 0, y: 0, mode: 'width' };
  size: Size = { width: 0, height: 0 };
  private frame = 0;
  private suspended = false;
  private initialized = false;
  private drag: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
  private suppressClick = false;
  private status: HTMLElement;
  private zoomOut: HTMLButtonElement;
  private zoomIn: HTMLButtonElement;
  private readonly win: Window;

  constructor(readonly svg: SVGSVGElement, readonly options: ViewerOptions, native = nativeSize(svg)) {
    if (!native) throw new Error('SVG needs a valid viewBox or explicit native dimensions.');
    this.native = native;
    const doc = svg.ownerDocument;
    this.win = doc.defaultView!;
    this.root = element(doc, 'section', 'kmv-viewer');
    this.root.setAttribute('aria-label', options.label || 'Mermaid diagram viewer');
    this.root.setAttribute('contenteditable', 'false');
    this.viewport = element(doc, 'div', 'kmv-viewport');
    this.viewport.tabIndex = 0;
    this.viewport.setAttribute('role', 'region');
    this.viewport.setAttribute('aria-label', 'Diagram. Arrow keys pan, plus and minus zoom, Home recenters, F fits, 0 sets native size.');
    // Keep the native direct-child presentation contract (notably Obsidian's dark SVG filter).
    this.surface = element(doc, 'div', options.nativeMermaidParent ? 'kmv-surface mermaid' : 'kmv-surface');
    this.svg.style.setProperty('width', `${this.native.width}px`, 'important');
    this.svg.style.setProperty('height', `${this.native.height}px`, 'important');
    this.svg.style.setProperty('max-width', 'none', 'important');
    this.svg.style.setProperty('max-height', 'none', 'important');
    this.svg.style.setProperty('display', 'block');
    this.surface.append(svg);
    this.viewport.append(this.surface);
    const footer = element(doc, 'div', 'kmv-footer');
    const info = element(doc, 'div', 'kmv-info');
    this.status = element(doc, 'div', 'kmv-status');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    const hint = element(doc, 'div', 'kmv-hint', 'Drag to explore · 100% is native size');
    const actions = element(doc, 'div', 'kmv-actions');
    actions.append(this.button(options.mode === 'width' ? 'Fit width' : 'Fit diagram', options.mode === 'width' ? 'Fit width' : 'Fit diagram', () => this.fit()));
    actions.append(this.button('100%', 'Native size (100%)', () => this.setZoom(1)));
    if (options.open) actions.append(this.button('Expand ↗', 'Open diagram lightbox', options.open));
    info.append(this.status, hint, actions);
    const dock = element(doc, 'div', 'kmv-dock');
    dock.setAttribute('aria-label', 'Diagram controls');
    const row = element(doc, 'div', 'kmv-zoom-row');
    this.zoomOut = this.button('−', 'Zoom out', e => this.nudge(-(e.shiftKey ? 0.35 : 0.15)));
    this.zoomIn = this.button('+', 'Zoom in', e => this.nudge(e.shiftKey ? 0.35 : 0.15));
    this.zoomInput = doc.createElement('input');
    this.zoomInput.className = 'kmv-zoom-input';
    this.zoomInput.type = 'text'; this.zoomInput.inputMode = 'decimal';
    this.zoomInput.setAttribute('aria-label', 'Zoom percentage');
    this.zoomInput.setAttribute('title', 'Enter 1–1000%, or a multiplier such as 1.5x');
    this.zoomInput.spellcheck = false;
    row.append(this.zoomOut, this.zoomInput, this.zoomIn);
    const dpad = element(doc, 'div', 'kmv-dpad');
    const directions: [string, string, string, () => void][] = [
      ['↑', 'Pan up', 'kmv-up', () => this.pan(0, 1)],
      ['←', 'Pan left', 'kmv-left', () => this.pan(1, 0)],
      ['⊙', 'Recenter diagram', 'kmv-center', () => this.recenter()],
      ['→', 'Pan right', 'kmv-right', () => this.pan(-1, 0)],
      ['↓', 'Pan down', 'kmv-down', () => this.pan(0, -1)],
    ];
    for (const [text, label, cls, fn] of directions) { const button = this.button(text, label, fn); button.classList.add(cls); dpad.append(button); }
    dock.append(row, dpad); footer.append(info, dock); this.root.append(this.viewport, footer);
    this.state.mode = options.mode;
    this.events();
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]; if (!entry || this.lifetime.disposed) return;
      this.resize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(this.viewport);
    this.lifetime.add(() => observer.disconnect());
    this.lifetime.add(() => { if (this.frame) this.win.cancelAnimationFrame(this.frame); this.finishDrag(); });
  }
  private button(text: string, label: string, fn: (e: MouseEvent) => void): HTMLButtonElement {
    const button = this.svg.ownerDocument.createElement('button');
    button.type = 'button'; button.className = 'kmv-button'; button.textContent = text;
    button.setAttribute('aria-label', label); button.title = label;
    this.lifetime.listen(button, 'click', ((e: MouseEvent) => { e.stopPropagation(); fn(e); }) as EventListener);
    return button;
  }
  private events(): void {
    const on = (type: string, callback: EventListener, target: EventTarget = this.viewport, options?: AddEventListenerOptions) => this.lifetime.listen(target, type, callback, options);
    on('keydown', ((e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.drag) { e.preventDefault(); e.stopPropagation(); this.finishDrag(); return; }
      if (e.target !== this.viewport || e.ctrlKey || e.metaKey || e.altKey) return;
      const actions: Record<string, () => void> = { ArrowLeft: () => this.pan(1, 0), ArrowRight: () => this.pan(-1, 0), ArrowUp: () => this.pan(0, 1), ArrowDown: () => this.pan(0, -1), '+': () => this.nudge(.15), '=': () => this.nudge(.15), '-': () => this.nudge(-.15), Home: () => this.recenter(), f: () => this.fit(), F: () => this.fit(), '0': () => this.setZoom(1) };
      if (actions[e.key]) { e.preventDefault(); e.stopPropagation(); actions[e.key]!(); }
    }) as EventListener);
    on('keydown', ((e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this.commitInput(); this.viewport.focus({ preventScroll: true }); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.zoomInput.value = this.percent(); this.viewport.focus({ preventScroll: true }); }
    }) as EventListener, this.zoomInput);
    on('change', (() => this.commitInput()) as EventListener, this.zoomInput);
    on('focus', (() => this.zoomInput.select()) as EventListener, this.zoomInput);
    on('pointerdown', ((e: PointerEvent) => {
      this.suppressClick = false;
      if (e.button !== 0 || !e.isPrimary || (e.target as Element).closest(interactive) || !this.canPan() || this.suspended) return;
      // Touch retains vertical document scrolling in width-fit mode. Use 100%/zoom for touch dragging.
      if (e.pointerType === 'touch' && this.state.mode !== 'manual') return;
      e.preventDefault(); e.stopPropagation();
      this.viewport.focus({ preventScroll: true });
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: this.state.x, startY: this.state.y, moved: false };
      this.viewport.setPointerCapture(e.pointerId);
    }) as EventListener);
    on('pointermove', ((e: PointerEvent) => {
      const drag = this.drag; if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true; this.suppressClick = true;
      e.preventDefault(); e.stopPropagation();
      this.state = constrain(this.native, this.size, { ...this.state, mode: 'manual', x: drag.startX + dx, y: drag.startY + dy });
      this.root.classList.add('kmv-dragging'); this.schedule();
    }) as EventListener);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) on(type, (() => this.finishDrag()) as EventListener);
    on('blur', (() => this.finishDrag()) as EventListener, this.win);
    on('click', ((e: MouseEvent) => {
      if (this.suppressClick) { e.preventDefault(); e.stopImmediatePropagation(); this.suppressClick = false; }
    }) as EventListener, this.viewport, { capture: true });
    // Noneditable widget island: preserve normal input focus but keep pointer starts out of host editors.
    for (const type of ['pointerdown', 'mousedown']) on(type, e => e.stopPropagation(), this.root);
    // Keep viewer gestures out of enclosing Mica edit/selection handlers. Links retain direct handlers.
    on('click', ((e: MouseEvent) => {
      const target = (e.target as Element).closest('a.internal-link, a[data-href]');
      if (target && this.options.openLink) {
        const href = target.getAttribute('data-href') || target.getAttribute('href');
        if (href) { e.preventDefault(); this.options.openLink(href, e.ctrlKey || e.metaKey); }
      }
      e.stopPropagation();
    }) as EventListener, this.root);
    on('dblclick', ((e: MouseEvent) => { if (!(e.target as Element).closest(interactive)) e.preventDefault(); e.stopPropagation(); }) as EventListener, this.root);
    // No wheel handler: ordinary wheel/trackpad gestures continue scrolling the note.
  }
  private finishDrag(): void {
    const drag = this.drag; this.drag = null; this.root.classList.remove('kmv-dragging');
    if (drag && this.viewport.hasPointerCapture(drag.id)) this.viewport.releasePointerCapture(drag.id);
  }
  private percent(): string { return `${Number((this.state.scale * 100).toFixed(2))}%`; }
  private commitInput(): void {
    const parsed = parsePercent(this.zoomInput.value);
    if (parsed !== null) this.setZoom(parsed);
    this.zoomInput.value = this.percent();
  }
  canPan(): boolean { return this.native.width * this.state.scale > this.size.width - 32 || this.native.height * this.state.scale > this.size.height - 32; }
  resize(next: Size): void {
    if (!validSize(next) || this.lifetime.disposed) return; // Hidden containers keep their state until visible.
    if (this.initialized && next.width === this.size.width && next.height === this.size.height) return;
    this.state = this.initialized ? resized(this.native, this.size, next, this.state) : fitted(this.native, next, this.options.mode);
    this.size = next; this.initialized = true; this.schedule();
  }
  fit(): void { this.finishDrag(); this.state = fitted(this.native, this.size, this.options.mode); this.schedule(); }
  setZoom(scale: number): void { this.finishDrag(); this.state = zoomAt(this.native, this.size, this.state, scale); this.schedule(); }
  private nudge(delta: number): void { this.setZoom(Math.max(.01, this.state.scale + delta)); }
  pan(dx: number, dy: number): void {
    this.state = constrain(this.native, this.size, { ...this.state, mode: 'manual', x: this.state.x + dx * Math.max(60, this.size.width * .25), y: this.state.y + dy * Math.max(60, this.size.height * .25) }); this.schedule();
  }
  recenter(): void { this.state = { ...this.state, ...center(this.native, this.size, this.state.scale), mode: 'manual' }; this.schedule(); }
  suspend(): void { this.suspended = true; this.finishDrag(); if (this.frame) this.win.cancelAnimationFrame(this.frame); this.frame = 0; }
  resume(): void { this.suspended = false; this.surface.append(this.svg); this.schedule(); }
  private schedule(): void {
    if (this.frame || this.suspended || this.lifetime.disposed) return;
    this.frame = this.win.requestAnimationFrame(() => { this.frame = 0; this.paint(); });
  }
  private paint(): void {
    if (!this.initialized || this.suspended || this.lifetime.disposed) return;
    const { scale, x, y } = this.state;
    this.surface.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    this.root.classList.toggle('kmv-can-pan', this.canPan());
    this.root.classList.toggle('kmv-touch-drag', this.state.mode === 'manual' && this.canPan());
    this.root.dataset.mode = this.state.mode;
    this.root.dataset.scale = String(scale);
    this.root.dataset.ready = 'true';
    if (this.svg.ownerDocument.activeElement !== this.zoomInput) this.zoomInput.value = this.percent();
    this.zoomOut.disabled = scale <= .01; this.zoomIn.disabled = scale >= 10;
    const mode = this.state.mode === 'width' ? 'Fit width' : this.state.mode === 'contain' ? 'Whole diagram' : scale === 1 ? 'Native size' : 'Custom zoom';
    const status = `${mode} · ${this.percent()}`;
    if (this.status.textContent !== status) this.status.textContent = status;
  }
  dispose(): void { this.lifetime.dispose(); this.root.remove(); }
}
