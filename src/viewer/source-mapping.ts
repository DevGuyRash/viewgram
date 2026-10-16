import type { SemanticTarget } from './source';
import { decodeLabel, type LabelEdit } from './source-label';
import { sourceStatements, type SourceStatement, type SourceToken } from './source-lexer';

export interface SourceRelationship {
  from: string;
  to: string;
  operator: string;
  line: number;
  label?: LabelEdit;
  text?: string;
}
export interface SourceElement {
  value: string;
  label?: LabelEdit;
  relationships: SourceRelationship[];
  reason?: string;
}
export interface SequenceAssociations {
  participants: Array<{ id: string; label: string }>;
  messages: Array<{ from: string; to: string; label: string; direction: 'forward' | 'both' }>;
  notes: Array<{ participants: string[]; label: string }>;
}

/** Read-only source identities for native sequence SVGs that omit endpoint metadata. */
export function sequenceAssociations(source: string): SequenceAssociations | undefined {
  const statements = diagramStatements(source);
  if (statements[0]?.tokens[0]?.text !== 'sequenceDiagram') return undefined;
  const index: SourceIndex = { nodes: [], relationships: [], complete: true };
  indexSequence(source, statements, index);
  const byId = new Map<string, NodeReference[]>();
  for (const node of index.nodes) {
    const nodes = byId.get(node.id) ?? []; nodes.push(node); byId.set(node.id, nodes);
  }
  const participants: SequenceAssociations['participants'] = [];
  for (const [id, nodes] of byId) {
    const labels = uniqueLabels(nodes.flatMap(node => node.label ? [node.label] : []));
    if (labels.length <= 1) participants.push({ id, label: labels[0]?.value ?? id });
  }
  const known = new Set(participants.map(participant => participant.id));
  const messages: SequenceAssociations['messages'] = [], notes: SequenceAssociations['notes'] = [];
  for (const edge of index.relationships) {
    if (!edge.label || !known.has(edge.from) || !known.has(edge.to)) continue;
    if (edge.operator === 'note') notes.push({ participants: edge.from === edge.to ? [edge.from] : [edge.from, edge.to], label: edge.label.value });
    else messages.push({ from: edge.from, to: edge.to, label: edge.label.value, direction: edge.operator.startsWith('<<') && edge.operator.endsWith('>>') ? 'both' : 'forward' });
  }
  return { participants, messages, notes };
}
interface NodeReference { id: string; start: number; end: number; label?: LabelEdit; canInsert?: boolean }
interface SourceIndex { nodes: NodeReference[]; relationships: SourceRelationship[]; complete: boolean }
interface ParsedNode { node: NodeReference; next: number }

function finishNode(source: string, tokens: SourceToken[], node: NodeReference, next: number): ParsedNode {
  if (tokens[next]?.text === '@' && tokens[next + 1]?.text === '{') {
    node.canInsert = false;
    let end = next + 2, depth = 1;
    while (end < tokens.length) {
      if (tokens[end]!.text === '{') depth++;
      else if (tokens[end]!.text === '}' && --depth === 0) break;
      end++;
    }
    if (end === tokens.length) { node.label = undefined; return { node, next: end }; }
    const body = tokens.slice(next + 2, end);
    const keys = body.flatMap((token, at) => ['label', '"label"'].includes(token.text) && body[at + 1]?.text === ':' ? [at + 2] : []);
    if (body.some(token => ['{', '['].includes(token.text))) node.label = undefined;
    else if (keys.length) {
      const value = keys.length === 1 ? body[keys[0]!] : undefined;
      node.label = value?.kind === 'string' ? labelRange(source, value.start, value.end, true) : undefined;
    }
    next = end + 1;
  }
  if (tokens[next]?.text === ':' && tokens[next + 1]?.text === ':' && tokens[next + 2]?.text === ':' && word(tokens[next + 3])) next += 4;
  if (tokens[next]?.text === ':' && /^\d+$/.test(tokens[next + 1]?.text ?? '')) next += 2;
  return { node, next };
}

/** An exact ID and native label are both required before a writable span is exposed. */
export function sourceElement(source: string, target: SemanticTarget): SourceElement {
  const statements = diagramStatements(source);
  const family = statements[0]?.tokens[0]?.text ?? '';
  const index: SourceIndex = { nodes: [], relationships: [], complete: true };
  if (family === 'flowchart' || family === 'flowchart-elk' || family === 'graph' || family === 'block-beta' || family === 'block') indexFlow(source, statements, index);
  else if (family === 'sequenceDiagram') indexSequence(source, statements, index);
  else if (family === 'stateDiagram' || family === 'stateDiagram-v2') indexState(source, statements, index);
  else if (family === 'classDiagram' || family === 'classDiagram-v2') indexClass(source, statements, index);
  else if (family === 'erDiagram') indexEr(source, statements, index);
  else if (family === 'architecture-beta') indexArchitecture(source, statements, index);
  else if (family === 'mindmap') indexMindmap(source, statements, index);
  else if (family === 'requirementDiagram') indexRequirements(source, statements, index);
  else return { value: target.label, relationships: [], reason: 'This element has no unambiguous editable label range in this diagram family. Use Edit whole chart to edit its source.' };
  if (!target.id || !['node', 'group', 'participant'].includes(target.kind)) return {
    value: target.label, relationships: [], reason: 'This rendered element cannot be matched to a source node safely. Use Edit whole chart to edit its source.',
  };
  const nodes = index.nodes.filter(node => node.id === target.id);
  const relationships = index.relationships.filter(edge => edge.from === target.id || edge.to === target.id);
  const labels = uniqueLabels(nodes.flatMap(node => node.label ? [node.label] : []));
  const matches = labels.filter(label => normalize(label.value) === normalize(target.label));
  let label = labels.length === 1 && matches.length === 1 ? matches[0] : undefined;
  // A plain flowchart reference has a separate display label syntax, so its identifier never changes.
  if (!labels.length && nodes.length && !nodes.some(node => node.canInsert === false) && /^(?:flowchart(?:-elk)?|graph|block(?:-beta)?)$/.test(family) && normalize(target.label) === target.id) {
    const node = nodes[0]!;
    label = { start: node.end, end: node.end, value: target.id, quote: true, prefix: '[', suffix: ']', original: '' };
  }
  if (family === 'mindmap' && !index.complete) label = undefined;
  const reason = !nodes.length ? 'The native node ID does not identify a source declaration safely. Use Edit whole chart to edit its source.'
    : labels.length > 1 ? 'This node has multiple label declarations. Edit whole chart to resolve them without changing the wrong declaration.'
    : !label ? 'This node has no separate, unambiguous display label. Use Edit whole chart to edit its source.'
    : !index.complete ? 'Some relationship syntax could not be resolved safely. Those connections are left unchanged; Edit whole chart gives access to the complete source.' : undefined;
  return { value: label?.value ?? target.label, label, relationships, reason };
}

function diagramStatements(source: string): SourceStatement[] {
  let statements = sourceStatements(source);
  if (statements[0]?.tokens.length === 1 && statements[0].tokens[0]?.text === '---') {
    const close = statements.findIndex((statement, at) => at > 0 && statement.tokens.length === 1 && statement.tokens[0]?.text === '---');
    statements = close > 0 ? statements.slice(close + 1) : [];
  }
  if (statements[0]?.tokens[0]?.text === 'sequenceDiagram') {
    const start = statements[0].start;
    statements = sourceStatements(source, { sequenceComments: true }).filter(statement => statement.start >= start);
  } else if (/^(?:flowchart(?:-elk)?|graph|block(?:-beta)?|mindmap)$/.test(statements[0]?.tokens[0]?.text ?? '')) {
    const start = statements[0]!.start;
    statements = sourceStatements(source, { flowLabels: true }).filter(statement => statement.start >= start);
  }
  // Accessibility descriptions are prose, even when they contain node-shaped text.
  const descriptions: Array<{ start: number; end: number }> = [];
  for (const statement of statements) {
    if (statement.tokens[0]?.text !== 'accDescr' || statement.tokens[1]?.text !== '{') continue;
    const end = source.indexOf('}', statement.tokens[1].end);
    descriptions.push({ start: statement.tokens[0].start, end: end < 0 ? source.length : end + 1 });
  }
  return statements.flatMap(statement => {
    const tokens = statement.tokens.filter(token => !descriptions.some(range => token.start >= range.start && token.start < range.end));
    return tokens.length ? [{ ...statement, tokens, start: Math.min(statement.start, tokens[0]!.start) }] : [];
  });
}

const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();
const uniqueLabels = (labels: LabelEdit[]): LabelEdit[] => [...new Map(labels.map(label => [`${label.start}:${label.end}`, label])).values()];
const tokenAt = (tokens: SourceToken[], offset: number): number => { let at = 0; while (at < tokens.length && tokens[at]!.start < offset) at++; return at; };
const word = (token?: SourceToken): token is SourceToken & { kind: 'word' } => token?.kind === 'word' && !!token.text && !/^[+!~*<>/=]/.test(token.text);

function labelRange(source: string, start: number, end: number, quote: boolean, prefix?: string, suffix?: string): LabelEdit | undefined {
  const raw = source.slice(start, end);
  if (raw.startsWith('"')) {
    if (!raw.endsWith('"') || raw.length < 2 || /\\["\\]/.test(raw)) return undefined;
    const inner = raw.slice(1, -1);
    // Markdown labels carry formatting syntax, not only the visible node text.
    if (inner.startsWith('`') || inner.includes('"')) return undefined;
    return { start, end, value: decodeLabel(inner), quote: true, original: raw, prefix, suffix };
  }
  if (raw.includes('"') || raw.includes('`') || /[\r\n]/.test(raw)) return undefined;
  return { start, end, value: decodeLabel(raw), quote, original: raw, prefix, suffix };
}

const shapes: ReadonlyArray<readonly [string, string]> = [
  ['[[', ']]'], ['[(', ')]'], ['([', '])'], ['(((', ')))'], ['((', '))'], ['{{', '}}'],
  ['[/', '/]'], ['[\\', '\\]'], ['[/', '\\]'], ['[\\', '/]'], ['[', ']'], ['(', ')'], ['{', '}'], ['>', ']'],
];

function flowNode(source: string, tokens: SourceToken[], at: number): ParsedNode | undefined {
  const id = tokens[at];
  if (!word(id)) return undefined;
  const node: NodeReference = { id: id.text, start: id.start, end: id.end };
  const after = tokens[at + 1];
  if (!after) return { node, next: at + 1 };
  if (after.text === '@' && tokens[at + 2]?.text === '{') return finishNode(source, tokens, node, at + 1);
  for (const [open, close] of shapes) {
    if (!source.startsWith(open, after.start)) continue;
    const start = after.start + open.length;
    let end = start;
    if (source[start] === '"') {
      const string = tokens.find(token => token.start === start && token.kind === 'string');
      if (!string || !source.startsWith(close, string.end)) continue;
      end = string.end;
    } else {
      while (end < source.length && !source.startsWith(close, end) && source[end] !== '\n' && source[end] !== '\r') end++;
      if (!source.startsWith(close, end) || /[[\](){}"]/.test(source.slice(start, end))) continue;
    }
    node.label = labelRange(source, start, end, true);
    return finishNode(source, tokens, node, tokenAt(tokens, end + close.length));
  }
  if ('[({'.includes(after.text)) return undefined;
  return finishNode(source, tokens, node, at + 1);
}

function flowGroup(source: string, tokens: SourceToken[], at: number): { nodes: NodeReference[]; next: number } | undefined {
  const nodes: NodeReference[] = [];
  let next = at;
  while (true) {
    const parsed = flowNode(source, tokens, next);
    if (!parsed) return undefined;
    nodes.push(parsed.node); next = parsed.next;
    if (tokens[next]?.text !== '&') break;
    next++;
  }
  return { nodes, next };
}

function indexFlow(source: string, statements: SourceStatement[], index: SourceIndex): void {
  const directives = new Set(['flowchart', 'flowchart-elk', 'graph', 'block-beta', 'end', 'direction', 'class', 'classDef', 'style', 'linkStyle', 'click', 'accTitle', 'accDescr', 'columns', 'space', 'block']);
  for (const statement of statements) {
    const tokens = statement.tokens, first = tokens[0]!;
    if (directives.has(first.text) || first.text.startsWith('space:')) continue;
    if (first.text === 'subgraph') {
      const node = flowNode(source, tokens, 1);
      if (node) {
        if (!node.node.label && tokens.length > 2) node.node.label = labelRange(source, tokens[2]!.start, statement.end, true, '[', ']');
        index.nodes.push(node.node);
      }
      continue;
    }
    let group = flowGroup(source, tokens, 0);
    if (!group) { index.complete = false; continue; }
    index.nodes.push(...group.nodes);
    let at = group.next;
    while (at < tokens.length) {
      // Native edge IDs precede an operator as e1@-->, and never become node IDs.
      if (word(tokens[at]) && tokens[at + 1]?.text === '@') at += 2;
      const firstArrow = tokens[at];
      if (firstArrow?.kind !== 'arrow') break;
      let operator = firstArrow.text, label: LabelEdit | undefined; at++;
      if (tokens[at]?.text === '|') {
        const open = tokens[at++]!; const labelStart = open.end;
        while (at < tokens.length && tokens[at]!.text !== '|') at++;
        const close = tokens[at++];
        if (!close) { index.complete = false; break; }
        label = labelRange(source, labelStart, close.start, true);
      } else if (['--', '==', '-.'].includes(firstArrow.text)) {
        const labelStart = tokens[at]?.start;
        const labelAt = at;
        while (at < tokens.length && tokens[at]!.kind !== 'arrow') at++;
        if (at < tokens.length && labelStart !== undefined && at > labelAt) {
          label = labelRange(source, labelStart, tokens[at - 1]!.end, true);
          operator += tokens[at++]!.text;
        } else at = labelAt;
      }
      const next = flowGroup(source, tokens, at);
      if (!next) { index.complete = false; break; }
      index.nodes.push(...next.nodes);
      for (const from of group.nodes) for (const to of next.nodes) index.relationships.push({ from: from.id, to: to.id, operator, label, line: statement.line });
      group = next; at = next.next;
    }
    if (tokens.slice(at).some(token => token.kind === 'arrow')) index.complete = false;
    // Block diagrams permit adjacent node declarations without connecting arrows.
    if (first.text !== 'subgraph' && !tokens.some(token => token.kind === 'arrow')) {
      while (at < tokens.length) {
        const next = flowNode(source, tokens, at);
        if (!next || next.next <= at) break;
        index.nodes.push(next.node); at = next.next;
      }
    }
  }
}

function textAfter(source: string, statement: SourceStatement, token: SourceToken, quoted = false): LabelEdit | undefined {
  let start = token.end, end = statement.end;
  while (start < end && /[ \t]/.test(source[start]!)) start++;
  while (end > start && /[ \t]/.test(source[end - 1]!)) end--;
  if (quoted) return labelRange(source, start, end, true);
  const raw = source.slice(start, end);
  return { start, end, value: decodeLabel(raw), quote: false, original: raw };
}

function sequenceText(source: string, statement: SourceStatement, token: SourceToken): LabelEdit | undefined {
  const edit = textAfter(source, statement, token);
  if (!edit) return undefined;
  edit.lineBreak = 'html';
  const prefix = source.startsWith('wrap:', edit.start) ? 5 : source.startsWith('nowrap:', edit.start) ? 7 : 0;
  if (prefix) { edit.start += prefix; edit.original = source.slice(edit.start, edit.end); edit.value = decodeLabel(edit.original); }
  return edit;
}

function indexSequence(source: string, statements: SourceStatement[], index: SourceIndex): void {
  for (const statement of statements) {
    const tokens = statement.tokens, first = tokens[0]!;
    if (first.text === 'participant' || first.text === 'actor') {
      const id = tokens[1]; if (!word(id)) { index.complete = false; continue; }
      // Native sequence IDs can contain punctuation this bounded index does not support.
      // Never reinterpret one composite ID as an existing shorter actor's declaration.
      if (tokens[2] && tokens[2].text !== 'as' && !(tokens[2].text === '@' && tokens[3]?.text === '{')) { index.complete = false; continue; }
      const as = tokens[2]?.text === 'as' ? tokens[2] : undefined;
      let label = as ? sequenceText(source, statement, as) : undefined;
      if (!as && tokens[2]?.text === '@' && tokens[3]?.text === '{' && tokens.at(-1)?.text === '}') {
        const body = tokens.slice(4, -1);
        const aliases = body.some(token => ['{', '['].includes(token.text)) ? [] : body.flatMap((token, at) => ['alias', '"alias"'].includes(token.text) && body[at + 1]?.text === ':' && body[at + 2]?.kind === 'string' ? [body[at + 2]!] : []);
        if (aliases.length === 1) { label = labelRange(source, aliases[0]!.start, aliases[0]!.end, true); if (label) label.lineBreak = 'html'; }
      }
      index.nodes.push({ id: id.text, start: id.start, end: id.end, label });
      continue;
    }
    const arrow = tokens.findIndex(token => token.kind === 'arrow');
    const colon = tokens.findIndex((token, at) => at > arrow && token.text === ':');
    if (arrow === 1 && colon > arrow + 1 && word(first)) {
      const destination = arrow + 1;
      const raw = tokens[destination];
      const to = raw && /^[+-].+/.test(raw.text) ? { ...raw, text: raw.text.slice(1), start: raw.start + 1 } : raw;
      if (!word(to) || destination + 1 !== colon) { index.complete = false; continue; }
      index.nodes.push({ id: first.text, start: first.start, end: first.end }, { id: to.text, start: to.start, end: to.end });
      index.relationships.push({ from: first.text, to: to.text, operator: tokens[arrow]!.text, label: sequenceText(source, statement, tokens[colon]!), line: statement.line });
    } else if (first.text.toLowerCase() === 'note') {
      const over = tokens.findIndex(token => ['over', 'of'].includes(token.text));
      const noteColon = tokens.findIndex(token => token.text === ':');
      if (over < 0 || noteColon < 0) { index.complete = false; continue; }
      const actorTokens = tokens.slice(over + 1, noteColon);
      const single = actorTokens.length === 1 && word(actorTokens[0]);
      const pair = actorTokens.length === 3 && word(actorTokens[0]) && actorTokens[1]?.text === ',' && word(actorTokens[2]);
      if (!single && !pair) { index.complete = false; continue; }
      const from = actorTokens[0]!, to = pair ? actorTokens[2]! : from;
      index.relationships.push({ from: from.text, to: to.text, operator: 'note', label: sequenceText(source, statement, tokens[noteColon]!), line: statement.line });
    }
  }
}

function indexState(source: string, statements: SourceStatement[], index: SourceIndex): void {
  let note: { id: string; line: number; start: number } | undefined;
  for (const statement of statements) {
    const tokens = statement.tokens, first = tokens[0]!;
    if (note) {
      if (first.text === 'end' && tokens[1]?.text === 'note') {
        index.relationships.push({ from: note.id, to: note.id, operator: 'note', text: decodeLabel(source.slice(note.start, statement.start).trim()), line: note.line });
        note = undefined;
      }
      continue;
    }
    if (first.text === 'note') {
      const of = tokens.findIndex(token => token.text === 'of'), id = tokens[of + 1];
      if (of >= 0 && word(id)) {
        index.nodes.push({ id: id.text, start: id.start, end: id.end });
        if (tokens[of + 2]?.text === ':') index.relationships.push({ from: id.text, to: id.text, operator: 'note', label: textAfter(source, statement, tokens[of + 2]!), line: statement.line });
        else note = { id: id.text, line: statement.line, start: statement.end };
      } else index.complete = false;
      continue;
    }
    if (first.text === 'state' && tokens[1]?.kind === 'string' && tokens[2]?.text === 'as' && word(tokens[3])) {
      const id = tokens[3], label = tokens[1];
      index.nodes.push({ id: id.text, start: id.start, end: id.end, label: labelRange(source, label.start, label.end, true) });
    } else if (first.text === 'state' && word(tokens[1])) {
      const id = tokens[1]; index.nodes.push({ id: id.text, start: id.start, end: id.end });
    } else if (word(first) && tokens[1]?.text === ':') {
      index.nodes.push({ id: first.text, start: first.start, end: first.end, label: textAfter(source, statement, tokens[1]) });
    } else {
      const from = stateEndpoint(tokens, 0);
      const operator = from && tokens[from.next];
      const to = from && operator?.kind === 'arrow' ? stateEndpoint(tokens, from.next + 1) : undefined;
      if (!from || !operator || !to) continue;
      if (from.node.id !== '[*]') index.nodes.push(from.node);
      if (to.node.id !== '[*]') index.nodes.push(to.node);
      index.relationships.push({ from: from.node.id, to: to.node.id, operator: operator.text, label: tokens[to.next]?.text === ':' ? textAfter(source, statement, tokens[to.next]!) : undefined, line: statement.line });
    }
  }
  if (note) index.complete = false;
}

function stateEndpoint(tokens: SourceToken[], at: number): ParsedNode | undefined {
  const token = tokens[at];
  if (word(token)) return { node: { id: token.text, start: token.start, end: token.end }, next: at + 1 };
  if (token?.text === '[' && tokens[at + 1]?.text === '*' && tokens[at + 2]?.text === ']') return { node: { id: '[*]', start: token.start, end: tokens[at + 2]!.end }, next: at + 3 };
  return undefined;
}

function indexClass(source: string, statements: SourceStatement[], index: SourceIndex): void {
  let inBody = false;
  for (const statement of statements) {
    const tokens = statement.tokens, first = tokens[0]!;
    if (first.text === '}') { inBody = false; continue; }
    if (inBody) continue;
    if (first.text === 'class') {
      const parsed = flowNode(source, tokens, 1);
      if (parsed) index.nodes.push(parsed.node);
      if (tokens.some(token => token.text === '{') && !tokens.some(token => token.text === '}')) inBody = true;
      continue;
    }
    const arrow = tokens.findIndex(token => token.kind === 'arrow');
    if (arrow < 1 || !word(first)) continue;
    const next = tokens[arrow + 1]?.kind === 'string' ? arrow + 2 : arrow + 1;
    const to = tokens[next]; if (!word(to)) { index.complete = false; continue; }
    const colon = tokens[next + 1]?.text === ':' ? tokens[next + 1] : undefined;
    index.nodes.push({ id: first.text, start: first.start, end: first.end }, { id: to.text, start: to.start, end: to.end });
    index.relationships.push({ from: first.text, to: to.text, operator: tokens[arrow]!.text, label: colon ? textAfter(source, statement, colon) : undefined, line: statement.line });
  }
}

function indexEr(source: string, statements: SourceStatement[], index: SourceIndex): void {
  let inBody = false;
  for (const statement of statements) {
    const tokens = statement.tokens, first = tokens[0]!;
    if (first.text === '}') { inBody = false; continue; }
    if (inBody || first.text === 'erDiagram' || first.text === 'direction') continue;
    const parsed = word(first) && tokens[1]?.text !== '[' ? { node: { id: first.text, start: first.start, end: first.end }, next: 1 } : flowNode(source, tokens, 0);
    if (!parsed) { index.complete = false; continue; }
    index.nodes.push(parsed.node);
    if (tokens[parsed.next]?.text === '{') { inBody = !tokens.some(token => token.text === '}'); continue; }
    const colon = tokens.findIndex(token => token.text === ':');
    if (colon < 2) continue;
    const to = tokens[colon - 1]; if (!word(to)) { index.complete = false; continue; }
    const operator = source.slice(tokens[parsed.next]!.start, to.start).trim();
    if (!/^[|o}{.-]+$/.test(operator) || !/--|\.\./.test(operator)) { index.complete = false; continue; }
    index.nodes.push({ id: to.text, start: to.start, end: to.end });
    index.relationships.push({ from: parsed.node.id, to: to.text, operator, label: textAfter(source, statement, tokens[colon]!, true), line: statement.line });
  }
}

function indexMindmap(source: string, statements: SourceStatement[], index: SourceIndex): void {
  if (statements.some(statement => source.slice(statement.start, statement.tokens[0]!.start).includes('\t'))) { index.complete = false; return; }
  const parents: Array<{ id: string; indent: number }> = [];
  let ordinal = 0;
  for (const statement of statements.slice(1)) {
    const tokens = statement.tokens, first = tokens[0]!;
    if (first.text === ':' || first.text.startsWith(':::')) continue;
    const indentation = source.slice(statement.start, first.start);
    if (!/^[ \t]*$/.test(indentation) || source.slice(statement.start, statement.end).includes(';')) { index.complete = false; continue; }
    const indent = indentation.length;
    const shaped = flowNode(source, tokens, 0);
    let label: LabelEdit | undefined;
    if (shaped?.node.label && shaped.next === tokens.length) label = shaped.node.label;
    else if (!tokens.some(token => token.kind === 'arrow' || ['[', ']', '(', ')', '{', '}'].includes(token.text))) label = labelRange(source, first.start, statement.end, false);
    if (!label) index.complete = false;
    const id = String(ordinal++);
    index.nodes.push({ id, start: first.start, end: statement.end, label });
    while (parents.length && parents[parents.length - 1]!.indent >= indent) parents.pop();
    if (parents.length) index.relationships.push({ from: parents[parents.length - 1]!.id, to: id, operator: 'child', line: statement.line });
    else if (ordinal > 1) index.complete = false;
    parents.push({ id, indent });
  }
}

function indexRequirements(source: string, statements: SourceStatement[], index: SourceIndex): void {
  const kinds = new Set(['requirement', 'functionalRequirement', 'interfaceRequirement', 'performanceRequirement', 'physicalRequirement', 'designConstraint', 'element']);
  let inBody = false;
  for (const statement of statements) {
    const tokens = statement.tokens, first = tokens[0]!;
    if (inBody) { if (tokens.some(token => token.text === '}')) inBody = false; continue; }
    if (kinds.has(first.text) && word(tokens[1])) {
      const id = tokens[1]; index.nodes.push({ id: id.text, start: id.start, end: id.end });
      inBody = tokens.some(token => token.text === '{') && !tokens.some(token => token.text === '}');
    } else if (word(first) && tokens[1]?.text === '-' && word(tokens[2]) && tokens[3]?.kind === 'arrow' && word(tokens[4])) {
      index.relationships.push({ from: first.text, to: tokens[4].text, operator: source.slice(tokens[1].start, tokens[4].start).trim(), line: statement.line });
    }
  }
}

function indexArchitecture(source: string, statements: SourceStatement[], index: SourceIndex): void {
  for (const statement of statements) {
    const tokens = statement.tokens, first = tokens[0]!;
    if (first.text === 'service' || first.text === 'group' || first.text === 'junction') {
      const id = tokens[1]; if (!word(id)) continue;
      const open = tokens.findIndex((token, at) => at > 1 && token.text === '[');
      const close = tokens.findIndex((token, at) => at > open && token.text === ']');
      index.nodes.push({ id: id.text, start: id.start, end: id.end, label: open > 1 && close > open ? labelRange(source, tokens[open]!.end, tokens[close]!.start, false) : undefined });
    } else if (word(first) && tokens[1]?.text === ':') {
      const arrow = tokens.findIndex(token => token.kind === 'arrow');
      const colon = tokens.findIndex((token, at) => at > arrow && token.text === ':');
      const to = tokens[colon + 1];
      if (arrow > 1 && colon > arrow && word(to)) index.relationships.push({ from: first.text, to: to.text, operator: source.slice(tokens[2]!.start, to.start).trim(), line: statement.line });
      else index.complete = false;
    }
  }
}
