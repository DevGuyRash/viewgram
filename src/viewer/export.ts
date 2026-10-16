import { nativeSize, type Size } from './math';
import { createHtmlElement } from './dom';

export type ExportFormat = 'svg' | 'png' | 'jpg' | 'webp';
export interface DiagramFile { blob: Blob; filename: string; notice?: string }
export type CopyResult = { copied: true; notice: string } | { copied: false; notice: string; fallback: DiagramFile };
/** Raster failures carry the complete SVG so the caller can offer an explicit Save SVG action. */
export class DiagramExportError extends Error {
  constructor(message: string, readonly fallback?: DiagramFile) { super(message); this.name = 'DiagramExportError'; }
}

const SVG = 'http://www.w3.org/2000/svg';
const XHTML = 'http://www.w3.org/1999/xhtml';
const MAX_SIDE = 8192;
const MAX_PIXELS = 16_777_216;
const IMAGE_TIMEOUT = 10_000;
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as const;
// Copy resolved presentation and HTML-label layout, never stylesheets, animations or external fonts.
const PRESENTATION = [
  'color', 'color-interpolation', 'color-interpolation-filters', 'color-rendering',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'paint-order', 'vector-effect', 'shape-rendering', 'text-rendering', 'image-rendering',
  'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'd',
  'opacity', 'filter', 'clip-path', 'clip-rule', 'mask', 'mask-type',
  'marker-start', 'marker-mid', 'marker-end', 'visibility', 'display',
  'font-family', 'font-size', 'font-style', 'font-weight', 'font-variant', 'font-stretch',
  'font-kerning', 'font-feature-settings', 'font-variation-settings',
  'letter-spacing', 'word-spacing', 'line-height', 'text-anchor', 'dominant-baseline',
  'alignment-baseline', 'baseline-shift', 'text-decoration', 'text-transform', 'text-shadow',
  'white-space', 'overflow-wrap', 'word-break', 'direction', 'unicode-bidi', 'writing-mode',
  'text-align', 'text-indent', 'vertical-align', 'tab-size',
  'background-color', 'background-image', 'background-position', 'background-size', 'background-repeat',
  'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius', 'box-shadow',
  'box-sizing', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'position', 'top', 'right', 'bottom', 'left', 'overflow', 'overflow-x', 'overflow-y',
  'transform', 'transform-origin', 'transform-box', 'object-fit', 'object-position',
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
  'align-items', 'align-content', 'align-self', 'justify-content', 'gap', 'order',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
  'stop-color', 'stop-opacity', 'flood-color', 'flood-opacity', 'lighting-color',
] as const;
const OMIT = new Set(['style', 'script', 'animate', 'animateMotion', 'animateTransform', 'set', 'discard']);
const UNSUPPORTED = new Set(['iframe', 'object', 'embed', 'video', 'audio', 'canvas', 'link', 'base', 'meta', 'input', 'textarea', 'select', 'picture', 'source']);
const foreignObjectSupport = new WeakMap<Document, Promise<boolean>>();

function windowOf(doc: Document): typeof window {
  if (!doc.defaultView) throw new DiagramExportError('This diagram no longer has an active document.');
  return doc.defaultView;
}
function resource(value: string, doc: Document, allowImage = false): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) return trimmed;
  if (allowImage && /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z\d+/=\s]+$/i.test(trimmed)) return trimmed;
  try {
    const Url = windowOf(doc).URL;
    const url = new Url(trimmed, doc.baseURI);
    if (url.hash && url.href.split('#')[0] === new Url(doc.URL).href.split('#')[0]) return url.hash;
  } catch { /* An invalid URL is not a portable local resource. */ }
  throw new DiagramExportError('This diagram uses an external image or resource. Export cannot fetch it; use an embedded image or copy the source.');
}
function cssValue(value: string, doc: Document): string {
  const normalized = value.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi,
    (_match, double: string | undefined, single: string | undefined, plain: string | undefined) =>
      `url("${resource(double ?? single ?? plain ?? '', doc, true).replaceAll('"', '%22')}")`);
  // Reject unparsed URL syntax instead of accidentally retaining an external resource.
  if (/url\(/i.test(normalized.replace(/url\("[^"]*"\)/gi, ''))) throw new DiagramExportError('This diagram has an unsupported resource URL. Copy its source instead.');
  return normalized;
}
function transientClass(value: string): boolean { return value.startsWith('kmv-'); }
function snapshot(svg: SVGSVGElement): { clone: SVGSVGElement; size: Size; background: string[] } {
  const size = nativeSize(svg);
  if (!size) throw new DiagramExportError('The diagram has no valid native dimensions to export.');
  const doc = svg.ownerDocument, win = windowOf(doc);
  // Callers clear hover before exporting. Refuse to bake a transient style into a permanent file.
  if (svg.classList.contains('kmv-has-semantic-hover') || svg.querySelector('.kmv-semantic-active, .kmv-semantic-dim, .kmv-semantic-related')) {
    throw new DiagramExportError('Move away from the highlighted diagram and try exporting again.');
  }
  const elements = [svg, ...svg.querySelectorAll('*')].filter(element => !element.hasAttribute('data-kmv-hit-target'));
  const styles: Map<string, string>[] = [];
  // Preflight before cloning: even a detached HTML image can start loading its src.
  for (const element of elements) {
    if (UNSUPPORTED.has(element.localName)) throw new DiagramExportError(`The diagram contains ${element.localName} content that cannot be exported reliably. Copy its source instead.`);
    if (OMIT.has(element.localName)) { styles.push(new Map()); continue; }
    for (const attribute of [...element.attributes]) if (/url\s*\(/i.test(attribute.value)) cssValue(attribute.value, doc);
    for (const name of ['href', 'xlink:href', 'src', 'poster', 'srcset', 'background']) {
      const value = element.getAttribute(name);
      if (!value || element.localName === 'a') continue;
      if (name === 'srcset') throw new DiagramExportError('Responsive images cannot be exported reliably. Use a single embedded image.');
      resource(value, doc, ['image', 'feImage', 'img'].includes(element.localName));
    }
    const resolved = win.getComputedStyle(element);
    const properties = new Map<string, string>();
    for (const property of PRESENTATION) {
      const value = resolved.getPropertyValue(property);
      if (value) properties.set(property, cssValue(value, doc));
    }
    styles.push(properties);
  }
  const clone = svg.cloneNode(true) as SVGSVGElement;
  for (const target of clone.querySelectorAll('[data-kmv-hit-target]')) target.remove();
  const copies = [clone, ...clone.querySelectorAll('*')];
  for (let i = 0; i < copies.length; i++) {
    const copy = copies[i]!;
    if (OMIT.has(copy.localName)) { copy.remove(); continue; }
    for (const attr of [...copy.attributes]) {
      if (/^on/i.test(attr.name) || attr.name.startsWith('data-kmv-') || ['tabindex', 'autofocus', 'contenteditable', 'xml:base'].includes(attr.name)) copy.removeAttribute(attr.name);
      else if (['href', 'xlink:href', 'src', 'poster', 'background'].includes(attr.name)) {
        if (copy.localName === 'a') copy.removeAttribute(attr.name);
        else copy.setAttribute(attr.name, resource(attr.value, doc, ['image', 'feImage', 'img'].includes(copy.localName)));
      } else if (/url\s*\(/i.test(attr.value)) copy.setAttribute(attr.name, cssValue(attr.value, doc));
    }
    for (const name of [...copy.classList]) if (transientClass(name)) copy.classList.remove(name);
    copy.removeAttribute('style');
    // Every retained element in rendered Mermaid is SVG or HTML, both exposing CSS style.
    const style = (copy as SVGElement | HTMLElement).style;
    if (style) for (const [property, value] of styles[i]!) style.setProperty(property, value, 'important');
    if (copy.namespaceURI === XHTML && copy.parentElement?.localName === 'foreignObject') copy.setAttribute('xmlns', XHTML);
  }
  clone.setAttribute('xmlns', SVG);
  clone.setAttribute('width', String(size.width)); clone.setAttribute('height', String(size.height));
  if (!clone.hasAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
  setDimensions(clone, size);
  const background: string[] = [];
  for (let element = svg.parentElement; element; element = element.parentElement) background.unshift(win.getComputedStyle(element).backgroundColor);
  return { clone, size, background };
}
function setDimensions(svg: SVGSVGElement, size: Size): void {
  svg.setAttribute('width', String(size.width)); svg.setAttribute('height', String(size.height));
  svg.style.setProperty('width', `${size.width}px`, 'important'); svg.style.setProperty('height', `${size.height}px`, 'important');
  // The detached file must override native responsive sizing without depending on viewer CSS.
  // eslint-disable-next-line obsidianmd/no-static-styles-assignment -- Portable SVG export requires inline dimensions with priority.
  svg.style.setProperty('max-width', 'none', 'important'); svg.style.setProperty('max-height', 'none', 'important');
}
function serialize(svg: SVGSVGElement): string { return new (windowOf(svg.ownerDocument).XMLSerializer)().serializeToString(svg); }
function svgFile(svg: SVGSVGElement): DiagramFile { return { blob: new (windowOf(svg.ownerDocument).Blob)([serialize(svg)], { type: 'image/svg+xml;charset=utf-8' }), filename: 'diagram.svg' }; }
function boundedSize(size: Size): Size {
  const scale = Math.min(1, MAX_SIDE / size.width, MAX_SIDE / size.height, Math.sqrt(MAX_PIXELS / size.width / size.height));
  return { width: Math.max(1, Math.floor(size.width * scale)), height: Math.max(1, Math.floor(size.height * scale)) };
}
function loadImage(doc: Document, source: string): Promise<HTMLImageElement> {
  const win = windowOf(doc);
  const data = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  return new Promise((resolve, reject) => {
    const image = createHtmlElement(doc, 'img');
    const finish = (error?: Error) => {
      win.clearTimeout(timer); image.onload = null; image.onerror = null;
      if (error) { image.removeAttribute('src'); reject(error); } else resolve(image);
    };
    const timer = win.setTimeout(() => finish(new Error('Image decoding timed out.')), IMAGE_TIMEOUT);
    image.onload = () => finish(); image.onerror = () => finish(new Error('The browser could not decode the exported SVG.'));
    // An SVG data URL keeps self-contained HTML labels origin-clean in Chromium. Blob URLs can taint them.
    try { image.src = data; } catch { finish(new Error('The browser refused SVG image decoding.')); }
  });
}
async function supportsHtmlLabels(doc: Document): Promise<boolean> {
  let pending = foreignObjectSupport.get(doc);
  if (!pending) {
    pending = (async () => {
      const canvas = createHtmlElement(doc, 'canvas'); canvas.width = canvas.height = 2;
      let image: HTMLImageElement | undefined;
      try {
        const context = canvas.getContext('2d'); if (!context) return false;
        image = await loadImage(doc, `<svg xmlns="${SVG}" width="2" height="2"><foreignObject width="2" height="2"><div xmlns="${XHTML}" style="width:2px;height:2px;background:#00ff00"></div></foreignObject></svg>`);
        context.drawImage(image, 0, 0);
        const pixel = context.getImageData(0, 0, 1, 1).data;
        return pixel[0] === 0 && pixel[1] === 255 && pixel[2] === 0 && pixel[3] === 255;
      } catch { return false; }
      finally { image?.removeAttribute('src'); canvas.width = canvas.height = 0; }
    })();
    foreignObjectSupport.set(doc, pending);
  }
  return pending;
}
async function rasterFile(clone: SVGSVGElement, size: Size, background: string[], format: Exclude<ExportFormat, 'svg'>): Promise<DiagramFile> {
  const doc = clone.ownerDocument;
  if (clone.querySelector('foreignObject') && !await supportsHtmlLabels(doc)) throw new Error('This browser cannot safely rasterize HTML diagram labels. Save SVG instead.');
  const output = boundedSize(size);
  setDimensions(clone, output);
  const canvas = createHtmlElement(doc, 'canvas'); canvas.width = output.width; canvas.height = output.height;
  let image: HTMLImageElement | undefined;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser does not provide image export. Save SVG instead.');
    image = await loadImage(doc, serialize(clone));
    if (format === 'jpg') {
      // Flatten against the visible document background so native dark-theme labels stay legible.
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, output.width, output.height);
      for (const color of background) if (color) { context.fillStyle = color; context.fillRect(0, 0, output.width, output.height); }
    }
    context.drawImage(image, 0, 0, output.width, output.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      const win = windowOf(doc);
      const timer = win.setTimeout(() => reject(new Error('Image encoding timed out. Save SVG instead.')), IMAGE_TIMEOUT);
      try {
        canvas.toBlob(value => {
          win.clearTimeout(timer);
          if (value) resolve(value); else reject(new Error('The browser could not encode this image. Save SVG instead.'));
        }, MIME[format], .95);
      } catch (error) { win.clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))); }
    });
    if (blob.type !== MIME[format]) throw new Error(`This browser does not support ${format.toUpperCase()} encoding. Save PNG or SVG instead.`);
    const resized = output.width < Math.floor(size.width) || output.height < Math.floor(size.height);
    return { blob, filename: `diagram.${format}`, ...(resized ? { notice: `Image resized from ${Math.round(size.width)} × ${Math.round(size.height)} to ${output.width} × ${output.height} pixels to keep export safe.` } : {}) };
  } finally { image?.removeAttribute('src'); canvas.width = canvas.height = 0; }
}

/** Creates a detached export; the rendered native SVG and all of its listeners stay untouched. */
export async function exportDiagram(svg: SVGSVGElement, format: ExportFormat): Promise<DiagramFile> {
  if (!['svg', 'png', 'jpg', 'webp'].includes(format)) throw new DiagramExportError('Unsupported diagram export format.');
  const { clone, size, background } = snapshot(svg);
  const fallback = svgFile(clone);
  if (format === 'svg') return fallback;
  try { return await rasterFile(clone, size, background, format); }
  catch (error) {
    throw new DiagramExportError(error instanceof Error ? error.message : 'Image export failed. Save SVG instead.', fallback);
  }
}

/** Initiates a local download. Browser acceptance is not proof that the user saved the file. */
export function downloadFile(doc: Document, blob: Blob, filename: string): void {
  const win = windowOf(doc);
  if (typeof win.URL.createObjectURL !== 'function') throw new DiagramExportError('This browser cannot download files.');
  const url = win.URL.createObjectURL(blob), anchor = createHtmlElement(doc, 'a');
  anchor.href = url; anchor.download = filename; anchor.hidden = true;
  try { doc.body.append(anchor); anchor.click(); }
  finally {
    anchor.remove();
    // Keep the URL alive until the browser has consumed the click's download request.
    win.setTimeout(() => win.URL.revokeObjectURL(url), 1_000);
  }
}

export async function copyText(doc: Document, text: string): Promise<CopyResult> {
  const BlobConstructor = doc.defaultView?.Blob ?? window.Blob;
  const fallback = { blob: new BlobConstructor([text], { type: 'text/plain;charset=utf-8' }), filename: 'diagram.mmd' };
  try {
    const clipboard = windowOf(doc).navigator.clipboard;
    if (!clipboard?.writeText) return { copied: false, notice: 'Source was not copied: clipboard access is unavailable. Save the source file instead.', fallback };
    await clipboard.writeText(text);
    return { copied: true, notice: 'Source copied.' };
  } catch { return { copied: false, notice: 'Source was not copied: clipboard access was denied or failed. Save the source file instead.', fallback }; }
}

export async function copyImage(svg: SVGSVGElement): Promise<CopyResult> {
  const win = windowOf(svg.ownerDocument);
  // Start preparing the image now but call clipboard.write in the initiating user gesture.
  const pending = exportDiagram(svg, 'png');
  let clipboardError = 'Image clipboard access is unavailable.';
  try {
    const Item = win.ClipboardItem, clipboard = win.navigator.clipboard;
    if (Item && clipboard?.write && (!Item.supports || Item.supports('image/png'))) {
      // Promise-backed ClipboardItem preserves user activation while the raster is being prepared.
      const png = pending.then(file => file.blob);
      // Some hosts reject write/constructor before observing their supplied promise.
      void png.catch(() => {});
      const item = new Item({ 'image/png': png });
      await clipboard.write([item]);
      const file = await pending;
      return { copied: true, notice: ['Image copied.', file.notice].filter(Boolean).join(' ') };
    }
  } catch { clipboardError = 'Image clipboard access was denied or failed.'; }
  try {
    const fallback = await pending;
    return { copied: false, notice: `Image was not copied: ${clipboardError} Save the PNG file instead.${fallback.notice ? ` ${fallback.notice}` : ''}`, fallback };
  } catch (error) {
    if (error instanceof DiagramExportError && error.fallback) return { copied: false, notice: `Image was not copied: ${error.message}`, fallback: error.fallback };
    throw error;
  }
}
