/** Lexical locations are offsets in the untouched JavaScript string (UTF-16). */
export interface SourceToken { kind: 'word' | 'string' | 'symbol' | 'arrow'; text: string; start: number; end: number }
export interface SourceStatement { tokens: SourceToken[]; start: number; end: number; line: number }

/** Tokenization only identifies editable ranges; Mermaid remains the parser and renderer. */
export function sourceStatements(source: string, options: { sequenceComments?: boolean; flowLabels?: boolean } = {}): SourceStatement[] {
  const statements: SourceStatement[] = [];
  let tokens: SourceToken[] = [], start = 0, line = 0, statementLine = 0, at = 0, metadataDepth = 0, labelClose: string | undefined;
  const finish = (end: number): void => {
    if (tokens.length) statements.push({ tokens, start, end, line: statementLine });
    tokens = [];
  };
  while (at < source.length) {
    const char = source[at]!;
    if (labelClose && source.startsWith(labelClose, at)) labelClose = undefined;
    else if (!labelClose && options.flowLabels) {
      if (char === '|' && tokens.at(-1)?.kind === 'arrow') labelClose = '|';
      else if (tokens.at(-1)?.kind === 'word') {
        const shape = shapes.find(([open]) => source.startsWith(open, at));
        if (shape) labelClose = shape[1];
      }
    }
    if (char === '\r' || char === '\n' || char === ';') {
      if (!labelClose) finish(at);
      if (char === '\r' && source[at + 1] === '\n') at++;
      if (char !== ';') line++;
      at++;
      if (!labelClose) { start = at; statementLine = line; }
      continue;
    }
    if (char === ' ' || char === '\t') { at++; continue; }
    if (!labelClose && source.startsWith('%%{', at)) {
      finish(at);
      const closing = source.indexOf('}%%', at + 3);
      const end = closing < 0 ? source.length : closing + 3;
      line += (source.slice(at, end).match(/\r\n|\r|\n/g) ?? []).length;
      at = end; start = at; statementLine = line; continue;
    }
    if (!labelClose && (source.startsWith('%%', at) || (options.sequenceComments && !metadataDepth && (char === '%' || (char === '#' && !entityAt(source, at)))))) {
      finish(at);
      while (at < source.length && source[at] !== '\n' && source[at] !== '\r') at++;
      continue;
    }
    const tokenStart = at;
    if (char === '"' && (!options.sequenceComments || metadataDepth > 0)) {
      const quote = char; at++;
      while (at < source.length) {
        if (source[at] === '\n' || source[at] === '\r') break;
        const next = source[at++]!;
        if (next === quote) break;
      }
      tokens.push({ kind: 'string', text: source.slice(tokenStart, at), start: tokenStart, end: at });
      continue;
    }
    const entity = entityAt(source, at);
    if (entity) { at += entity.length; tokens.push({ kind: 'word', text: entity, start: tokenStart, end: at }); continue; }
    const arrow = arrowAt(source, at);
    if (arrow) { at += arrow.length; tokens.push({ kind: 'arrow', text: arrow, start: tokenStart, end: at }); continue; }
    if ('[](){}:,&|@'.includes(char)) {
      if (options.sequenceComments && char === '{' && (metadataDepth || tokens.at(-1)?.text === '@')) metadataDepth++;
      else if (options.sequenceComments && char === '}' && metadataDepth) metadataDepth--;
      at++; tokens.push({ kind: 'symbol', text: char, start: tokenStart, end: at }); continue;
    }
    at++;
    while (at < source.length) {
      const entity = entityAt(source, at);
      if (entity) { at += entity.length; continue; }
      if (/[\s;\[\](){}:,&|@"]/.test(source[at]!) || source.startsWith('%%', at) || (options.sequenceComments && !metadataDepth && (source[at] === '%' || source[at] === '#')) || arrowAt(source, at, true)) break;
      at++;
    }
    tokens.push({ kind: 'word', text: source.slice(tokenStart, at), start: tokenStart, end: at });
  }
  finish(source.length);
  return statements;
}

const shapes: ReadonlyArray<readonly [string, string]> = [['[[', ']]'], ['[(', ')]'], ['([', '])'], ['(((', ')))'], ['((', '))'], ['{{', '}}'], ['[/', '/]'], ['[\\', '\\]'], ['[/', '\\]'], ['[\\', '/]'], ['[', ']'], ['(', ')'], ['{', '}'], ['>', ']']];

function arrowAt(source: string, at: number, insideWord = false): string | undefined {
  const char = source[at];
  if (!char || !'-=<>.~ox*'.includes(char)) return undefined;
  if (insideWord && (char === 'o' || char === 'x' || char === '*')) return undefined;
  // Longest operators first. Identifier hyphens/dots that do not form an operator remain in the ID.
  return /^(?:(?:<<|<)?-{1,2}(?:>>?|[)x])|[ox<]?(?:-+\.-+|={2,}|-{2,}|~{3,})[>ox]?|(?:<\||\*|o)?(?:--|\.\.)(?:\|>|\*|o)?|-\.|\.->?)/.exec(source.slice(at))?.[0];
}

function entityAt(source: string, at: number): string | undefined {
  if (source[at] !== '#' && source[at] !== '&') return undefined;
  return /^(?:#(?:\d+|[A-Za-z]\w*);|&(?:#\d+|[A-Za-z]\w*);)/.exec(source.slice(at))?.[0];
}
