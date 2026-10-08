import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const matrix=JSON.parse(readFileSync('fixtures/taxonomy.json','utf8'));
const native=JSON.parse(readFileSync('tests/fixtures/native-registry.json','utf8'));
const parsed=JSON.parse(readFileSync('tests/fixtures/parse-baseline.json','utf8'));
test('matrix contains all 24 native families, 36 variants and 9 unsupported families',()=>{
 const required=matrix.fixtures.filter((x:any)=>x.scope==='required-native');const unsupported=matrix.fixtures.filter((x:any)=>x.scope==='recognition-only');
 assert.equal(required.length,36);assert.equal(new Set(required.map((x:any)=>x.family)).size,24);
 assert.equal(unsupported.length,12);assert.equal(new Set(unsupported.map((x:any)=>x.family)).size,9);
 for(const fixture of matrix.fixtures)assert.ok(readFileSync(fixture.file,'utf8').trim().length>0);
});
test('fixture detector coverage includes every installed registry ID except error/frontmatter sentinels',()=>{
 const detected=new Set(parsed.results.filter((x:any)=>x.status==='parse-pass').map((x:any)=>x.detectedType));
 for(const type of native.registry)if(!['error','---'].includes(type.id))assert.ok(detected.has(type.id),type.id);
});
test('development parser evidence is never labelled native SVG or viewer acceptance',()=>{
 assert.equal(matrix.nativeRenderer.obsidian_version,'1.14.4');assert.equal(parsed.version,'11.17.2');
 for(const fixture of matrix.fixtures){assert.ok(['not-tested','not-applicable'].includes(fixture.nativeSvg));assert.ok(['not-tested','not-applicable'].includes(fixture.viewer));}
 assert.equal(parsed.results.filter((x:any)=>x.status==='parse-pass').length,38);
});
