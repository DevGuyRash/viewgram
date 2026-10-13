/** Semantic interaction over the original SVG. Never imports Mermaid or rebuilds its DOM. */
export interface SemanticTarget { id: string; label: string; kind: string }
type Direction = 'forward' | 'reverse' | 'both' | 'undirected';
type Relation = 'incoming' | 'outgoing' | 'both' | 'undirected';
interface Item {
  target: SemanticTarget;
  elements: Set<Element>;
  links: Set<Item>;
  edge?: { from?: Item; to?: Item; direction: Direction };
}
const ignored = 'defs, marker, clipPath, mask, pattern, symbol, style, script';
const interactive = 'a, button, input, textarea, select, [role="button"], [role="link"], .clickable, [contenteditable="true"], [onclick]';
const drawable = 'rect, circle, ellipse, polygon, polyline, path, line, text, foreignObject, image, use';
const transient = ['kmv-semantic-active', 'kmv-semantic-related', 'kmv-semantic-dim', 'kmv-semantic-incoming', 'kmv-semantic-outgoing', 'kmv-semantic-both', 'kmv-semantic-undirected'];
const textOf = (el: Element): string => (el.textContent || '').replace(/\s+/g, ' ').trim();
const attr = (el: Element, ...names: string[]): string => names.map(name => el.getAttribute(name)).find(Boolean) || '';

export class SemanticHighlighter {
  readonly family: string;
  private readonly items: Item[] = [];
  private readonly byElement = new Map<Element, Item>();
  private readonly aliases = new Map<string, Set<Item>>();
  private readonly attributes = new Map<Element, Map<string, string | null>>();
  private readonly classes = new Map<Element, { originallyAbsent: boolean; added: Set<string> }>();
  private readonly listeners: Array<[string, EventListener]> = [];
  private active?: Item;
  private disposed = false;

  constructor(readonly svg: SVGSVGElement, readonly onEdit?: (target: SemanticTarget) => void) {
    this.family = (attr(svg, 'aria-roledescription', 'data-diagram-type') || 'diagram').toLowerCase();
    this.mark(svg, 'data-kmv-family', this.family);
    this.indexNodes();
    this.indexEdges();
    this.indexFamilies();
    this.indexFallback();
    this.listen('pointerover', event => {
      const pointer = event as PointerEvent;
      this.highlight(pointer.buttons ? undefined : this.find(event.target));
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
      if (!onEdit || !target || target.closest(interactive)) return;
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
      elements: new Set(), links: new Set(),
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
    const selector = 'g.node, g.cluster, g.classGroup, g.stateGroup, g.entity, g.mindmap-node, .architecture-service, .architecture-junction, [data-et="participant"], [data-node="true"]';
    for (const el of this.select(selector)) {
      const kind = el.matches('[data-et="participant"]') ? 'participant' : el.matches('.cluster') ? 'group' : 'node';
      const child = el.querySelector('[id]');
      const id = this.nodeId(el) || (child ? this.nodeId(child).replace(/^node-/, '') : '');
      const label = textOf(el.querySelector('.nodeLabel, .label, .classTitle, .state-title, .entityTitleText, text') || el);
      const item = this.add([el], kind, id, label); if (!item) continue;
      for (const key of [id, el.id, this.unprefix(el.id)]) this.alias(key, item);
    }
    if (/sequence/.test(this.family)) {
      // Older native Mermaid releases lack data-et; actor names are still explicit.
      for (const el of this.select('rect.actor[name], g.actor[name], .actor-line[name], [data-et="life-line"]')) {
        const name = attr(el, 'data-id', 'name'); if (!name) continue;
        let item = this.lookup(name);
        if (item) this.attach(item, el);
        else {
          item = this.add([el], 'participant', name, name);
          if (item) this.alias(name, item);
        }
        if (!item || !el.matches('rect.actor[name], g.actor[name]')) continue;
        const parent = el.parentElement;
        // Legacy actor boxes, their labels and footer duplicates share an explicit
        // actor name. Keep those together even when newer data-et metadata is absent.
        if (parent?.tagName.toLowerCase() === 'g' &&
            !parent.querySelector('.messageLine0, .messageLine1') &&
            [...parent.querySelectorAll('[name]')].every(part => part.getAttribute('name') === name)) {
          this.attach(item, parent);
          item.target.label = textOf(parent) || item.target.label;
        } else {
          const next = el.nextElementSibling;
          if (next?.matches('text.actor, foreignObject.actor')) this.attach(item, next);
        }
      }
    }
  }
  /** Resolve only an exact, unambiguous ID grammar or explicit renderer metadata. */
  private endpoints(el: Element): [Item | undefined, Item | undefined] {
    const from = attr(el, 'data-from', 'data-source', 'data-start');
    const to = attr(el, 'data-to', 'data-target', 'data-end');
    if (from || to) return [this.lookup(from), this.lookup(to)];
    const id = this.unprefix(attr(el, 'data-id', 'id'));
    const matches: Array<[Item, Item]> = [];
    const patterns: Array<[string, string, RegExp]> = [
      ['L_', '_', /^(.+)_\d+(?:_[a-z]+)?$/i], ['id_', '_', /^(.+)_\d+$/],
      ['edge_', '_', /^(.+)$/],
    ];
    if (/state/.test(this.family)) patterns.push(['', '-', /^(.+)$/]);
    if (/requirement/.test(this.family)) patterns.push(['', '-', /^(.+)-\d+$/]);
    for (const [prefix, separator, suffix] of patterns) {
      if (!id.startsWith(prefix)) continue;
      for (const [key, values] of this.aliases) {
        if (values.size !== 1 || !id.startsWith(prefix + key + separator)) continue;
        const end = suffix.exec(id.slice(prefix.length + key.length + separator.length))?.[1];
        const a = this.lookup(key), b = end ? this.lookup(end) : undefined;
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
    return [undefined, undefined];
  }
  private indexEdges(): void {
    const selector = '[data-edge="true"], [data-et="message"], .edgePath path.path, path.flowchart-link, path.relationshipLine, path.relation, path.transition, path.edge, .messageLine0, .messageLine1, .links > .link';
    const edgeItems: Item[] = [];
    for (const el of this.select(selector)) {
      const group = el.closest('.architecture-edges > g, .links > .link');
      const item = this.add([group || el], 'edge', this.unprefix(attr(el, 'data-id', 'id'))); if (!item) continue;
      if (group) this.attach(item, el);
      const [from, to] = this.endpoints(el);
      const style = (el as SVGElement).style;
      const start = attr(el, 'marker-start') || style?.getPropertyValue('marker-start') || '';
      const end = attr(el, 'marker-end') || style?.getPropertyValue('marker-end') || '';
      // Cardinality decorations convey multiplicity, never arrow direction.
      const directed = (marker: string) => !!marker && marker !== 'none' && !/(?:onlyOne|zeroOrOne|oneOrMore|zeroOrMore|lollipop|circle|cross)/i.test(marker);
      let a = directed(start), b = directed(end);
      if (group?.closest('.architecture-edges')) [a, b] = this.architectureArrows(el, group);
      // Explicit sequence sender/recipient metadata also identifies messages with
      // an open arrow or a cross ending. Preserve their native line and marker type.
      if (/sequence/.test(this.family) && !a && !b && attr(el, 'data-from') && attr(el, 'data-to')) b = true;
      item.edge = { from, to, direction: a && b ? 'both' : a ? 'reverse' : b ? 'forward' : 'undirected' };
      for (const node of [from, to]) if (node) node.links.add(item);
      const classes = el.getAttribute('class') || '';
      const dash = attr(el, 'stroke-dasharray') || style?.getPropertyValue('stroke-dasharray');
      const line = /dotted/.test(classes) ? 'dotted' : /dashed|messageLine1/.test(classes) || (dash && dash !== 'none' && dash !== '0') ? 'dashed' : /thick/.test(classes) ? 'thick' : 'solid';
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
        const previous = el.previousElementSibling;
        if (previous?.matches('.messageText, foreignObject')) { this.attach(item, previous); item.target.label = textOf(previous); }
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
    ];
    for (const [selector, kind] of groups) for (const el of this.select(selector)) {
      const target = el.matches('.treemapLeaf') ? el.parentElement || el : el;
      if (!this.find(target)) this.add([target], kind);
    }
    if (/gantt/.test(this.family)) for (const el of this.select('rect.task')) {
      const label = this.select('text[id]').find(text => text.id === `${el.id}-text`);
      this.add(label ? [el, label] : [el], 'task', this.unprefix(el.id), label ? textOf(label) : '');
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
      slices.forEach((slice, index) => {
        const fill = attr(slice, 'fill') || (slice as SVGElement).style.fill;
        const legend = legends.filter(el => { const box = el.querySelector('rect'); return box && (attr(box, 'fill') || (box as SVGElement).style.fill) === fill; });
        // Legend color is only an identity when unique; palette colors can repeat.
        const parts = [slice]; if (labels.length === slices.length && labels[index]) parts.push(labels[index]!);
        const unique = legend.length === 1 && slices.filter(el => (attr(el, 'fill') || (el as SVGElement).style.fill) === fill).length === 1;
        if (unique) parts.push(legend[0]!);
        this.add(parts, 'slice', undefined, unique ? textOf(legend[0]!) : undefined);
      });
    }
    if (/radar/.test(this.family)) for (const curve of this.select('[class*="radarCurve-"]')) {
      const index = /radarCurve-(\d+)/.exec(curve.getAttribute('class') || '')?.[1];
      const legend = index ? this.select(`[class~="radarLegendBox-${index}"]`)[0]?.parentElement : undefined;
      this.add(legend ? [curve, legend] : [curve], 'series', undefined, legend ? textOf(legend) : undefined);
    }
    if (/xychart|xy-chart/.test(this.family)) {
      for (const el of this.select('[class*="line-plot-"]')) this.add([el], 'series');
      for (const el of this.select('[class*="bar-plot-"] > rect')) this.add([el], 'bar');
    }
    if (/git/.test(this.family)) {
      const commits = new Map<string, Element[]>();
      for (const el of this.select('.commit')) {
        const id = [...el.classList].find(c => c !== 'commit' && !/^type/.test(c)); if (!id) continue;
        const parts = commits.get(id) || []; parts.push(el); commits.set(id, parts);
      }
      for (const [id, parts] of commits) {
        for (const label of this.select('.commit-label')) if (textOf(label) === id) parts.push(label.parentElement || label);
        this.add(parts, 'commit', id, id);
      }
    }
  }
  private indexFallback(): void {
    // Unknown families keep useful local interaction. Do not infer links from geometry or order.
    for (const el of this.select(drawable)) {
      if (this.find(el) || el.closest('a, .grid, .tick, .axis, .actorPopupMenu')) continue;
      if (el.matches('.background, .pieOuterCircle, .radarGraticule, .radarAxisLine')) continue;
      let target = el;
      const parent: Element | null = el.parentElement;
      if (parent && parent !== this.svg && parent.tagName.toLowerCase() === 'g' &&
          !parent.querySelector('g') && ![...parent.children].some(child => this.byElement.has(child)) &&
          parent.children.length <= 12) target = parent;
      if (!this.find(target)) this.add([target], 'element');
    }
  }
  private relation(edge: NonNullable<Item['edge']>, node: Item): Relation {
    if (edge.direction === 'undirected') return 'undirected';
    if (edge.direction === 'both' || (edge.from === node && edge.to === node)) return 'both';
    const leaves = edge.direction === 'forward' ? edge.from === node : edge.to === node;
    return leaves ? 'outgoing' : 'incoming';
  }
  private highlight(item?: Item): void {
    if (this.disposed || item === this.active) return;
    this.clear(); if (!item) return;
    this.active = item; this.addClass(this.svg, 'kmv-has-semantic-hover');
    const related = new Map<Item, Relation | undefined>();
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
    const bright = [item, ...related.keys()].flatMap(value => [...value.elements]);
    for (const current of this.items) for (const el of current.elements) {
      if (current === item) this.addClass(el, 'kmv-semantic-active');
      else if (related.has(current)) {
        this.addClass(el, 'kmv-semantic-related');
        const relation = related.get(current);
        if (relation) { this.addClass(el, `kmv-semantic-${relation}`); this.mark(el, 'data-kmv-relation', relation); }
      } else if (!bright.some(part => el.contains(part) || part.contains(el))) this.addClass(el, 'kmv-semantic-dim');
    }
  }
  /** Clear hover before an export computes native styles. Next pointer entry works normally. */
  clear(): void {
    this.active = undefined;
    this.removeClass(this.svg, 'kmv-has-semantic-hover');
    for (const item of this.items) for (const el of item.elements) {
      for (const name of transient) this.removeClass(el, name);
      this.restore(el, 'data-kmv-relation');
    }
  }
  private listen(type: string, callback: EventListener): void {
    this.svg.addEventListener(type, callback); this.listeners.push([type, callback]);
  }
  private mark(el: Element, name: string, value: string): void {
    let saved = this.attributes.get(el); if (!saved) this.attributes.set(el, saved = new Map());
    if (!saved.has(name)) saved.set(name, el.getAttribute(name));
    el.setAttribute(name, value);
  }
  private restore(el: Element, name: string): void {
    const saved = this.attributes.get(el); if (!saved?.has(name)) return;
    const value = saved.get(name); if (value == null) el.removeAttribute(name); else el.setAttribute(name, value);
  }
  private addClass(el: Element, name: string): void {
    let saved = this.classes.get(el);
    if (!saved) this.classes.set(el, saved = { originallyAbsent: !el.hasAttribute('class'), added: new Set() });
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
    for (const [el, saved] of this.attributes) for (const name of saved.keys()) this.restore(el, name);
    for (const [el, saved] of this.classes) for (const name of saved.added) this.removeClass(el, name);
    this.items.length = 0; this.byElement.clear(); this.aliases.clear(); this.attributes.clear(); this.classes.clear(); this.listeners.length = 0;
  }
}
