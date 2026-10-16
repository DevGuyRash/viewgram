import { HighlightStyle, StreamLanguage, syntaxTree, type StringStream } from '@codemirror/language';
import type { Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { tags } from '@lezer/highlight';

const keywords = new Set(('flowchart graph block-beta sequenceDiagram stateDiagram stateDiagram-v2 classDiagram erDiagram mindmap architecture-beta requirementDiagram gantt journey timeline pie gitGraph quadrantChart xychart-beta radar-beta packet-beta kanban treemap-beta sankey-beta C4Context C4Container C4Component C4Dynamic C4Deployment title accTitle accDescr subgraph end direction class classDef style linkStyle click participant actor activate deactivate note over left right of as loop alt else opt par and critical option break rect box autonumber state fork join choice concurrent composite namespace interface enum relationship service group junction requirement functionalRequirement interfaceRequirement performanceRequirement physicalRequirement designConstraint element id text risk verifymethod type docref contains copies derives satisfies verifies refines traces section dateFormat axisFormat excludes todayMarker milestone done active crit commit branch checkout merge cherry-pick reset showData x-axis y-axis line bar xyChart init config').split(' '));

/** Highlighting is deliberately lexical. The host Mermaid parser alone validates syntax. */
export const mermaidLanguage = StreamLanguage.define<{ quote: string | null }>({
  name: 'Mermaid',
  startState: () => ({ quote: null }),
  token(stream, state) {
    if (state.quote) { quoted(stream, state); return 'string'; }
    if (stream.eatSpace()) return null;
    if (stream.match('%%')) { stream.skipToEnd(); return 'comment'; }
    const next = stream.peek();
    if (next === '"') { stream.next(); state.quote = next; quoted(stream, state); return 'string'; }
    if (stream.match(/^#(?:\d+|x[\da-f]+);/i)) return 'escape';
    if (stream.match(/^(?:<?[-=.~]{2,}[>ox]?|[-=]{1,2}>[>]?|\|[|o}{]+[-.]{2}[|o}{]+|:::)/)) return 'operator';
    if (stream.match(/^[[\](){}|:,&@]/)) return 'punctuation';
    if (stream.match(/^-?\d+(?:\.\d+)?(?:%|px)?\b/)) return 'number';
    if (stream.match(/^[\w\u0080-\uffff][\w\u0080-\uffff.-]*/)) return keywords.has(stream.current()) ? 'keyword' : 'variableName';
    stream.next(); return null;
  },
  languageData: { commentTokens: { line: '%%' } },
});

const tokenStyles = {
  keyword: { tag: tags.keyword, color: 'var(--code-keyword, var(--kmv-accent))', fontWeight: '600' },
  string: { tag: tags.string, color: 'var(--code-string, var(--kmv-accent))' },
  comment: { tag: tags.comment, color: 'var(--code-comment, var(--kmv-muted))' },
  number: { tag: tags.number, color: 'var(--code-value, var(--kmv-accent))' },
  operator: { tag: tags.operator, color: 'var(--code-operator, var(--kmv-accent))' },
  punctuation: { tag: tags.punctuation, color: 'var(--code-punctuation, var(--kmv-muted))' },
  variableName: { tag: tags.variableName, color: 'var(--code-normal, var(--kmv-text))' },
  escape: { tag: tags.escape, color: 'var(--code-operator, var(--kmv-accent))' },
};

/** The host theme owns token colors; fallbacks use the viewer's readable theme palette. */
export const mermaidHighlightStyle = HighlightStyle.define(Object.values(tokenStyles), { scope: mermaidLanguage });
const tokenMarks = new Map(Object.entries(tokenStyles).map(([name, { tag }]) => {
  const className = mermaidHighlightStyle.style([tag]);
  return [name, className ? Decoration.mark({ class: className }) : null] as const;
}));

/** Obsidian's stream parser keeps token names but uses legacy highlighting metadata. */
export const mermaidSourceHighlighting = [
  mermaidHighlightStyle.module ? EditorView.styleModule.of(mermaidHighlightStyle.module) : [],
  ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    private tree: ReturnType<typeof syntaxTree>;
    constructor(view: EditorView) {
      this.tree = syntaxTree(view.state);
      this.decorations = highlightTokens(view, this.tree);
    }
    update(update: ViewUpdate): void {
      const tree = syntaxTree(update.state);
      if (tree !== this.tree || update.docChanged || update.viewportChanged) {
        this.tree = tree;
        this.decorations = highlightTokens(update.view, tree);
      }
    }
  }, { decorations: plugin => plugin.decorations }),
];

function highlightTokens(view: EditorView, tree: ReturnType<typeof syntaxTree>): DecorationSet {
  if (mermaidHighlightStyle.scope && !mermaidHighlightStyle.scope(tree.type)) return Decoration.none;
  const ranges: Range<Decoration>[] = [];
  for (const visible of view.visibleRanges) {
    tree.iterate({ from: visible.from, to: visible.to, enter(node) {
      const mark = tokenMarks.get(node.type.name);
      if (!mark) return;
      const from = Math.max(visible.from, node.from), to = Math.min(visible.to, node.to);
      if (from < to) ranges.push(mark.range(from, to));
      return false;
    } });
  }
  return Decoration.set(ranges, true);
}

function quoted(stream: StringStream, state: { quote: string | null }): void {
  while (!stream.eol()) {
    const char = stream.next();
    if (char === state.quote) { state.quote = null; break; }
  }
}
