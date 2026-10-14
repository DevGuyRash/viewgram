import { Lifetime } from './lifetime';
import { SourceCodeEditor } from './source-code-editor';
import { applyLabelEdits, sourceSelection, type DiagramSource, type LabelEdit, type SemanticTarget } from './source';
import { sourceElement } from './source-mapping';

/** Source drafts survive native render replacement; Obsidian owns validation and rendering. */
export class SourceEditor {
  private closeCurrent?: () => void;
  private disposed = false;
  private detached = false;
  private opening = false;
  constructor(private readonly doc: Document, private readonly source: DiagramSource, private readonly onDispose?: () => void) {}
  async open(target?: SemanticTarget): Promise<void> {
    if (this.disposed || this.detached || this.opening || this.closeCurrent) return;
    this.opening = true;
    try {
      const snapshot = await this.source.read();
      if (this.disposed || this.detached) return;
      const previous = this.doc.activeElement as HTMLElement | null;
      const dialog = this.doc.createElement('dialog'); dialog.className = 'kmv-source-editor';
      dialog.setAttribute('aria-label', 'Edit Mermaid source');
      const header = this.doc.createElement('div'); header.className = 'kmv-source-header';
      const body = this.doc.createElement('div'); body.className = 'kmv-source-body';
      const title = this.doc.createElement('h2');
      const help = this.doc.createElement('p'); header.append(title, help);
      const status = this.doc.createElement('p'); status.className = 'kmv-source-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      const setStatus = (state: string, message: string): void => { status.dataset.state = state; status.textContent = message; };
      const actions = this.doc.createElement('div'); actions.className = 'kmv-source-actions';
      const wholeChart = this.doc.createElement('button'); wholeChart.type = 'button'; wholeChart.textContent = 'Edit whole chart';
      const cancel = this.doc.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
      const save = this.doc.createElement('button'); save.type = 'button'; save.textContent = 'Save source';
      actions.append(cancel, save);
      const life = new Lifetime();
      let code: SourceCodeEditor | undefined;
      let wrapToggle: HTMLInputElement | undefined;
      let saving = false, closed = false;
      const fields: Array<{ edit: LabelEdit; input: HTMLTextAreaElement }> = [];
      const nodeBody = this.doc.createElement('div'); nodeBody.className = 'kmv-node-fields';
      const field = (parent: HTMLElement, captionText: string, value: string, edit?: LabelEdit, relationship = false): HTMLTextAreaElement => {
        const caption = this.doc.createElement('label'); caption.textContent = captionText;
        const input = this.doc.createElement('textarea'); input.className = relationship ? 'kmv-relationship-label' : 'kmv-element-label kmv-node-text';
        input.value = value; input.setAttribute('aria-label', captionText); input.spellcheck = false;
        if (!edit) { input.readOnly = true; input.classList.add('kmv-source-readonly-label'); }
        else {
          fields.push({ edit, input });
          // A grouped/chained relation can share one authored label across several rendered edges.
          life.listen(input, 'input', () => {
            for (const item of fields) if (item.input !== input && item.edit.start === edit.start && item.edit.end === edit.end) item.input.value = input.value;
            setStatus('draft', 'Changes are kept in this draft until Save.');
          });
        }
        caption.append(input); parent.append(caption); return input;
      };
      const nodeCandidate = (): string => applyLabelEdits(snapshot.source, fields.map(({ edit, input }) => ({ edit, value: input.value })));
      const candidate = (): string => code?.value ?? nodeCandidate();
      const win = this.doc.defaultView, viewport = win?.visualViewport;
      const size = (): void => {
        if (!win) return;
        const width = viewport?.width ?? win.innerWidth, height = viewport?.height ?? win.innerHeight;
        dialog.style.setProperty('--kmv-editor-viewport-width', `${width}px`);
        dialog.style.setProperty('--kmv-editor-viewport-height', `${height}px`);
        dialog.style.setProperty('--kmv-editor-center-x', `${(viewport?.offsetLeft ?? 0) + width / 2}px`);
        dialog.style.setProperty('--kmv-editor-center-y', `${(viewport?.offsetTop ?? 0) + height / 2}px`);
        code?.resize();
      };
      const openWholeChart = (source: string, focus: boolean): void => {
        const codeField = this.doc.createElement('div'); codeField.className = 'kmv-source-field';
        const toolbar = this.doc.createElement('div'); toolbar.className = 'kmv-source-toolbar';
        const caption = this.doc.createElement('span'); caption.textContent = 'Mermaid source';
        const wrapLabel = this.doc.createElement('label'); wrapLabel.className = 'kmv-source-wrap';
        const toggle = this.doc.createElement('input'); toggle.type = 'checkbox'; toggle.checked = true; toggle.setAttribute('aria-label', 'Wrap lines');
        wrapLabel.append(toggle, this.doc.createTextNode('Wrap lines')); toolbar.append(caption, wrapLabel);
        const parent = this.doc.createElement('div'); parent.className = 'kmv-source-code'; codeField.append(toolbar, parent);
        // CodeMirror is created only for an explicit whole-chart editor.
        const next = new SourceCodeEditor(parent, source, () => setStatus('draft', 'Changes are kept in this draft until Save.'));
        code = next; wrapToggle = toggle;
        life.add(() => next.dispose()); life.listen(toggle, 'change', () => next.setWrap(toggle.checked));
        nodeBody.remove(); wholeChart.remove(); body.prepend(codeField);
        dialog.dataset.mode = 'source'; title.textContent = 'Edit Mermaid source';
        save.disabled = false;
        help.textContent = 'Edit the chart source. Save checks it with Obsidian’s native Mermaid parser before changing the note.';
        setStatus('draft', ''); size();
        if (focus) next.focus(...sourceSelection(next.value, target));
      };
      let nodeInput: HTMLTextAreaElement | undefined;
      if (target) {
        const element = sourceElement(snapshot.source, target);
        dialog.dataset.mode = 'node'; title.textContent = `Edit ${target.kind}`;
        help.textContent = element.reason ?? 'Edit this node’s text and attached relationship labels. Save preserves IDs, shapes and Mermaid syntax.';
        nodeInput = field(nodeBody, 'Element label', element.value, element.label);
        const relationships = this.doc.createElement('section'); relationships.className = 'kmv-source-relationships';
        relationships.setAttribute('aria-label', 'Attached relationships');
        const heading = this.doc.createElement('h3'); heading.textContent = 'Attached relationships'; relationships.append(heading);
        if (!element.relationships.length) {
          const empty = this.doc.createElement('p'); empty.textContent = element.reason ? 'No source relationships could be resolved for this element.' : 'This node has no attached relationships.'; relationships.append(empty);
        }
        for (const [number, edge] of element.relationships.entries()) {
          const item = this.doc.createElement('div'); item.className = 'kmv-source-relationship';
          const summary = this.doc.createElement('p'); summary.className = 'kmv-relationship-summary'; summary.textContent = `${edge.from} ${edge.operator} ${edge.to}`;
          const location = this.doc.createElement('small'); location.textContent = `Source line ${edge.line + 1}`; item.append(summary, location);
          if (edge.label) field(item, `Relationship ${number + 1} label`, edge.label.value, edge.label, true);
          else if (edge.text !== undefined) field(item, `Relationship ${number + 1} text`, edge.text, undefined, true);
          else { const unlabeled = this.doc.createElement('p'); unlabeled.textContent = 'No separate editable relationship label.'; item.append(unlabeled); }
          relationships.append(item);
        }
        nodeBody.append(relationships); body.append(nodeBody); actions.prepend(wholeChart);
        life.listen(wholeChart, 'click', () => {
          if (saving || closed || code) return;
          try { openWholeChart(nodeCandidate(), true); }
          catch (error) { setStatus('error', errorMessage(error)); }
        });
        save.disabled = !fields.length;
      }
      body.append(status); dialog.append(header, body, actions); this.doc.body.append(dialog);
      const close = (): void => {
        if (closed) return;
        closed = true; life.dispose(); this.closeCurrent = undefined;
        if (dialog.open) dialog.close(); dialog.remove();
        if (previous?.isConnected && !this.disposed) previous.focus({ preventScroll: true });
        if (this.detached && !this.disposed) this.dispose();
      };
      this.closeCurrent = close;
      if (!target) {
        try { openWholeChart(snapshot.source, false); }
        catch (error) { close(); throw error; }
      }
      size();
      if (win) life.listen(win, 'resize', size);
      if (viewport) { life.listen(viewport, 'resize', size); life.listen(viewport, 'scroll', size); }
      life.listen(cancel, 'click', close);
      life.listen(dialog, 'cancel', event => { event.preventDefault(); if (!saving) close(); });
      life.listen(dialog, 'close', close);
      // Host editor shortcuts and selection handlers must not consume this dialog's typing.
      for (const event of ['pointerdown', 'mousedown', 'click', 'dblclick', 'keydown']) life.listen(dialog, event, event => event.stopPropagation());
      life.listen(save, 'click', () => {
        if (saving || closed) return;
        let next: string;
        try { next = candidate(); } catch (error) { setStatus('error', errorMessage(error)); return; }
        saving = true; save.disabled = true; cancel.disabled = true; wholeChart.disabled = true; code?.setEnabled(false); if (wrapToggle) wrapToggle.disabled = true;
        for (const item of fields) item.input.disabled = true;
        setStatus('checking', 'Checking Mermaid syntax…');
        let stage = 'validation';
        void (async () => {
          try {
            if (!next.trim()) throw new Error('Mermaid source cannot be empty.');
            await this.source.validate?.(next);
            if (this.disposed || closed) return;
            stage = 'save'; setStatus('saving', 'Saving Mermaid source…');
            await this.source.write(snapshot, next);
            if (!this.disposed && !closed) close();
          } catch (error) {
            if (!this.disposed && !closed) setStatus('error', `${stage === 'validation' ? 'Mermaid validation failed' : 'Source could not be saved'}: ${errorMessage(error)} Your draft is kept here; correct it or copy it before closing.`);
          } finally {
            saving = false;
            if (!closed) {
              save.disabled = !code && !fields.length; cancel.disabled = false; wholeChart.disabled = false; code?.setEnabled(true); if (wrapToggle) wrapToggle.disabled = false;
              for (const item of fields) item.input.disabled = false;
            }
          }
        })();
      });
      try {
        dialog.showModal();
        if (nodeInput) { nodeInput.focus(); nodeInput.select(); }
        else code?.focus(0, 0);
      } catch (error) { close(); throw error; }
    } finally { this.opening = false; }
  }
  /** Retire the removed viewer while allowing an already-open draft to finish. */
  detach(): void { this.detached = true; if (!this.closeCurrent) this.dispose(); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.closeCurrent?.(); this.onDispose?.();
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    for (const key of ['message', 'str']) {
      if (key in error && typeof (error as Record<string, unknown>)[key] === 'string') return (error as Record<string, string>)[key]!;
    }
  }
  return typeof error === 'string' ? error : 'An unexpected error occurred.';
}
