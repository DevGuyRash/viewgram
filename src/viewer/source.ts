import { sourceElement } from './source-mapping';
import type { LabelEdit } from './source-label';
export { decodeLabel, encodeLabel, applyLabel, applyLabelEdits } from './source-label';
export type { LabelEdit } from './source-label';
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
  const normalized = source.replace(/\r?\n/g, newline);
  const fencedSource = normalized.endsWith(newline) ? normalized : normalized + newline;
  return current.slice(0, snapshot.start) + fencedSource + current.slice(snapshot.end);
}
export interface SemanticTarget { id: string; label: string; kind: string }
export function labelEdit(source: string, target: SemanticTarget): LabelEdit | null {
  const edit = sourceElement(source, target).label;
  // Keep this older API limited to an existing label; sourceElement also supports safe label insertion.
  return edit && edit.start !== edit.end ? edit : null;
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
