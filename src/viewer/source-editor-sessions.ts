import { SourceEditor } from './source-editor';
import type { DiagramSource } from './source';

/** Open drafts belong to the plugin, independently of a replaceable native render. */
export class SourceEditorSessions {
  private readonly editors = new Set<SourceEditor>();
  private disposed = false;
  create(doc: Document, source: DiagramSource): SourceEditor {
    const editor = new SourceEditor(doc, source, () => this.editors.delete(editor));
    if (this.disposed) editor.dispose(); else this.editors.add(editor);
    return editor;
  }
  get count(): number { return this.editors.size; }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const editor of this.editors) editor.dispose();
    this.editors.clear();
  }
}
