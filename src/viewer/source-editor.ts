import { Lifetime } from './lifetime';
import { applyLabel, labelEdit, sourceSelection, type DiagramSource, type SemanticTarget } from './source';

/** Text-only editing UI. Native Obsidian owns validation and the subsequent render. */
export class SourceEditor {
  private closeCurrent?: () => void;
  private disposed = false;
  private opening = false;
  constructor(private readonly doc: Document, private readonly source: DiagramSource) {}
  async open(target?: SemanticTarget): Promise<void> {
    if (this.disposed || this.opening || this.closeCurrent) return;
    this.opening = true;
    try {
      const snapshot = await this.source.read();
      if (this.disposed) return;
      const previous = this.doc.activeElement as HTMLElement | null;
      const dialog = this.doc.createElement('dialog'); dialog.className = 'kmv-source-editor';
      dialog.setAttribute('aria-label', 'Edit Mermaid source');
      const title = this.doc.createElement('h2'); title.textContent = target ? `Edit ${target.kind}` : 'Edit Mermaid source';
      const help = this.doc.createElement('p');
      const edit = target ? labelEdit(snapshot.source, target) : null;
      help.textContent = edit ? 'Edit this label. Special characters are escaped for Mermaid. You can also edit the full source below.' : 'Edit the actual Mermaid source below. The matching text is selected when it can be identified unambiguously. Save validates with Obsidian’s native Mermaid parser.';
      const codeLabel = this.doc.createElement('label'); codeLabel.textContent = 'Mermaid source';
      const code = this.doc.createElement('textarea'); code.className = 'kmv-source-code'; code.value = snapshot.source; code.spellcheck = false;
      code.setAttribute('aria-label', 'Mermaid source'); codeLabel.append(code);
      const status = this.doc.createElement('p'); status.className = 'kmv-source-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      const actions = this.doc.createElement('div'); actions.className = 'kmv-source-actions';
      const cancel = this.doc.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
      const save = this.doc.createElement('button'); save.type = 'button'; save.textContent = 'Save source';
      actions.append(cancel, save); dialog.append(title, help);
      let label: HTMLTextAreaElement | undefined;
      const life = new Lifetime();
      if (edit) {
        const caption = this.doc.createElement('label'); caption.textContent = 'Element label';
        label = this.doc.createElement('textarea'); label.className = 'kmv-element-label'; label.value = edit.value; label.setAttribute('aria-label', 'Element label');
        caption.append(label); dialog.append(caption);
        life.listen(label, 'input', () => { code.value = applyLabel(snapshot.source, edit, label!.value); });
        life.listen(code, 'input', () => { label!.disabled = true; help.textContent = 'Full-source editing is active. Keep Mermaid syntax intact; Save validates before changing the note.'; });
      }
      dialog.append(codeLabel, status, actions); this.doc.body.append(dialog);
      let saving = false;
      const close = (): void => {
        life.dispose(); this.closeCurrent = undefined;
        if (dialog.open) dialog.close(); dialog.remove();
        if (previous?.isConnected && !this.disposed) previous.focus({ preventScroll: true });
      };
      this.closeCurrent = close;
      life.listen(cancel, 'click', close);
      life.listen(dialog, 'cancel', event => { event.preventDefault(); if (!saving) close(); });
      life.listen(dialog, 'close', close);
      // Host editor shortcuts and selection handlers must not consume this dialog's typing.
      for (const event of ['pointerdown', 'mousedown', 'click', 'dblclick', 'keydown']) life.listen(dialog, event, event => event.stopPropagation());
      life.listen(save, 'click', () => {
        if (saving) return;
        const candidate = code.value;
        const labelWasDisabled = label?.disabled;
        saving = true; save.disabled = true; cancel.disabled = true; code.disabled = true; if (label) label.disabled = true; status.textContent = 'Checking Mermaid syntax…';
        void (async () => {
          try {
            if (!candidate.trim()) throw new Error('Mermaid source cannot be empty.');
            await this.source.validate?.(candidate);
            if (this.disposed) return;
            await this.source.write(snapshot, candidate);
            if (!this.disposed) close();
          } catch (error) { if (!this.disposed) status.textContent = error instanceof Error ? error.message : String(error); }
          finally { saving = false; save.disabled = false; cancel.disabled = false; code.disabled = false; if (label) label.disabled = labelWasDisabled ?? false; }
        })();
      });
      try {
        dialog.showModal();
        if (label) { label.focus(); label.select(); }
        else { code.focus(); code.setSelectionRange(...sourceSelection(snapshot.source, target)); }
      } catch (error) { close(); throw error; }
    } finally { this.opening = false; }
  }
  dispose(): void { this.disposed = true; this.closeCurrent?.(); }
}
