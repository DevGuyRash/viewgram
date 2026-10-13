import { test, expect, type Locator, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.goto('/'); await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
});
async function renderedType(page: Page, id: string): Promise<Locator> {
  const result = await page.evaluate(id => (window as any).demo.runTypeCase(id), id);
  expect(result.svg, result.message).toBe('pass'); expect(result.viewer, result.message).toBe('pass');
  const root = page.locator('#taxonomy-preview .kmv-viewer');
  await expect(root).toHaveAttribute('data-ready', 'true');
  await root.scrollIntoViewIfNeeded(); return root;
}
async function relations(root: Locator) {
  return root.locator('[data-kmv-kind="edge"]').evaluateAll(elements => elements.map(el => ({
    id: el.id, text: el.textContent, relation: el.getAttribute('data-kmv-relation'), classes: el.getAttribute('class'),
    markerStart: el.getAttribute('marker-start'), markerEnd: el.getAttribute('marker-end'),
  })));
}

test('rendered flowchart, class, ER, state, sequence and chart hover keep native relationships', async ({ page }) => {
  test.setTimeout(60_000);
  const receipt: Record<string, unknown> = {};
  for (const [id, kind, text] of [
    ['flowchart', 'node', 'Source valid?'], ['class-v2', 'node', 'Diagram'],
    ['er', 'node', 'NOTE'], ['state-v2', 'node', 'Inline'], ['sequence', 'participant', 'Viewport'],
  ]) {
    const root = await renderedType(page, id!);
    const before = await root.locator('.kmv-surface > svg').textContent();
    const target = root.locator(`[data-kmv-kind="${kind}"]`).filter({ hasText: text! }).first();
    await expect(target).toBeVisible(); await target.hover();
    await expect(target).toHaveClass(/kmv-semantic-active/);
    await writeFile(`evidence/hover-${id}-metadata.json`, JSON.stringify(await root.locator('.kmv-surface > svg').evaluate(svg => ({ nodes: [...svg.querySelectorAll('[data-kmv-kind="node"], [data-kmv-kind="participant"]')].map(el => ({id:el.id,label:el.textContent,attributes:[...el.attributes].map(attr=>[attr.name,attr.value])})), edges: [...svg.querySelectorAll('[data-kmv-kind="edge"]')].map(el=>({id:el.id,attributes:[...el.attributes].map(attr=>[attr.name,attr.value])})) })), null, 2));
    if (id === 'state-v2') {
      // This renderer exposes edge0..3 and markers, with no endpoint IDs.
      // The viewer must emphasize the hovered node without inventing adjacency.
      await expect(root.locator('[data-kmv-kind="edge"].kmv-semantic-incoming, [data-kmv-kind="edge"].kmv-semantic-outgoing, [data-kmv-kind="edge"].kmv-semantic-both, [data-kmv-kind="edge"].kmv-semantic-undirected')).toHaveCount(0);
      await expect(root.locator('[data-kmv-kind="node"].kmv-semantic-active')).toHaveCount(1);
      const normalEdges = root.locator('path.edge-thickness-normal.edge-pattern-solid');
      await expect(normalEdges).toHaveCount(4);
      for (const edge of await normalEdges.all()) await expect(edge).toHaveAttribute('data-kmv-line', 'solid');
    }
    else if (id === 'er') await expect(root.locator('[data-kmv-kind="edge"].kmv-semantic-undirected')).not.toHaveCount(0);
    else {
      await expect(root.locator('[data-kmv-kind="edge"].kmv-semantic-outgoing')).not.toHaveCount(0);
      if (['flowchart', 'sequence'].includes(id!)) await expect(root.locator('[data-kmv-kind="edge"].kmv-semantic-incoming')).not.toHaveCount(0);
    }
    expect(await root.locator('.kmv-surface > svg').textContent()).toBe(before);
    receipt[id!] = await relations(root);
    await page.screenshot({ path: `evidence/hover-${id}.png` });
  }
  const pie = await renderedType(page, 'pie');
  await writeFile('evidence/pie-native-fill-metadata.json', JSON.stringify(await pie.locator('.kmv-surface > svg').evaluate(svg => ({ slices: [...svg.querySelectorAll('.pieCircle')].map(el => ({ attributes: [...el.attributes].map(attr => [attr.name, attr.value]), raw: el.getAttribute('fill'), inline: (el as SVGElement).style.fill, computed: getComputedStyle(el).fill })), legends: [...svg.querySelectorAll('g.legend')].map(el => { const rect = el.querySelector('rect')!; return { label: el.textContent, attributes: [...rect.attributes].map(attr => [attr.name, attr.value]), raw: rect.getAttribute('fill'), inline: (rect as SVGElement).style.fill, computed: getComputedStyle(rect).fill }; }) })), null, 2));
  const legend = pie.locator('[data-kmv-kind="slice"]').filter({ hasText: 'Flow' }).first();
  await expect(legend).toBeVisible(); await legend.hover(); await expect(legend).toHaveClass(/kmv-semantic-active/);
  await expect(pie.locator('.pieCircle.kmv-semantic-active')).toHaveCount(1);
  await expect(pie.locator('text.slice.kmv-semantic-active')).toHaveCount(1);
  await expect(pie.locator('.kmv-semantic-incoming, .kmv-semantic-outgoing, .kmv-semantic-both')).toHaveCount(0);
  receipt.pie = { activeSlices: await pie.locator('.pieCircle.kmv-semantic-active').count(), activePercentLabels: await pie.locator('text.slice.kmv-semantic-active').count(), activeLegends: await pie.locator('g.legend.kmv-semantic-active').count() };
  await page.screenshot({ path: 'evidence/hover-pie.png' });
  await writeFile('evidence/semantic-hover-receipt.json', JSON.stringify(receipt, null, 2));
});

test('rendered sequence open and cross arrowheads keep their incoming and outgoing direction', async ({ page }) => {
  const root = await renderedType(page, 'sequence');
  await root.locator('summary').click(); await root.getByRole('button', { name: 'Edit Mermaid source', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit Mermaid source' });
  await editor.getByRole('textbox', { name: 'Mermaid source', exact: true }).fill('sequenceDiagram\n participant A\n participant B\n A-)B: Open head\n B--xA: Cross head');
  await editor.getByRole('button', { name: 'Save source', exact: true }).click(); await expect(editor).toHaveCount(0);
  await expect(root).toHaveAttribute('data-ready', 'true');
  const participant = root.locator('[data-kmv-kind="participant"]').filter({ hasText: /^A$/ }).first();
  await expect(participant).toBeVisible(); await participant.hover();
  await expect(root.locator('.messageLine0.kmv-semantic-outgoing, .messageLine1.kmv-semantic-outgoing')).toHaveCount(1);
  await expect(root.locator('.messageLine0.kmv-semantic-incoming, .messageLine1.kmv-semantic-incoming')).toHaveCount(1);
  await expect(root.locator('.messageLine0.kmv-semantic-undirected, .messageLine1.kmv-semantic-undirected')).toHaveCount(0);
  await writeFile('evidence/sequence-open-cross-receipt.json', JSON.stringify(await relations(root), null, 2));
  await page.screenshot({ path: 'evidence/hover-sequence-open-cross.png' });
});
