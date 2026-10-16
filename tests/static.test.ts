import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('viewport integration preserves native rendering and avoids polling or private storage APIs',()=>{
 const source=['src/main.ts','src/viewer/controller.ts','src/viewer/diagram.ts','src/viewer/render-scope.ts'].map(p=>readFileSync(p,'utf8')).join('\n');
 for(const forbidden of ['cloneNode','innerHTML','DOMParser','setInterval','fetch(','loadMermaid','vault.modify','localStorage']) assert.ok(!source.includes(forbidden),forbidden);
});
test('component CSS avoids expensive selectors and has higher overflow specificity than synthetic host',()=>{
 const css=readFileSync('src/styles.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
 assert.ok(!css.includes(':has('));assert.ok(!css.includes('*='));assert.ok(!css.includes('will-change'));assert.ok(!css.includes('.workspace-'));
 assert.ok(css.includes('.kmv-viewer.kmv-viewer .kmv-viewport.kmv-viewport'));
 assert.ok(css.includes('overflow: hidden !important'));
});
test('private plugin identity is namespaced and its installation path is documented',()=>{
 const manifest=JSON.parse(readFileSync('manifest.json','utf8'));
 assert.equal(manifest.id,'viewgram');assert.equal(manifest.name,'Viewgram');
 assert.equal(manifest.author,'DevGuyRash');assert.equal(manifest.version,'0.1.0');
 assert.equal(JSON.parse(readFileSync('package.json','utf8')).name,'viewgram');
 assert.ok(readFileSync('docs/PLACEMENT.md','utf8').includes('<vault>/.obsidian/plugins/viewgram/'));
});

test('Live Preview uses public view lifecycle and keeps host CodeMirror external',()=>{
 const main=readFileSync('src/main.ts','utf8'),editor=readFileSync('src/editor/live-preview.ts','utf8'),build=readFileSync('scripts/build.mjs','utf8');
 assert.ok(main.includes('registerEditorExtension'));assert.ok(editor.includes('ViewPlugin.fromClass'));assert.ok(editor.includes('editorLivePreviewField'));assert.ok(editor.includes('editorInfoField'));assert.ok(editor.includes('destroy(): void'));assert.ok(build.includes("'@codemirror/state','@codemirror/view'"));
});
test('print stage geometry overrides native-context stage geometry at equal specificity',()=>{
 const css=readFileSync('src/styles.css','utf8');
 assert.ok(css.includes('.kmv-viewer .kmv-viewport .kmv-surface { position: static; width: auto; height: auto; transform: none !important; }'));
});
