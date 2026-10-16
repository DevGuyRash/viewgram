import { Lifetime } from './lifetime';

/** Native SVG inline/ID animations can outrank normal reduced-motion CSS. */
export function respectReducedMotion(svg: SVGSVGElement): () => void {
  const win = svg.ownerDocument.defaultView;
  if (!win?.matchMedia || typeof svg.getAnimations !== 'function') return () => {};
  const preference = win.matchMedia('(prefers-reduced-motion: reduce)');
  const life = new Lifetime();
  const held = new Map<Animation, number>();
  const release = (animation: Animation, rate: number): void => {
    // Restore only the rate we still own. Paused/cancelled state is untouched.
    if (animation.playbackRate === 0) animation.playbackRate = rate;
    held.delete(animation);
  };
  const sync = (): void => {
    if (life.disposed) return;
    const current = new Set(svg.getAnimations({ subtree: true }));
    for (const [animation, rate] of held) {
      if (!preference.matches || !current.has(animation)) release(animation, rate);
    }
    if (!preference.matches) return;
    for (const animation of current) {
      // Cancelling a native transition reveals its target style immediately,
      // just as transition:none does, rather than freezing a half-hidden state.
      if ('transitionProperty' in animation) { animation.cancel(); continue; }
      // Include paused CSS animations: CSS can resume them without a new start
      // event. Holding the rate does not change their existing paused state.
      if (!('animationName' in animation) || animation.playbackRate === 0 || held.has(animation)) continue;
      held.set(animation, animation.playbackRate);
      animation.playbackRate = 0;
    }
  };
  life.listen(preference, 'change', sync);
  for (const event of ['animationstart', 'animationcancel', 'animationend', 'transitionrun', 'transitioncancel', 'transitionend']) {
    life.listen(svg, event, sync, true);
  }
  // Capture native animations once the attached viewer has a computed style.
  const frame = win.requestAnimationFrame(sync);
  life.add(() => win.cancelAnimationFrame(frame));
  life.add(() => { for (const [animation, rate] of held) release(animation, rate); });
  return () => life.dispose();
}
