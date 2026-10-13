import { test, expect, type Locator, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const nativeBundle = resolve('.local/native-renderer/mermaid-obsidian-11.13.min.js');
const nativeSha256 = '6ef73c979e4636b0724eb3b4ee505e53e3a117e4cae31914ec5b2d64f27ff603';
const fixtureSource = 'flowchart LR\r\n A(["Old"]) -->|out| B[Right]\r\n C[Other] -->|in| A\r\n A --- D[Peer]\r\n E[Unrelated] --> F[Else]\r\n\r\n';
const notePrefix = '# Intended note\r\n\r\n```mermaid\r\n';
const noteSuffix = '```\r\nTail preserved\r\n\r\n```mermaid\r\npie\r\n "Other": 1\r\n```\r\n';

test.skip(!existsSync(nativeBundle), 'Requires isolated Obsidian11.13 fixture; see verification docs.');
test.beforeAll(async () => {
  if (existsSync(nativeBundle)) expect(createHash('sha256').update(readFileSync(nativeBundle)).digest('hex')).toBe(nativeSha256);
  await mkdir('evidence/ui-v2', { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await page.goto('/'); await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await page.addScriptTag({ path: nativeBundle });
});

// Real browser UI/native Mermaid; the synthetic note provider keeps persistence outcomes observable.
async function mountSource(page: Page, source: string) {
  await page.evaluate(async ({ source, notePrefix, noteSuffix }) => {
    const native = (window as unknown as { mermaid: {
      initialize(settings: unknown): void;
      render(id: string, source: string): Promise<{ svg: string }>;
      parse(source: string): Promise<unknown>;
    } }).mermaid;
    native.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default' });
    const host = document.createElement('div'); host.className = 'mermaid'; host.dataset.nodeEditorFixture = '';
    document.querySelector('main')!.prepend(host);
    let current = source, documentText = notePrefix + source + noteSuffix, revision = 0;
    const render = async (text: string) => {
      const rendered = await native.render(`native_source_editor_${++revision}`, text);
      host.replaceChildren(document.importNode(new DOMParser().parseFromString(rendered.svg, 'image/svg+xml').documentElement, true));
    };
    await render(current);
    const provider = {
      read: async () => ({ source: current, document: documentText, start: notePrefix.length, end: notePrefix.length + current.length, line: 2 }),
      validate: async (text: string) => { await native.parse(text); },
      write: async (snapshot: { document: string; start: number; end: number }, text: string) => {
        if (snapshot.document !== documentText) throw new Error('Synthetic note changed while editing.');
        await render(text);
        documentText = documentText.slice(0, snapshot.start) + text + documentText.slice(snapshot.end); current = text;
      },
    };
    const scope = new window.demo.RenderScope(host, undefined, () => provider, window.demo.sessions);
    window.demo.scopes.push(scope);
    (window as unknown as { nodeEditorProbe: { read(): { source: string; document: string } } }).nodeEditorProbe = { read: () => ({ source: current, document: documentText }) };
  }, { source, notePrefix, noteSuffix });
  const root = page.locator('[data-node-editor-fixture] .kmv-viewer');
  await expect(root).toHaveAttribute('data-ready', 'true'); await root.scrollIntoViewIfNeeded(); return root;
}
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Edit Mermaid source' });
async function sourceDocument(code: Locator): Promise<string> {
  return code.evaluate(element => window.demo.EditorView.findFromDOM(element as HTMLElement)!.state.doc.toString());
}
async function readNote(page: Page) {
  return page.evaluate(() => (window as unknown as { nodeEditorProbe: { read(): { source: string; document: string } } }).nodeEditorProbe.read());
}

async function tokenContrast(code: Locator) {
  return code.evaluate(element => {
    const spans = [...element.querySelectorAll('.cm-line span')];
    const keyword = spans.find(span => span.textContent === 'flowchart');
    const string = spans.find(span => span.textContent === '"Draft label"');
    if (!keyword || !string) throw new Error('Expected Mermaid keyword and quoted label tokens are missing.');
    const background = getComputedStyle(element.closest('.cm-editor')!).backgroundColor;
    const luminance = (color: string): number => {
      const channels = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!channels) throw new Error(`Cannot inspect actual token color ${color}.`);
      const [r, g, b] = channels.slice(1, 4).map(channel => { const value = Number(channel) / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; });
      return .2126 * r! + .7152 * g! + .0722 * b!;
    };
    const ratio = (color: string): number => {
      const a = luminance(color), b = luminance(background);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    };
    const keywordColor = getComputedStyle(keyword).color, stringColor = getComputedStyle(string).color;
    return { keyword: ratio(keywordColor), string: ratio(stringColor), keywordColor, stringColor, background };
  });
}

test('native node editor shows only its text and all attached relationships, saving safe spans with source bytes preserved', async ({ page }) => {
  const root = await mountSource(page, fixtureSource);
  await root.locator('g.node').filter({ hasText: /^Old$/ }).dblclick();
  const editor = dialog(page); await expect(editor).toHaveAttribute('data-mode', 'node');
  await expect(editor.getByRole('textbox', { name: 'Mermaid source', exact: true })).toHaveCount(0);
  const relationships = editor.getByRole('region', { name: 'Attached relationships' });
  await expect(relationships.locator('.kmv-source-relationship')).toHaveCount(3);
  await expect(relationships).toContainText('A --> B'); await expect(relationships).toContainText('C --> A'); await expect(relationships).toContainText('A --- D');
  await expect(relationships).not.toContainText('Unrelated'); await expect(relationships).not.toContainText('E --> F');
  await page.screenshot({ path: 'evidence/ui-v2/node-editor.png' });
  const value = 'New "label" <tag> [x] & 😀';
  await editor.getByRole('textbox', { name: 'Element label', exact: true }).fill(value);
  await editor.getByRole('textbox', { name: 'Relationship 1 label', exact: true }).fill('edited "edge" | #34; % &');
  await editor.getByRole('button', { name: 'Save source', exact: true }).click(); await expect(editor).toHaveCount(0);
  const expected = 'flowchart LR\r\n A(["New #34;label#34; #60;tag#62; #91;x#93; #38; 😀"]) -->|"edited #34;edge#34; #124; #35;34#59; #37; #38;"| B[Right]\r\n C[Other] -->|in| A\r\n A --- D[Peer]\r\n E[Unrelated] --> F[Else]\r\n\r\n';
  await expect.poll(async () => (await readNote(page)).document).toBe(notePrefix + expected + noteSuffix);
  await expect(root.locator('g.node').filter({ hasText: value })).toHaveCount(1);
  await expect(root.locator('g.edgeLabel').filter({ hasText: 'edited "edge" | #34; % &' })).toHaveCount(1);
  await root.locator('g.node').filter({ hasText: value }).dblclick();
  await expect(dialog(page).getByRole('textbox', { name: 'Element label', exact: true })).toHaveValue(value);
  await dialog(page).getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('explicit whole chart action carries node draft into highlighted source and toggles wrapping without changing it', async ({ page }) => {
  const root = await mountSource(page, fixtureSource);
  await root.locator('g.node').filter({ hasText: /^Old$/ }).dblclick(); const editor = dialog(page);
  await editor.getByRole('textbox', { name: 'Element label', exact: true }).fill('Draft label');
  await editor.getByRole('button', { name: 'Edit whole chart', exact: true }).click();
  await expect(editor).toHaveAttribute('data-mode', 'source'); await expect(editor.locator('.kmv-node-fields')).toHaveCount(0);
  const code = editor.getByRole('textbox', { name: 'Mermaid source', exact: true });
  const draft = await sourceDocument(code); expect(draft).toContain('A(["Draft label"])');
  await expect(code.locator('.cm-line span').filter({ hasText: /^flowchart$/ })).toHaveCount(1);
  const keyword = code.locator('.cm-line span').filter({ hasText: /^flowchart$/ });
  expect(await keyword.evaluate(element => getComputedStyle(element).color)).not.toBe(await code.evaluate(element => getComputedStyle(element).color));
  const toggle = editor.getByRole('checkbox', { name: 'Wrap lines', exact: true }); await expect(toggle).toBeChecked();
  await expect(editor.locator('.cm-content')).toHaveClass(/cm-lineWrapping/);
  await toggle.uncheck(); await expect(editor.locator('.cm-content')).not.toHaveClass(/cm-lineWrapping/);
  expect(await sourceDocument(code)).toBe(draft);
  await toggle.check(); await expect(editor.locator('.cm-content')).toHaveClass(/cm-lineWrapping/); expect(await sourceDocument(code)).toBe(draft);
  const dark = await tokenContrast(code); expect(dark.keyword, JSON.stringify(dark)).toBeGreaterThanOrEqual(4.5); expect(dark.string, JSON.stringify(dark)).toBeGreaterThanOrEqual(4.5);
  await page.evaluate(() => document.body.classList.add('theme-light'));
  const light = await tokenContrast(code); expect(light.keyword, JSON.stringify(light)).toBeGreaterThanOrEqual(4.5); expect(light.string, JSON.stringify(light)).toBeGreaterThanOrEqual(4.5);
  expect(light.keywordColor).not.toBe(dark.keywordColor); expect(await sourceDocument(code)).toBe(draft);
  await page.evaluate(() => document.body.classList.remove('theme-light'));
  await page.screenshot({ path: 'evidence/ui-v2/highlighted-source.png' });
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click(); expect((await readNote(page)).source).toBe(fixtureSource);
});

test('ambiguous node declarations stay read only until explicit whole chart editing', async ({ page }) => {
  const source = 'flowchart LR\n A["First"] --> B\n A["Second"] --> C\n';
  const root = await mountSource(page, source); await root.locator('g.node').filter({ hasText: /^Second$/ }).dblclick();
  const editor = dialog(page); await expect(editor.getByRole('textbox', { name: 'Mermaid source', exact: true })).toHaveCount(0);
  await expect(editor.getByRole('textbox', { name: 'Element label', exact: true })).toHaveAttribute('readonly', '');
  await expect(editor).toContainText('multiple label declarations');
  await editor.getByRole('button', { name: 'Edit whole chart', exact: true }).click();
  await expect(editor.getByRole('button', { name: 'Save source', exact: true })).toBeEnabled();
  expect(await sourceDocument(editor.getByRole('textbox', { name: 'Mermaid source', exact: true }))).toBe(source);
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('native sequence text edits preserve comments, literal syntax and multiline layout', async ({ page }) => {
  const source = 'sequenceDiagram\n participant A as Speaker\n participant B as Listener\n A->>B: Don\'t stop # preserve this comment\n B-->>A: Reply\n Note right of A: Attached note\n';
  const root = await mountSource(page, source);
  const actor = root.locator('[data-kmv-kind="participant"]').filter({ hasText: /^Speaker$/ }).first();
  await expect(actor).toBeVisible(); await actor.dblclick(); const editor = dialog(page);
  await expect(editor.getByRole('textbox', { name: 'Element label', exact: true })).toHaveValue('Speaker');
  await expect(editor.locator('.kmv-source-relationship')).toHaveCount(3);
  await editor.getByRole('textbox', { name: 'Element label', exact: true }).fill('Speaker\nTwo');
  await editor.getByRole('textbox', { name: 'Relationship 1 label', exact: true }).fill('% literal #34; &quot;\nSecond');
  await editor.getByRole('button', { name: 'Save source', exact: true }).click(); await expect(editor).toHaveCount(0);
  const expected = 'sequenceDiagram\n participant A as Speaker<br/>Two\n participant B as Listener\n A->>B: #37; literal #35;34#59; #38;quot#59;<br/>Second # preserve this comment\n B-->>A: Reply\n Note right of A: Attached note\n';
  await expect.poll(async () => (await readNote(page)).source).toBe(expected);
  // Native 11.13 emits one text element per line, and repeats actors at the footer.
  const actorLines = await root.locator('text.actor').filter({ hasText: /^(?:Speaker|Two)$/ }).evaluateAll(elements => elements.map(element => { const rect = element.getBoundingClientRect(); return { text: element.textContent?.trim(), x: rect.left + rect.width / 2, y: rect.top }; }));
  expect(actorLines.map(line => line.text).sort()).toEqual(['Speaker', 'Speaker', 'Two', 'Two']);
  const topSpeaker = actorLines.filter(line => line.text === 'Speaker').sort((a, b) => a.y - b.y)[0]!;
  const topTwo = actorLines.filter(line => line.text === 'Two').sort((a, b) => a.y - b.y)[0]!;
  expect(Math.abs(topSpeaker.x - topTwo.x)).toBeLessThan(1); expect(topTwo.y).toBeGreaterThan(topSpeaker.y);
  const messageLines = await root.locator('text.messageText').evaluateAll(elements => elements.map(element => ({ text: element.textContent?.trim(), y: element.getBoundingClientRect().top })));
  expect(messageLines.map(line => line.text)).toEqual(['% literal #34; &quot;', 'Second', 'Reply']);
  expect(messageLines[1]!.y).toBeGreaterThan(messageLines[0]!.y);
});

for (const separator of ['|', '&']) {
  test(`native composite sequence ID A${separator}B never becomes a writable A label or a phantom A/B note`, async ({ page }) => {
    const source = `sequenceDiagram\n participant A${separator}B as A\n participant A\n participant B\n Note over A${separator}B: Only composite\n A->>B: Known edge\n`;
    const root = await mountSource(page, source);
    await root.locator('rect.actor.actor-top[name="A"]').dblclick({ position: { x: 10, y: 10 } }); const editor = dialog(page);
    await expect(editor.getByRole('textbox', { name: 'Element label', exact: true })).toHaveAttribute('readonly', '');
    await expect(editor.getByRole('textbox', { name: 'Mermaid source', exact: true })).toHaveCount(0);
    await expect(editor.locator('.kmv-source-relationship')).toHaveCount(1);
    await expect(editor).toContainText('A ->> B'); await expect(editor).not.toContainText('Only composite');
    await editor.getByRole('textbox', { name: 'Relationship 1 label', exact: true }).fill('Safe update');
    await editor.getByRole('button', { name: 'Save source', exact: true }).click(); await expect(editor).toHaveCount(0);
    const expected = `sequenceDiagram\n participant A${separator}B as A\n participant A\n participant B\n Note over A${separator}B: Only composite\n A->>B: Safe update\n`;
    await expect.poll(async () => (await readNote(page)).source).toBe(expected);
    await expect(root.locator('text.noteText')).toContainText('Only composite');
    await expect(root.locator('text.messageText')).toContainText('Safe update');
  });
}
