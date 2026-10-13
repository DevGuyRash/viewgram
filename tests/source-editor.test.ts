import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { EditorView } from '@codemirror/view';
import { SourceEditor } from '../src/viewer/source-editor';
import { SourceCodeEditor } from '../src/viewer/source-code-editor';
import { SourceEditorSessions } from '../src/viewer/source-editor-sessions';
import { RenderScope } from '../src/viewer/render-scope';
import type { DiagramSource } from '../src/viewer/source';

let win: Window;
const globals = new Map<string, PropertyDescriptor | undefined>();
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  win = new Window({ url: 'http://localhost' });
  Object.assign(win.HTMLDialogElement.prototype, { showModal() { (this as any).open = true; }, close() { (this as any).open = false; } });
  for (const [name, value] of Object.entries({ window: win, document: win.document, MutationObserver: win.MutationObserver, ResizeObserver: ResizeObserverStub, Node: win.Node, HTMLElement: win.HTMLElement, getComputedStyle: win.getComputedStyle.bind(win), requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win) })) {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
});
afterEach(async () => {
  await win.happyDOM.abort();
  for (const [name, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
  globals.clear();
});
const initial = 'flowchart LR\n A["Old"] --> B\n';
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(validate?: DiagramSource['validate'], write?: DiagramSource['write']) {
  let saved = '', writes = 0;
  const source: DiagramSource = { read: async () => ({ source: initial, document: initial, start: 0, end: initial.length, line: 0 }), validate, write: async (snapshot, next) => { await write?.(snapshot, next); saved = next; writes++; } };
  return { editor: new SourceEditor(win.document as unknown as Document, source), get saved() { return saved; }, get writes() { return writes; } };
}
function button(name: string): HTMLButtonElement { return [...win.document.querySelectorAll('button')].find(b => b.textContent === name)! as unknown as HTMLButtonElement; }
function code(): EditorView { return EditorView.findFromDOM(win.document.querySelector('.cm-content')! as unknown as HTMLElement)!; }
function draft(text: string): void { const view = code(); view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); }

test('double-open edits one source dialog and saves escaped label after validation', async () => {
  let validated = ''; const x = setup(async source => { validated = source; });
  await x.editor.open({ id: 'A', label: 'Old', kind: 'node' }); await x.editor.open(); assert.equal(win.document.querySelectorAll('dialog').length, 1);
  const label = win.document.querySelector('[aria-label="Element label"]')! as unknown as HTMLTextAreaElement;
  label.value = '"<new>"'; label.dispatchEvent(new win.Event('input') as unknown as Event);
  button('Save source').click(); await settle();
  assert.equal(x.writes, 1); assert.equal(x.saved, validated); assert.ok(x.saved.includes('#34;#60;new#62;#34;')); assert.equal(win.document.querySelector('dialog'), null); x.editor.dispose();
});

test('native syntax rejection retains the exact full-source draft and actionable error', async () => {
  const x = setup(async () => { throw { message: 'Invalid Mermaid at line 2' }; }); await x.editor.open(); const candidate = 'flowchart TD\n A --> ]'; draft(candidate);
  button('Save source').click(); await settle();
  assert.equal(x.writes, 0); assert.equal(code().state.doc.toString(), candidate); assert.match(win.document.querySelector('[role="status"]')!.textContent!, /Mermaid validation failed: Invalid Mermaid at line 2/);
  assert.equal(win.document.querySelector('[role="status"]')!.getAttribute('data-state'), 'error'); assert.equal(button('Save source').disabled, false); assert.equal(code().contentDOM.getAttribute('aria-disabled'), 'false');
  button('Cancel').click(); assert.equal(win.document.querySelector('dialog'), null); x.editor.dispose();
});

test('async write rejection keeps the draft editable and a successful retry closes it', async () => {
  let attempts = 0; const x = setup(async () => {}, async () => { if (++attempts === 1) throw new Error('Disk write denied'); }); await x.editor.open(); const candidate = 'flowchart TD\n New --> Target\n'; draft(candidate);
  button('Save source').click(); await settle();
  assert.equal(x.writes, 0); assert.equal(code().state.doc.toString(), candidate); assert.match(win.document.querySelector('[role="status"]')!.textContent!, /Source could not be saved: Disk write denied.*draft is kept/); assert.equal(button('Cancel').disabled, false);
  button('Save source').click(); await settle(); assert.equal(x.writes, 1); assert.equal(x.saved, candidate); assert.equal(win.document.querySelector('dialog'), null); x.editor.dispose();
});

test('true editor disposal cancels a save pending validation', async () => {
  let resolve!: () => void; const x = setup(() => new Promise<void>(done => { resolve = done; })); await x.editor.open();
  button('Save source').click(); assert.equal(code().state.readOnly, true); assert.equal(win.document.querySelector('[role="status"]')!.getAttribute('data-state'), 'checking');
  x.editor.dispose(); resolve(); await settle(); assert.equal(x.writes, 0); assert.equal(win.document.querySelector('dialog'), null);
});

test('renderer retirement retains a pending draft, saves once, and cannot reopen the retired editor', async () => {
  let resolve!: () => void; const x = setup(() => new Promise<void>(done => { resolve = done; })); await x.editor.open(); const candidate = 'flowchart LR\n Draft --> Saved\n'; draft(candidate);
  button('Save source').click(); x.editor.detach(); assert.ok(win.document.querySelector('dialog')); resolve(); await settle();
  assert.equal(x.writes, 1); assert.equal(x.saved, candidate); assert.equal(win.document.querySelector('dialog'), null); await x.editor.open(); assert.equal(win.document.querySelector('dialog'), null);
});

test('native RenderScope replacement retains the open session until save, then unload clears all sessions', async () => {
  const host = win.document.createElement('div'); host.className = 'mermaid'; win.document.body.append(host);
  const svg = () => { const node = win.document.createElementNS('http://www.w3.org/2000/svg', 'svg'); node.setAttribute('viewBox', '0 0 600 300'); return node; }; host.append(svg());
  const sessions = new SourceEditorSessions(); let resolve!: () => void, writes = 0;
  const source: DiagramSource = { read: async () => ({ source: initial, document: initial, start: 0, end: initial.length, line: 0 }), validate: () => new Promise<void>(done => { resolve = done; }), write: async () => { writes++; } };
  const scope = new RenderScope(host as unknown as HTMLElement, undefined, () => source, sessions);
  (host.querySelector('[aria-label="Edit Mermaid source"]')! as unknown as HTMLButtonElement).click(); await settle(); button('Save source').click();
  host.replaceChildren(svg()); await settle(); assert.equal(scope.count, 1); assert.ok(win.document.querySelector('dialog')); resolve(); await settle(); assert.equal(writes, 1); assert.equal(win.document.querySelector('dialog'), null); assert.equal(sessions.count, 1);
  (host.querySelector('[aria-label="Edit Mermaid source"]')! as unknown as HTMLButtonElement).click(); await settle(); button('Save source').click();
  sessions.dispose(); scope.dispose(); resolve(); await settle(); assert.equal(writes, 1); assert.equal(sessions.count, 0); assert.equal(win.document.querySelector('dialog'), null); assert.equal(scope.count, 0);
});

test('CRLF fallback target selection uses normalized editor offsets', async () => {
  const text = 'pie\r\n "First" : 1\r\n "Second" : 2\r\n';
  const editor = new SourceEditor(win.document as unknown as Document, { read: async () => ({ source: text, document: text, start: 0, end: text.length, line: 0 }), write: async () => {} });
  await editor.open({ id: '', label: 'Second', kind: 'slice' }); const view = code(); assert.equal(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to), 'Second'); editor.dispose();
});

test('source keyboard preserves indentation, indents Mermaid blocks, and uses standard undo/redo', () => {
  const parent = win.document.createElement('div'); win.document.body.append(parent); let changes = 0;
  const input = new SourceCodeEditor(parent as unknown as HTMLElement, 'flowchart LR\n  subgraph Group', () => { changes++; }); input.focus(input.value.length, input.value.length);
  const key = (value: string, options: { ctrlKey?: boolean; shiftKey?: boolean } = {}) => input.view.contentDOM.dispatchEvent(new win.KeyboardEvent('keydown', { key: value, code: value, bubbles: true, cancelable: true, ...options }) as unknown as Event);
  key('Enter'); assert.equal(input.value, 'flowchart LR\n  subgraph Group\n    '); assert.equal(changes, 1);
  key('z', { ctrlKey: true }); assert.equal(input.value, 'flowchart LR\n  subgraph Group'); key('z', { ctrlKey: true, shiftKey: true }); assert.equal(input.value, 'flowchart LR\n  subgraph Group\n    ');
  input.value = 'flowchart LR\nloop[Node]'; input.focus(input.value.length, input.value.length); key('Enter'); assert.equal(input.value, 'flowchart LR\nloop[Node]\n');
  input.value = 'sequenceDiagram\n  alt case'; input.focus(input.value.length, input.value.length); key('Enter'); assert.equal(input.value, 'sequenceDiagram\n  alt case\n    ');
  input.value = 'A\nB\n'; input.focus(0, input.value.length); key('Tab'); assert.equal(input.value, '  A\n  B\n'); key('Tab', { shiftKey: true }); assert.equal(input.value, 'A\nB\n'); input.dispose();
});
