import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { SemanticHighlighter, type SemanticTarget } from '../src/viewer/semantics';
function setup(content: string, family = 'flowchart-v2') {
  const window = new Window();
  window.document.body.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" id="native" aria-roledescription="${family}">${content}</svg>`;
  const svg = window.document.querySelector('svg')! as unknown as SVGSVGElement;
  const get = (id: string) => svg.querySelector(`[id="${id}"]`)!;
  const hover = (id: string) => get(id).dispatchEvent(new window.PointerEvent('pointerover', { bubbles: true }) as unknown as Event);
  return { window, svg, get, hover };
}
const graph = `<g class="nodes"><g class="node" id="flowchart-A-0"><rect/><text>A</text></g><g class="node" id="flowchart-B-1"><rect/><text>B</text></g><g class="node" id="flowchart-C-2"><rect/><text>C</text></g><g class="node" id="flowchart-D-3"><rect/><text>D</text></g></g><path id="L_A_B_0" class="flowchart-link" marker-end="url(#arrow)"/><path id="L_C_A_0" class="flowchart-link" marker-end="url(#arrow)"/><g class="edgeLabel"><g data-id="L_A_B_0" id="edge-label"><text>go</text></g></g>`;
test('native nodes highlight their exact incoming and outgoing connections and edge labels', () => {
  const { svg, get, hover } = setup(graph); const highlighter = new SemanticHighlighter(svg);
  hover('flowchart-A-0');
  assert.ok(get('flowchart-A-0').classList.contains('kmv-semantic-active'));
  assert.equal(get('L_A_B_0').getAttribute('data-kmv-relation'), 'outgoing');
  assert.equal(get('L_C_A_0').getAttribute('data-kmv-relation'), 'incoming');
  assert.ok(get('edge-label').classList.contains('kmv-semantic-related'));
  assert.ok(get('flowchart-D-3').classList.contains('kmv-semantic-dim'));
  hover('L_A_B_0');
  assert.ok(get('flowchart-A-0').classList.contains('kmv-semantic-related'));
  assert.ok(get('flowchart-B-1').classList.contains('kmv-semantic-related'));
  assert.ok(get('L_C_A_0').classList.contains('kmv-semantic-dim'));
  highlighter.dispose();
});
test('bidirectional, undirected, reversed and dashed connections retain their native distinctions', () => {
  const { svg, get, hover } = setup(graph + `<path id="both" data-from="A" data-to="B" class="flowchart-link edge-pattern-dashed" marker-start="url(#arrow)" marker-end="url(#arrow)" stroke-dasharray="3 3"/><path id="none" data-from="A" data-to="C" class="flowchart-link"/><path id="reverse" data-from="A" data-to="D" class="flowchart-link" marker-start="url(#arrow)"/>`);
  const h = new SemanticHighlighter(svg); hover('flowchart-A-0');
  assert.equal(get('both').getAttribute('data-kmv-relation'), 'both');
  assert.equal(get('none').getAttribute('data-kmv-relation'), 'undirected');
  assert.equal(get('reverse').getAttribute('data-kmv-relation'), 'incoming');
  assert.equal(get('both').getAttribute('data-kmv-line'), 'dashed');
  assert.equal(get('both').getAttribute('stroke-dasharray'), '3 3'); h.dispose();
});
test('ambiguous underscore edge IDs never invent topology', () => {
  const { svg, get, hover } = setup(`<g class="node" id="flowchart-A_B-0"><text>AB</text></g><g class="node" id="flowchart-C-1"><text>C</text></g><g class="node" id="flowchart-A-2"><text>A</text></g><g class="node" id="flowchart-B_C-3"><text>BC</text></g><path class="flowchart-link" id="L_A_B_C_0" marker-end="url(#arrow)"/>`);
  const h = new SemanticHighlighter(svg); hover('L_A_B_C_0');
  assert.equal(svg.querySelectorAll('.node.kmv-semantic-related').length, 0); assert.ok(get('L_A_B_C_0').classList.contains('kmv-semantic-active')); h.dispose();
});
test('sequence messages use explicit actor metadata and preserve return-line styling', () => {
  const { svg, get, hover } = setup(`<g data-et="participant" data-id="Alice" id="alice"><rect/><text>Alice</text></g><g data-et="participant" data-id="Bob" id="bob"><rect/><text>Bob</text></g><line class="actor-line" name="Alice" id="life"/><text class="messageText" id="msgtext">Reply</text><line id="reply" data-et="message" data-id="i1" data-from="Bob" data-to="Alice" class="messageLine1" marker-end="url(#arrowhead)"/>`, 'sequence');
  const h = new SemanticHighlighter(svg); hover('alice');
  assert.equal(get('reply').getAttribute('data-kmv-relation'), 'incoming'); assert.ok(get('life').classList.contains('kmv-semantic-active'));
  hover('msgtext'); assert.ok(get('reply').classList.contains('kmv-semantic-active')); assert.ok(get('bob').classList.contains('kmv-semantic-related')); h.dispose();
});
test('chart items use semantic groups without invented graph relationships', () => {
  const { svg, get, hover } = setup(`<g class="data-point" id="point"><circle/><text>Reach</text></g><g class="data-point" id="other"><circle/><text>Value</text></g>`, 'quadrantChart');
  const h = new SemanticHighlighter(svg); hover('point'); assert.equal(get('point').getAttribute('data-kmv-kind'),'data-point'); assert.ok(get('other').classList.contains('kmv-semantic-dim')); assert.equal(svg.querySelectorAll('[data-kmv-relation]').length, 0); h.dispose();
});
test('double click returns source identity, leaves links alone, and SVG movement retains events', () => {
  const { window, svg, get, hover } = setup(graph + '<a id="link" href="#note"><text>Note</text></a>'); const original = svg.outerHTML; const edits: SemanticTarget[] = []; let links = 0;
  get('link').addEventListener('dblclick', () => links++); const h = new SemanticHighlighter(svg, target => edits.push(target));
  const dialog = window.document.createElement('dialog'); window.document.body.append(dialog); dialog.append(svg as never); hover('flowchart-A-0');
  get('flowchart-A-0').dispatchEvent(new window.MouseEvent('dblclick', { bubbles:true, cancelable:true }) as unknown as Event);
  get('link').dispatchEvent(new window.MouseEvent('dblclick', { bubbles:true, cancelable:true }) as unknown as Event);
  assert.deepEqual(edits,[{id:'A',label:'A',kind:'node'}]); assert.equal(links,1); assert.ok(get('flowchart-A-0').classList.contains('kmv-semantic-active'));
  h.dispose(); h.dispose(); assert.equal(svg.outerHTML,original); get('flowchart-A-0').dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true}) as unknown as Event); assert.equal(edits.length,1);
});
test('unknown families get conservative local shape or label hover and blank background clears', () => {
  const { window, svg, get, hover } = setup('<g id="custom"><rect/><text id="caption">Value</text></g>', 'unknown'); const h = new SemanticHighlighter(svg);
  hover('caption'); assert.ok(get('custom').classList.contains('kmv-semantic-active')); svg.dispatchEvent(new window.PointerEvent('pointerover',{bubbles:true}) as unknown as Event); assert.equal(svg.querySelectorAll('.kmv-semantic-active').length,0); h.dispose();
});
test('prefixed class and ER identities resolve exact endpoints while cardinalities stay undirected', () => {
  const { svg, get, hover } = setup(`<g class="node" id="native-entity-NOTE-0"><text>Note</text></g><g class="node" id="native-entity-DIAGRAM-1"><text>Diagram</text></g><path class="relationshipLine" id="native-id_entity-NOTE-0_entity-DIAGRAM-1_0" marker-start="url(#onlyOneStart)" marker-end="url(#zeroOrMoreEnd)"/>`, 'erDiagram');
  const h = new SemanticHighlighter(svg); hover('native-entity-NOTE-0'); assert.equal(get('native-id_entity-NOTE-0_entity-DIAGRAM-1_0').getAttribute('data-kmv-relation'),'undirected'); h.dispose();
});
test('architecture arrow triangles and mindmap IDs preserve encoded relationships', () => {
  const { svg, get, hover } = setup(`<g class="architecture-service" id="native-service-a"><text>First</text></g><g class="architecture-service" id="native-service-b"><text>Second</text></g><g class="architecture-edges"><g><path class="edge" id="native-L_a_b_0" d="M 0,0 L 50,0 L 100,0"/><polygon class="arrow" points="10,5 0,10 0,0" transform="translate(92,-5)"/></g></g>`, 'architecture');
  const h = new SemanticHighlighter(svg); hover('native-service-a'); assert.equal(get('native-L_a_b_0').getAttribute('data-kmv-relation'),'outgoing'); h.dispose();
  const mind = setup('<g class="mindmap-node"><path id="native-node_0"/><text>Root</text></g><g class="mindmap-node"><path id="native-node_1"/><text>Leaf</text></g><path class="edge" id="native-edge_0_1"/>','mindmap'); const m = new SemanticHighlighter(mind.svg); mind.hover('native-node_0'); assert.equal(mind.get('native-edge_0_1').getAttribute('data-kmv-relation'),'undirected'); m.dispose();
});
test('Gantt labels, packet fields and radar legends belong to their data marks', () => {
  for (const [family, markup, mark, label, kind] of [
    ['gantt','<rect class="task task0" id="native-a"/><text id="native-a-text">Plan</text>','native-a','native-a-text','task'],
    ['packet','<g><rect class="packetBlock" id="field"/><text class="packetLabel" id="label">Header</text><text class="packetByte start">0</text></g>','field','label','field'],
    ['radar','<polygon class="radarCurve-0" id="curve"/><g id="legend"><rect class="radarLegendBox-0"/><text>Coverage</text></g>','curve','legend','series'],
  ] as const) {
    const { svg, get, hover } = setup(markup, family); const h = new SemanticHighlighter(svg); hover(label); assert.ok(get(mark).classList.contains('kmv-semantic-active')); assert.equal(get(mark).getAttribute('data-kmv-kind'),kind); h.dispose();
  }
});
test('clear removes export emphasis without losing native style, attributes or later hover', () => {
  const { svg, get, hover } = setup(graph); const native = get('flowchart-A-0'); native.setAttribute('style','opacity:.8;filter:grayscale(.1)');
  const h = new SemanticHighlighter(svg); hover('flowchart-A-0'); h.clear(); assert.equal(svg.querySelectorAll('.kmv-semantic-active,.kmv-semantic-dim,[data-kmv-relation]').length,0); assert.equal(native.getAttribute('style'),'opacity:.8;filter:grayscale(.1)'); hover('flowchart-A-0'); assert.ok(native.classList.contains('kmv-semantic-active')); h.dispose();
});
test('legacy sequence actor labels and lifelines stay together without fabricating message endpoints', () => {
  const { svg, get, hover } = setup('<g><line class="actor-line" name="Alice" id="life"/><g id="actor"><rect class="actor actor-top" name="Alice"/><text class="actor" id="label">Alice</text></g></g><text class="messageText" id="message">Hello</text><line class="messageLine0" id="opaque" marker-end="url(#arrowhead)"/>','sequence');
  const h = new SemanticHighlighter(svg); hover('label'); assert.ok(get('life').classList.contains('kmv-semantic-active')); assert.ok(!get('opaque').classList.contains('kmv-semantic-related')); hover('message'); assert.ok(get('opaque').classList.contains('kmv-semantic-active')); h.dispose();
});
test('explicit sequence open and cross messages retain sender direction and native type', () => {
  const {svg,get,hover}=setup('<g data-et="participant" data-id="Alice" id="alice"><text>Alice</text></g><g data-et="participant" data-id="Bob" id="bob"><text>Bob</text></g><line id="open" class="messageLine0" data-from="Alice" data-to="Bob"/><line id="dotted-open" class="messageLine1" data-from="Alice" data-to="Bob"/><line id="cross" class="messageLine0" data-from="Alice" data-to="Bob" marker-end="url(#crosshead)"/><line id="dotted-cross" class="messageLine1" data-from="Alice" data-to="Bob" marker-end="url(#crosshead)"/>','sequence');
  const h=new SemanticHighlighter(svg);hover('alice');
  for(const id of ['open','dotted-open','cross','dotted-cross']) assert.equal(get(id).getAttribute('data-kmv-relation'),'outgoing');
  assert.equal(get('dotted-cross').getAttribute('data-kmv-line'),'dashed');assert.equal(get('cross').getAttribute('marker-end'),'url(#crosshead)');
  hover('bob');for(const id of ['open','dotted-open','cross','dotted-cross']) assert.equal(get(id).getAttribute('data-kmv-relation'),'incoming');h.dispose();
});
test('undirected self loops stay distinct from directed self loops', () => {
  const {svg,get,hover}=setup('<g class="node" id="flowchart-A-0"><text>A</text></g><path id="undirected-loop" class="flowchart-link" data-from="A" data-to="A"/><path id="directed-loop" class="flowchart-link" data-from="A" data-to="A" marker-end="url(#arrow)"/>');
  const h=new SemanticHighlighter(svg);hover('flowchart-A-0');assert.equal(get('undirected-loop').getAttribute('data-kmv-relation'),'undirected');assert.equal(get('directed-loop').getAttribute('data-kmv-relation'),'both');h.dispose();
});
test('duplicate renderer edge IDs leave their ambiguous labels locally highlighted', () => {
  const {svg,get,hover}=setup(graph+'<path id="duplicate" class="flowchart-link" data-from="A" data-to="B" marker-end="url(#arrow)"/><path id="duplicate" class="flowchart-link" data-from="C" data-to="D" marker-end="url(#arrow)"/><g class="edgeLabel" id="ambiguous-label" data-id="duplicate"><text>Ambiguous</text></g>');
  const h=new SemanticHighlighter(svg);hover('ambiguous-label');assert.equal(svg.querySelectorAll('.node.kmv-semantic-related').length,0);assert.ok(get('ambiguous-label').classList.contains('kmv-semantic-active'));h.dispose();
});
