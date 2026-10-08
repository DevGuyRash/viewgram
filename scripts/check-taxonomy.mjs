/** Parse-only fixture validation. This never renders or claims browser/native acceptance. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { Window } from 'happy-dom';
const window = new Window();
Object.assign(globalThis, {window, document:window.document});
const { default: mermaid } = await import('mermaid');
const packageInfo = JSON.parse(await readFile('node_modules/mermaid/package.json','utf8'));
const matrix = JSON.parse(await readFile('fixtures/taxonomy.json','utf8'));
mermaid.initialize({startOnLoad:false,securityLevel:'strict'});
const registeredIds = mermaid.getRegisteredDiagramsMetadata().map(x=>x.id);
const results=[];
for(const fixture of matrix.fixtures) {
 const text=await readFile(fixture.file,'utf8');
 let detectedType=null;
 try { detectedType=mermaid.detectType(text); }
 catch(error){results.push({...fixture,status:'unsupported-type',detectedType,error:String(error.message||error)});continue;}
 if(fixture.scope==='recognition-only'){results.push({...fixture,status:'recognition-only',detectedType});continue;}
 try { await mermaid.parse(text); results.push({...fixture,status:'parse-pass',detectedType}); }
 catch(error){results.push({...fixture,status:'syntax-error',detectedType,error:String(error.message||error)});}
}
const record={renderer:'development-only Mermaid',version:packageInfo.version,registeredIds,stage:'parse-only; no SVG rendering, viewer geometry or native Obsidian checks',nativeRenderer:matrix.nativeRenderer,results};
await mkdir('evidence',{recursive:true});
await writeFile('evidence/taxonomy-parse-results.json',JSON.stringify(record,null,2)+'\n');
for(const result of results)console.log(`${result.status.padEnd(17)} ${result.id.padEnd(24)} ${result.detectedType||'-'}`);
await window.happyDOM.abort();
if(results.some(x=>x.status==='syntax-error'||(x.status==='unsupported-type'&&x.scope!=='recognition-only')))process.exitCode=1;
