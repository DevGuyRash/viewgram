import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lifetime } from '../src/viewer/lifetime';
test('cleanup is reverse ordered and idempotent',()=>{const life=new Lifetime();const calls:number[]=[];life.add(()=>calls.push(1));life.add(()=>calls.push(2));life.dispose();life.dispose();assert.deepEqual(calls,[2,1]);life.add(()=>calls.push(3));assert.deepEqual(calls,[2,1,3]);});
test('owned event listeners do not survive disposal',()=>{const life=new Lifetime();const target=new EventTarget();let count=0;life.listen(target,'x',()=>count++);target.dispatchEvent(new Event('x'));life.dispose();target.dispatchEvent(new Event('x'));assert.equal(count,1);});
