/** Each entry point supplies the DOM API available in its platform. */
export interface DomCreationPlatform {
  createHtml<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K): HTMLElementTagNameMap[K];
  createSvg<K extends keyof SVGElementTagNameMap>(doc: Document, tag: K): SVGElementTagNameMap[K];
}

let creationPlatform: DomCreationPlatform | undefined;

export function setDomCreationPlatform(platform: DomCreationPlatform): void {
  creationPlatform = platform;
}

function domCreationPlatform(): DomCreationPlatform {
  if (!creationPlatform) throw new Error('The viewer DOM platform has not been initialized.');
  return creationPlatform;
}

export function createHtmlElement<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = domCreationPlatform().createHtml(doc, tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function createSvgElement<K extends keyof SVGElementTagNameMap>(doc: Document, tag: K): SVGElementTagNameMap[K] {
  return domCreationPlatform().createSvg(doc, tag);
}

/** Runtime measurements are CSS variables; static presentation belongs in styles.css. */
export function setCssProps(element: HTMLElement | SVGElement, props: Record<`--${string}`, string>): void {
  if (typeof element.setCssProps === 'function') element.setCssProps(props);
  else for (const [name, value] of Object.entries(props)) element.style.setProperty(name, value);
}
