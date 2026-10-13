import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { App, MarkdownPostProcessorContext, TFile } from 'obsidian';
import type * as Bridge from '../src/editor/source-bridge';

// Obsidian supplies this public module at runtime. Exercise the production adapters
// against a bounded synthetic API, without opening or writing any actual note.
let api: typeof Bridge & { TFile: new (path: string) => TFile; parser(value: unknown): void };
before(async () => {
  const compiled = await build({ stdin: { contents: 'export * from "./src/editor/source-bridge"; export {TFile, parser} from "obsidian";', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'synthetic-obsidian', setup(builder) {
    builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'synthetic' }));
    builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ contents: 'export class TFile { constructor(path){this.path=path;} } export const editorInfoField=Symbol("editorInfo"); let native={parse:async()=>true}; export function parser(value){native=value;} export async function loadMermaid(){return native;}' }));
  } }] });
  api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0]!.text).toString('base64')}`);
});
let win: Window;
beforeEach(() => { win = new Window(); api.parser({ parse: async () => true }); });
afterEach(async () => { await win.happyDOM.abort(); });
const note = '# Note\n```mermaid\nflowchart LR\n A[Same]\n```\n\n```mermaid\nflowchart LR\n A[Same]\n```\n';
const replacement = 'flowchart TD\n B[Updated]\n';
function nativeHost() {
  const container = win.document.createElement('section'), host = win.document.createElement('div'); host.className = 'mermaid';
  const svg = win.document.createElementNS('http://www.w3.org/2000/svg', 'svg'); host.append(svg); container.append(host); win.document.body.append(container);
  return { container: container as unknown as HTMLElement, host, svg: svg as unknown as SVGSVGElement };
}
function reading() {
  const native = nativeHost(); let document = note, original = new api.TFile('synthetic.md'), currentFile = original, writes = 0, active = true;
  const context = { sourcePath: original.path, getSectionInfo: () => ({ lineStart: 6, lineEnd: 10 }) } as unknown as MarkdownPostProcessorContext;
  let beforeProcess: () => void = () => {};
  const app = { vault: { getAbstractFileByPath: () => currentFile, read: async () => document, process: async (file: TFile, change: (current: string) => string) => { assert.equal(file, original); beforeProcess(); const next = change(document); document = next; writes++; } } } as unknown as App;
  const source = api.readingSource(app, context, native.container, native.svg, () => active);
  return { ...native, source, context, get document() { return document; }, get writes() { return writes; }, changeDocument(value: string) { document = value; }, replaceFile() { currentFile = new api.TFile(original.path); }, moveFile() { original.path = 'moved.md'; }, stop() { active = false; }, beforeProcess(run: () => void) { beforeProcess = run; } };
}
function livePreview() {
  const native = nativeHost(); native.host.className = 'cm-embed-block'; let document = note, original = new api.TFile('synthetic.md'), currentFile = original, active = true, writes = 0;
  const view = { dom: native.container, get state() { return { doc: EditorState.create({ doc: document }).doc, field: () => ({ file: currentFile }) }; }, posAtDOM: () => note.indexOf('```mermaid', note.indexOf('```mermaid') + 1) + 3, dispatch(transaction: { changes: { from: number; to: number; insert: string } }) { const { from, to, insert } = transaction.changes; document = document.slice(0, from) + insert + document.slice(to); writes++; } } as unknown as EditorView;
  const source = api.editorSource(view, native.svg, () => active);
  return { ...native, source, get document() { return document; }, get writes() { return writes; }, changeDocument(value: string) { document = value; }, replaceFile() { currentFile = new api.TFile(original.path); }, stop() { active = false; } };
}

test('Reading save targets the captured second block after native render and container replacement', async () => {
  const x = reading(), snapshot = await x.source.read(); assert.equal(snapshot.line, 6); x.container.remove();
  await x.source.write(snapshot, replacement); assert.equal(x.writes, 1); assert.equal(x.document, note.replace(/flowchart LR\n A\[Same\]\n(?=```\n$)/, replacement)); assert.equal(x.document.split('A[Same]').length - 1, 1);
});

test('Reading save refuses a stale note, replaced file, moved path, and unissued snapshot', async () => {
  const stale = reading(), snapshot = await stale.source.read(); stale.changeDocument(note + 'New paragraph\n'); await assert.rejects(stale.source.write(snapshot, replacement), /note changed/); assert.equal(stale.document, note + 'New paragraph\n'); assert.equal(stale.writes, 0);
  const replaced = reading(), captured = await replaced.source.read(); replaced.replaceFile(); await assert.rejects(replaced.source.write(captured, replacement), /source note changed/); assert.equal(replaced.document, note);
  const moved = reading(), original = await moved.source.read(); moved.moveFile(); await assert.rejects(moved.source.write(original, replacement), /source note changed/);
  const issued = reading(), saved = await issued.source.read(); await assert.rejects(issued.source.write({ ...saved }, replacement), /source note changed/); assert.equal(issued.writes, 0);
});

test('Reading native position refresh is safe and reads still require the current host', async () => {
  const x = reading(); x.context.getSectionInfo = () => ({ lineStart: 1, lineEnd: 4, text: '' }); const first = await x.source.read(); assert.equal(first.line, 1);
  x.context.sourcePath = 'another.md'; await assert.rejects(x.source.write(first, replacement), /source note changed/);
  const removed = reading(); removed.svg.remove(); await assert.rejects(removed.source.read(), /rendered block changed/);
});

test('Reading atomic callback rechecks unload and concurrent note changes before modification', async () => {
  const unloaded = reading(), snapshot = await unloaded.source.read(); unloaded.beforeProcess(() => unloaded.stop()); await assert.rejects(unloaded.source.write(snapshot, replacement), /source note changed/); assert.equal(unloaded.document, note); assert.equal(unloaded.writes, 0);
  const changed = reading(), original = await changed.source.read(); changed.beforeProcess(() => changed.changeDocument(note + 'Concurrent\n')); await assert.rejects(changed.source.write(original, replacement), /note changed/); assert.equal(changed.document, note + 'Concurrent\n'); assert.equal(changed.writes, 0);
});

test('Live Preview saves the correct unsaved block after its native widget is removed', async () => {
  const x = livePreview(), snapshot = await x.source.read(); assert.equal(snapshot.line, 6); x.host.remove();
  await x.source.write(snapshot, replacement); assert.equal(x.writes, 1); assert.equal(x.document, note.replace(/flowchart LR\n A\[Same\]\n(?=```\n$)/, replacement));
});

test('Live Preview rejects stale text, changed owning file, closed view, unissued snapshot and unload', async () => {
  const stale = livePreview(), snapshot = await stale.source.read(); stale.changeDocument(note + 'Unsaved typing\n'); await assert.rejects(stale.source.write(snapshot, replacement), /note changed/); assert.equal(stale.document, note + 'Unsaved typing\n'); assert.equal(stale.writes, 0);
  const swapped = livePreview(), captured = await swapped.source.read(); swapped.replaceFile(); await assert.rejects(swapped.source.write(captured, replacement), /note editor changed/);
  const closed = livePreview(), original = await closed.source.read(); closed.container.remove(); await assert.rejects(closed.source.write(original, replacement), /note editor changed/);
  const unloaded = livePreview(), opened = await unloaded.source.read(); unloaded.stop(); await assert.rejects(unloaded.source.write(opened, replacement), /note editor changed/);
  const issued = livePreview(), saved = await issued.source.read(); await assert.rejects(issued.source.write({ ...saved }, replacement), /snapshot is unavailable/); assert.equal(issued.writes, 0);
});

test('native direct parse API supports success and asynchronous syntax failures without speculative unwrap', async () => {
  const x = reading(); let validated = ''; api.parser({ parse: async (source: string) => { validated = source; } }); await x.source.validate!(replacement); assert.equal(validated, replacement);
  api.parser({ parse: async () => false }); await assert.rejects(x.source.validate!(replacement), /syntax is invalid/);
  api.parser({ parse: async () => { throw new Error('Native parse line 2'); } }); await assert.rejects(x.source.validate!(replacement), /Native parse line 2/);
  api.parser({ default: { parse: async () => true } }); await assert.rejects(x.source.validate!(replacement), /native Mermaid parser is unavailable/);
});
