export type Size = { width: number; height: number };
export type Point = { x: number; y: number };
export type ViewState = Point & { scale: number; mode: 'width' | 'contain' | 'manual' };
export const PADDING = 16;
export const MIN_ZOOM = 0.01;
export const MAX_ZOOM = 10;
export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
export const validSize = (s: Size): boolean => Number.isFinite(s.width) && Number.isFinite(s.height) && s.width > 0 && s.height > 0;
export function fitScale(native: Size, viewport: Size, mode: 'width' | 'contain'): number {
  if (!validSize(native) || !validSize(viewport)) return 1;
  const horizontal = Math.max(1, viewport.width - PADDING * 2) / native.width;
  const vertical = Math.max(1, viewport.height - PADDING * 2) / native.height;
  return Math.min(1, mode === 'contain' ? Math.min(horizontal, vertical) : horizontal);
}
export function center(native: Size, viewport: Size, scale: number): Point {
  return { x: (viewport.width - native.width * scale) / 2, y: (viewport.height - native.height * scale) / 2 };
}
export function constrain(native: Size, viewport: Size, state: ViewState): ViewState {
  const axis = (value: number, size: number, available: number): number =>
    size <= available - PADDING * 2 ? (available - size) / 2 : clamp(value, available - size - PADDING, PADDING);
  return { ...state, x: axis(state.x, native.width * state.scale, viewport.width), y: axis(state.y, native.height * state.scale, viewport.height) };
}
export function fitted(native: Size, viewport: Size, mode: 'width' | 'contain'): ViewState {
  const scale = fitScale(native, viewport, mode);
  const point = center(native, viewport, scale);
  if (mode === 'width' && native.height * scale > viewport.height - PADDING * 2) point.y = PADDING;
  return { ...point, scale, mode };
}
export function zoomAt(native: Size, viewport: Size, state: ViewState, requested: number, anchor: Point = { x: viewport.width / 2, y: viewport.height / 2 }): ViewState {
  if (!Number.isFinite(requested) || requested <= 0) return state;
  const scale = clamp(requested, MIN_ZOOM, MAX_ZOOM);
  const ratio = scale / state.scale;
  return constrain(native, viewport, { x: anchor.x - (anchor.x - state.x) * ratio, y: anchor.y - (anchor.y - state.y) * ratio, scale, mode: 'manual' });
}
export function resized(native: Size, before: Size, after: Size, state: ViewState): ViewState {
  if (state.mode !== 'manual') return fitted(native, after, state.mode);
  return constrain(native, after, { ...state, x: state.x + (after.width - before.width) / 2, y: state.y + (after.height - before.height) / 2 });
}
export function parsePercent(input: string): number | null {
  const match = /^\s*(\d+(?:[.,]\d+)?)\s*(%|x)?\s*$/i.exec(input);
  if (!match) return null;
  const value = Number(match[1]!.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return match[2]?.toLowerCase() === 'x' ? value : value / 100;
}
/** Mermaid's viewBox is its stable native coordinate space; never use its fitted DOM width. */
export function nativeSize(svg: SVGSVGElement): Size | null {
  const parts = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (parts?.length === 4 && parts.every(Number.isFinite)) {
    const size = { width: parts[2]!, height: parts[3]! };
    if (validSize(size)) return size;
  }
  const length = (value: string | null): number => value && /^\d+(?:\.\d+)?(?:px)?$/.test(value.trim()) ? parseFloat(value) : NaN;
  const size = { width: length(svg.getAttribute('width')), height: length(svg.getAttribute('height')) };
  return validSize(size) ? size : null;
}
