import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { DiagramViewer } from '../../src/viewer/diagram';

const nativePath = resolve('.local/native-renderer/mermaid-obsidian-11.13.min.js');
const nativeSha = '6ef73c979e4636b0724eb3b4ee505e53e3a117e4cae31914ec5b2d64f27ff603';
test.skip(!existsSync(nativePath), 'Requires isolated Obsidian 11.13 fixture; see verification docs.');
interface NativeMermaid { initialize(options: Record<string, unknown>): void; render(id: string, source: string): Promise<{ svg: string }> }
declare global {
  interface Window {
    semanticNativeRenderer: NativeMermaid;
    semanticNativeCase: { svg: SVGSVGElement; viewer: DiagramViewer; original: string; elements: Element[]; listenerCount: number; noteShift?: number };
  }
}
test.beforeAll(async () => {
  expect(createHash('sha256').update(await readFile(nativePath)).digest('hex')).toBe(nativeSha);
  await mkdir('evidence/semantic-native', { recursive: true });
});
test.beforeEach(async ({ page }) => {
  await page.goto('/'); await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await page.addScriptTag({ path: nativePath });
  await page.evaluate(() => {
    window.semanticNativeRenderer = (window as unknown as { mermaid: NativeMermaid }).mermaid;
    window.semanticNativeRenderer.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', flowchart: { htmlLabels: false } });
  });
});
async function mount(page: Page, source: string, overlapSideNote = false, nativeFilter = false): Promise<void> {
  await page.evaluate(async ({ source, overlapSideNote, nativeFilter }) => {
    const rendered = await window.semanticNativeRenderer.render('semantic_native_case', source);
    const host = document.createElement('div'); host.id = 'semantic-native-host'; host.className = 'mermaid';
    host.style.width = '1100px'; document.body.append(host); host.innerHTML = rendered.svg;
    const svg = host.querySelector('svg')!;
    if (nativeFilter) svg.querySelector('g.node')!.setAttribute('style', 'filter:grayscale(.4);opacity:.8');
    let noteShift: number | undefined;
    if (overlapSideNote) {
      const note = [...svg.querySelectorAll('g')].find(group => group.querySelector('rect.note') && group.textContent?.trim() === 'Side note for A');
      const rect = note?.querySelector('rect.note');
      const line = svg.querySelector('.actor-line[name="B"]');
      if (!note || !rect || !line) throw new Error('Native sequence fixture did not expose the expected note and named lifeline.');
      noteShift = Number(line.getAttribute('x1')) - (Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2);
      note.setAttribute('transform', `translate(${noteShift},0)`);
    }
    const original = svg.outerHTML, elements = [svg, ...svg.querySelectorAll('*')];
    const snapshot = { source, document: source, start: 0, end: source.length, line: 0 };
    const viewer = new window.demo.DiagramViewer(svg, undefined, { read: async () => snapshot, validate: async () => {}, write: async () => {} }, undefined,
      { ...window.demo.DEFAULT_SETTINGS, initialFit: 'contain', lineHitWidth: 12 });
    window.semanticNativeCase = { svg, viewer, original, elements, listenerCount: 0, noteShift };
    svg.addEventListener('native-semantic-proof', () => window.semanticNativeCase.listenerCount++);
  }, { source, overlapSideNote, nativeFilter });
  const root = page.locator('#semantic-native-host .kmv-viewer');
  await expect(root).toHaveAttribute('data-ready', 'true'); await root.scrollIntoViewIfNeeded();
}
async function identity(page: Page) {
  return page.evaluate(() => {
    const saved = window.semanticNativeCase;
    saved.svg.dispatchEvent(new Event('native-semantic-proof'));
    return { sameSvg: document.querySelector<SVGSVGElement>(`svg#${CSS.escape(saved.svg.id)}`) === saved.svg, retainedElements: saved.elements.every(element => element === saved.svg || saved.svg.contains(element)), listenerCount: saved.listenerCount };
  });
}
async function dispose(page: Page): Promise<void> {
  const result = await page.evaluate(() => {
    const saved = window.semanticNativeCase; saved.viewer.dispose();
    return { restored: saved.svg.outerHTML === saved.original, proxies: saved.svg.querySelectorAll('[data-kmv-hit-target]').length, retained: saved.elements.every(element => element === saved.svg || saved.svg.contains(element)) };
  });
  expect(result).toEqual({ restored: true, proxies: 0, retained: true });
  await page.evaluate(() => document.getElementById('semantic-native-host')?.remove());
}
async function offsetPoint(edge: Locator) {
  return edge.evaluate(element => {
    const path = element as SVGPathElement, matrix = path.getScreenCTM()!;
    const length = path.getTotalLength(), middle = path.getPointAtLength(length / 2), before = path.getPointAtLength(length / 2 - .1), after = path.getPointAtLength(length / 2 + .1);
    const convert = (point: DOMPoint) => ({ x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f });
    const a = convert(before), b = convert(after), center = convert(middle), size = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: center.x - (b.y - a.y) * 5 / size, y: center.y + (b.x - a.x) * 5 / size, center, normal: { x: -(b.y - a.y) / size, y: (b.x - a.x) / size }, scale: Math.hypot(matrix.a, matrix.b) };
  });
}
test('native 11.13 edges accept a pointer five screen pixels away at three zoom levels and export cleanly', async ({ page }) => {
  await mount(page, 'flowchart LR\n A[Left] --> B[Right]');
  const root = page.locator('#semantic-native-host .kmv-viewer');
  const edge = root.locator('path.flowchart-link').first();
  const nativeAttributes = await edge.evaluate(element => [...element.attributes].filter(attribute => !attribute.name.startsWith('data-kmv-') && !['class', 'style'].includes(attribute.name)).map(attribute => [attribute.name, attribute.value]));
  const receipts: unknown[] = [];
  for (const scale of [.35, 1, 2]) {
    await root.getByRole('textbox', { name: 'Zoom percentage' }).fill(String(scale * 100));
    await root.getByRole('textbox', { name: 'Zoom percentage' }).press('Enter');
    await expect(root).toHaveAttribute('data-scale', String(scale));
    const point = await offsetPoint(edge);
    await page.mouse.move(point.x, point.y);
    const diagnosis = await edge.evaluate((element, point) => {
      const path = element as SVGPathElement, proxy = path.previousElementSibling as SVGPathElement | null;
      const box = (element: Element) => { const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; };
      const matrix = (matrix: DOMMatrix | null) => matrix ? { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f } : null;
      return { point, nativeBox: box(path), svgBox: box(path.ownerSVGElement!), viewportBox: box(path.closest('.kmv-viewport')!),
        proxy: proxy ? { attrs: [...proxy.attributes].map(attribute => [attribute.name, attribute.value]), box: box(proxy), ctm: matrix(proxy.getCTM()), screenCtm: matrix(proxy.getScreenCTM()), stroke: getComputedStyle(proxy).strokeWidth } : null,
        offsets: [0, 1, 2, 3, 4, 5, 6].map(offset => { const target = document.elementFromPoint(point.center.x + point.normal.x * offset, point.center.y + point.normal.y * offset); return { offset, tag: target?.localName, id: target?.id, classes: target?.getAttribute('class'), proxy: target?.hasAttribute('data-kmv-hit-target') }; }) };
    }, point);
    await writeFile(`evidence/semantic-native/wide-line-diagnosis-${scale}.json`, JSON.stringify(diagnosis, null, 2));
    await expect(edge).toHaveClass(/kmv-semantic-active/);
    const observed = await page.evaluate(point => {
      const target = document.elementFromPoint(point.x, point.y);
      return { proxy: target?.hasAttribute('data-kmv-hit-target'), stroke: target ? getComputedStyle(target).strokeWidth : '', vectorEffect: target ? getComputedStyle(target).vectorEffect : '' };
    }, point);
    expect(observed.proxy).toBe(true); expect(observed.vectorEffect).toBe('non-scaling-stroke');
    expect(Number.parseFloat(observed.stroke) * point.scale).toBeCloseTo(12, 2);
    receipts.push({ scale, point, observed, identity: await identity(page) });
    expect(await edge.evaluate(element => [...element.attributes].filter(attribute => !attribute.name.startsWith('data-kmv-') && !['class', 'style'].includes(attribute.name)).map(attribute => [attribute.name, attribute.value]))).toEqual(nativeAttributes);
  }
  await root.getByRole('button', { name: 'Source & export', exact: true }).click();
  const pending = page.waitForEvent('download'); await root.getByRole('button', { name: 'Save diagram as SVG', exact: true }).click();
  const download = await pending, path = await download.path(); expect(path).toBeTruthy();
  const exported = await readFile(path!, 'utf8');
  expect(exported).not.toContain('data-kmv-hit-target'); expect(exported).not.toContain('kmv-semantic');
  const nativePathCount = await page.evaluate(() => window.semanticNativeCase.elements.filter(element => element.localName === 'path').length);
  const exportedPaths = await page.evaluate(exported => new DOMParser().parseFromString(exported, 'image/svg+xml').querySelectorAll('path').length, exported);
  expect(exportedPaths).toBe(nativePathCount);
  expect((await identity(page)).sameSvg).toBe(true);
  await writeFile('evidence/semantic-native/wide-line-receipt.json', JSON.stringify({ renderer: 'Obsidian bundled Mermaid 11.13.0 in standalone Chromium', nativeSha, receipts, exportedPaths, nativePathCount }, null, 2));
  await page.screenshot({ path: 'evidence/semantic-native/wide-line.png' });
  await dispose(page);
});
test('wide hit areas follow the shared native SVG through independent modal and inline zoom', async ({ page }) => {
  const source = 'flowchart LR\n ' + Array.from({ length: 9 }, (_, index) => `N${index}[Node ${index} wider native label]`).join(' --> ');
  await mount(page, source);
  const root = page.locator('#semantic-native-host .kmv-viewer');
  await root.getByRole('textbox', { name: 'Zoom percentage' }).fill('35'); await root.getByRole('textbox', { name: 'Zoom percentage' }).press('Enter');
  await expect(root).toHaveAttribute('data-scale', '0.35');
  await root.getByRole('button', { name: 'Open diagram lightbox', exact: true }).click();
  const modal = page.locator('.kmv-dialog .kmv-viewer'); await expect(modal).toHaveAttribute('data-mode', 'contain');
  await modal.getByRole('button', { name: 'Native size (100%)', exact: true }).click(); await expect(modal).toHaveAttribute('data-scale', '1');
  const modalEdge = modal.locator('path.flowchart-link').nth(4), nativePoint = await offsetPoint(modalEdge);
  await page.mouse.move(nativePoint.x, nativePoint.y); await expect(modalEdge).toHaveClass(/kmv-semantic-active/);
  expect((await identity(page)).sameSvg).toBe(true);
  await modal.getByRole('button', { name: 'Fit whole chart', exact: true }).click(); await expect(modal).toHaveAttribute('data-mode', 'contain');
  expect(Number(await modal.getAttribute('data-scale'))).toBeLessThan(1);
  const fitPoint = await offsetPoint(modalEdge); await page.mouse.move(fitPoint.x, fitPoint.y); await expect(modalEdge).toHaveClass(/kmv-semantic-active/);
  await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0); await expect(root).toHaveAttribute('data-scale', '0.35');
  const inlineEdge = root.locator('path.flowchart-link').nth(4), restoredPoint = await offsetPoint(inlineEdge);
  await page.mouse.move(restoredPoint.x, restoredPoint.y); await expect(inlineEdge).toHaveClass(/kmv-semantic-active/);
  await writeFile('evidence/semantic-native/modal-scale-receipt.json', JSON.stringify({ nativePoint, fitPoint, restoredPoint, identity: await identity(page) }, null, 2));
  await dispose(page);
});
test('native composite participant IDs never create phantom note relationships for A and B', async ({ page }) => {
  for (const id of ['A|B', 'A&B']) {
    await mount(page, `sequenceDiagram\n participant ${id} as Composite\n participant A\n participant B\n Note over ${id}: Only composite`);
    const root = page.locator('#semantic-native-host .kmv-viewer'), note = root.locator('[data-kmv-kind="note"]').filter({ hasText: 'Only composite' });
    for (const actor of ['A', 'B', id]) {
      const point = await root.locator(`rect.actor.actor-top[name="${actor}"]`).evaluate(element => { const rect = element.getBoundingClientRect(); return { x: rect.left + 10, y: rect.top + 10 }; });
      await page.mouse.move(point.x, point.y); await expect(root.locator(`.actor-line[name="${actor}"]`)).toHaveClass(/kmv-semantic-active/);
      await expect(note).toHaveClass(/kmv-semantic-dim/); await expect(note).not.toHaveClass(/kmv-semantic-related/);
    }
    await dispose(page);
  }
});
test('native sequence lifelines include source-associated messages and notes without proximity guesses', async ({ page }) => {
  const source = 'sequenceDiagram\n participant A as Alpha\n participant B as Beta\n participant C as Gamma\n A->>B: First unique\n B--xA: Returned unique\n Note right of A: Side note for A\n Note over A,C: Shared note\n Note over B: Only Beta\n A->>A: Self unique';
  await mount(page, source, true);
  const root = page.locator('#semantic-native-host .kmv-viewer');
  const point = await root.locator('.actor-line[name="A"]').evaluate(element => {
    const line = element as SVGLineElement, matrix = line.getScreenCTM()!;
    const x = Number(line.getAttribute('x1')), y = Number(line.getAttribute('y1')) + 10;
    return { x: matrix.a * x + matrix.c * y + matrix.e + 4, y: matrix.b * x + matrix.d * y + matrix.f };
  });
  await page.mouse.move(point.x, point.y);
  await expect(root.locator('.actor-line[name="A"]')).toHaveClass(/kmv-semantic-active/);
  const edgeFor = (label: string) => root.locator('.messageText').filter({ hasText: label });
  await expect(edgeFor('First unique')).toHaveClass(/kmv-semantic-outgoing/);
  await expect(edgeFor('Returned unique')).toHaveClass(/kmv-semantic-incoming/);
  await expect(edgeFor('Self unique')).toHaveClass(/kmv-semantic-both/);
  await expect(root.locator('[data-kmv-kind="note"]').filter({ hasText: 'Side note for A' })).toHaveClass(/kmv-semantic-related/);
  await expect(root.locator('[data-kmv-kind="note"]').filter({ hasText: 'Shared note' })).toHaveClass(/kmv-semantic-related/);
  await expect(root.locator('[data-kmv-kind="note"]').filter({ hasText: 'Only Beta' })).toHaveClass(/kmv-semantic-dim/);
  const betaPoint = await root.locator('rect.actor.actor-top[name="B"]').evaluate(element => { const rect = element.getBoundingClientRect(); return { x: rect.left + 10, y: rect.top + 10 }; });
  await page.mouse.move(betaPoint.x, betaPoint.y);
  await expect(root.locator('.actor-line[name="B"]')).toHaveClass(/kmv-semantic-active/);
  await expect(root.locator('[data-kmv-kind="note"]').filter({ hasText: 'Only Beta' })).toHaveClass(/kmv-semantic-related/);
  await expect(root.locator('[data-kmv-kind="note"]').filter({ hasText: 'Side note for A' })).toHaveClass(/kmv-semantic-dim/);
  await expect(root.locator('[data-kmv-kind="note"]').filter({ hasText: 'Shared note' })).toHaveClass(/kmv-semantic-dim/);
  const receipt = await page.evaluate(() => ({ nativeSha: '6ef73c979e4636b0724eb3b4ee505e53e3a117e4cae31914ec5b2d64f27ff603', fixtureOnlyNoteShift: window.semanticNativeCase.noteShift,
    items: [...window.semanticNativeCase.svg.querySelectorAll('[data-kmv-kind]')].map(element => ({ kind: element.getAttribute('data-kmv-kind'), id: element.id, label: element.textContent, classes: element.getAttribute('class') })) }));
  await writeFile('evidence/semantic-native/sequence-receipt.json', JSON.stringify(receipt, null, 2));
  await page.screenshot({ path: 'evidence/semantic-native/sequence-source-associations.png' });
  expect((await identity(page)).retainedElements).toBe(true); await dispose(page);
});
test('semantic emphasis composes a native filter and restores native style bytes', async ({ page }) => {
  await mount(page, 'flowchart LR\n A[Filtered] --> B[Native]', false, true);
  const root = page.locator('#semantic-native-host .kmv-viewer'), node = root.locator('g.node').first();
  await node.hover(); await expect(node).toHaveClass(/kmv-semantic-active/);
  const emphasized = await node.evaluate(element => getComputedStyle(element).filter);
  expect(emphasized).toMatch(/^grayscale\(0\.4\) drop-shadow\(/);
  await root.getByRole('textbox', { name: 'Zoom percentage' }).hover();
  await expect(node).not.toHaveClass(/kmv-semantic-active/);
  await expect(node).toHaveAttribute('style', 'filter:grayscale(.4);opacity:.8');
  await expect(node).toHaveCSS('filter', 'grayscale(0.4)');
  await writeFile('evidence/semantic-native/filter-receipt.json', JSON.stringify({ emphasized, nativeAfterClear: await node.getAttribute('style'), identity: await identity(page) }, null, 2));
  await dispose(page);
});
