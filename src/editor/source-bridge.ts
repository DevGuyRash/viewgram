import { loadMermaid, TFile, type App, type MarkdownPostProcessorContext } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import { locateSource, replaceSource, type DiagramSource, type SourceSnapshot } from '../viewer/source';

async function validate(source: string): Promise<void> {
  const mermaid: unknown = await loadMermaid();
  if (!mermaid || typeof mermaid !== 'object' || !('parse' in mermaid) || typeof mermaid.parse !== 'function') throw new Error('The native Mermaid parser is unavailable. Edit this block in Obsidian’s source view.');
  const parser = mermaid as { parse(source: string): unknown };
  const result: unknown = await parser.parse(source);
  if (result === false) throw new Error('Mermaid syntax is invalid. Correct the source before saving.');
}

/** Reading view writes through the vault's atomic process operation. */
export function readingSource(app: App, context: MarkdownPostProcessorContext, container: HTMLElement, svg: SVGSVGElement, isActive: () => boolean = () => true): DiagramSource {
  const host = svg.parentElement!;
  const sourcePath = context.sourcePath;
  const snapshots = new WeakMap<SourceSnapshot, TFile>();
  const ensureCurrent = (): void => {
    if (!isActive() || !container.isConnected || !host.isConnected || !svg.isConnected || context.sourcePath !== sourcePath) throw new Error('This rendered block changed or closed. Reopen the diagram before editing.');
  };
  const file = (): TFile => {
    const result = app.vault.getAbstractFileByPath(sourcePath);
    if (!(result instanceof TFile)) throw new Error('The source note is no longer available.');
    return result;
  };
  return {
    read: async () => {
      ensureCurrent();
      const originalFile = file();
      const document = await app.vault.read(originalFile);
      ensureCurrent();
      // Obsidian requires section information to be obtained immediately before use.
      // Source positions can change while a native SVG is retained on screen.
      const info = context.getSectionInfo(host);
      if (!info) throw new Error('Obsidian did not expose the source position for this rendered block. Open its source in the note editor.');
      if (file() !== originalFile) throw new Error('The source note changed while opening the editor. Reopen the diagram.');
      const snapshot = locateSource(document, { line: info.lineStart, endLine: info.lineEnd });
      snapshots.set(snapshot, originalFile);
      return snapshot;
    },
    write: async (snapshot, source) => {
      // The native renderer may replace its SVG while this draft is open. The captured
      // file identity and exact document snapshot, rather than that old SVG, own the write.
      const originalFile = snapshots.get(snapshot);
      const ensureFile = (): void => {
        if (!isActive() || !originalFile || context.sourcePath !== sourcePath || file() !== originalFile || originalFile.path !== sourcePath) throw new Error('The source note changed or closed. Copy your draft, then reopen the correct diagram.');
      };
      ensureFile();
      await app.vault.process(originalFile!, current => { ensureFile(); return replaceSource(current, snapshot, source); });
    },
    validate,
  };
}

/** Live Preview edits the owning CodeMirror document, preserving undo and unsaved changes. */
export function editorSource(view: EditorView, svg: SVGSVGElement, isActive: () => boolean = () => true): DiagramSource {
  const host = svg.closest('.cm-embed-block') ?? svg.parentElement!;
  const sourcePath = view.state.field(editorInfoField, false)?.file?.path ?? '';
  const sourceFile = view.state.field(editorInfoField, false)?.file;
  const snapshots = new WeakSet<SourceSnapshot>();
  const ensureEditor = (): void => {
    const currentFile = view.state.field(editorInfoField, false)?.file;
    if (!isActive() || !view.dom.isConnected || !sourceFile || currentFile !== sourceFile || currentFile.path !== sourcePath) throw new Error('This note editor changed or closed. Copy your draft, then reopen the correct diagram.');
  };
  const ensureCurrent = (): void => {
    ensureEditor();
    if (!host.isConnected || !svg.isConnected) throw new Error('This rendered block changed or closed. Reopen the diagram before editing.');
  };
  return {
    read: async () => {
      ensureCurrent();
      let line: number;
      try { line = view.state.doc.lineAt(view.posAtDOM(host)).number - 1; }
      catch { throw new Error('The native widget’s source position is unavailable. Use the note’s source editor.'); }
      const snapshot = locateSource(view.state.doc.toString(), { line });
      snapshots.add(snapshot);
      return snapshot;
    },
    write: async (snapshot, source) => {
      ensureEditor();
      if (!snapshots.has(snapshot)) throw new Error('The source snapshot is unavailable. Reopen the diagram before editing.');
      const current = view.state.doc.toString();
      const next = replaceSource(current, snapshot, source);
      const inserted = next.slice(snapshot.start, next.length - (current.length - snapshot.end));
      view.dispatch({ changes: { from: snapshot.start, to: snapshot.end, insert: inserted } });
    },
    validate,
  };
}
