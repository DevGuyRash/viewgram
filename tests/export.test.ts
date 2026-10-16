import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { copyImage, copyText, DiagramExportError, downloadFile, exportDiagram } from '../src/viewer/export';
import { setDomCreationPlatform } from '../src/viewer/dom';
import { browserDomCreation } from '../demo/browser-dom';

setDomCreationPlatform(browserDomCreation);

let window: Window;
beforeEach(() => { window = new Window({ url: 'https://viewer.invalid/note' }); });
afterEach(async () => { await window.happyDOM.abort(); });
const document = () => window.document as unknown as Document;
function svg(markup = '<rect width="100" height="40" fill="red"/>'): SVGSVGElement {
  const host = window.document.createElement('div');
  host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="5 10 600 300" width="100%">${markup}</svg>`;
  window.document.body.append(host);
  return host.firstElementChild as unknown as SVGSVGElement;
}

test('SVG export uses native dimensions, preserves original and removes viewer metadata', async () => {
  const original = svg('<g class="node kmv-semantic" data-kmv-kind="node"><rect width="100" height="40" style="fill: rgb(255, 0, 0)"/></g>');
  const before = original.outerHTML;
  const file = await exportDiagram(original, 'svg');
  assert.equal(file.filename, 'diagram.svg');
  assert.equal(file.blob.type, 'image/svg+xml;charset=utf-8');
  const content = await file.blob.text();
  assert.match(content, /viewBox="5 10 600 300"/);
  assert.match(content, /width="600"/);
  assert.match(content, /height="300"/);
  assert.match(content, /class="node"/);
  assert.doesNotMatch(content, /data-kmv-|kmv-semantic/);
  assert.equal(original.outerHTML, before);
});

test('source clipboard reports confirmed success only after write resolves', async () => {
  let text = '';
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { text = value; } } });
  const result = await copyText(document(), 'flowchart LR\n  A-->B');
  assert.equal(result.copied, true);
  assert.equal(text, 'flowchart LR\n  A-->B');
});

test('unavailable or denied source clipboard returns exact downloadable source', async () => {
  for (const clipboard of [undefined, { writeText: async () => { throw new Error('Permission denied'); } }]) {
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: clipboard });
    const result = await copyText(document(), 'flowchart LR\n  A-->B');
    assert.equal(result.copied, false);
    if (result.copied) throw new Error('Expected fallback');
    assert.match(result.notice, /not copied/i);
    assert.equal(result.fallback.filename, 'diagram.mmd');
    assert.equal(await result.fallback.blob.text(), 'flowchart LR\n  A-->B');
  }
});

test('standalone SVG freezes presentation, removes executable content and keeps local markers', async () => {
  const original = svg(`<defs><marker id="arrow"><path d="M0 0L4 2L0 4Z"/></marker></defs><path class="label" d="M0 0L30 20" marker-end="url(https://viewer.invalid/note#arrow)" onclick="alert(1)"/><script>alert(2)</script><animate attributeName="opacity"/><a href="https://external.invalid" onclick="alert(3)"><text>Hello</text></a>`);
  const style = window.document.createElement('style'); style.textContent = '.label { fill: rgb(10, 20, 30) }'; window.document.head.append(style);
  const embeddedStyle = window.document.createElementNS('http://www.w3.org/2000/svg', 'style'); embeddedStyle.textContent = '.unneeded { fill: red }'; original.append(embeddedStyle as unknown as SVGElement);
  original.querySelector('script')!.textContent = 'alert(2)';
  const before = original.outerHTML;
  const content = await (await exportDiagram(original, 'svg')).blob.text();
  assert.doesNotMatch(content, /<style|<script|<animate|onclick|https:\/\/external/);
  assert.match(content, /marker-end="url\(&quot;#arrow&quot;\)"/);
  assert.match(content, /fill: rgb\(10, 20, 30\)/);
  assert.equal(original.outerHTML, before);
});

test('HTML labels keep their XHTML namespace and resolved label layout', async () => {
  const original = svg('<foreignObject x="10" y="20" width="200" height="60"/>');
  const label = window.document.createElementNS('http://www.w3.org/1999/xhtml', 'div'); label.setAttribute('style', 'font: bold 20px sans-serif; color: rgb(10,20,30); width: 200px'); label.innerHTML = 'Hello<br/>label'; original.querySelector('foreignObject')!.append(label as unknown as HTMLElement);
  const content = await (await exportDiagram(original, 'svg')).blob.text();
  assert.match(content, /xmlns="http:\/\/www.w3.org\/1999\/xhtml"/);
  assert.match(content, /(?:font-size: 20px|font: bold 20px)/);
  assert.match(content, /color: rgb\(10, 20, 30\)/);
  assert.match(content, /Hello<br[^>]*\/>label/);
});

test('external resources fail before a snapshot can initiate a fetch', async () => {
  for (const markup of ['<image href="https://external.invalid/image.png"/>', '<rect style="fill:url(https://external.invalid/paint.svg#color)"/>']) {
    const original = svg(markup);
    original.cloneNode = () => { throw new Error('Must validate before cloning'); };
    await assert.rejects(exportDiagram(original, 'svg'), /external image or resource/);
  }
});

test('invalid geometry and active hover fail explicitly without mutating the native SVG', async () => {
  const original = svg(); original.setAttribute('viewBox', '0 0 0 0');
  await assert.rejects(exportDiagram(original, 'svg'), /native dimensions/);
  original.setAttribute('viewBox', '0 0 600 300'); original.classList.add('kmv-has-semantic-hover');
  const before = original.outerHTML;
  await assert.rejects(exportDiagram(original, 'png'), /highlighted diagram/);
  assert.equal(original.outerHTML, before);
});

type RasterHarness = ReturnType<typeof rasterHarness>;
function rasterHarness(options: { htmlLabels?: boolean; decode?: boolean; mime?: string; nullBlob?: boolean } = {}) {
  const contexts: { canvas: HTMLCanvasElement; fills: string[]; draws: number[][] }[] = [];
  const decoded: string[] = [];
  Object.defineProperty(window.HTMLImageElement.prototype, 'src', {
    configurable: true,
    set(value: string) {
      decoded.push(decodeURIComponent(value.split(',').slice(1).join(',')));
      queueMicrotask(() => this.dispatchEvent(new window.Event(options.decode === false ? 'error' : 'load')));
    },
  });
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value(this: HTMLCanvasElement) {
      const record = { canvas: this, fills: [] as string[], draws: [] as number[][] };
      contexts.push(record);
      return {
        fillStyle: '',
        fillRect() { record.fills.push(this.fillStyle); },
        drawImage(_image: unknown, ...args: number[]) { record.draws.push(args); },
        getImageData() { return { data: new Uint8ClampedArray(options.htmlLabels === false ? [0, 0, 0, 0] : [0, 255, 0, 255]) }; },
      };
    },
  });
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    value(callback: BlobCallback, type: string) { callback(options.nullBlob ? null : new Blob(['pixels'], { type: options.mime ?? type })); },
  });
  return { contexts, decoded };
}
function rasterDraw(harness: RasterHarness): number[] { return harness.contexts.at(-1)!.draws.at(-1)!; }

test('PNG, JPG and WebP select exact encoders; only JPG flattens the document background', async () => {
  const harness = rasterHarness(); window.document.body.style.backgroundColor = 'rgb(12, 20, 30)';
  const original = svg();
  for (const [format, mime] of [['png', 'image/png'], ['jpg', 'image/jpeg'], ['webp', 'image/webp']] as const) {
    const before = original.outerHTML;
    const file = await exportDiagram(original, format);
    assert.equal(file.filename, `diagram.${format}`); assert.equal(file.blob.type, mime);
    assert.deepEqual(rasterDraw(harness), [0, 0, 600, 300]);
    const context = harness.contexts.at(-1)!;
    if (format === 'jpg') { assert.equal(context.fills[0], '#ffffff'); assert.ok(context.fills.includes('rgb(12, 20, 30)')); }
    else assert.equal(context.fills.length, 0);
    assert.equal(original.outerHTML, before);
    assert.equal(context.canvas.width, 0); assert.equal(context.canvas.height, 0);
  }
});

test('huge raster dimensions are bounded before decoding, with a resizing notice', async () => {
  const harness = rasterHarness(); const original = svg(); original.setAttribute('viewBox', '0 0 100000 100000');
  const file = await exportDiagram(original, 'png');
  assert.match(file.notice!, /resized.*4096 × 4096/);
  assert.deepEqual(rasterDraw(harness), [0, 0, 4096, 4096]);
  assert.match(harness.decoded[0]!, /width="4096"/);
  assert.match(harness.decoded[0]!, /viewBox="0 0 100000 100000"/);
  original.setAttribute('viewBox', '0 0 100000 10');
  await exportDiagram(original, 'png');
  assert.deepEqual(rasterDraw(harness), [0, 0, 8192, 1]);
});

test('HTML labels are capability-tested once and fail with a complete native SVG fallback', async () => {
  const harness = rasterHarness({ htmlLabels: false });
  const original = svg('<foreignObject width="100" height="20"><div xmlns="http://www.w3.org/1999/xhtml">Important label</div></foreignObject>');
  for (let i = 0; i < 2; i++) {
    try { await exportDiagram(original, 'png'); assert.fail('Expected a raster error'); }
    catch (error) {
      assert.ok(error instanceof DiagramExportError); assert.match(error.message, /HTML diagram labels/);
      assert.equal(error.fallback?.filename, 'diagram.svg');
      assert.match(await error.fallback!.blob.text(), /Important label/);
      assert.match(await error.fallback!.blob.text(), /width="600"/);
    }
  }
  assert.equal(harness.decoded.length, 1);
});

test('encoder fallback and decoding failures never return a mislabelled or empty image', async () => {
  for (const options of [{ mime: 'image/png' }, { decode: false }, { nullBlob: true }]) {
    rasterHarness(options);
    await assert.rejects(exportDiagram(svg(), 'webp'), error => error instanceof DiagramExportError && error.fallback?.filename === 'diagram.svg');
  }
});

test('copy image supplies a PNG promise inside the user gesture and waits for confirmed write', async () => {
  rasterHarness(); let written = false;
  class ClipboardItem {
    constructor(readonly values: Record<string, Promise<Blob>>) {}
    static supports(type: string) { return type === 'image/png'; }
  }
  Object.defineProperty(window, 'ClipboardItem', { configurable: true, value: ClipboardItem });
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { write: async (items: ClipboardItem[]) => {
    written = true; assert.ok(items[0]!.values['image/png'] instanceof Promise);
    assert.equal((await items[0]!.values['image/png'])!.type, 'image/png');
  } } });
  const pending = copyImage(svg()); assert.equal(written, true);
  assert.equal((await pending).copied, true);
});

test('image clipboard absent or denied yields a PNG download; raster failure yields SVG', async () => {
  rasterHarness();
  Object.defineProperty(window, 'ClipboardItem', { configurable: true, value: class ClipboardItem {} });
  for (const clipboard of [undefined, { write: async () => { throw new Error('Denied'); } }]) {
    Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: clipboard });
    const result = await copyImage(svg()); assert.equal(result.copied, false);
    if (result.copied) throw new Error('Expected a fallback');
    assert.match(result.notice, /not copied/); assert.equal(result.fallback.filename, 'diagram.png');
  }
  rasterHarness({ decode: false });
  const result = await copyImage(svg()); assert.equal(result.copied, false);
  if (result.copied) throw new Error('Expected a fallback');
  assert.equal(result.fallback.filename, 'diagram.svg');
});

test('download creates one local anchor, removes it and revokes the URL after use', async () => {
  const created: Blob[] = [], revoked: string[] = [], clicks: string[] = [];
  Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value: (blob: Blob) => { created.push(blob); return 'blob:local-export'; } });
  Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value: (url: string) => revoked.push(url) });
  Object.defineProperty(window.HTMLAnchorElement.prototype, 'click', { configurable: true, value(this: HTMLAnchorElement) { clicks.push(this.download); assert.equal(this.href, 'blob:local-export'); } });
  const pendingTimers: (() => void)[] = [];
  const originalTimer = window.setTimeout;
  window.setTimeout = ((callback: () => void) => { pendingTimers.push(callback); return 1; }) as unknown as typeof window.setTimeout;
  const blob = new Blob(['diagram']);
  try { downloadFile(document(), blob, 'diagram.svg'); }
  finally { window.setTimeout = originalTimer; }
  assert.deepEqual(created, [blob]); assert.deepEqual(clicks, ['diagram.svg']);
  assert.equal(window.document.querySelector('a'), null); assert.equal(revoked.length, 0);
  pendingTimers.forEach(callback => callback()); assert.deepEqual(revoked, ['blob:local-export']);
});

test('foreignObject positive capability allows a complete HTML-label raster image', async () => {
  const harness = rasterHarness();
  const file = await exportDiagram(svg('<foreignObject width="100" height="20"><div>Important label</div></foreignObject>'), 'png');
  assert.equal(file.filename, 'diagram.png');
  assert.equal(harness.decoded.length, 2);
  assert.match(harness.decoded[1]!, /Important label/);
  assert.deepEqual(rasterDraw(harness), [0, 0, 600, 300]);
});

test('unsupported image clipboard format skips write and offers an explicit PNG fallback', async () => {
  rasterHarness(); let written = false;
  Object.defineProperty(window, 'ClipboardItem', { configurable: true, value: class ClipboardItem { static supports() { return false; } } });
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { write: async () => { written = true; } } });
  const result = await copyImage(svg());
  assert.equal(written, false); assert.equal(result.copied, false);
  if (result.copied) throw new Error('Expected fallback');
  assert.equal(result.fallback.filename, 'diagram.png');
});
