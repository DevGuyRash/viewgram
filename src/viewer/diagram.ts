import { ViewportController, type ViewerAction, type ViewerActionResult } from './controller';
import { SemanticHighlighter } from './semantics';
import { SourceEditor } from './source-editor';
import type { SourceEditorSessions } from './source-editor-sessions';
import type { DiagramSource } from './source';
import { copyText, copyImage, exportDiagram, downloadFile, DiagramExportError, type DiagramFile, type CopyResult } from './export';
import { Lifetime } from './lifetime';
import { nativeSize } from './math';
import { DEFAULT_SETTINGS, readSettings, type ViewerSettings } from './settings';
import { createHtmlElement } from './dom';

export class DiagramViewer {
  readonly inline: ViewportController;
  readonly marker: Comment;
  readonly lifetime = new Lifetime();
  private closeModal: (() => void) | null = null;
  private readonly originalStyle: string | null;
  private readonly semantics: SemanticHighlighter;
  private readonly editor?: SourceEditor;
  private settings: ViewerSettings;
  private modal?: ViewportController;
  constructor(readonly svg: SVGSVGElement, openLink?: (href: string, newLeaf: boolean) => void, private readonly source?: DiagramSource, private readonly editorSessions?: SourceEditorSessions, settings: ViewerSettings = { ...DEFAULT_SETTINGS }) {
    const parent = svg.parentNode;
    const native = nativeSize(svg);
    if (!parent || !native) throw new Error('Cannot wrap an unmeasurable or detached SVG.');
    this.originalStyle = svg.getAttribute('style');
    this.settings = readSettings(settings);
    if (source) this.editor = editorSessions ? editorSessions.create(svg.ownerDocument, source) : new SourceEditor(svg.ownerDocument, source);
    this.semantics = new SemanticHighlighter(svg, target => {
      if (!this.editor) { (this.modal ?? this.inline).announce('Source is unavailable for this rendered diagram.'); return; }
      void this.editor.open(target).catch(error => (this.modal ?? this.inline).announce(error instanceof Error ? error.message : String(error)));
    }, { lineHitWidth: this.settings.lineHitWidth, enabled: this.settings.hoverHighlighting });

    this.marker = svg.ownerDocument.createComment('viewgram: original position');
    parent.insertBefore(this.marker, svg);
    this.inline = new ViewportController(svg, { mode: this.settings.initialFit, resizable: true, settings: this.settings, onScale: scale => this.semantics.setViewportScale(scale), nativeMermaidParent: svg.parentElement?.classList.contains('mermaid') === true, open: () => this.open(), edit: this.editor ? () => this.editChart() : undefined, openLink, actions: this.actions() }, native);
    this.marker.after(this.inline.root);
    if (source && /sequence/.test(this.semantics.family)) {
      // Notes can straddle neighboring actors. One source snapshot grounds those
      // associations without keeping note text or polling the editor.
      void source.read().then(snapshot => { if (!this.lifetime.disposed) this.semantics.setSource(snapshot.source); }).catch(() => {});
    }
  }
  private editChart(): void {
    if (this.lifetime.disposed || !this.editor) return;
    void this.editor.open().catch(error => (this.modal ?? this.inline).announce(error instanceof Error ? error.message : String(error)));
  }
  updateSettings(settings: ViewerSettings): void {
    this.settings = readSettings(settings);
    this.semantics.setLineHitWidth(this.settings.lineHitWidth);
    this.semantics.setEnabled(this.settings.hoverHighlighting);
    this.inline.updateSettings(this.settings); this.modal?.updateSettings(this.settings);
  }
  private fallback(file: DiagramFile): ViewerActionResult['fallback'] {
    return { label: `Save ${file.filename}`, run: () => downloadFile(this.svg.ownerDocument, file.blob, file.filename) };
  }
  private copied(result: CopyResult): ViewerActionResult {
    // Keep material notices, such as resized image output, visible after a successful copy.
    const confirmation = result.notice === 'Source copied.' || result.notice === 'Image copied.';
    return { message: result.notice, feedback: result.copied && confirmation ? 'success' : 'warning', fallback: result.copied ? undefined : this.fallback(result.fallback) };
  }
  private actions(): ViewerAction[] {
    const actions: ViewerAction[] = [];
    const source = this.source, editor = this.editor;
    if (source && editor) {
      actions.push({ text: 'Edit Mermaid source', label: 'Edit Mermaid source', icon: 'edit', run: () => editor.open() });
      actions.push({ text: 'Copy source', label: 'Copy Mermaid source', icon: 'copy', run: async () => this.copied(await copyText(this.svg.ownerDocument, (await source.read()).source)) });
    }
    actions.push({ text: 'Copy image', label: 'Copy diagram image', icon: 'image', run: async () => { this.semantics.clear(); return this.copied(await copyImage(this.svg)); } });
    for (const format of ['svg', 'png', 'jpg', 'webp'] as const) actions.push({ text: `Save ${format.toUpperCase()}`, label: `Save diagram as ${format.toUpperCase()}`, icon: 'download', run: async () => {
      this.semantics.clear();
      try {
        const file = await exportDiagram(this.svg, format);
        downloadFile(this.svg.ownerDocument, file.blob, file.filename);
        return { message: `Download requested: ${file.filename}.${file.notice ? ` ${file.notice}` : ''}`, feedback: file.notice ? 'warning' : 'success' };
      } catch (error) {
        if (error instanceof DiagramExportError && error.fallback) return { message: error.message, feedback: 'warning', fallback: this.fallback(error.fallback) };
        throw error;
      }
    } });
    return actions;
  }
  open(): void {
    if (this.lifetime.disposed || this.closeModal) return;
    const doc = this.svg.ownerDocument;
    const previousFocus = doc.activeElement as HTMLElement | null;
    const dialog = createHtmlElement(doc, 'dialog');
    dialog.className = 'kmv-dialog';
    dialog.setAttribute('aria-label', 'Mermaid diagram lightbox');
    const header = createHtmlElement(doc, 'div'); header.className = 'kmv-dialog-header';
    const title = createHtmlElement(doc, 'h2'); title.textContent = 'Diagram';
    const subtitle = createHtmlElement(doc, 'span'); subtitle.textContent = 'Pan and zoom'; subtitle.className = 'kmv-dialog-subtitle';
    const close = createHtmlElement(doc, 'button'); close.type = 'button'; close.className = 'kmv-button kmv-close';
    close.textContent = 'Close ×'; close.setAttribute('aria-label', 'Close diagram lightbox');
    header.append(title, subtitle, close);
    const life = new Lifetime();
    this.inline.suspend();
    // Move the original SVG, never clone or re-parse it: IDs and direct link listeners survive.
    const modal = this.modal = new ViewportController(this.svg, { mode: 'contain', resizable: false, settings: this.settings, onScale: scale => this.semantics.setViewportScale(scale), edit: this.inline.options.edit, nativeMermaidParent: this.inline.options.nativeMermaidParent, openLink: this.inline.options.openLink, actions: this.inline.options.actions }, this.inline.native);
    dialog.append(header, modal.root); doc.body.append(dialog);
    const finish = (): void => {
      if (!this.closeModal) return;
      this.closeModal = null;
      this.modal = undefined;
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
    this.lifetime.dispose();
    if (this.editorSessions) this.editor?.detach(); else this.editor?.dispose();
    this.semantics.dispose(); this.closeModal?.();
    if (this.originalStyle === null) this.svg.removeAttribute('style'); else this.svg.setAttribute('style', this.originalStyle);
    // Do not resurrect a removed/rerendered block.
    if (this.marker.parentNode && this.inline.root.parentNode === this.marker.parentNode) this.marker.replaceWith(this.svg);
    else this.marker.remove();
    this.inline.dispose();
  }
}
