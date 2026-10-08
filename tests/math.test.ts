import { test } from 'node:test';
import assert from 'node:assert/strict';
import { center, constrain, fitScale, fitted, parsePercent, resized, zoomAt, nativeSize } from '../src/viewer/math';
const viewport = { width: 600, height: 300 };
test('inline fit is horizontal, not responsive-baseline 100%', () => {
  const wide = { width: 2000, height: 100 }; const state = fitted(wide, viewport, 'width');
  assert.equal(state.scale, 568 / 2000); assert.equal(state.x,16);
  assert.equal(zoomAt(wide, viewport, state, 1).scale,1);
});
test('tall inline starts at top without fitting its height', () => {
  const state=fitted({width:300,height:3000},viewport,'width');
  assert.equal(state.scale,1); assert.equal(state.y,16);
});
test('contain always fits both dimensions including pathological large diagrams', () => {
  for(const native of [{width:300,height:3000},{width:9000,height:20},{width:1e8,height:1e8}]) {
    const scale=fitScale(native,viewport,'contain');
    assert.ok(native.width*scale<=568+.001); assert.ok(native.height*scale<=268+.001);
  }
});
test('true recenter does not change zoom or go to top-left',()=>{
 const centered=center({width:2000,height:1000},viewport,1);
 assert.deepEqual(centered,{x:-700,y:-350});
});
test('zoom preserves focal point when unconstrained',()=>{
 const native={width:2000,height:2000};
 const a={x:-100,y:-100,scale:1,mode:'manual' as const};
 const b=zoomAt(native,viewport,a,2,{x:100,y:100});
 assert.equal((100-a.x)/a.scale,(100-b.x)/b.scale);
});
test('manual resize preserves native scale and relative center; fitted resizes refit',()=>{
 const native={width:2000,height:2000}; const state={x:-500,y:-500,scale:1,mode:'manual' as const};
 const after=resized(native,viewport,{width:800,height:400},state);
 assert.deepEqual(after,{x:-400,y:-450,scale:1,mode:'manual'});
 assert.equal(resized(native,viewport,{width:800,height:400},fitted(native,viewport,'width')).scale,768/2000);
});
test('pan clamps overflow and centers small dimensions',()=>{
 assert.deepEqual(constrain({width:2000,height:20},viewport,{x:500,y:500,scale:1,mode:'manual'}),{x:16,y:140,scale:1,mode:'manual'});
});
test('percentage input is unambiguous, finite, bounded by caller',()=>{
 assert.equal(parsePercent('1'),.01); assert.equal(parsePercent('100%'),1); assert.equal(parsePercent('1.5x'),1.5); assert.equal(parsePercent('12,5%'),.125);
 for(const bad of ['100oops','NaN','Infinity','-10','0','','1e3']) assert.equal(parsePercent(bad),null);
 assert.equal(zoomAt({width:2000,height:1000},viewport,fitted({width:2000,height:1000},viewport,'width'),100).scale,10);
});
test('native dimensions prefer viewBox, not CSS display width',()=>{
 const fake=(attrs:Record<string,string>)=>({getAttribute:(name:string)=>attrs[name]??null}) as SVGSVGElement;
 assert.deepEqual(nativeSize(fake({viewBox:'0 0 2000 300',width:'100%',style:'max-width: 300px'})),{width:2000,height:300});
 assert.equal(nativeSize(fake({width:'100%',height:'auto'})),null);
 assert.deepEqual(nativeSize(fake({width:'100px',height:'200'})),{width:100,height:200});
});
