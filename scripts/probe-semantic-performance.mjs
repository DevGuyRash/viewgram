// Runs against the existing private demo server. It never starts a server or Obsidian.
// Baseline bundle: git show c56fbe9:src/viewer/semantics.ts -> ignored .local entry;
// bundle that entry as browser IIFE globalName=SemanticBaseline, same ES2022 target.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import os from 'node:os';

const baseUrl = process.env.SEMANTIC_PROBE_URL ?? 'http://127.0.0.1:4173';
const baselineUrl = process.env.SEMANTIC_BASELINE_URL ?? '/.local/semantic-baseline.js';
const output = resolve('evidence/semantic-native/performance-receipt.json');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(baseUrl); await page.waitForFunction(() => window.demo?.ready === true);
  await page.addScriptTag({ url: new URL(baselineUrl, baseUrl).href });
  const environment = { node: process.version, browser: browser.version(), platform: process.platform, architecture: process.arch, cpus: os.cpus().map(cpu => cpu.model), baseUrl, baselineUrl, baselineCommit: 'c56fbe9' };
  const results = [];
  for (const nodes of [100, 1000, 5000]) for (let repetition = 0; repetition < 3; repetition++) {
    const order = repetition % 2 === 0 ? ['baseline', 'current'] : ['current', 'baseline'];
    for (const implementation of order) {
      const result = await page.evaluate(({ nodes, repetition, implementation }) => {
        const Highlighter = implementation === 'baseline' ? window.SemanticBaseline.SemanticHighlighter : window.demo.SemanticHighlighter;
        const namespace = 'http://www.w3.org/2000/svg', host = document.createElement('div');
        host.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:600px;overflow:hidden;';
        const svg = document.createElementNS(namespace, 'svg'); svg.id = `probe-${implementation}-${nodes}-${repetition}`;
        svg.setAttribute('aria-roledescription', 'flowchart-v2'); svg.setAttribute('width', '1000'); svg.setAttribute('height', String(Math.ceil(nodes / 50) * 20));
        const defs = document.createElementNS(namespace, 'defs'), marker = document.createElementNS(namespace, 'marker');
        marker.id = `${svg.id}-arrow`; marker.setAttribute('class', 'marker point'); marker.setAttribute('markerWidth', '10'); marker.setAttribute('markerHeight', '10');
        const arrow = document.createElementNS(namespace, 'path'); arrow.setAttribute('d', 'M0 0L10 5L0 10Z'); marker.append(arrow); defs.append(marker); svg.append(defs);
        const vertices = [], edges = [];
        for (let index = 0; index < nodes; index++) {
          const group = document.createElementNS(namespace, 'g'); group.id = `flowchart-N${index}-${index}`; group.setAttribute('class', 'node');
          const rect = document.createElementNS(namespace, 'rect'); rect.setAttribute('x', String(index % 50 * 20)); rect.setAttribute('y', String(Math.floor(index / 50) * 20)); rect.setAttribute('width', '14'); rect.setAttribute('height', '14');
          group.append(rect); svg.append(group); vertices.push(group);
          if (index > 0) {
            const path = document.createElementNS(namespace, 'path'); path.id = `L_N${index - 1}_N${index}_0`; path.setAttribute('class', 'flowchart-link');
            path.setAttribute('marker-end', `url(#${marker.id})`); path.setAttribute('d', `M${(index - 1) % 50 * 20 + 14},${Math.floor((index - 1) / 50) * 20 + 7}L${index % 50 * 20},${Math.floor(index / 50) * 20 + 7}`);
            path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#555'); svg.append(path); edges.push(path);
          }
        }
        host.append(svg); document.body.append(host);
        const native = [svg, ...svg.querySelectorAll('*')], original = svg.outerHTML;
        const observer = new MutationObserver(() => {}); observer.observe(svg, { attributes: true, childList: true, subtree: true });
        const percentile = (values, fraction) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]; };
        let start = performance.now(); const highlighter = new Highlighter(svg); const constructionMs = performance.now() - start;
        const constructionMutations = observer.takeRecords().length;
        // Both implementations settle constructor style/layout work before the
        // first hover. The baseline has no filter reads and would otherwise defer
        // that work outside the handler while the candidate pays it inside.
        start = performance.now(); const settledBox = svg.getBoundingClientRect(); const postConstructionLayoutMs = performance.now() - start;
        const layoutBounds = { width: settledBox.width, height: settledBox.height };
        const hover = index => vertices[index].dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
        start = performance.now(); hover(25); const firstHoverMs = performance.now() - start, firstHoverMutations = observer.takeRecords().length;
        for (let warm = 0; warm < 20; warm++) hover(25 + warm % 3);
        observer.takeRecords();
        const times = [], mutations = [], untouchedMutationCounts = [];
        let last = 25;
        for (let sample = 0; sample < 60; sample++) {
          last = 25 + sample % 3; start = performance.now(); hover(last); times.push(performance.now() - start);
          const records = observer.takeRecords(); mutations.push(records.length); untouchedMutationCounts.push(records.filter(record => record.target === vertices[nodes - 1]).length);
        }
        const correct = vertices[last].classList.contains('kmv-semantic-active') && edges[last - 1].getAttribute('data-kmv-relation') === 'incoming' && edges[last].getAttribute('data-kmv-relation') === 'outgoing' && vertices[nodes - 1].classList.contains('kmv-semantic-dim');
        const identity = native.every(element => element === svg || svg.contains(element));
        const proxies = svg.querySelectorAll('[data-kmv-hit-target]').length;
        start = performance.now(); highlighter.clear(); const clearMs = performance.now() - start, clearMutations = observer.takeRecords().length;
        highlighter.dispose(); const restored = svg.outerHTML === original; observer.disconnect(); host.remove();
        if (!correct || !identity || !restored) throw new Error(`Correctness guard failed: ${implementation}/${nodes}, correct=${correct}, identity=${identity}, restored=${restored}`);
        if (implementation === 'current' && untouchedMutationCounts.some(count => count !== 0)) throw new Error(`Local highlight guard failed: unrelated node was mutated at ${nodes} nodes.`);
        return { nodes, edges: nodes - 1, repetition, implementation, constructionMs, constructionMutations, postConstructionLayoutMs, layoutBounds, firstHoverMs, firstHoverMutations,
          handlerMs: { p50: percentile(times, .5), p95: percentile(times, .95), samples: times }, handlerMutations: { p50: percentile(mutations, .5), p95: percentile(mutations, .95), samples: mutations },
          untouchedMutationCounts, clearMs, clearMutations, proxies, correct, identity, restored };
      }, { nodes, repetition, implementation });
      results.push(result);
      process.stdout.write(`${implementation} ${nodes} nodes repetition ${repetition + 1}: handler p50=${result.handlerMs.p50.toFixed(3)} ms, p95=${result.handlerMs.p95.toFixed(3)} ms, mutations=${result.handlerMutations.p50}\n`);
    }
  }
  await mkdir(resolve('evidence/semantic-native'), { recursive: true });
  await writeFile(output, JSON.stringify({ environment, workload: 'Visible SVG sparse directed chain; degree two; explicitly timed getBoundingClientRect style/layout flush after construction for both implementations; first hover measured afterward; 20 hover warmups then 60 delegated pointerover events; three interleaved repetitions.',
    scope: 'Synchronous semantic handler and DOM mutation microprobe. Construction and post-construction style/layout are recorded separately. Browser paint, real pointer travel, source reads, exports, and full app latency are outside the timed region. Native11.13/offset hover correctness is established separately by semantic-hit.spec.ts.', results }, null, 2));
  process.stdout.write(`Saved ${output}\n`);
} finally { await browser.close(); }
