export type DiagramBackground = 'none' | 'grid' | 'dots';
export type DiagramFit = 'contain' | 'width';
export interface ViewerSettings {
  background: DiagramBackground;
  backgroundSpacing: number;
  initialFit: DiagramFit;
  zoomStep: number;
  hoverHighlighting: boolean;
  lineHitWidth: number;
  showHints: boolean;
}
export const DEFAULT_SETTINGS: Readonly<ViewerSettings> = Object.freeze({
  background: 'none', backgroundSpacing: 18, initialFit: 'contain', zoomStep: 15,
  hoverHighlighting: true, lineHitWidth: 12, showHints: true,
});
export function settingsRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
/** Persisted plugin data is untrusted; only known, bounded values enter a viewer. */
export function readSettings(value: unknown): ViewerSettings {
  const data = settingsRecord(value);
  const number = (key: 'backgroundSpacing' | 'zoomStep' | 'lineHitWidth', min: number, max: number): number => {
    const candidate = data[key];
    return typeof candidate === 'number' && Number.isFinite(candidate)
      ? Math.round(Math.min(max, Math.max(min, candidate))) : DEFAULT_SETTINGS[key];
  };
  return {
    background: data.background === 'grid' || data.background === 'dots' ? data.background : 'none',
    backgroundSpacing: number('backgroundSpacing', 8, 48),
    initialFit: data.initialFit === 'width' ? 'width' : 'contain',
    zoomStep: number('zoomStep', 5, 50),
    hoverHighlighting: typeof data.hoverHighlighting === 'boolean' ? data.hoverHighlighting : DEFAULT_SETTINGS.hoverHighlighting,
    lineHitWidth: number('lineHitWidth', 6, 30),
    showHints: typeof data.showHints === 'boolean' ? data.showHints : DEFAULT_SETTINGS.showHints,
  };
}
