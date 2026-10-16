import { SequenceGeometry } from './sequence-geometry';
import { sequenceAssociations } from './source-mapping';
import { createSvgElement } from './dom';

/** Semantic interaction over the original SVG. Never imports Mermaid or rebuilds its DOM. */
export interface SemanticTarget { id: string; label: string; kind: string }
export interface SemanticOptions { lineHitWidth?: number; enabled?: boolean }
type Direction = 'forward' | 'reverse' | 'both' | 'undirected';
type Relation = 'incoming' | 'outgoing' | 'both' | 'undirected';
interface Item {
  target: SemanticTarget;
  elements: Set<Element>;
  links: Set<Item>;
  related: Set<Item>;
  edge?: { from?: Item; to?: Item; direction: Direction };
}
const ignored = 'defs, marker, clipPath, mask, pattern, symbol, style, script';
const interactive = 'a, summary, button, input, textarea, select, [role="button"], [role="link"], .clickable, [onclick]';
const drawable = 'rect, circle, ellipse, polygon, polyline, path, line, text, foreignObject, image, use';
const transient = ['kmv-semantic-active', 'kmv-semantic-related', 'kmv-semantic-dim', 'kmv-semantic-incoming', 'kmv-semantic-outgoing', 'kmv-semantic-both', 'kmv-semantic-undirected'];
type Emphasis = 'active' | 'context' | Relation | 'related';
const hitStrokeProperty = '--kmv-semantic-hit-stroke-width';
const textOf = (el: Element): string => (el.textContent || '').replace(/\s+/g, ' ').trim();
const labelOf = (el: Element): string => {
  const parts: string[] = [];
  const visit = (node: Node): void => {
    if (node.nodeType === 3) { parts.push(node.textContent || ''); return; }
    const element = node.nodeType === 1 ? node as Element : undefined;
    if (element?.localName === 'br') { parts.push(' '); return; }
    const block = element && ['tspan', 'text', 'p', 'div'].includes(element.localName);
    if (block) parts.push(' ');
    for (const child of node.childNodes) visit(child);
    if (block) parts.push(' ');
  };
  visit(el); return parts.join('').replace(/\s+/g, ' ').trim();
};
const attr = (el: Element, ...names: string[]): string => names.map(name => el.getAttribute(name)).find(Boolean) || '';

/** Host editors outside the owned island do not make its native SVG interactive. */
export function interactiveAncestor(target: EventTarget | null | undefined, boundary: Element): Element | undefined {
  const element = target && (target as Node).nodeType === 1 ? target as Element : undefined;
  if (!element || !boundary.contains(element)) return undefined;
  let editable = true;
  for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.matches(interactive)) return ancestor;
    const contentEditable = ancestor.getAttribute('contenteditable')?.toLowerCase();
    // A noneditable descendant masks editable ancestors, but never native controls.
    if (contentEditable === 'false') editable = false;
    else if (editable && (contentEditable === '' || contentEditable === 'true' || contentEditable === 'plaintext-only')) return ancestor;
    if (ancestor === boundary) break;
  }
  return undefined;
}

export class SemanticHighlighter {
  readonly family: string;
  private readonly items: Item[] = [];
  private readonly byElement = new Map<Element, Item>();
  private readonly aliases = new Map<string, Set<Item>>();
  private readonly attributes = new Map<Element, Map<string, string | null>>();
  private readonly classes = new Map<Element, { original: string | null; originallyAbsent: boolean; added: Set<string> }>();
  private readonly listeners: Array<[string, EventListener]> = [];
  private readonly parents = new Map<Item, Set<Item>>();
  private readonly children = new Map<Item, Set<Item>>();
  private readonly emphasis = new Map<Item, Emphasis>();
  private readonly dimmed = new Set<Item>();
  private readonly hitTargets = new Map<Element, Element>();
  private readonly nativeFilters = new Map<Element, { original: string | null; applied: string; value: string; priority: string; appliedFilter: string }>();
  private sequenceGeometry?: SequenceGeometry<Item>;
  private readonly sourceEdges = new Map<Item, NonNullable<Item['edge']>>();
  private readonly sourceNotes: Array<[Item, Item]> = [];
  private active?: Item;
  private enabled: boolean;
  private lineHitWidth: number;
  private viewportScale = 1;
  private hitStyle?: { original: string | null; applied: string; value: string; priority: string; externalChange: boolean };
  private disposed = false;

  constructor(readonly svg: SVGSVGElement, readonly onEdit?: (target: SemanticTarget) => void, options: SemanticOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.lineHitWidth = this.hitWidth(options.lineHitWidth ?? 12);
    this.family = (attr(svg, 'aria-roledescription', 'data-diagram-type') || 'diagram').toLowerCase();
    this.mark(svg, 'data-kmv-family', this.family);
    this.indexNodes();
    this.indexSequenceGeometry();
    this.indexEdges();
    this.indexFamilies();
    this.indexFallback();
    this.indexContainment();
    this.updateHitStrokeWidth();
    this.indexHitTargets();
    this.listen('pointerover', event => {
      const pointer = event as PointerEvent;
      this.highlight(!this.enabled || pointer.buttons ? undefined : this.find(event.target));
    });
    this.listen('pointerout', event => {
      const next = (event as PointerEvent).relatedTarget as Node | null;
      if (!next || !svg.contains(next)) this.clear();
    });
    this.listen('pointerleave', () => this.clear());
    this.listen('pointerdown', () => this.clear());
    this.listen('pointercancel', () => this.clear());
    this.listen('dblclick', event => {
      const target = this.element(event.target);
      if (!onEdit || !target || interactiveAncestor(target, svg) || interactiveAncestor(this.hitTargets.get(target), svg)) return;
      const item = this.find(target);
      if (!item) return;
      event.preventDefault(); event.stopPropagation();
      onEdit({ ...item.target });
    });
  }

  private select(selector: string): Element[] {
    return [...this.svg.querySelectorAll(selector)].filter(el => !el.closest(ignored));
  }
  private element(target: EventTarget | null): Element | undefined {
    // ownerDocument-independent: the original SVG can move between inline and modal containers.
    return target && (target as Node).nodeType === 1 ? target as Element : undefined;
  }
  private find(target: EventTarget | null): Item | undefined {
    let el = this.element(target);
    while (el && el !== this.svg) {
      const item = this.byElement.get(el); if (item) return item;
      el = el.parentElement || undefined;
    }
    return undefined;
  }
  private add(elements: Element[], kind: string, id?: string, label?: string): Item | undefined {
    const available = elements.filter(el => el !== this.svg && !this.byElement.has(el) && !el.closest(ignored));
    if (!available.length) return undefined;
    const first = available[0]!;
    const item: Item = {
      target: { id: id || attr(first, 'data-id', 'id') || `${kind}-${this.items.length + 1}`, label: label || textOf(first), kind },
      elements: new Set(), links: new Set(), related: new Set(),
    };
    this.items.push(item);
    for (const el of available) this.attach(item, el);
    return item;
  }
  private attach(item: Item, el: Element): void {
    if (this.byElement.has(el)) return;
    item.elements.add(el); this.byElement.set(el, item);
    this.addClass(el, 'kmv-semantic'); this.mark(el, 'data-kmv-kind', item.target.kind);
  }
  private alias(key: string, item: Item): void {
    if (!key) return;
    let set = this.aliases.get(key); if (!set) this.aliases.set(key, set = new Set());
    set.add(item);
  }
  private lookup(key: string): Item | undefined {
    const set = this.aliases.get(key); return set?.size === 1 ? [...set][0] : undefined;
  }
  private unprefix(id: string): string {
    return this.svg.id && id.startsWith(`${this.svg.id}-`) ? id.slice(this.svg.id.length + 1) : id;
  }
  private nodeId(el: Element): string {
    const explicit = attr(el, 'data-id', 'data-node-id'); if (explicit) return explicit;
    const id = this.unprefix(el.id);
    return id.replace(/^(?:flowchart-|classId-|state-|entity-)(.+)-\d+$/, '$1')
      .replace(/^(?:service-|node_)(.+)$/, '$1');
  }
  private indexNodes(): void {
    const selector = 'g.node, g.rough-node, g.cluster, g.classGroup, g.stateGroup, g.entity, g.mindmap-node, .architecture-service, .architecture-junction, [data-et="participant"], [data-node="true"]';
    for (const el of this.select(selector)) {
      const kind = el.matches('[data-et="participant"]') ? 'participant' : el.matches('.cluster') ? 'group' : 'node';
      const child = el.querySelector('[id]');
      const id = this.nodeId(el) || (child ? this.nodeId(child).replace(/^node-/, '') : '');
      const caption = el.querySelector('.nodeLabel, .label, .classTitle, .state-title, .entityTitleText, text') || el;
      const label = kind === 'participant' ? labelOf(caption) : textOf(caption);
      const item = this.add([el], kind, id, label); if (!item) continue;
      for (const key of [id, el.id, this.unprefix(el.id)]) this.alias(key, item);
    }
    if (/sequence/.test(this.family)) {
      // Older native Mermaid releases lack data-et; actor names are still explicit.
      for (const el of this.select('rect.actor[name], g.actor[name], g.actor-man[name], .actor-line[name], [data-et="life-line"]')) {
        const name = attr(el, 'data-id', 'name'); if (!name) continue;
        let item = this.lookup(name);
        if (item) this.attach(item, el);
        else {
          item = this.add([el], 'participant', name, name);
          if (item) this.alias(name, item);
        }
        if (!item || !el.matches('rect.actor[name], g.actor[name], g.actor-man[name]')) continue;
        item.target.label = labelOf(el) || item.target.label;
        const parent = el.parentElement;
        // Legacy actor boxes, their labels and footer duplicates share an explicit
        // actor name. Keep those together even when newer data-et metadata is absent.
        if (parent?.tagName.toLowerCase() === 'g' &&
            !parent.querySelector('.messageLine0, .messageLine1') &&
            [...parent.querySelectorAll('[name]')].every(part => part.getAttribute('name') === name)) {
          this.attach(item, parent);
          item.target.label = labelOf(parent) || item.target.label;
        } else {
          const next = el.nextElementSibling;
          if (next?.matches('text.actor, foreignObject.actor')) { this.attach(item, next); item.target.label = labelOf(next) || item.target.label; }
        }
      }
    }
  }
  private indexSequenceGeometry(): void {
    if (!/sequence/.test(this.family)) return;
    this.sequenceGeometry = new SequenceGeometry(this.svg);
    for (const el of this.select('.actor-line[name], [data-et="life-line"]')) {
      const owner = this.find(el); if (owner?.target.kind === 'participant') this.sequenceGeometry.addLifeline(el, owner);
    }
    this.sequenceGeometry.finishLifelines();
  }
  /** Resolve only an exact, unambiguous ID grammar or explicit renderer metadata. */
  private endpoints(el: Element): [Item | undefined, Item | undefined] {
    const from = attr(el, 'data-from', 'data-source', 'data-start');
    const to = attr(el, 'data-to', 'data-target', 'data-end');
    if (from || to) return [this.lookup(from), this.lookup(to)];
    const id = this.unprefix(attr(el, 'data-id', 'id'));
    const matches: Array<[Item, Item]> = [];
    const patterns: Array<[string, string, RegExp | undefined]> = [
      ['L_', '_', /_\d+(?:_[a-z]+)?$/i], ['id_', '_', /_\d+$/],
      ['edge_', '_', undefined],
    ];
    if (/state/.test(this.family)) patterns.push(['', '-', undefined]);
    if (/requirement/.test(this.family)) patterns.push(['', '-', /-\d+$/]);
    for (const [prefix, separator, suffix] of patterns) {
      if (!id.startsWith(prefix)) continue;
      const body = id.slice(prefix.length), ending = suffix?.exec(body);
      if (suffix && !ending) continue;
      const pair = ending ? body.slice(0, ending.index) : body;
      // Endpoint lookup scales with the ID's separators, not the number of nodes.
      for (let index = pair.indexOf(separator); index >= 0; index = pair.indexOf(separator, index + 1)) {
        const a = this.lookup(pair.slice(0, index)), b = this.lookup(pair.slice(index + separator.length));
        if (a && b && !matches.some(([x, y]) => x === a && y === b)) matches.push([a, b]);
      }
    }
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1) return [undefined, undefined];
    // Block renderer versions ship placeholder LS-a1/LE-b1 classes; never trust those.
    if (!/block/.test(this.family)) {
      const start = [...el.classList].find(c => c.startsWith('LS-'))?.slice(3);
      const end = [...el.classList].find(c => c.startsWith('LE-'))?.slice(3);
      if (start && end) return [this.lookup(start), this.lookup(end)];
    }
    return this.sequenceGeometry && el.matches('.messageLine0, .messageLine1, [data-et="message"]') ? this.sequenceGeometry.message(el) : [undefined, undefined];
  }
  private indexEdges(): void {
    const selector = '[data-edge="true"], [data-et="edge"], [data-et="message"], .edgePath path.path, path.flowchart-link, path.relationshipLine, path.relation, path.transition, path.edge, .messageLine0, .messageLine1, .links > .link';
    const edgeItems: Item[] = [];
    const markers = new Map<string, Element[]>();
    for (const marker of this.svg.querySelectorAll('marker[id]')) { const entries = markers.get(marker.id) || []; entries.push(marker); markers.set(marker.id, entries); }
    for (const el of this.select(selector)) {
      const group = el.closest('.architecture-edges > g, .links > .link');
      const item = this.add([group || el], 'edge', this.unprefix(attr(el, 'data-id', 'id'))); if (!item) continue;
      if (group) this.attach(item, el);
      const [from, to] = this.endpoints(el);
      const style = (el as SVGElement).style;
      const start = attr(el, 'marker-start') || style?.getPropertyValue('marker-start') || '';
      const end = attr(el, 'marker-end') || style?.getPropertyValue('marker-end') || '';
      // Cardinality decorations convey multiplicity, never arrow direction.
      const directed = (marker: string) => {
        const fragment = /#([^\s)'"#]+)[)'"\s]*$/.exec(marker)?.[1];
        const definitions = fragment ? markers.get(fragment) : undefined;
        const definition = definitions?.length === 1 ? definitions[0] : undefined;
        const decoration = /^(?:onlyOne|zeroOrOne|oneOrMore|zeroOrMore|lollipop|circle|cross)(?:Start|End|head)?$/i;
        const tokens = definition ? [...definition.classList] : (fragment ? [this.unprefix(fragment).split(/[_-]/).at(-1)!] : []);
        return !!marker && marker !== 'none' && !tokens.some(token => decoration.test(token));
      };
      let a = directed(start), b = directed(end);
      if (group?.closest('.architecture-edges')) [a, b] = this.architectureArrows(el, group);
      // Explicit sequence sender/recipient metadata also identifies messages with
      // an open arrow or a cross ending. Preserve their native line and marker type.
      if (/sequence/.test(this.family) && !a && !b && from && to) b = true;
      item.edge = { from, to, direction: a && b ? 'both' : a ? 'reverse' : b ? 'forward' : 'undirected' };
      for (const node of [from, to]) if (node) node.links.add(item);
      const classes = el.getAttribute('class') || '';
      const dash = attr(el, 'stroke-dasharray') || style?.getPropertyValue('stroke-dasharray');
      const line = /dotted/.test(classes) ? 'dotted' : /dashed|messageLine1/.test(classes) || (!/edge-pattern-solid/.test(classes) && dash && dash !== 'none' && dash !== '0') ? 'dashed' : /(?:^|\s)(?:thick|edge-thickness-thick)(?:\s|$)/.test(classes) ? 'thick' : 'solid';
      this.mark(el, 'data-kmv-line', line);
      if (start || end) this.mark(el, 'data-kmv-marker', `${start} ${end}`.trim());
      edgeItems.push(item);
    }
    // Labels refer to the renderer's edge ID; never match on human-readable text.
    const edgeById = new Map<string, Set<Item>>();
    for (const item of edgeItems) for (const el of item.elements) {
      for (const id of [item.target.id, el.id, attr(el, 'data-id')]) if (id) {
        let matches = edgeById.get(id); if (!matches) edgeById.set(id, matches = new Set());
        matches.add(item);
      }
    }
    for (const el of this.select('.edgeLabel [data-id], .edgeLabel[id]')) {
      const matches = edgeById.get(attr(el, 'data-id', 'id'));
      const item = matches?.size === 1 ? [...matches][0] : undefined; if (!item) continue;
      this.attach(item, el); item.target.label ||= textOf(el);
    }
    if (/sequence/.test(this.family)) {
      // Renderer emits each message label immediately before its corresponding line/path.
      for (const item of edgeItems) for (const el of [...item.elements]) {
        if (!el.matches('.messageLine0, .messageLine1, [data-et="message"]')) continue;
        const labels: Element[] = []; let previous = el.previousElementSibling;
        while (previous?.matches('.messageText, foreignObject.messageText')) { labels.unshift(previous); previous = previous.previousElementSibling; }
        for (const label of labels) this.attach(item, label);
        if (labels.length) item.target.label = labels.map(labelOf).join(' ');
      }
    }
  }
  private architectureArrows(path: Element, group: Element): [boolean, boolean] {
    // Architecture uses sibling triangles instead of SVG markers. Its arrow tips
    // are exactly two SVG units inside the encoded path endpoints.
    const numbers = (value: string) => (value.match(/-?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
    const points = numbers(attr(path, 'd'));
    if (points.length !== 6 || !/^M[^ML]*L[^ML]*L[^ML]*$/i.test(attr(path, 'd').trim())) return [false, false];
    const endpoints = [[points[0]!, points[1]!], [points[4]!, points[5]!]];
    const ends = [false, false];
    for (const arrow of group.querySelectorAll('polygon.arrow')) {
      const transform = /^translate\(([^)]+)\)$/.exec(attr(arrow, 'transform'));
      const shift = transform ? numbers(transform[1]!) : [];
      const vertices = numbers(attr(arrow, 'points'));
      if (shift.length !== 2 || vertices.length !== 6) continue;
      const near = endpoints.map(([x, y]) => [0, 2, 4].some(i => Math.hypot(vertices[i]! + shift[0]! - x!, vertices[i + 1]! + shift[1]! - y!) <= 2.1));
      if (near[0] !== near[1]) { if (near[0]) ends[0] = true; if (near[1]) ends[1] = true; }
    }
    return [ends[0]!, ends[1]!];
  }
  private indexFamilies(): void {
    const groups: Array<[string, string]> = [
      ['.taskWrapper, .eventWrapper', 'event'], ['.data-point', 'data-point'],
      ['.treemapSection', 'section'], ['.treemapLeaf', 'cell'],
      ['.items > g', 'card'], ['.sections > g', 'section'],
      ['.note, [data-et="note"]', 'note'], ['[data-et="control-structure"]', 'group'],
      ['.branchLabel', 'branch'], ['.quadrant', 'quadrant'],
      ['.ishikawa-head-group, .ishikawa-label-group, .ishikawa-sub-group', 'cause'],
      ['.venn-circle, .venn-intersection, .venn-text-area, .venn-text-node-fo', 'set'],
      ['.timeline-node', 'event'],
    ];
    for (const [selector, kind] of groups) for (const el of this.select(selector)) {
      let target = el.matches('.treemapLeaf') ? el.parentElement || el : el;
      if (kind === 'note' && el.matches('rect.note') && el.parentElement?.localName === 'g' &&
          el.parentElement.querySelectorAll('rect.note').length === 1 && el.parentElement.querySelector('.noteText')) target = el.parentElement;
      if (this.find(target)) continue;
      const item = this.add([target], kind, undefined, kind === 'note' ? labelOf(target) : undefined); if (!item || kind !== 'note') continue;
      const names = [attr(target, 'data-actor'), attr(target, 'data-from'), attr(target, 'data-to')].filter(Boolean);
      const participants = new Set<Item>();
      if (names.length) for (const name of names) { const participant = this.lookup(name); if (participant?.target.kind === 'participant') participants.add(participant); }
      for (const participant of participants) { item.related.add(participant); participant.related.add(item); }
    }
    if (/gantt/.test(this.family)) {
      const labels = new Map(this.select('text[id]').map(text => [text.id, text]));
      for (const el of this.select('rect.task')) {
        const label = labels.get(`${el.id}-text`);
        this.add(label ? [el, label] : [el], 'task', this.unprefix(el.id), label ? textOf(label) : '');
      }
    }
    if (/journey/.test(this.family)) for (const line of this.select('.task-line')) {
      if (line.parentElement) this.add([line.parentElement], 'task', this.unprefix(line.id));
    }
    if (/packet/.test(this.family)) for (const block of this.select('.packetBlock')) {
      const parts = [block]; let next = block.nextElementSibling;
      while (next?.matches('.packetLabel, .packetByte')) { parts.push(next); next = next.nextElementSibling; }
      this.add(parts, 'field', undefined, textOf(parts.find(el => el.matches('.packetLabel')) || block));
    }
    if (/pie/.test(this.family)) {
      const slices = this.select('.pieCircle'), labels = this.select('text.slice'), legends = this.select('g.legend');
      const fills = new Map<Element, string>();
      const fillOf = (el: Element): string => {
        let value = fills.get(el);
        if (value === undefined) {
          value = this.svg.ownerDocument.defaultView?.getComputedStyle(el).fill || attr(el, 'fill') || (el as SVGElement).style.fill;
          fills.set(el, value);
        }
        return value;
      };
      const slicesByFill = new Map<string, Element[]>(), legendsByFill = new Map<string, Element[]>();
      for (const slice of slices) { const fill = fillOf(slice), entries = slicesByFill.get(fill) || []; entries.push(slice); slicesByFill.set(fill, entries); }
      for (const legend of legends) {
        const box = legend.querySelector('rect'); if (!box) continue;
        const fill = fillOf(box), entries = legendsByFill.get(fill) || []; entries.push(legend); legendsByFill.set(fill, entries);
      }
      slices.forEach((slice, index) => {
        const fill = fillOf(slice);
        const legend = legendsByFill.get(fill) || [];
        // Legend color is only an identity when unique; palette colors can repeat.
        const parts = [slice]; if (labels.length === slices.length && labels[index]) parts.push(labels[index]);
        const unique = legend.length === 1 && slicesByFill.get(fill)?.length === 1;
        if (unique) parts.push(legend[0]!);
        this.add(parts, 'slice', undefined, unique ? textOf(legend[0]!) : undefined);
      });
    }
    if (/radar/.test(this.family)) {
      const legends = new Map<string, Element>();
      for (const box of this.select('[class*="radarLegendBox-"]')) {
        const index = /(?:^|\s)radarLegendBox-(\d+)(?:\s|$)/.exec(box.getAttribute('class') || '')?.[1];
        if (index && box.parentElement) legends.set(index, box.parentElement);
      }
      for (const curve of this.select('[class*="radarCurve-"]')) {
        const index = /(?:^|\s)radarCurve-(\d+)(?:\s|$)/.exec(curve.getAttribute('class') || '')?.[1];
        const legend = index ? legends.get(index) : undefined;
        this.add(legend ? [curve, legend] : [curve], 'series', undefined, legend ? textOf(legend) : undefined);
      }
    }
    if (/xychart|xy-chart/.test(this.family)) {
      for (const el of this.select('[class*="line-plot-"]')) this.add([el], 'series');
      for (const el of this.select('[class*="bar-plot-"] > rect')) this.add([el], 'bar');
    }
    if (/git/.test(this.family)) {
      const commits = new Map<string, Element[]>();
      const labels = new Map<string, Element[]>();
      for (const label of this.select('.commit-label')) { const text = textOf(label), entries = labels.get(text) || []; entries.push(label.parentElement || label); labels.set(text, entries); }
      for (const el of this.select('.commit')) {
        const id = [...el.classList].find(c => c !== 'commit' && !/^type/.test(c)); if (!id) continue;
        const parts = commits.get(id) || []; parts.push(el); commits.set(id, parts);
      }
      for (const [id, parts] of commits) {
        parts.push(...labels.get(id) || []);
        this.add(parts, 'commit', id, id);
      }
    }
  }
  private indexFallback(): void {
    // Unknown families keep useful local interaction. Do not infer links from geometry or order.
    for (const el of this.select(drawable)) {
      const excluded = el.closest('a, .grid, .tick, .ticks, .axis, .left-axis, .bottom-axis, .top-axis, .actorPopupMenu');
      if (this.find(el) || (excluded && this.svg.contains(excluded))) continue;
      if (el.matches('.background, .pieOuterCircle, .radarGraticule, .radarAxisLine')) continue;
      let target = el;
      const parent: Element | null = el.parentElement;
      if (parent && parent !== this.svg && parent.tagName.toLowerCase() === 'g' &&
          parent.children.length <= 12 && !parent.matches('.node-labels') &&
          !parent.querySelector('g') && ![...parent.children].some(child => this.byElement.has(child))) target = parent;
      if (!this.find(target)) this.add([target], 'element');
    }
  }
  private relation(edge: NonNullable<Item['edge']>, node: Item): Relation {
    if (edge.direction === 'undirected') return 'undirected';
    if (edge.direction === 'both' || (edge.from === node && edge.to === node)) return 'both';
    const leaves = edge.direction === 'forward' ? edge.from === node : edge.to === node;
    return leaves ? 'outgoing' : 'incoming';
  }
  private indexContainment(): void {
    for (const item of this.items) for (const el of item.elements) {
      let ancestor: Element | null = el.parentElement;
      while (ancestor && ancestor !== this.svg) {
        const parent = this.byElement.get(ancestor);
        if (parent && parent !== item) {
          const parents = this.parents.get(item) || new Set<Item>(); parents.add(parent); this.parents.set(item, parents);
          const children = this.children.get(parent) || new Set<Item>(); children.add(item); this.children.set(parent, children);
          break;
        }
        ancestor = ancestor.parentElement;
      }
    }
  }
  private hitWidth(width: number): number { return Number.isFinite(width) ? Math.max(6, Math.min(30, width)) : 12; }
  setLineHitWidth(width: number): void {
    if (this.disposed) return;
    const next = this.hitWidth(width); if (next === this.lineHitWidth) return;
    this.lineHitWidth = next; this.updateHitStrokeWidth();
  }
  /** SVG vector-effect excludes the viewer's HTML ancestor scale. */
  setViewportScale(scale: number): void {
    if (this.disposed || !Number.isFinite(scale) || scale <= 0 || scale === this.viewportScale) return;
    this.viewportScale = scale; this.updateHitStrokeWidth();
  }
  private updateHitStrokeWidth(): void {
    const style = this.svg.style;
    if (!this.hitStyle) this.hitStyle = { original: this.svg.getAttribute('style'), applied: '', value: style.getPropertyValue(hitStrokeProperty), priority: style.getPropertyPriority(hitStrokeProperty), externalChange: false };
    else if (this.svg.getAttribute('style') !== this.hitStyle.applied) this.hitStyle.externalChange = true;
    style.setProperty(hitStrokeProperty, `${this.lineHitWidth / this.viewportScale}px`, 'important');
    this.hitStyle.applied = this.svg.getAttribute('style') || '';
  }
  private restoreHitStrokeWidth(): void {
    const saved = this.hitStyle; if (!saved) return;
    if (!saved.externalChange && this.svg.getAttribute('style') === saved.applied) {
      if (saved.original === null) this.svg.removeAttribute('style'); else this.svg.setAttribute('style', saved.original);
    } else {
      if (saved.value) this.svg.style.setProperty(hitStrokeProperty, saved.value, saved.priority); else this.svg.style.removeProperty(hitStrokeProperty);
      if (saved.original === null && this.svg.getAttribute('style') === '') this.svg.removeAttribute('style');
    }
    this.hitStyle = undefined;
  }
  setEnabled(enabled: boolean): void { if (!this.disposed) { this.enabled = enabled; if (!enabled) this.clear(); } }
  /** A fresh source snapshot augments legacy sequence SVGs without rerendering. */
  setSource(source: string): void {
    if (this.disposed || !/sequence/.test(this.family)) return;
    const associations = sequenceAssociations(source); if (!associations) return;
    this.clear();
    for (const [item, edge] of this.sourceEdges) {
      item.edge?.from?.links.delete(item); item.edge?.to?.links.delete(item);
      item.edge = edge; edge.from?.links.add(item); edge.to?.links.add(item);
    }
    this.sourceEdges.clear();
    for (const [note, participant] of this.sourceNotes) { note.related.delete(participant); participant.related.delete(note); }
    this.sourceNotes.length = 0;
    const normalize = (label: string) => label.replace(/\s+/g, ' ').trim();
    const participants = new Map<string, Item>();
    for (const actor of associations.participants) {
      const item = this.lookup(actor.id);
      if (item?.target.kind === 'participant' && normalize(item.target.label) === normalize(actor.label)) participants.set(actor.id, item);
    }
    // Labels establish identity only when unique on BOTH sides of the snapshot.
    // Repeated events cannot be matched by an invented SVG/source ordinal.
    const sourceMessages = new Map<string, typeof associations.messages>();
    const sourceNotes = new Map<string, typeof associations.notes>();
    for (const message of associations.messages) { const label = normalize(message.label), entries = sourceMessages.get(label) || []; entries.push(message); sourceMessages.set(label, entries); }
    for (const note of associations.notes) { const label = normalize(note.label), entries = sourceNotes.get(label) || []; entries.push(note); sourceNotes.set(label, entries); }
    const messages = new Map<string, Item[]>(), notes = new Map<string, Item[]>();
    for (const item of this.items) {
      const index = item.edge ? messages : item.target.kind === 'note' ? notes : undefined; if (!index) continue;
      const label = normalize(item.target.label), entries = index.get(label) || []; entries.push(item); index.set(label, entries);
    }
    for (const [label, entries] of sourceMessages) {
      const rendered = messages.get(label); if (entries.length !== 1 || rendered?.length !== 1) continue;
      const sourceMessage = entries[0]!, item = rendered[0]!, from = participants.get(sourceMessage.from), to = participants.get(sourceMessage.to);
      if (!from || !to || !item.edge || (item.edge.from && item.edge.from !== from) || (item.edge.to && item.edge.to !== to)) continue;
      this.sourceEdges.set(item, item.edge);
      item.edge = { from, to, direction: item.edge.direction === 'undirected' ? sourceMessage.direction : item.edge.direction }; from.links.add(item); to.links.add(item);
    }
    for (const [label, entries] of sourceNotes) {
      const rendered = notes.get(label); if (entries.length !== 1 || rendered?.length !== 1) continue;
      const note = rendered[0]!, actors = entries[0]!.participants.map(id => participants.get(id));
      if (actors.some(actor => !actor)) continue;
      for (const actor of actors) if (actor && !note.related.has(actor)) {
        note.related.add(actor); actor.related.add(note); this.sourceNotes.push([note, actor]);
      }
    }
  }
  private indexHitTargets(): void {
    const targets: Array<{ el: Element; item: Item }> = [];
    // Resolve styles before inserting anything: interleaving each style read with
    // each proxy insertion would repeatedly invalidate the browser's style work.
    for (const el of this.select('path, line, polyline')) {
      const item = this.find(el); if (!item || interactiveAncestor(el, this.svg) || !el.parentElement) continue;
      if (el.localName === 'path' && !item.edge && !el.matches('.actor-line, .task-line')) {
        const native = el as SVGElement;
        const fill = this.svg.ownerDocument.defaultView?.getComputedStyle(el).fill || attr(el, 'fill') || native.style.fill;
        if (fill !== 'none') continue;
      }
      targets.push({ el, item });
    }
    for (const { el, item } of targets) {
      const parent = el.parentElement; if (!parent) continue;
      const tag = el.localName;
      if (tag !== 'path' && tag !== 'line' && tag !== 'polyline') continue;
      const proxy = createSvgElement(this.svg.ownerDocument, tag);
      const geometry = el.localName === 'path' ? ['d'] : el.localName === 'line' ? ['x1', 'y1', 'x2', 'y2'] : ['points'];
      for (const name of [...geometry, 'transform']) { const value = el.getAttribute(name); if (value != null) proxy.setAttribute(name, value); }
      // No copied native ID, classes, markers, styles, event attributes, or links.
      // A sibling shares the original clipping and coordinate system.
      proxy.setAttribute('data-kmv-hit-target', ''); proxy.setAttribute('aria-hidden', 'true');
      // Inline priority isolates hit geometry from native SVG ID-scoped styles.
      const style = proxy.style;
      for (const [name, value] of Object.entries({ fill: 'none', stroke: 'transparent', 'stroke-width': `var(${hitStrokeProperty})`,
        'stroke-opacity': '0', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': 'none',
        'pointer-events': 'stroke', 'vector-effect': 'non-scaling-stroke', filter: 'none', 'marker-start': 'none', 'marker-mid': 'none', 'marker-end': 'none' })) style.setProperty(name, value, 'important');
      parent.insertBefore(proxy, el);
      this.hitTargets.set(proxy, el); this.byElement.set(proxy, item);
    }
  }
  private stateClasses(item: Item, state?: Emphasis, filters?: ReadonlyMap<Element, string>): void {
    for (const el of item.elements) {
      for (const name of transient) this.removeClass(el, name);
      this.restore(el, 'data-kmv-relation'); this.restoreFilter(el);
      if (!state || state === 'context') continue;
      this.preserveFilter(el, filters?.get(el));
      if (state === 'active') this.addClass(el, 'kmv-semantic-active');
      else {
        this.addClass(el, 'kmv-semantic-related');
        if (state !== 'related') { this.addClass(el, `kmv-semantic-${state}`); this.mark(el, 'data-kmv-relation', state); }
      }
    }
  }
  private preserveFilter(el: Element, captured?: string): void {
    const native = captured ?? this.svg.ownerDocument.defaultView?.getComputedStyle(el).filter;
    const original = el.getAttribute('style');
    const style = (el as SVGElement).style;
    const value = style.getPropertyValue('filter'), priority = style.getPropertyPriority('filter');
    // This is measured presentation, not a static override: keep the native
    // filter and compose the theme-owned glow only for the current emphasis.
    style.setProperty('filter', `${native && native !== 'none' ? native + ' ' : ''}var(--kmv-semantic-glow)`);
    this.nativeFilters.set(el, { original, applied: el.getAttribute('style') || '', value, priority, appliedFilter: style.getPropertyValue('filter') });
  }
  private restoreFilter(el: Element): void {
    const saved = this.nativeFilters.get(el); if (!saved) return;
    if (el.getAttribute('style') === saved.applied) {
      if (saved.original === null) el.removeAttribute('style'); else el.setAttribute('style', saved.original);
    } else {
      const style = (el as SVGElement).style;
      // Another owner may change unrelated styles while hovered. Restore only
      // our still-current filter, retaining that owner's newer declarations.
      if (style.getPropertyValue('filter') === saved.appliedFilter && style.getPropertyPriority('filter') === '') {
        if (saved.value) style.setProperty('filter', saved.value, saved.priority);
        else style.removeProperty('filter');
      }
    }
    this.nativeFilters.delete(el);
  }
  private addContext(states: Map<Item, Emphasis>, item: Item, index: Map<Item, Set<Item>>, visited: Set<Item>): void {
    const pending = [item];
    while (pending.length) {
      const current = pending.pop()!; if (visited.has(current)) continue; visited.add(current);
      for (const other of index.get(current) || []) {
        if (!states.has(other)) states.set(other, 'context');
        pending.push(other);
      }
    }
  }
  private highlight(item?: Item): void {
    if (this.disposed || item === this.active) return;
    if (!item) { this.clear(); return; }
    const previous = this.active;
    this.active = item;
    const related = new Map<Item, Relation | undefined>();
    for (const other of item.related) related.set(other, undefined);
    if (item.edge) {
      if (item.edge.from) related.set(item.edge.from, this.relation(item.edge, item.edge.from));
      if (item.edge.to) related.set(item.edge.to, this.relation(item.edge, item.edge.to));
    } else for (const link of item.links) {
      if (!link.edge) continue;
      const relation = this.relation(link.edge, item); related.set(link, relation);
      for (const node of [link.edge.from, link.edge.to]) if (node && node !== item) {
        const old = related.get(node); related.set(node, old && old !== relation ? 'both' : relation);
      }
    }
    const states = new Map<Item, Emphasis>();
    for (const [other, relation] of related) states.set(other, relation || 'related');
    states.set(item, 'active');
    const parents = new Set<Item>(), children = new Set<Item>();
    for (const bright of [...states.keys()]) {
      this.addContext(states, bright, this.parents, parents);
      this.addContext(states, bright, this.children, children);
    }
    // Remove only changed previous emphasis, then resolve the next neighborhood's
    // native filters together. Reading after the full dim pass would force a
    // synchronous whole-chart style flush inside the first hover handler.
    for (const [other, state] of this.emphasis) if (states.get(other) !== state) this.stateClasses(other);
    const filters = new Map<Element, string>();
    for (const [other, state] of states) if (state !== 'context' && this.emphasis.get(other) !== state) {
      for (const el of other.elements) filters.set(el, this.svg.ownerDocument.defaultView?.getComputedStyle(el).filter || 'none');
    }
    this.addClass(this.svg, 'kmv-has-semantic-hover');
    // Only first entry dims the diagram. Target changes touch the previous and
    // next neighborhoods, with no item rescan or bright×all containment pass.
    if (!previous) for (const other of this.items) if (!states.has(other)) this.dim(other);
    for (const other of this.emphasis.keys()) if (!states.has(other)) this.dim(other);
    for (const [other, state] of states) if (this.emphasis.get(other) !== state) {
      this.undim(other); this.stateClasses(other, state, filters);
    }
    this.emphasis.clear(); for (const [other, state] of states) this.emphasis.set(other, state);
  }
  private dim(item: Item): void { this.dimmed.add(item); for (const el of item.elements) this.addClass(el, 'kmv-semantic-dim'); }
  private undim(item: Item): void { this.dimmed.delete(item); for (const el of item.elements) this.removeClass(el, 'kmv-semantic-dim'); }
  /** Clear hover before an export computes native styles. Next pointer entry works normally. */
  clear(): void {
    this.active = undefined;
    this.removeClass(this.svg, 'kmv-has-semantic-hover');
    for (const item of this.emphasis.keys()) this.stateClasses(item);
    for (const item of this.dimmed) this.undim(item);
    this.emphasis.clear(); this.dimmed.clear();
  }
  private listen(type: string, callback: EventListener): void {
    this.svg.addEventListener(type, callback); this.listeners.push([type, callback]);
  }
  private mark(el: Element, name: string, value: string): void {
    let saved = this.attributes.get(el); if (!saved) this.attributes.set(el, saved = new Map<string, string | null>());
    if (!saved.has(name)) saved.set(name, el.getAttribute(name));
    el.setAttribute(name, value);
  }
  private restore(el: Element, name: string): void {
    const saved = this.attributes.get(el); if (!saved?.has(name)) return;
    const value = saved.get(name); if (value == null) el.removeAttribute(name); else el.setAttribute(name, value);
  }
  private addClass(el: Element, name: string): void {
    let saved = this.classes.get(el);
    if (!saved) this.classes.set(el, saved = { original: el.getAttribute('class'), originallyAbsent: !el.hasAttribute('class'), added: new Set() });
    if (!el.classList.contains(name)) { saved.added.add(name); el.classList.add(name); }
  }
  private removeClass(el: Element, name: string): void {
    const saved = this.classes.get(el); if (!saved?.added.has(name)) return;
    el.classList.remove(name);
    if (saved.originallyAbsent && el.getAttribute('class') === '') el.removeAttribute('class');
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.clear();
    for (const [type, callback] of this.listeners) this.svg.removeEventListener(type, callback);
    for (const proxy of this.hitTargets.keys()) proxy.remove();
    this.restoreHitStrokeWidth();
    for (const [el, saved] of this.attributes) for (const name of saved.keys()) this.restore(el, name);
    for (const [el, saved] of this.classes) {
      for (const name of saved.added) this.removeClass(el, name);
      const original = new Set((saved.original || '').split(/\s+/).filter(Boolean));
      if (el.classList.length === original.size && [...el.classList].every(name => original.has(name))) {
        if (saved.original === null) el.removeAttribute('class'); else el.setAttribute('class', saved.original);
      }
    }
    this.items.length = 0; this.byElement.clear(); this.aliases.clear(); this.attributes.clear(); this.classes.clear(); this.listeners.length = 0;
    this.hitTargets.clear(); this.parents.clear(); this.children.clear(); this.emphasis.clear(); this.dimmed.clear(); this.nativeFilters.clear(); this.sequenceGeometry = undefined; this.sourceEdges.clear(); this.sourceNotes.length = 0;
  }
}
