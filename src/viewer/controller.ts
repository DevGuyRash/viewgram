import { center, constrain, fitted, nativeSize, parsePercent, resized, validSize, zoomAt, type Size, type ViewState } from './math';
import { Lifetime } from './lifetime';

export interface ViewerActionResult { message: string; fallback?: { label: string; run(): void } }
export interface ViewerAction { text: string; label: string; run(): Promise<ViewerActionResult | void> | ViewerActionResult | void }
export interface ViewerOptions {
  mode: 'width' | 'contain';
  label?: string;
  nativeMermaidParent?: boolean;
  open?: () => void;
  actions?: ViewerAction[];
  openLink?: (href: string, newLeaf: boolean) => void;
}
const ZOOM_PRESETS = [10, 25, 50, 75, 100, 125, 150, 200, 300, 400];
const interactive = 'a, summary, button, input, textarea, select, [role="button"], [role="link"], [contenteditable="true"]';
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
  private actionStatus: HTMLElement;
  private zoomOut: HTMLButtonElement;
  private zoomIn: HTMLButtonElement;
  private readonly win: Window;
  private userHeight = false;
  private heightObserver?: ResizeObserver;
  private heightParent?: Element;
  private zoomMenu: HTMLElement;

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
    const hint = element(doc, 'div', 'kmv-hint', 'Scroll or drag to explore · Ctrl/⌘ + scroll to zoom');
    hint.title = 'Hover a diagram element to see related items. Incoming, outgoing, bidirectional and undirected relations have distinct emphasis; theme filters can affect colors. Native line styles and arrowheads retain relationship type. Double-click an element to edit Mermaid source.';
    const actions = element(doc, 'div', 'kmv-actions');
    if (options.open) actions.append(this.button('Expand ↗', 'Open diagram lightbox', options.open));
    const actionStatus = this.actionStatus = element(doc, 'div', 'kmv-action-status'); actionStatus.setAttribute('role', 'status');
    if (options.actions?.length) {
      const menu = doc.createElement('details'); menu.className = 'kmv-tools';
      const summary = doc.createElement('summary'); summary.className = 'kmv-button'; summary.textContent = 'Source & export';
      const choices = element(doc, 'div', 'kmv-tool-menu');
      menu.append(summary, choices);
      for (const action of options.actions) {
        const button = this.button(action.text, action.label, () => {
          menu.open = false; button.disabled = true; actionStatus.textContent = 'Working…';
          void Promise.resolve().then(() => action.run()).then(result => {
            if (this.lifetime.disposed) return;
            actionStatus.textContent = result?.message ?? '';
            if (result?.fallback) actionStatus.append(this.button(result.fallback.label, result.fallback.label, result.fallback.run));
          }, error => { if (!this.lifetime.disposed) actionStatus.textContent = error instanceof Error ? error.message : String(error); })
            .finally(() => { button.disabled = false; });
        });
        choices.append(button);
      }
      this.lifetime.listen(doc, 'pointerdown', event => { if (!menu.contains(event.target as Node)) menu.open = false; });
      this.lifetime.listen(menu, 'keydown', ((event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); menu.open = false; summary.focus(); } }) as EventListener);
      actions.append(menu);
    }
    info.append(this.status, hint, actions, actionStatus);
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
    const zoomPicker = element(doc, 'div', 'kmv-zoom-picker');
    this.zoomMenu = element(doc, 'div', 'kmv-zoom-menu');
    this.zoomMenu.hidden = true;
    this.zoomMenu.setAttribute('role', 'group');
    this.zoomMenu.setAttribute('aria-label', 'Zoom presets');
    const togglePresets = (): void => {
      this.zoomMenu.hidden = !this.zoomMenu.hidden;
      this.zoomInput.setAttribute('aria-expanded', String(!this.zoomMenu.hidden));
    };
    this.zoomInput.setAttribute('aria-expanded', 'false');
    this.zoomInput.setAttribute('aria-haspopup', 'true');
    for (const preset of ZOOM_PRESETS) this.zoomMenu.append(this.button(`${preset}%`, `Zoom to ${preset}%`, () => {
      this.setZoom(preset / 100); this.closePresets(); this.zoomInput.focus({ preventScroll: true });
    }));
    zoomPicker.append(this.zoomInput, this.button('⌄', 'Choose zoom preset', togglePresets), this.zoomMenu);
    this.lifetime.listen(this.zoomInput, 'click', togglePresets);
    this.lifetime.listen(this.zoomMenu, 'keydown', ((event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.closePresets(); this.zoomInput.focus(); } }) as EventListener);
    this.lifetime.listen(doc, 'pointerdown', event => {
      if (!zoomPicker.contains(event.target as Node)) this.closePresets();
    });
    row.append(
      this.button(options.mode === 'width' ? 'Fit width' : 'Fit diagram', options.mode === 'width' ? 'Fit width' : 'Fit diagram', () => this.fit()),
      this.button('100%', 'Native size (100%)', () => this.setZoom(1)),
      this.zoomOut, zoomPicker, this.zoomIn,
    );
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
    if (options.mode === 'width') this.addResizeHandle();
    this.events();
    this.lifetime.listen(this.win, 'resize', () => this.autoHeight(this.viewport.clientWidth));
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]; if (!entry || this.lifetime.disposed) return;
      this.resize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(this.viewport);
    this.lifetime.add(() => observer.disconnect());
    if (options.mode === 'width') {
      this.heightObserver = new ResizeObserver(() => this.autoHeight(this.viewport.clientWidth));
      this.heightObserver.observe(footer);
      this.lifetime.add(() => this.heightObserver?.disconnect());
    }
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
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); this.zoomMenu.hidden = false; this.zoomInput.setAttribute('aria-expanded', 'true'); (this.zoomMenu.querySelector('button') as HTMLButtonElement | null)?.focus(); return; }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this.commitInput(); this.viewport.focus({ preventScroll: true }); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.closePresets(); this.zoomInput.value = this.percent(); this.viewport.focus({ preventScroll: true }); }
    }) as EventListener, this.zoomInput);
    on('change', (() => this.commitInput()) as EventListener, this.zoomInput);
    on('focus', (() => this.zoomInput.select()) as EventListener, this.zoomInput);
    on('pointerdown', ((e: PointerEvent) => {
      this.suppressClick = false;
      const control = (e.target as Element).closest(interactive);
      if ((e.button !== 0 && e.button !== 1) || !e.isPrimary || (control && !(e.button === 1 && control.matches('a, [role="link"]'))) || !this.canPan() || this.suspended) return;
      // Touch retains vertical document scrolling in width-fit mode. Use 100%/zoom for touch dragging.
      if (e.pointerType === 'touch' && this.state.mode !== 'manual') return;
      e.preventDefault(); e.stopPropagation();
      this.viewport.focus({ preventScroll: true });
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: this.state.x, startY: this.state.y, moved: false };
    }) as EventListener);
    on('pointermove', ((e: PointerEvent) => {
      const drag = this.drag; if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      if (!drag.moved) this.viewport.setPointerCapture(e.pointerId);
      drag.moved = true; this.suppressClick = true;
      e.preventDefault(); e.stopPropagation();
      this.state = constrain(this.native, this.size, { ...this.state, mode: 'manual', x: drag.startX + dx, y: drag.startY + dy });
      this.root.classList.add('kmv-dragging'); this.schedule();
    }) as EventListener, this.win, { capture: true });
    for (const type of ['pointerup', 'pointercancel']) on(type, (() => this.finishDrag()) as EventListener, this.win, { capture: true });
    on('lostpointercapture', (() => this.finishDrag()) as EventListener);
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
    on('auxclick', ((e: MouseEvent) => {
      if (e.button === 1 && this.suppressClick) { e.preventDefault(); e.stopPropagation(); this.suppressClick = false; }
    }) as EventListener);
    on('wheel', ((e: WheelEvent) => {
      if (this.suspended || (e.target as Element).closest(interactive)) return;
      const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.size.height : 1;
      if (e.ctrlKey || e.metaKey) {
        const rect = this.viewport.getBoundingClientRect();
        this.state = zoomAt(this.native, this.size, this.state,
          this.state.scale * Math.exp(-e.deltaY * factor * .002),
          { x: e.clientX - rect.left, y: e.clientY - rect.top });
      } else {
        const dx = (e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX) * factor;
        const dy = (e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY) * factor;
        const next = constrain(this.native, this.size, { ...this.state, mode: 'manual', x: this.state.x - dx, y: this.state.y - dy });
        if (next.x === this.state.x && next.y === this.state.y) return; // At edges, let the note scroll.
        this.state = next;
      }
      e.preventDefault(); e.stopPropagation(); this.closePresets(); this.schedule();
    }) as EventListener, this.viewport, { passive: false });
  }
  private closePresets(): void {
    this.zoomMenu.hidden = true; this.zoomInput.setAttribute('aria-expanded', 'false');
  }
  private heightLimit(): number {
    const parent = this.root.closest('.view-content, .markdown-reading-view, .cm-scroller') as HTMLElement | null;
    if (parent && parent !== this.heightParent && this.heightObserver) {
      if (this.heightParent) this.heightObserver.unobserve(this.heightParent);
      this.heightParent = parent; this.heightObserver.observe(parent);
    }
    const available = Math.min(this.win.innerHeight, parent?.clientHeight || this.win.innerHeight);
    const footer = this.root.querySelector('.kmv-footer') as HTMLElement | null;
    return Math.max(150, available * .88 - (footer?.offsetHeight || 80));
  }
  private autoHeight(width: number): void {
    if (this.options.mode !== 'width' || width <= 0) return;
    const height = this.userHeight ? this.viewport.clientHeight : this.native.height * Math.min(1, Math.max(1, width - 32) / this.native.width) + 32;
    const next = Math.round(Math.max(150, Math.min(this.heightLimit(), height)));
    if (Math.abs(this.viewport.clientHeight - next) > 1) this.viewport.style.height = `${next}px`;
  }
  private addResizeHandle(): void {
    const handle = this.button('↕', 'Resize diagram height. Arrow keys resize; Home restores automatic height.', () => {});
    handle.classList.add('kmv-resize-handle');
    handle.setAttribute('aria-label', 'Resize diagram height');
    let resize: { id: number; y: number; height: number } | null = null;
    this.lifetime.listen(handle, 'pointerdown', ((e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      resize = { id: e.pointerId, y: e.clientY, height: this.viewport.clientHeight };
      handle.setPointerCapture(e.pointerId);
    }) as EventListener);
    this.lifetime.listen(handle, 'pointermove', ((e: PointerEvent) => {
      if (!resize || resize.id !== e.pointerId) return;
      e.preventDefault();
      const height = Math.max(150, Math.min(this.heightLimit(), resize.height + e.clientY - resize.y));
      if (height === this.viewport.clientHeight) return;
      this.userHeight = true; this.viewport.style.height = `${height}px`;
    }) as EventListener);
    const finish = (): void => {
      const previous = resize; resize = null;
      if (previous && handle.hasPointerCapture(previous.id)) handle.releasePointerCapture(previous.id);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.lifetime.listen(handle, type, finish);
    this.lifetime.listen(this.win, 'blur', finish); this.lifetime.add(finish);
    this.lifetime.listen(handle, 'keydown', ((e: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Home') { this.userHeight = false; this.autoHeight(this.viewport.clientWidth); }
      else { this.userHeight = true; this.viewport.style.height = `${Math.max(150, Math.min(this.heightLimit(), this.viewport.clientHeight + (e.key === 'ArrowDown' ? 40 : -40)))}px`; }
    }) as EventListener);
    this.viewport.append(handle);
  }
  private finishDrag(): void {
    const drag = this.drag; this.drag = null; this.root.classList.remove('kmv-dragging');
    if (drag && this.viewport.hasPointerCapture(drag.id)) this.viewport.releasePointerCapture(drag.id);
  }
  private percent(): string { return `${Number((this.state.scale * 100).toFixed(2))}%`; }
  private commitInput(): void {
    this.closePresets();
    const parsed = parsePercent(this.zoomInput.value);
    if (parsed !== null) this.setZoom(parsed);
    this.zoomInput.value = this.percent();
  }
  announce(message: string): void { if (!this.lifetime.disposed) this.actionStatus.textContent = message; }
  canPan(): boolean { return this.native.width * this.state.scale > this.size.width - 32 || this.native.height * this.state.scale > this.size.height - 32; }
  resize(next: Size): void {
    if (!validSize(next) || this.lifetime.disposed) return; // Hidden containers keep their state until visible.
    this.autoHeight(next.width);
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
