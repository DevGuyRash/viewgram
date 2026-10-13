import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import { editorSource } from './source-bridge';
import { editorInfoField, editorLivePreviewField } from 'obsidian';
import { LivePreviewScope, type EditorScopeOwner } from './live-preview-scope';

/** Registered through Obsidian's public editor-extension API; CodeMirror owns construction/destruction. */
export function livePreviewExtension(owner: EditorScopeOwner) {
  return ViewPlugin.fromClass(class {
    private readonly scope: LivePreviewScope;
    constructor(private readonly view: EditorView) {
      this.scope = new LivePreviewScope(view.contentDOM, owner, svg => editorSource(view, svg, () => owner.isActive()));
      this.sync();
    }
    update(_update: ViewUpdate): void { this.sync(); }
    private sync(): void {
      this.scope.sync(
        this.view.state.field(editorLivePreviewField, false) === true,
        this.view.state.field(editorInfoField, false)?.file?.path ?? '',
      );
    }
    destroy(): void { this.scope.dispose(); }
  });
}
