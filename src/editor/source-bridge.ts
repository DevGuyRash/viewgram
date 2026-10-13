import { loadMermaid, TFile, type App, type MarkdownPostProcessorContext } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import { locateSource, replaceSource, type DiagramSource } from '../viewer/source';

async function validate(source: string): Promise<void> {
  const mermaid: unknown = await loadMermaid();
  if (!mermaid || typeof mermaid !== 'object' || !('parse' in mermaid) || typeof mermaid.parse !== 'function') throw new Error('The native Mermaid parser is unavailable. Edit this block in Obsidian’s source view.');
  const result: unknown = await mermaid.parse(source);
  if (result === false) throw new Error('Mermaid syntax is invalid. Correct the source before saving.');
}

/** Reading view writes through the vault's atomic process operation. */
export function readingSource(app: App, context: MarkdownPostProcessorContext, container: HTMLElement, svg: SVGSVGElement): DiagramSource {
  const host = svg.parentElement!;
  const sourcePath = context.sourcePath;
  const ensureCurrent = (): void => {
    if (!container.isConnected || !host.isConnected || !svg.isConnected || context.sourcePath !== sourcePath) throw new Error('This rendered block changed or closed. Reopen the diagram before editing.');
  };
  const file = (): TFile => {
    const result = app.vault.getAbstractFileByPath(sourcePath);
    if (!(result instanceof TFile)) throw new Error('The source note is no longer available.');
    return result;
  };
  return {
    read: async () => {
      ensureCurrent();
      const document = await app.vault.read(file());
      ensureCurrent();
      // Obsidian requires section information to be obtained immediately before use.
      // Source positions can change while a native SVG is retained on screen.
      const info = context.getSectionInfo(host);
      if (!info) throw new Error('Obsidian did not expose the source position for this rendered block. Open its source in the note editor.');
      return locateSource(document, { line: info.lineStart, endLine: info.lineEnd });
    },
    write: async (snapshot, source) => {
      ensureCurrent();
      await app.vault.process(file(), current => replaceSource(current, snapshot, source));
    },
    validate,
  };
}

/** Live Preview edits the owning CodeMirror document, preserving undo and unsaved changes. */
export function editorSource(view: EditorView, svg: SVGSVGElement): DiagramSource {
  const host = svg.closest('.cm-embed-block') ?? svg.parentElement!;
  const sourcePath = view.state.field(editorInfoField, false)?.file?.path ?? '';
  const ensureCurrent = (): void => {
    if (!view.dom.isConnected || !host.isConnected || (view.state.field(editorInfoField, false)?.file?.path ?? '') !== sourcePath) throw new Error('This editor changed or closed. Reopen the diagram before editing.');
  };
  return {
    read: async () => {
      ensureCurrent();
      let line: number;
      try { line = view.state.doc.lineAt(view.posAtDOM(host)).number - 1; }
      catch { throw new Error('The native widget’s source position is unavailable. Use the note’s source editor.'); }
      return locateSource(view.state.doc.toString(), { line });
    },
    write: async (snapshot, source) => {
      ensureCurrent();
      const current = view.state.doc.toString();
      const next = replaceSource(current, snapshot, source);
      const inserted = next.slice(snapshot.start, next.length - (current.length - snapshot.end));
      view.dispatch({ changes: { from: snapshot.start, to: snapshot.end, insert: inserted } });
    },
    validate,
  };
}
