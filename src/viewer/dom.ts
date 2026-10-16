/** Shared viewer DOM creation also runs in the standalone browser demo. */
export function createHtmlElement<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const win = doc.defaultView;
  let element: HTMLElementTagNameMap[K];
  if (typeof win?.createEl === 'function') element = win.createEl(tag);
  else {
    // The standalone demo and detached documents do not provide Obsidian DOM helpers.
    element = doc.createElement(tag);
  }
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function createSvgElement<K extends keyof SVGElementTagNameMap>(doc: Document, tag: K): SVGElementTagNameMap[K] {
  const win = doc.defaultView;
  if (typeof win?.createSvg === 'function') return win.createSvg(tag);
  // Browser documents require the SVG namespace; Obsidian helpers are unavailable here.
  return doc.createElementNS('http://www.w3.org/2000/svg', tag);
}

/** Runtime measurements are CSS variables; static presentation belongs in styles.css. */
export function setCssProps(element: HTMLElement | SVGElement, props: Record<`--${string}`, string>): void {
  if (typeof element.setCssProps === 'function') element.setCssProps(props);
  else for (const [name, value] of Object.entries(props)) element.style.setProperty(name, value);
}
