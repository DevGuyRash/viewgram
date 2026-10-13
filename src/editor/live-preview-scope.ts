import { RenderScope } from '../viewer/render-scope';
import type { DiagramSource } from '../viewer/source';
import type { SourceEditorSessions } from '../viewer/source-editor-sessions';

export interface EditorScopeOwner {
  isActive(): boolean;
  openLink(href: string, sourcePath: string, newLeaf: boolean): void;
  add(scope: RenderScope): void;
  remove(scope: RenderScope): void;
  editorSessions?: SourceEditorSessions;
}

/** One editor view owns one render scope. It only wraps SVGs inside existing native Mermaid islands. */
export class LivePreviewScope {
  private scope?: RenderScope;
  private sourcePath = '';
  private disposed = false;
  constructor(private readonly contentDOM: HTMLElement, private readonly owner: EditorScopeOwner, private readonly sourceFor?: (svg: SVGSVGElement) => DiagramSource) {}

  sync(livePreview: boolean, sourcePath: string): void {
    if (this.disposed) return;
    if (!livePreview || !this.owner.isActive()) { this.clear(); return; }
    if (this.scope && this.sourcePath === sourcePath) return;
    this.clear();
    this.sourcePath = sourcePath;
    // Native widgets can render asynchronously after a CM update. RenderScope watches only this
    // editor's content subtree and changes only the SVG's Mermaid parent, never the CM widget root.
    this.scope = new RenderScope(this.contentDOM, (href, newLeaf) => this.owner.openLink(href, this.sourcePath, newLeaf), this.sourceFor, this.owner.editorSessions);
    this.owner.add(this.scope);
  }
  private clear(): void {
    if (!this.scope) return;
    const scope = this.scope; this.scope = undefined;
    scope.dispose(); this.owner.remove(scope);
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.clear(); }
}
