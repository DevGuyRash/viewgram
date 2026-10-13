/** A source operation is tied to one native-rendered fenced block, never an SVG label. */
export interface SourceSnapshot {
  source: string;
  document: string;
  start: number;
  end: number;
  line: number;
}
export interface DiagramSource {
  read(): Promise<SourceSnapshot>;
  write(snapshot: SourceSnapshot, source: string): Promise<void>;
  validate?(source: string): Promise<void>;
}
export interface SourceHint { line?: number; endLine?: number; ordinal?: number }
export function mermaidBlocks(document: string): SourceSnapshot[] {
  const lines = document.match(/.*(?:\r\n|\n|$)/g)?.filter(Boolean) ?? [];
  const blocks: SourceSnapshot[] = [];
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n?$/.exec(line);
    if (!fence) { offset += line.length; continue; }
    const start = offset + line.length;
    let end = start, j = i + 1;
    const closing = new RegExp(`^ {0,3}${fence[1]![0]}{${fence[1]!.length},}\\s*$`);
    while (j < lines.length && !closing.test(lines[j]!.trimEnd())) { end += lines[j]!.length; j++; }
    if (j < lines.length && fence[2]!.trim().toLowerCase() === 'mermaid') blocks.push({ source: document.slice(start, end), document, start, end, line: i });
    offset = end + (lines[j]?.length ?? 0);
    i = j;
  }
  return blocks;
}
export function locateSource(document: string, hint: SourceHint = {}): SourceSnapshot {
  let candidates = mermaidBlocks(document);
  if (hint.line !== undefined) {
    candidates = candidates.filter(block => block.line <= (hint.endLine ?? hint.line!) && document.slice(0, block.end).split('\n').length - 1 >= hint.line!);
  }
  if (hint.ordinal !== undefined && candidates[hint.ordinal]) return candidates[hint.ordinal]!;
  if (candidates.length !== 1) throw new Error('Cannot identify this Mermaid block safely. Open its source in the note editor.');
  return candidates[0]!;
}
/** Optimistic, whole-document check also protects duplicate diagrams and moved fences. */
export function replaceSource(current: string, snapshot: SourceSnapshot, source: string): string {
  if (current !== snapshot.document) throw new Error('The note changed while you were editing. Close and reopen this editor to avoid overwriting newer changes.');
  // The user edits the inside of the existing fence, never its surrounding note.
  if (/^\s*(?:`{3,}|~{3,})/m.test(source)) throw new Error('Do not include Markdown fences in Mermaid source.');
  const newline = current.includes('\r\n') ? '\r\n' : '\n';
  const normalized = source.replace(/\r?\n/g, newline).replace(/(?:\r?\n)*$/, '') + newline;
  return current.slice(0, snapshot.start) + normalized + current.slice(snapshot.end);
}
export interface SemanticTarget { id: string; label: string; kind: string }
export interface LabelEdit { start: number; end: number; value: string; quote: boolean }
const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function decodeLabel(text: string): string {
  return text.replace(/<br\s*\/?\s*>/gi, '\n').replace(/#(\d+);/g, (_, code: string) => Number(code) <= 0x10ffff ? String.fromCodePoint(Number(code)) : `#${code};`).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
/** Entity escaping is Mermaid syntax; no input is inserted as HTML. */
export function encodeLabel(text: string): string {
  return text.replace(/[#"&<>\[\]{}()|;`\\\r\n]/g, char => char === '\r' ? '' : `#${char.codePointAt(0)};`);
}
export function labelEdit(source: string, target: SemanticTarget): LabelEdit | null {
  // Flowchart/block labels: match the identified declaration, including quoted labels.
  const family = source.trimStart().split(/\s/)[0];
  if (!/^(?:flowchart|graph|block-beta)$/.test(family ?? '') || !target.id) return null;
  // Mask quoted labels and comments before looking for declaration IDs. Text such as
  // B["A[Thing]"] must never turn into a writable declaration of A.
  let quoted = false, comment = false;
  const visible = source.split('').map((char, index) => {
    if (char === '\n') { comment = false; return char; }
    if (!quoted && char === '%' && (comment || source[index + 1] === '%')) comment = true;
    if (comment) return ' ';
    if (char === '"') { quoted = !quoted; return ' '; }
    return quoted ? ' ' : char;
  }).join('');
  // A declaration can follow whitespace, a statement separator or an arrowhead.
  // Other punctuation may belong to an identifier (for example X-A or X.A).
  // Unrecognized boundaries fall back to full-source editing instead of targeting a suffix.
  const expression = new RegExp(`(^|[\\s;>])${escaped(target.id)}(?=\\s*[\\[({>])`, 'gm');
  const shapes: [string, string][] = [['[[', ']]'], ['[(', ')]'], ['([', '])'], ['((', '))'], ['{{', '}}'], ['[/', '/]'], ['[\\', '\\]'], ['[/', '\\]'], ['[\\', '/]'], ['[', ']'], ['(', ')'], ['{', '}'], ['>', ']']];
  const matches = [...visible.matchAll(expression)];
  if (matches.length !== 1) return null;
  const edits: LabelEdit[] = [];
  for (const match of matches) {
    const afterId = match.index! + match[0].length;
    const whitespace = /^\s*/.exec(source.slice(afterId))![0].length;
    const shapeStart = afterId + whitespace;
    for (const [open, close] of shapes) {
      if (!source.startsWith(open, shapeStart)) continue;
      const start = shapeStart + open.length;
      const quotedLabel = source[start] === '"';
      const end = quotedLabel ? source.indexOf('"', start + 1) + 1 : source.indexOf(close, start);
      if (end <= start || !source.startsWith(close, end)) continue;
      const raw = source.slice(start, end);
      if (!quotedLabel && /[\[\](){}"\r\n]/.test(raw)) continue;
      const value = decodeLabel(quotedLabel ? raw.slice(1, -1) : raw);
      if (value.replace(/\s+/g, ' ').trim() !== target.label.replace(/\s+/g, ' ').trim()) continue;
      edits.push({ start, end, value, quote: true }); break;
    }
  }
  return edits.length === 1 ? edits[0]! : null;
}
export function applyLabel(source: string, edit: LabelEdit, value: string): string {
  return source.slice(0, edit.start) + `"${encodeLabel(value)}"` + source.slice(edit.end);
}
export function sourceSelection(source: string, target?: SemanticTarget): [number, number] {
  if (!target) return [0, 0];
  for (const text of [target.label, target.id]) {
    if (!text) continue;
    const at = source.indexOf(text);
    if (at >= 0 && source.indexOf(text, at + text.length) < 0) return [at, at + text.length];
  }
  return [0, 0];
}
