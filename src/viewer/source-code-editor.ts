import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, type Command } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { mermaidLanguage, mermaidSourceHighlighting } from './mermaid-language';

const indent = '  ';

/** Small source input using Obsidian's existing CodeMirror packages. */
export class SourceCodeEditor {
  readonly view: EditorView;
  private readonly editable = new Compartment();
  private readonly wrap = new Compartment();
  private wrapEnabled = true;
  private programmatic = false;
  constructor(parent: HTMLElement, source: string, changed: () => void) {
    this.view = new EditorView({ parent, root: parent.ownerDocument, state: EditorState.create({
      doc: source,
      extensions: [
        this.editable.of([EditorState.readOnly.of(false), EditorView.editable.of(true)]),
        EditorView.contentAttributes.of({ role: 'textbox', 'aria-label': 'Mermaid source', 'aria-multiline': 'true', spellcheck: 'false' }),
        EditorState.tabSize.of(2),
        this.wrap.of(EditorView.lineWrapping),
        lineNumbers(),
        mermaidLanguage,
        mermaidSourceHighlighting,
        history(),
        keymap.of([
          { key: 'Enter', run: newline },
          { key: 'Tab', run: view => indentLines(view, false) },
          { key: 'Shift-Tab', run: view => indentLines(view, true) },
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.updateListener.of(update => {
          if (!update.docChanged || this.programmatic) return;
          changed();
        }),
      ],
    }) });
  }
  get value(): string { return this.view.state.doc.toString(); }
  set value(text: string) {
    if (text === this.value) return;
    this.programmatic = true;
    try { this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: text } }); }
    finally { this.programmatic = false; }
  }
  get wrapping(): boolean { return this.wrapEnabled; }
  setWrap(enabled: boolean): void {
    if (enabled === this.wrapEnabled) return;
    this.wrapEnabled = enabled;
    this.view.dispatch({ effects: this.wrap.reconfigure(enabled ? EditorView.lineWrapping : []) });
    this.resize();
  }
  setEnabled(enabled: boolean): void {
    this.view.dispatch({ effects: this.editable.reconfigure([EditorState.readOnly.of(!enabled), EditorView.editable.of(enabled)]) });
    this.view.contentDOM.setAttribute('aria-disabled', String(!enabled));
  }
  focus(from: number, to: number): void {
    this.view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
    this.view.focus();
  }
  resize(): void {
    this.view.requestMeasure();
    if (this.view.hasFocus) this.view.dispatch({ effects: EditorView.scrollIntoView(this.view.state.selection.main.head, { y: 'nearest' }) });
  }
  dispose(): void { this.view.destroy(); }
}

const newline: Command = view => {
  if (view.state.readOnly) return true;
  const range = view.state.selection.main;
  const line = view.state.doc.lineAt(range.from);
  const before = line.text.slice(0, range.from - line.from);
  const leading = before.match(/^[ \t]*/)?.[0] ?? '';
  const sequence = /^\s*sequenceDiagram\b/m.test(view.state.doc.toString());
  const opens = /^subgraph(?:\s|$)/.test(before.trim()) || (sequence && /^(?:loop|alt|opt|par|rect|critical|break|box)(?:\s|$)/.test(before.trim())) || /\{\s*$/.test(before);
  const insert = `\n${leading}${opens ? indent : ''}`;
  view.dispatch({ changes: { from: range.from, to: range.to, insert }, selection: { anchor: range.from + insert.length }, userEvent: 'input' });
  return true;
};

function indentLines(view: EditorView, outdent: boolean): boolean {
  if (view.state.readOnly) return true;
  const range = view.state.selection.main;
  if (range.empty && !outdent) {
    view.dispatch({ changes: { from: range.from, insert: indent }, selection: { anchor: range.from + indent.length }, userEvent: 'input' });
    return true;
  }
  const first = view.state.doc.lineAt(range.from).number;
  const last = view.state.doc.lineAt(range.to > range.from ? range.to - 1 : range.to).number;
  const edits = [];
  for (let number = first; number <= last; number++) {
    const line = view.state.doc.line(number);
    const remove = outdent ? line.text.match(/^(?: {1,2}|\t)/)?.[0].length ?? 0 : 0;
    edits.push({ from: line.from, to: line.from + remove, insert: outdent ? '' : indent });
  }
  const changes = view.state.changes(edits);
  view.dispatch({ changes, selection: view.state.selection.map(changes), userEvent: 'input' });
  return true;
}
