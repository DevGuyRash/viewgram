import { center, constrain, fitted, nativeSize, parsePercent, resized, validSize, zoomAt, type Size, type ViewState } from './math';
import { Lifetime } from './lifetime';
import { DEFAULT_SETTINGS, readSettings, type ViewerSettings } from './settings';
import { interactiveAncestor } from './semantics';

export type ViewerActionIcon = 'edit' | 'copy' | 'image' | 'download';
export interface ViewerActionResult { message: string; feedback?: 'success' | 'warning'; fallback?: { label: string; run(): void } }
export interface ViewerAction { text: string; label: string; icon?: ViewerActionIcon; run(): Promise<ViewerActionResult | void> | ViewerActionResult | void }
export interface ViewerOptions {
  mode: 'width' | 'contain';
  label?: string;
  nativeMermaidParent?: boolean;
  resizable?: boolean;
  settings?: ViewerSettings;
  open?: () => void;
  edit?: () => void;
  onScale?: (scale: number) => void;
  actions?: ViewerAction[];
  openLink?: (href: string, newLeaf: boolean) => void;
}
const ZOOM_PRESETS = [10, 25, 50, 75, 100, 125, 150, 200, 300, 400];
let helpId = 0;
function element(doc: Document, tag: string, className: string, text?: string): HTMLElement {
  const el = doc.createElement(tag); el.className = className; if (text) el.textContent = text; return el;
}
function controlIcon(doc: Document, name: ViewerActionIcon | 'check'): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('kmv-control-icon'); svg.dataset.icon = name;
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, value);
  const paths: Record<ViewerActionIcon | 'check', string> = {
    edit: 'M15 5l4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z',
    copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
    image: 'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M16 7h.01',
    download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
    check: 'M5 12l4 4L19 6',
  };
  const path = doc.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[name]); svg.append(path);
  return svg;
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
  private manualHeight?: number;
  private heightObserver?: ResizeObserver;
  private heightParents = new Set<HTMLElement>();
  private zoomMenu: HTMLElement;
  private actionEpoch = 0;
  private actionFeedbackTimer?: number;
  private resetActionFeedback?: () => void;
  private finishResize?: () => void;
  private settings: ViewerSettings;
  private readonly resizable: boolean;

  constructor(readonly svg: SVGSVGElement, readonly options: ViewerOptions, native = nativeSize(svg)) {
    if (!native) throw new Error('SVG needs a valid viewBox or explicit native dimensions.');
    this.native = native;
    this.settings = readSettings(options.settings ?? DEFAULT_SETTINGS);
    this.resizable = options.resizable ?? options.mode === 'width';
    const doc = svg.ownerDocument;
    this.win = doc.defaultView!;
    this.root = element(doc, 'section', 'kmv-viewer');
    this.root.setAttribute('aria-label', options.label || 'Mermaid diagram viewer');
    this.root.setAttribute('contenteditable', 'false');
    this.viewport = element(doc, 'div', 'kmv-viewport');
    this.viewport.tabIndex = 0;
    this.viewport.setAttribute('role', 'region');
    this.viewport.setAttribute('aria-label', 'Diagram');
    const help = element(doc, 'span', 'kmv-accessible-help', 'Arrow keys pan. Plus and minus zoom. Home recenters. F fits the whole chart. W fits width. 0 sets native size. R resets the view. Double-click blank space to edit the whole chart.');
    help.id = `kmv-help-${++helpId}`; help.hidden = true;
    this.viewport.setAttribute('aria-describedby', help.id);
    this.viewport.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown + - Home F W 0 R');
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
    if (options.edit) {
      const edit = this.button('Edit chart', 'Edit whole chart', () => options.edit?.());
      edit.replaceChildren(controlIcon(doc, 'edit'), element(doc, 'span', 'kmv-control-label', 'Edit chart'));
      actions.append(edit);
    }
    const actionStatus = this.actionStatus = element(doc, 'div', 'kmv-action-status'); actionStatus.setAttribute('role', 'status'); actionStatus.setAttribute('aria-live', 'polite');
    if (options.actions?.length) {
      const menu = element(doc, 'div', 'kmv-tools');
      const choices = element(doc, 'div', 'kmv-tool-menu');
      choices.hidden = true; choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', 'Source and export actions');
      const setMenuOpen = (open: boolean): void => { this.constrainMenus(); choices.hidden = !open; summary.setAttribute('aria-expanded', String(open)); };
      const summary = this.button('Source & export', 'Source & export', () => { this.closePresets(); setMenuOpen(choices.hidden); });
      summary.classList.add('kmv-tools-toggle'); summary.setAttribute('aria-expanded', 'false'); summary.setAttribute('aria-haspopup', 'true');
      summary.replaceChildren(controlIcon(doc, 'download'), element(doc, 'span', 'kmv-control-label', 'Source & export'));
      menu.append(summary, choices);
      for (const action of options.actions) {
        const button = this.button(action.text, action.label, () => {
          if (button.disabled || this.lifetime.disposed) return;
          const epoch = ++this.actionEpoch;
          this.clearActionFeedback();
          setMenuOpen(false); summary.focus({ preventScroll: true }); button.disabled = true; button.setAttribute('aria-busy', 'true');
          actionStatus.textContent = 'Working…';
          void Promise.resolve().then(() => { if (!this.lifetime.disposed) return action.run(); }).then(result => {
            if (this.lifetime.disposed || epoch !== this.actionEpoch) return;
            actionStatus.textContent = result?.message ?? '';
            if (result?.feedback === 'success' && !result.fallback) this.showActionSuccess(button, action.icon, summary, result.message);
            if (result?.fallback) actionStatus.append(this.button(result.fallback.label, result.fallback.label, () => {
              try { result.fallback!.run(); }
              catch (error) { if (actionStatus.firstChild) actionStatus.firstChild.textContent = error instanceof Error ? error.message : String(error); }
            }));
          }, error => { if (!this.lifetime.disposed && epoch === this.actionEpoch) actionStatus.textContent = error instanceof Error ? error.message : String(error); })
            .finally(() => { if (!this.lifetime.disposed) { button.disabled = false; button.removeAttribute('aria-busy'); } });
        });
        button.replaceChildren(...(action.icon ? [controlIcon(doc, action.icon)] : []), element(doc, 'span', 'kmv-control-label', action.text));
        choices.append(button);
      }
      this.lifetime.listen(doc, 'pointerdown', event => { if (!menu.contains(event.target as Node)) setMenuOpen(false); }, { capture: true });
      this.lifetime.listen(menu, 'keydown', ((event: KeyboardEvent) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setMenuOpen(false); summary.focus(); }
        else if (event.key === 'ArrowDown' && event.target === summary) { event.preventDefault(); event.stopPropagation(); setMenuOpen(true); choices.querySelector('button')?.focus(); }
      }) as EventListener);
      actions.append(menu);
    }
    info.append(this.status, hint, actions, actionStatus);
    const dock = element(doc, 'div', 'kmv-dock');
    dock.setAttribute('aria-label', 'Diagram controls');
    const row = element(doc, 'div', 'kmv-zoom-row');
    this.zoomOut = this.button('−', 'Zoom out', e => this.nudge(-this.zoomStep(e.shiftKey)));
    this.zoomIn = this.button('+', 'Zoom in', e => this.nudge(this.zoomStep(e.shiftKey)));
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
      this.constrainMenus();
      this.zoomMenu.hidden = !this.zoomMenu.hidden;
      this.zoomInput.setAttribute('aria-expanded', String(!this.zoomMenu.hidden));
    };
    this.zoomInput.setAttribute('aria-expanded', 'false');
    this.zoomInput.setAttribute('aria-haspopup', 'true');
    for (const preset of ZOOM_PRESETS) this.zoomMenu.append(this.button(`${preset}%`, `Zoom to ${preset}%`, () => {
      this.setZoom(preset / 100); this.closePresets(); this.zoomInput.focus({ preventScroll: true });
    }));
    this.zoomMenu.append(this.button('Fit width', 'Fit diagram width', () => { this.fit('width'); this.closePresets(); this.viewport.focus({ preventScroll: true }); }));
    this.zoomMenu.append(this.button('Reset view', 'Reset zoom, pan, and automatic height', () => { this.reset(); this.closePresets(); this.viewport.focus({ preventScroll: true }); }));
    zoomPicker.append(this.zoomInput, this.button('⌄', 'Choose zoom preset', togglePresets), this.zoomMenu);
    this.lifetime.listen(this.zoomInput, 'click', togglePresets);
    this.lifetime.listen(this.zoomMenu, 'keydown', ((event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.closePresets(); this.zoomInput.focus(); } }) as EventListener);
    this.lifetime.listen(doc, 'pointerdown', event => {
      if (!zoomPicker.contains(event.target as Node)) this.closePresets();
    }, { capture: true });
    row.append(
      this.button('Fit chart', 'Fit whole chart', () => this.fit()),
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
    dock.append(row, dpad); footer.append(info, dock); this.root.append(this.viewport, footer, help);
    this.state.mode = options.mode;
    if (this.resizable) { this.root.classList.add('kmv-resizable'); this.addResizeHandle(); }
    this.updateSettings(this.settings);
    this.events();
    const refreshHeight = (): void => { this.autoHeight(this.viewport.clientWidth); this.constrainMenus(); };
    this.lifetime.listen(this.win, 'resize', refreshHeight);
    if (this.win.visualViewport) for (const event of ['resize', 'scroll']) this.lifetime.listen(this.win.visualViewport, event, refreshHeight);
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]; if (!entry || this.lifetime.disposed) return;
      this.resize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(this.viewport);
    this.lifetime.add(() => observer.disconnect());
    if (this.resizable) {
      this.heightObserver = new ResizeObserver(() => this.autoHeight(this.viewport.clientWidth));
      this.heightObserver.observe(footer);
      this.lifetime.add(() => this.heightObserver?.disconnect());
    }
    this.lifetime.add(() => { ++this.actionEpoch; this.clearActionFeedback(); if (this.frame) this.win.cancelAnimationFrame(this.frame); this.finishDrag(); });
  }
  private button(text: string, label: string, fn: (e: MouseEvent) => void): HTMLButtonElement {
    const button = this.svg.ownerDocument.createElement('button');
    button.type = 'button'; button.className = 'kmv-button'; button.textContent = text;
    button.setAttribute('aria-label', label); button.title = label;
    this.lifetime.listen(button, 'click', ((e: MouseEvent) => { e.stopPropagation(); fn(e); }) as EventListener);
    return button;
  }
  private setControlIcon(target: HTMLElement, name?: ViewerActionIcon | 'check'): void {
    target.querySelector('.kmv-control-icon')?.remove();
    if (name) target.prepend(controlIcon(this.svg.ownerDocument, name));
  }
  private clearActionFeedback(): void {
    if (this.actionFeedbackTimer !== undefined) this.win.clearTimeout(this.actionFeedbackTimer);
    this.actionFeedbackTimer = undefined;
    const reset = this.resetActionFeedback; this.resetActionFeedback = undefined; reset?.();
    this.actionStatus.classList.remove('kmv-action-status-transient');
  }
  private showActionSuccess(button: HTMLButtonElement, icon: ViewerActionIcon | undefined, summary: HTMLElement, message: string): void {
    this.clearActionFeedback();
    const originalTitle = button.title;
    this.setControlIcon(button, 'check'); this.setControlIcon(summary, 'check');
    button.classList.add('kmv-copy-success'); summary.classList.add('kmv-copy-success');
    button.title = message; summary.title = message;
    this.actionStatus.classList.add('kmv-action-status-transient');
    this.resetActionFeedback = () => {
      this.setControlIcon(button, icon); this.setControlIcon(summary, 'download');
      button.classList.remove('kmv-copy-success'); summary.classList.remove('kmv-copy-success');
      button.title = originalTitle; summary.title = 'Source & export';
    };
    const epoch = this.actionEpoch;
    this.actionFeedbackTimer = this.win.setTimeout(() => {
      if (this.lifetime.disposed || epoch !== this.actionEpoch) return;
      this.clearActionFeedback(); this.actionStatus.replaceChildren();
    }, 1600);
  }
  private constrainMenus(): void {
    if (this.lifetime.disposed) return;
    const visual = this.win.visualViewport;
    const height = visual?.height || this.win.innerHeight;
    const footer = this.root.querySelector<HTMLElement>('.kmv-footer');
    const above = footer ? footer.getBoundingClientRect().top - (visual?.offsetTop || 0) - 8 : height / 2;
    this.root.style.setProperty('--kmv-menu-max-height', `${Math.max(32, Math.floor(Math.min(height / 2, above)))}px`);
  }
  private events(): void {
    const on = (type: string, callback: EventListener, target: EventTarget = this.viewport, options?: AddEventListenerOptions) => this.lifetime.listen(target, type, callback, options);
    on('keydown', ((e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.drag) { e.preventDefault(); e.stopPropagation(); this.finishDrag(); return; }
      if (e.target !== this.viewport || e.ctrlKey || e.metaKey || e.altKey) return;
      const actions: Record<string, () => void> = { ArrowLeft: () => this.pan(1, 0), ArrowRight: () => this.pan(-1, 0), ArrowUp: () => this.pan(0, 1), ArrowDown: () => this.pan(0, -1), '+': () => this.nudge(this.zoomStep(e.shiftKey)), '=': () => this.nudge(this.zoomStep(e.shiftKey)), '-': () => this.nudge(-this.zoomStep(e.shiftKey)), Home: () => this.recenter(), f: () => this.fit(), F: () => this.fit(), w: () => this.fit('width'), W: () => this.fit('width'), r: () => this.reset(), R: () => this.reset(), '0': () => this.setZoom(1) };
      if (actions[e.key]) { e.preventDefault(); e.stopPropagation(); actions[e.key]!(); }
    }) as EventListener);
    on('keydown', ((e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); this.constrainMenus(); this.zoomMenu.hidden = false; this.zoomInput.setAttribute('aria-expanded', 'true'); (this.zoomMenu.querySelector('button') as HTMLButtonElement | null)?.focus(); return; }
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this.commitInput(); this.viewport.focus({ preventScroll: true }); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.closePresets(); this.zoomInput.value = this.percent(); this.viewport.focus({ preventScroll: true }); }
    }) as EventListener, this.zoomInput);
    on('change', (() => this.commitInput()) as EventListener, this.zoomInput);
    on('focus', (() => this.zoomInput.select()) as EventListener, this.zoomInput);
    on('pointerdown', ((e: PointerEvent) => {
      this.suppressClick = false;
      const control = interactiveAncestor(e.target, this.viewport);
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
      if (target && this.root.contains(target) && this.options.openLink) {
        const href = target.getAttribute('data-href') || target.getAttribute('href');
        if (href) { e.preventDefault(); this.options.openLink(href, e.ctrlKey || e.metaKey); }
      }
      e.stopPropagation();
    }) as EventListener, this.root);
    on('dblclick', ((e: MouseEvent) => {
      const target = e.target as Element;
      if (!interactiveAncestor(target, this.root)) {
        e.preventDefault();
        if (this.options.edit && this.viewport.contains(target) && !target.closest('.kmv-semantic, [data-kmv-kind], [data-kmv-hit-target]')) this.options.edit();
      }
      e.stopPropagation();
    }) as EventListener, this.root);
    on('auxclick', ((e: MouseEvent) => {
      if (e.button === 1 && this.suppressClick) { e.preventDefault(); e.stopPropagation(); this.suppressClick = false; }
    }) as EventListener);
    on('wheel', ((e: WheelEvent) => {
      if (this.suspended || interactiveAncestor(e.target, this.viewport)) return;
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
  private heightBounds(): { min: number; max: number } {
    const parents = new Set<HTMLElement>();
    for (let parent = this.root.parentElement; parent; parent = parent.parentElement) if (parent.matches('.view-content, .markdown-reading-view, .cm-scroller')) parents.add(parent);
    const previous = this.heightParents; this.heightParents = parents;
    if (this.heightObserver) {
      for (const parent of previous) if (!parents.has(parent)) this.heightObserver.unobserve(parent);
      for (const parent of parents) if (!previous.has(parent)) this.heightObserver.observe(parent);
    }
    const heights = [this.win.innerHeight, this.win.visualViewport?.height ?? 0, ...[...parents].map(parent => parent.clientHeight)].filter(height => height > 0 && Number.isFinite(height));
    const available = heights.length ? Math.min(...heights) : 0;
    const footer = this.root.querySelector('.kmv-footer') as HTMLElement | null;
    const maxOuter = Math.max(0, Math.floor(available * .88));
    const max = Math.max(0, maxOuter - (footer?.offsetHeight || 80) - 2);
    // Leave room to shrink in a small pane instead of setting its minimum to its maximum.
    const min = Math.min(150, Math.floor(max / 2));
    this.root.style.setProperty('--kmv-viewport-min-height', `${min}px`);
    this.root.style.setProperty('--kmv-viewer-max-height', `${maxOuter}px`);
    return { min, max };
  }
  private setHeight(requested: number, manual = false): void {
    const { min, max } = this.heightBounds();
    const next = Math.round(Math.max(min, Math.min(max, requested)));
    if (manual) this.manualHeight = Math.max(min, requested);
    const footer = this.root.querySelector<HTMLElement>('.kmv-footer');
    const total = next + (footer?.offsetHeight || 0) + 2;
    // Obsidian themes can assign section/div height and flex sizing. The owned outer
    // frame, not only its child, must grow so the footer follows every resize.
    this.root.style.setProperty('height', `${total}px`, 'important');
    this.root.style.setProperty('block-size', `${total}px`, 'important');
    this.viewport.style.setProperty('height', `${next}px`, 'important');
    this.constrainMenus();
  }
  private autoHeight(width: number): void {
    if (!this.resizable || width <= 0) return;
    this.setHeight(this.manualHeight ?? this.native.height * Math.min(1, Math.max(1, width - 32) / this.native.width) + 32);
  }
  private addResizeHandle(): void {
    const handle = this.button('↘', 'Resize chart height. Arrow keys resize; Home or double-click restores automatic height.', () => {});
    handle.classList.add('kmv-resize-handle');
    handle.setAttribute('aria-label', 'Resize diagram height');
    let resize: { id: number; y: number; height: number } | null = null;
    this.lifetime.listen(handle, 'pointerdown', ((e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary || resize || this.suspended) return;
      e.preventDefault(); e.stopPropagation();
      this.finishDrag(); this.closePresets(); handle.focus({ preventScroll: true });
      resize = { id: e.pointerId, y: e.clientY, height: this.viewport.clientHeight };
      handle.setPointerCapture(e.pointerId);
    }) as EventListener);
    this.lifetime.listen(handle, 'pointermove', ((e: PointerEvent) => {
      if (!resize || resize.id !== e.pointerId) return;
      e.preventDefault();
      this.setHeight(resize.height + e.clientY - resize.y, true);
    }) as EventListener);
    const finish = (): void => {
      const previous = resize; resize = null;
      if (previous && handle.hasPointerCapture(previous.id)) handle.releasePointerCapture(previous.id);
    };
    this.finishResize = finish;
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.lifetime.listen(handle, type, finish);
    this.lifetime.listen(this.win, 'blur', finish); this.lifetime.add(finish);
    this.lifetime.listen(handle, 'keydown', ((e: KeyboardEvent) => {
      if (!['ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Home') { this.manualHeight = undefined; this.autoHeight(this.viewport.clientWidth); }
      else this.setHeight(this.viewport.clientHeight + (e.key === 'ArrowDown' ? 1 : -1) * (e.shiftKey ? 80 : 40), true);
    }) as EventListener);
    this.lifetime.listen(handle, 'dblclick', event => { event.preventDefault(); event.stopPropagation(); this.manualHeight = undefined; this.autoHeight(this.viewport.clientWidth); });
    this.root.append(handle);
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
  announce(message: string): void { if (!this.lifetime.disposed) { ++this.actionEpoch; this.clearActionFeedback(); this.actionStatus.textContent = message; } }
  canPan(): boolean { return this.native.width * this.state.scale > this.size.width - 32 || this.native.height * this.state.scale > this.size.height - 32; }
  resize(next: Size): void {
    if (!validSize(next) || this.lifetime.disposed) return; // Hidden containers keep their state until visible.
    this.autoHeight(next.width);
    if (this.initialized && next.width === this.size.width && next.height === this.size.height) return;
    this.state = this.initialized ? resized(this.native, this.size, next, this.state) : fitted(this.native, next, this.options.mode);
    this.size = next; this.initialized = true; this.schedule();
  }
  fit(mode: 'width' | 'contain' = 'contain'): void { this.finishDrag(); this.state = fitted(this.native, this.size, mode); this.schedule(); }
  reset(): void { this.finishResize?.(); this.manualHeight = undefined; this.autoHeight(this.viewport.clientWidth); this.fit(this.resizable ? this.settings.initialFit : this.options.mode); }
  setZoom(scale: number): void { this.finishDrag(); this.state = zoomAt(this.native, this.size, this.state, scale); this.schedule(); }
  private nudge(delta: number): void { this.setZoom(Math.max(.01, this.state.scale + delta)); }
  private zoomStep(large = false): number { return this.settings.zoomStep / 100 * (large ? 2 : 1); }
  updateSettings(settings: ViewerSettings): void {
    const previous = this.settings; this.settings = readSettings(settings);
    this.root.dataset.background = this.settings.background;
    this.root.style.setProperty('--kmv-background-spacing', `${this.settings.backgroundSpacing}px`);
    const hint = this.root.querySelector<HTMLElement>('.kmv-hint'); if (hint) hint.hidden = !this.settings.showHints;
    if (this.initialized && previous.initialFit !== this.settings.initialFit && this.state.mode !== 'manual' && this.resizable) this.fit(this.settings.initialFit);
    this.autoHeight(this.viewport.clientWidth);
  }
  pan(dx: number, dy: number): void {
    this.state = constrain(this.native, this.size, { ...this.state, mode: 'manual', x: this.state.x + dx * Math.max(60, this.size.width * .25), y: this.state.y + dy * Math.max(60, this.size.height * .25) }); this.schedule();
  }
  recenter(): void { this.state = { ...this.state, ...center(this.native, this.size, this.state.scale), mode: 'manual' }; this.schedule(); }
  suspend(): void { this.suspended = true; this.finishDrag(); this.finishResize?.(); if (this.frame) this.win.cancelAnimationFrame(this.frame); this.frame = 0; }
  resume(): void { this.suspended = false; this.surface.append(this.svg); this.schedule(); }
  private schedule(): void {
    if (this.frame || this.suspended || this.lifetime.disposed) return;
    this.frame = this.win.requestAnimationFrame(() => { this.frame = 0; this.paint(); });
  }
  private paint(): void {
    if (!this.initialized || this.suspended || this.lifetime.disposed) return;
    const { scale, x, y } = this.state;
    this.surface.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    this.options.onScale?.(scale);
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
