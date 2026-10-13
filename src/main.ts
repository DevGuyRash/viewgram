import { MarkdownRenderChild, Plugin, type MarkdownPostProcessorContext } from 'obsidian';
import { RenderScope } from './viewer/render-scope';
import { readingSource } from './editor/source-bridge';
import { livePreviewExtension } from './editor/live-preview';

class MermaidRenderChild extends MarkdownRenderChild {
  private scope?: RenderScope;
  constructor(el: HTMLElement, private readonly plugin: MermaidViewer, private readonly context: MarkdownPostProcessorContext) { super(el); }
  onload(): void {
    this.scope = new RenderScope(this.containerEl, (href, newLeaf) => {
      void this.plugin.app.workspace.openLinkText(href, this.context.sourcePath, newLeaf);
    }, svg => readingSource(this.plugin.app, this.context, this.containerEl, svg));
    this.plugin.scopes.add(this.scope);
  }
  onunload(): void {
    if (!this.scope) return;
    this.scope.dispose(); this.plugin.scopes.delete(this.scope); this.scope = undefined;
  }
}
export default class MermaidViewer extends Plugin {
  // An active-instance registry for unload only. No cached source, SVG or viewport state.
  readonly scopes = new Set<RenderScope>();
  private active = false;
  onload(): void {
    this.active = true;
    this.registerEditorExtension(livePreviewExtension({
      isActive: () => this.active,
      openLink: (href, sourcePath, newLeaf) => { void this.app.workspace.openLinkText(href, sourcePath, newLeaf); },
      add: scope => this.scopes.add(scope),
      remove: scope => this.scopes.delete(scope),
    }));
    this.registerMarkdownPostProcessor((el, ctx) => {
      if (el.closest('.kmv-viewer, .kmv-dialog')) return;
      if (!el.matches('.mermaid, .block-language-mermaid, code.language-mermaid') && !el.querySelector('.mermaid, .block-language-mermaid, code.language-mermaid')) return;
      ctx.addChild(new MermaidRenderChild(el, this, ctx));
    }, 1000);
  }
  onunload(): void { this.active = false; for (const scope of this.scopes) scope.dispose(); this.scopes.clear(); }
}
