import { Lifetime } from './lifetime';
import { SourceCodeEditor } from './source-code-editor';
import { applyLabel, labelEdit, sourceSelection, type DiagramSource, type SemanticTarget } from './source';

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
      if (this.disposed) return;
      const previous = this.doc.activeElement as HTMLElement | null;
      const dialog = this.doc.createElement('dialog'); dialog.className = 'kmv-source-editor';
      dialog.setAttribute('aria-label', 'Edit Mermaid source');
      const header = this.doc.createElement('div'); header.className = 'kmv-source-header';
      const body = this.doc.createElement('div'); body.className = 'kmv-source-body';
      const title = this.doc.createElement('h2'); title.textContent = target ? `Edit ${target.kind}` : 'Edit Mermaid source';
      const help = this.doc.createElement('p');
      const edit = target ? labelEdit(snapshot.source, target) : null;
      help.textContent = edit ? 'Edit this label. Special characters are escaped for Mermaid. You can also edit the full source below.' : 'Edit the actual Mermaid source below. The matching text is selected when it can be identified unambiguously. Save validates with Obsidian’s native Mermaid parser.';
      header.append(title, help);
      const codeLabel = this.doc.createElement('div'); codeLabel.className = 'kmv-source-field';
      const codeCaption = this.doc.createElement('div'); codeCaption.textContent = 'Mermaid source';
      const codeParent = this.doc.createElement('div'); codeParent.className = 'kmv-source-code';
      codeLabel.append(codeCaption, codeParent);
      const status = this.doc.createElement('p'); status.className = 'kmv-source-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      const setStatus = (state: string, message: string): void => { status.dataset.state = state; status.textContent = message; };
      const actions = this.doc.createElement('div'); actions.className = 'kmv-source-actions';
      const cancel = this.doc.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
      const save = this.doc.createElement('button'); save.type = 'button'; save.textContent = 'Save source';
      actions.append(cancel, save);
      let label: HTMLTextAreaElement | undefined;
      const life = new Lifetime();
      if (edit) {
        const caption = this.doc.createElement('label'); caption.textContent = 'Element label';
        label = this.doc.createElement('textarea'); label.className = 'kmv-element-label'; label.value = edit.value; label.setAttribute('aria-label', 'Element label');
        caption.append(label); body.append(caption);
      }
      body.append(codeLabel, status); dialog.append(header, body, actions); this.doc.body.append(dialog);
      let code: SourceCodeEditor;
      try {
        code = new SourceCodeEditor(codeParent, snapshot.source, () => {
          if (label) label.disabled = true;
          help.textContent = 'Full-source editing is active. Keep Mermaid syntax intact; Save validates before changing the note.';
        });
      } catch (error) { life.dispose(); dialog.remove(); throw error; }
      life.add(() => code.dispose());
      if (label && edit) life.listen(label, 'input', () => { code.value = applyLabel(snapshot.source, edit, label!.value); });
      const win = this.doc.defaultView;
      const viewport = win?.visualViewport;
      const size = (): void => {
        if (!win) return;
        const width = viewport?.width ?? win.innerWidth, height = viewport?.height ?? win.innerHeight;
        dialog.style.setProperty('--kmv-editor-viewport-width', `${width}px`);
        dialog.style.setProperty('--kmv-editor-viewport-height', `${height}px`);
        dialog.style.setProperty('--kmv-editor-center-x', `${(viewport?.offsetLeft ?? 0) + width / 2}px`);
        dialog.style.setProperty('--kmv-editor-center-y', `${(viewport?.offsetTop ?? 0) + height / 2}px`);
        code.resize();
      };
      size();
      if (win) life.listen(win, 'resize', size);
      if (viewport) { life.listen(viewport, 'resize', size); life.listen(viewport, 'scroll', size); }
      let saving = false, closed = false;
      const close = (): void => {
        if (closed) return;
        closed = true; life.dispose(); this.closeCurrent = undefined;
        if (dialog.open) dialog.close(); dialog.remove();
        if (previous?.isConnected && !this.disposed) previous.focus({ preventScroll: true });
        if (this.detached && !this.disposed) this.dispose();
      };
      this.closeCurrent = close;
      life.listen(cancel, 'click', close);
      life.listen(dialog, 'cancel', event => { event.preventDefault(); if (!saving) close(); });
      life.listen(dialog, 'close', close);
      // Host editor shortcuts and selection handlers must not consume this dialog's typing.
      for (const event of ['pointerdown', 'mousedown', 'click', 'dblclick', 'keydown']) life.listen(dialog, event, event => event.stopPropagation());
      life.listen(save, 'click', () => {
        if (saving || closed) return;
        const candidate = code.value;
        const labelWasDisabled = label?.disabled;
        saving = true; save.disabled = true; cancel.disabled = true; code.setEnabled(false); if (label) label.disabled = true;
        setStatus('checking', 'Checking Mermaid syntax…');
        let stage = 'validation';
        void (async () => {
          try {
            if (!candidate.trim()) throw new Error('Mermaid source cannot be empty.');
            await this.source.validate?.(candidate);
            if (this.disposed || closed) return;
            stage = 'save'; setStatus('saving', 'Saving Mermaid source…');
            await this.source.write(snapshot, candidate);
            if (!this.disposed && !closed) close();
          } catch (error) {
            if (!this.disposed && !closed) {
              setStatus('error', `${stage === 'validation' ? 'Mermaid validation failed' : 'Source could not be saved'}: ${errorMessage(error)} Your draft is kept here; correct it or copy it before closing.`);
            }
          } finally {
            saving = false;
            if (!closed) { save.disabled = false; cancel.disabled = false; code.setEnabled(true); if (label) label.disabled = labelWasDisabled ?? false; }
          }
        })();
      });
      try {
        dialog.showModal();
        if (label) { label.focus(); label.select(); }
        else code.focus(...sourceSelection(code.value, target));
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
