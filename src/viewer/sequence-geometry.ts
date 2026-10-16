/** Exact SVG geometry for legacy sequence renderers that omit endpoint metadata. */
interface Point { x: number; y: number }
interface Segment<T> { owner: T; from: number; to: number }
const number = (element: Element, name: string): number | undefined => {
  const raw = element.getAttribute(name);
  if (raw == null || raw.trim() === '') return undefined;
  const value = Number(raw); return Number.isFinite(value) ? value : undefined;
};
const tolerance = .01;

export class SequenceGeometry<T> {
  private readonly positions = new Map<number, Segment<T>[]>();
  private xs: number[] = [];
  constructor(private readonly svg: SVGSVGElement) {}

  private point(element: Element, x: number, y: number): Point | undefined {
    // Browser CTMs normalize nested transforms without relying on the container,
    // zoom, or document that currently owns the original SVG.
    const graphics = element as SVGGraphicsElement;
    if (typeof graphics.getCTM === 'function' && typeof this.svg.getCTM === 'function') {
      const matrix = graphics.getCTM(), root = this.svg.getCTM();
      if (matrix && root && Math.abs(root.a * root.d - root.b * root.c) > Number.EPSILON) {
        const relative = root.inverse().multiply(matrix);
        return { x: relative.a * x + relative.c * y + relative.e, y: relative.b * x + relative.d * y + relative.f };
      }
    }
    // Detached/limited DOM implementations may not expose CTMs. Untransformed
    // geometry is still exact; transformed geometry stays unassociated.
    for (let current: Element | null = element; current && current !== this.svg; current = current.parentElement) {
      if (current.hasAttribute('transform') || (current as SVGElement).style?.transform) return undefined;
    }
    return { x, y };
  }
  endpoints(element: Element): [Point, Point] | undefined {
    let coordinates: number[] | undefined;
    if (element.localName === 'line') {
      const values = ['x1', 'y1', 'x2', 'y2'].map(name => number(element, name));
      if (values.every(value => value !== undefined)) coordinates = values;
    } else if (element.localName === 'path') {
      const d = element.getAttribute('d') || '';
      const values = (d.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
      // Native self messages use one absolute cubic or the four-command elbow.
      if (/^\s*M[^a-z]*C[^a-z]*$/i.test(d) && !/[mc]/.test(d) && values.length === 8) coordinates = [values[0]!, values[1]!, values[6]!, values[7]!];
      else if (/^\s*M[^a-z]*H[^a-z]*V[^a-z]*H[^a-z]*$/i.test(d) && !/[mhv]/.test(d) && values.length === 5) coordinates = [values[0]!, values[1]!, values[4]!, values[3]!];
    }
    if (!coordinates) return undefined;
    const a = this.point(element, coordinates[0]!, coordinates[1]!);
    const b = this.point(element, coordinates[2]!, coordinates[3]!);
    return a && b ? [a, b] : undefined;
  }
  addLifeline(element: Element, owner: T): void {
    const ends = this.endpoints(element);
    if (!ends || Math.abs(ends[0].x - ends[1].x) > tolerance) return;
    this.add(ends[0].x, { owner, from: Math.min(ends[0].y, ends[1].y), to: Math.max(ends[0].y, ends[1].y) });
  }
  private add(x: number, segment: Segment<T>): void {
    const entries = this.positions.get(x) || []; entries.push(segment); this.positions.set(x, entries);
  }
  finishLifelines(): void { this.xs = [...this.positions.keys()].sort((a, b) => a - b); }
  private near(x: number): number[] {
    let low = 0, high = this.xs.length;
    while (low < high) { const middle = (low + high) >>> 1; if (this.xs[middle]! < x - tolerance) low = middle + 1; else high = middle; }
    const result: number[] = [];
    while (low < this.xs.length && this.xs[low]! <= x + tolerance) result.push(this.xs[low++]!);
    return result;
  }
  private owners(point: Point): Set<T> {
    const owners = new Set<T>();
    for (const x of this.near(point.x)) for (const segment of this.positions.get(x)!) {
      if (point.y >= segment.from - tolerance && point.y <= segment.to + tolerance) owners.add(segment.owner);
    }
    return owners;
  }
  owner(point: Point): T | undefined { const owners = this.owners(point); return owners.size === 1 ? owners.values().next().value : undefined; }
  message(element: Element): [T | undefined, T | undefined] {
    const ends = this.endpoints(element); return ends ? [this.owner(ends[0]), this.owner(ends[1])] : [undefined, undefined];
  }
}
