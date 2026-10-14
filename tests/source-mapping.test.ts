import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceElement, sequenceAssociations } from '../src/viewer/source-mapping';
import { applyLabel, applyLabelEdits, decodeLabel, encodeLabel, locateSource, replaceSource } from '../src/viewer/source';
const node = (id: string, label: string, kind = 'node') => ({ id, label, kind });

test('source relationships expand grouped endpoints and chains while sharing only the authored edge label', () => {
  const source = 'flowchart LR\r\n A["😀 Old"] & B[Peer] -->|shared| C[Target] & D[Other]\r\n C --> A\r\n X --> Y\r\n';
  const element = sourceElement(source, node('A', '😀 Old')); assert.ok(element.label);
  assert.deepEqual(element.relationships.map(edge => [edge.from, edge.to]), [['A', 'C'], ['A', 'D'], ['C', 'A']]);
  const label = element.relationships[0]!.label!;
  assert.equal(label.start, element.relationships[1]!.label!.start);
  const next = applyLabelEdits(source, [{ edit: element.label, value: 'New [😀]' }, { edit: label, value: 'safe | % #34;' }]);
  assert.equal(next, 'flowchart LR\r\n A["New #91;😀#93;"] & B[Peer] -->|"safe #124; #37; #35;34#59;"| C[Target] & D[Other]\r\n C --> A\r\n X --> Y\r\n');
});

test('native metadata label overrides the bracket label and editing preserves both the shape and ignored bracket text', () => {
  const source = 'flowchart LR\n A["Same"]@{label: "Same", shape: rect} --> B\n';
  const element = sourceElement(source, node('A', 'Same')); assert.ok(element.label);
  assert.equal(element.label.start, source.lastIndexOf('"Same"'));
  assert.equal(applyLabel(source, element.label, 'Changed'), 'flowchart LR\n A["Same"]@{label: "Changed", shape: rect} --> B\n');
  assert.deepEqual(element.relationships.map(edge => [edge.from, edge.to]), [['A', 'B']]);
  assert.equal(sourceElement('flowchart LR\n A@{shape: rect, extra: {label: "A"}}\n', node('A', 'A')).label, undefined);
});

test('unquoted shape label semicolons and arrows never create phantom source nodes or relationships', () => {
  const source = 'flowchart LR\n A[Before; B --> C]\n B --> D\n C --> E\n';
  const a = sourceElement(source, node('A', 'Before; B --> C')); assert.ok(a.label); assert.equal(a.label.value, 'Before; B --> C');
  const b = sourceElement(source, node('B', 'B')); assert.ok(b.label);
  assert.equal(b.label.start, source.indexOf('B --> D') + 1);
  assert.deepEqual(b.relationships.map(edge => [edge.from, edge.to]), [['B', 'D']]);
  assert.deepEqual(sourceElement(source, node('C', 'C')).relationships.map(edge => [edge.from, edge.to]), [['C', 'E']]);
});

test('frontmatter, multiline directives and accessibility prose are excluded without changing source offsets', () => {
  const source = '---\ntitle: A --> B\n---\n%%{init: {\n "themeVariables": { "fontFamily": "A --> B" }\n}}%%\nflowchart LR\naccDescr {\nA --> B\n}\nA --> C\n';
  const a = sourceElement(source, node('A', 'A')); assert.ok(a.label);
  assert.equal(a.label.start, source.lastIndexOf('A --> C') + 1);
  assert.deepEqual(a.relationships.map(edge => [edge.from, edge.to]), [['A', 'C']]);
  assert.equal(sourceElement(source, node('B', 'B')).label, undefined);
});

test('sequence labels remain unquoted, retain wrapping controls and comments, and encode intended breaks for native layout', () => {
  const source = 'sequenceDiagram\n participant A as nowrap:Speaker\n participant B\n participant C\n A->>B:wrap:Don\'t stop # keep comment\n Note over A,C: Shared note\n B-->>A: Reply\n';
  const a = sourceElement(source, node('A', 'Speaker', 'participant')); assert.ok(a.label);
  assert.deepEqual(a.relationships.map(edge => [edge.from, edge.to]), [['A', 'B'], ['A', 'C'], ['B', 'A']]);
  assert.equal(a.relationships[0]!.label!.value, "Don't stop");
  const next = applyLabelEdits(source, [{ edit: a.label, value: 'New "speaker"\nline' }, { edit: a.relationships[0]!.label!, value: 'wrap:literal\nnext' }]);
  assert.equal(next, 'sequenceDiagram\n participant A as nowrap:New #34;speaker#34;<br/>line\n participant B\n participant C\n A->>B:wrap:wrap#58;literal<br/>next # keep comment\n Note over A,C: Shared note\n B-->>A: Reply\n');
});

test('state descriptions with apostrophes, unmatched quotes and trailing backslashes cannot consume following transitions', () => {
  const source = 'stateDiagram-v2\n state "State" as S\n S --> T: "Don\'t stop\\\n C --> D: Go\n';
  const s = sourceElement(source, node('S', 'State')); assert.equal(s.relationships.length, 1);
  const edit = s.relationships[0]!.label!; assert.equal(edit.value, '"Don\'t stop\\'); assert.equal(edit.end, source.indexOf('\n C --> D'));
  assert.equal(applyLabel(source, edit, 'Changed'), 'stateDiagram-v2\n state "State" as S\n S --> T: Changed\n C --> D: Go\n');
});

test('state pseudo endpoints and note bodies are attached information, never parsed as editable declarations', () => {
  const source = 'stateDiagram-v2\n state "State" as S\n [*] --> S\n S --> T: Next\n note right of S\n C --> D\n end note\n';
  const s = sourceElement(source, node('S', 'State')); assert.equal(s.relationships.length, 3);
  assert.deepEqual(s.relationships.map(edge => [edge.from, edge.to]), [['[*]', 'S'], ['S', 'T'], ['S', 'S']]);
  assert.equal(s.relationships[2]!.text, 'C --> D'); assert.equal(s.relationships[2]!.label, undefined);
  assert.deepEqual(sourceElement(source, node('C', 'C')).relationships, []);
});

test('class and ER display aliases preserve members, attributes, multiplicities and cardinality operators', () => {
  const classes = 'classDiagram-v2\n class A["Old"] { +String title }\n A "1" --> "many" B : owns\n B --> C : other\n';
  const a = sourceElement(classes, node('A', 'Old')); assert.ok(a.label); assert.equal(a.relationships.length, 1);
  assert.equal(applyLabel(classes, a.label, 'New [x]'), 'classDiagram-v2\n class A["New #91;x#93;"] { +String title }\n A "1" --> "many" B : owns\n B --> C : other\n');
  const er = 'erDiagram\n CUSTOMER["Old"] { string id PK }\n CUSTOMER ||--o{ ORDER : "places"\n ORDER ||--|{ LINE_ITEM : has\n';
  const customer = sourceElement(er, node('CUSTOMER', 'Old')); assert.ok(customer.label);
  assert.equal(customer.relationships[0]!.operator, '||--o{');
  assert.equal(applyLabel(er, customer.label, 'New & Name'), 'erDiagram\n CUSTOMER["New #38; Name"] { string id PK }\n CUSTOMER ||--o{ ORDER : "places"\n ORDER ||--|{ LINE_ITEM : has\n');
});

test('unsupported native elements and conflicting declarations expose no guessed writable node span', () => {
  assert.equal(sourceElement('pie\n "First": 1\n', node('slice-1', 'First', 'slice')).label, undefined);
  assert.equal(sourceElement('flowchart LR\n A[First] --> B\n A[Second] --> C\n', node('A', 'Second')).label, undefined);
  assert.equal(sourceElement('flowchart LR\n A["`**Bold**`"] --> B\n', node('A', 'Bold')).label, undefined);
});

test('untouched labels and literal entity-looking text retain their source representation', () => {
  const source = 'flowchart LR\r\n A["Keep<br/>line &quot; #35;34; 😀"] --> B\r\n\r\n';
  const a = sourceElement(source, node('A', 'Keep line " #34; 😀')); assert.ok(a.label);
  assert.equal(applyLabel(source, a.label, a.label.value), source);
  const literal = '&quot; <br/> #34; &amp; 😀'; assert.equal(decodeLabel(encodeLabel(literal)), literal);
});

test('source splices reject stale and overlapping ranges, and fenced saves retain CRLF and trailing blank lines', () => {
  const source = 'flowchart LR\r\n A["Old"] --> B\r\n\r\n';
  const a = sourceElement(source, node('A', 'Old')); assert.ok(a.label);
  assert.throws(() => applyLabel(source.replace('Old', 'New'), a.label!, 'Changed'), /source changed/);
  assert.throws(() => applyLabelEdits(source, [{ edit: a.label!, value: 'First' }, { edit: { ...a.label!, start: a.label!.start + 1, original: undefined }, value: 'Second' }]), /overlap/);
  const note = '# Header\r\n```mermaid\r\n' + source + '```\r\nTail\r\n';
  const snapshot = locateSource(note), next = applyLabel(source, a.label, 'Changed');
  assert.equal(replaceSource(note, snapshot, next), '# Header\r\n```mermaid\r\nflowchart LR\r\n A["Changed"] --> B\r\n\r\n```\r\nTail\r\n');
  assert.throws(() => replaceSource(note + 'new text', snapshot, next), /note changed/);
});

test('sequence associations preserve right-of and over actor identities and retain duplicate events for conservative matching', () => {
  const source = 'sequenceDiagram\n participant A as Alpha\n participant B as Beta\n participant C as Gamma\n A->>B: Repeated\n B->>A: Repeated\n Note right of A: Local note\n Note over A,C: Shared note\n';
  const associations = sequenceAssociations(source)!;
  assert.deepEqual(associations.participants, [{ id: 'A', label: 'Alpha' }, { id: 'B', label: 'Beta' }, { id: 'C', label: 'Gamma' }]);
  assert.deepEqual(associations.messages, [{ from: 'A', to: 'B', label: 'Repeated', direction: 'forward' }, { from: 'B', to: 'A', label: 'Repeated', direction: 'forward' }]);
  assert.deepEqual(associations.notes, [{ participants: ['A'], label: 'Local note' }, { participants: ['A', 'C'], label: 'Shared note' }]);
  const ambiguous = sequenceAssociations('sequenceDiagram\n participant A as One\n participant A as Two\n participant B\n A->>B: Message\n Note right of A: Note\n')!;
  assert.deepEqual(ambiguous.participants, [{ id: 'B', label: 'B' }]); assert.deepEqual(ambiguous.messages, []); assert.deepEqual(ambiguous.notes, []);
});

for (const separator of ['|', '&']) {
  test(`verified native composite sequence actor A${separator}B is never reinterpreted as declarations or note attachments for A/B`, () => {
    const source = `sequenceDiagram\n participant A${separator}B as A\n participant A\n participant B\n Note over A${separator}B: Only composite\n A${separator}B->>B: Composite message\n A->>B: Known edge\n`;
    const a = sourceElement(source, node('A', 'A', 'participant'));
    assert.equal(a.label, undefined);
    assert.deepEqual(a.relationships.map(edge => [edge.from, edge.to, edge.label?.value]), [['A', 'B', 'Known edge']]);
    const associations = sequenceAssociations(source)!;
    assert.deepEqual(associations.participants, [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }]);
    assert.deepEqual(associations.notes, []);
    assert.deepEqual(associations.messages, [{ from: 'A', to: 'B', label: 'Known edge', direction: 'forward' }]);
    assert.equal(sourceElement(source, node(`A${separator}B`, 'A', 'participant')).label, undefined);
    assert.equal(applyLabel(source, a.relationships[0]!.label!, 'Safe update'), `sequenceDiagram\n participant A${separator}B as A\n participant A\n participant B\n Note over A${separator}B: Only composite\n A${separator}B->>B: Composite message\n A->>B: Safe update\n`);
  });
}

test('duplicate source note labels remain explicit ambiguity for the native association consumer', () => {
  const associations = sequenceAssociations('sequenceDiagram\n participant A\n participant B\n Note right of A: Same note\n Note right of B: Same note\n')!;
  assert.deepEqual(associations.notes, [{ participants: ['A'], label: 'Same note' }, { participants: ['B'], label: 'Same note' }]);
});
