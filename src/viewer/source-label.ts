export interface LabelEdit {
  start: number;
  end: number;
  value: string;
  quote: boolean;
  original?: string;
  /** Wrappers are used only when introducing a separate display label to a bare node. */
  prefix?: string;
  suffix?: string;
  lineBreak?: 'html';
}

export function decodeLabel(text: string): string {
  // Decode the original tokens once. A literal user-entered '&quot;' or '<br>' stays literal after encoding.
  return text.replace(/<br\s*\/?\s*>|#(\d+);|&(quot|amp|lt|gt);/gi, (token: string, code?: string, name?: string) => {
    if (code !== undefined) {
      const point = Number(code);
      return point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : token;
    }
    if (name) return ({ quot: '"', amp: '&', lt: '<', gt: '>' } as Record<string, string>)[name.toLowerCase()] ?? token;
    return '\n';
  });
}

/** Mermaid entities survive parsing without becoming syntax or injected HTML. */
export function encodeLabel(text: string): string {
  return text.replace(/[#%"&<>[\]{}()|;:`\\\r\n]/g, char => char === '\r' ? '' : `#${char.codePointAt(0)};`);
}

export function applyLabel(source: string, edit: LabelEdit, value: string): string {
  return applyLabelEdits(source, [{ edit, value }]);
}

/** Check every range against the same snapshot, then splice from the end without offset drift. */
export function applyLabelEdits(source: string, changes: ReadonlyArray<{ edit: LabelEdit; value: string }>): string {
  const edits = new Map<string, { edit: LabelEdit; value: string }>();
  for (const change of changes) {
    const { edit, value } = change;
    if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end) || edit.start < 0 || edit.end < edit.start || edit.end > source.length || (edit.original !== undefined && source.slice(edit.start, edit.end) !== edit.original)) throw new Error('The label source changed. Close and reopen the editor before saving.');
    const key = `${edit.start}:${edit.end}`, previous = edits.get(key);
    if (previous && previous.value !== value) throw new Error('A shared relationship label has conflicting edits.');
    edits.set(key, change);
  }
  let next = source, limit = source.length;
  for (const { edit, value } of [...edits.values()].sort((a, b) => b.edit.start - a.edit.start || b.edit.end - a.edit.end)) {
    if (edit.end > limit) throw new Error('The source label ranges overlap. Use Edit whole chart to resolve this safely.');
    limit = edit.start;
    // An untouched field keeps its original entities, quotes, Markdown and whitespace byte for byte.
    if (value === edit.value) continue;
    const text = edit.lineBreak === 'html' ? encodeLabel(value).replace(/#10;/g, '<br/>') : encodeLabel(value);
    const replacement = `${edit.prefix ?? ''}${edit.quote ? `"${text}"` : text}${edit.suffix ?? ''}`;
    next = next.slice(0, edit.start) + replacement + next.slice(edit.end);
  }
  return next;
}
