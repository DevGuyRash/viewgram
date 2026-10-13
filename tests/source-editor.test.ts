import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {SourceEditor} from '../src/viewer/source-editor';
import type {DiagramSource} from '../src/viewer/source';
let win:Window;
beforeEach(()=>{win=new Window();Object.assign(win.HTMLDialogElement.prototype,{showModal(){(this as any).open=true;},close(){(this as any).open=false;}});});
afterEach(async()=>{await win.happyDOM.abort();});
function setup(validate?:DiagramSource['validate']){
 const initial='flowchart LR\n A["Old"] --> B\n';let saved='';let writes=0;
 const source:DiagramSource={read:async()=>({source:initial,document:initial,start:0,end:initial.length,line:0}),validate,write:async(_,next)=>{saved=next;writes++;}};
 return {editor:new SourceEditor(win.document as unknown as Document,source),get saved(){return saved},get writes(){return writes}};
}
const settle=()=>new Promise(r=>setTimeout(r,0));
test('double-open edits one source dialog and saves escaped label after validation',async()=>{
 let validated='';const x=setup(async s=>{validated=s;});await x.editor.open({id:'A',label:'Old',kind:'node'});await x.editor.open();assert.equal(win.document.querySelectorAll('dialog').length,1);
 const label=win.document.querySelector('[aria-label="Element label"]')! as unknown as HTMLTextAreaElement;label.value='"<new>"';label.dispatchEvent(new win.Event('input') as unknown as Event);
 const save=[...win.document.querySelectorAll('button')].find(b=>b.textContent==='Save source')!;save.click();await settle();
 assert.equal(x.writes,1);assert.equal(x.saved,validated);assert.ok(x.saved.includes('#34;#60;new#62;#34;'));assert.equal(win.document.querySelector('dialog'),null);x.editor.dispose();
});
test('invalid native syntax reports error without writing; Cancel closes cleanly',async()=>{
 const x=setup(async()=>{throw new Error('Invalid Mermaid');});await x.editor.open();[...win.document.querySelectorAll('button')].find(b=>b.textContent==='Save source')!.click();await settle();
 assert.equal(x.writes,0);assert.equal(win.document.querySelector('[role="status"]')?.textContent,'Invalid Mermaid');assert.ok(win.document.querySelector('dialog'));
 [...win.document.querySelectorAll('button')].find(b=>b.textContent==='Cancel')!.click();assert.equal(win.document.querySelector('dialog'),null);x.editor.dispose();
});
test('source saved is exactly the validated snapshot and disposal prevents a late save',async()=>{
 let resolve!:()=>void;const x=setup(()=>new Promise<void>(r=>{resolve=r;}));await x.editor.open();const code=win.document.querySelector('[aria-label="Mermaid source"]')! as unknown as HTMLTextAreaElement;
 [...win.document.querySelectorAll('button')].find(b=>b.textContent==='Save source')!.click();assert.equal(code.disabled,true);x.editor.dispose();resolve();await settle();assert.equal(x.writes,0);assert.equal(win.document.querySelector('dialog'),null);
});
