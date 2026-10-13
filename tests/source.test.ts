import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mermaidBlocks,locateSource,replaceSource,labelEdit,applyLabel,encodeLabel,decodeLabel} from '../src/viewer/source';

test('fenced source edits preserve note boundaries, newline convention and later diagrams',()=>{
 const note='# Note\r\n\r\n```mermaid\r\nflowchart LR\r\n A[First] --> B[Second]\r\n```\r\nTail\r\n~~~mermaid\r\npie\r\n "x": 2\r\n~~~\r\n';
 const blocks=mermaidBlocks(note);assert.equal(blocks.length,2);assert.equal(blocks[0]!.line,2);
 const snap=locateSource(note,{line:2});const changed=replaceSource(note,snap,'flowchart LR\n A[New] --> B[Second]');
 assert.equal(changed,'# Note\r\n\r\n```mermaid\r\nflowchart LR\r\n A[New] --> B[Second]\r\n```\r\nTail\r\n~~~mermaid\r\npie\r\n "x": 2\r\n~~~\r\n');
});
test('ambiguous, stale and fence-breaking edits are rejected',()=>{
 const note='```mermaid\nflowchart LR\n A-->B\n```\n';const snap=locateSource(note);
 assert.throws(()=>locateSource(note+note),/safely/);assert.throws(()=>replaceSource(note+'new',snap,'pie'),/changed/);assert.throws(()=>replaceSource(note,snap,'```\nBAD'),/fences/);
});
test('flowchart targeted labels escape syntax and HTML-sensitive characters',()=>{
 const source='flowchart LR\n A["Old"] --> B[Second]\n';const edit=labelEdit(source,{id:'A',label:'Old',kind:'node'});assert.ok(edit);
 const value='a "quote" & <tag> [x] {y} | ; # \\ `\nnext';const result=applyLabel(source,edit,value);
 assert.equal(decodeLabel(encodeLabel(value)),value);assert.equal(result,'flowchart LR\n A["'+encodeLabel(value)+'"] --> B[Second]\n');
 assert.equal(labelEdit('pie\n "A": 2',{id:'A',label:'A',kind:'slice'}),null);
});
test('duplicate node declarations never pick an arbitrary label',()=>{
 assert.equal(labelEdit('flowchart LR\n A[One]-->B\n A[Two]-->C',{id:'A',label:'One',kind:'node'}),null);
});
test('Mermaid-looking fences inside other fenced code are not editable blocks',()=>{
 const doc='````markdown\n```mermaid\nflowchart LR\n A-->B\n```\n````\n';
 assert.deepEqual(mermaidBlocks(doc),[]);
});
test('rounded and subroutine labels preserve their native shape delimiters',()=>{
 for(const [open,close] of [['[(',')]'],['([','])'],['[[',']]'],['((', '))'],['{{','}}']]){
  const source=`flowchart LR\n A${open}"Old"${close} --> B\n`;const edit=labelEdit(source,{id:'A',label:'Old',kind:'node'});assert.ok(edit,source);assert.equal(edit.value,'Old');assert.equal(applyLabel(source,edit,'New'),`flowchart LR\n A${open}"New"${close} --> B\n`);
 }
});
test('node-shaped text inside another label or comment never becomes an editable declaration',()=>{
 assert.equal(labelEdit('flowchart LR\n B["A[Thing]"]\n A-->B',{id:'A',label:'Thing',kind:'node'}),null);
 assert.equal(labelEdit('flowchart LR\n %% A[Thing]\n A-->B',{id:'A',label:'Thing',kind:'node'}),null);
});
test('targeted label offsets remain UTF-16 correct after astral Unicode',()=>{
 const source='flowchart LR\n B["😀"] --> A["Old"]\n';const edit=labelEdit(source,{id:'A',label:'Old',kind:'node'});assert.ok(edit);assert.equal(applyLabel(source,edit,'New'),'flowchart LR\n B["😀"] --> A["New"]\n');
});
