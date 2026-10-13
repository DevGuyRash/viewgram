import { StreamLanguage, type StringStream } from '@codemirror/language';

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
    if (next === '"') { state.quote = stream.next() as string; quoted(stream, state); return 'string'; }
    if (stream.match(/^#(?:\d+|x[\da-f]+);/i)) return 'escape';
    if (stream.match(/^(?:<?[-=.~]{2,}[>ox]?|[-=]{1,2}>[>]?|\|[|o}{]+[-.]{2}[|o}{]+|:::)/)) return 'operator';
    if (stream.match(/^[\[\](){}|:,&@]/)) return 'punctuation';
    if (stream.match(/^-?\d+(?:\.\d+)?(?:%|px)?\b/)) return 'number';
    if (stream.match(/^[\w\u0080-\uffff][\w\u0080-\uffff.-]*/)) return keywords.has(stream.current()) ? 'keyword' : 'variableName';
    stream.next(); return null;
  },
  languageData: { commentTokens: { line: '%%' } },
});

function quoted(stream: StringStream, state: { quote: string | null }): void {
  while (!stream.eol()) {
    const char = stream.next();
    if (char === state.quote) { state.quote = null; break; }
  }
}
