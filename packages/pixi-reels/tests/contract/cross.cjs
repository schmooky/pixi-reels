const fc = require('fast-check');
const { AxisMotion } = require('./AxisMotion.cjs');
const near=(a,b)=>Math.abs(a-b)<1e-6;
const geo = fc.record({ h: fc.integer({min:20,max:200}), gap: fc.integer({min:0,max:20}),
  bs: fc.integer({min:1,max:3}), vc: fc.integer({min:1,max:6}), be: fc.integer({min:1,max:3}) });
const steps = fc.array(fc.double({min:-90,max:90,noNaN:true}),{minLength:1,maxLength:40});

function trace(g, {polarity, prop}, ds) {
  const M=g.bs+g.vc+g.be;
  const syms=Array.from({length:M},(_,i)=>({id:i,view:{x:0,y:0}}));
  const wraps=[];
  const m=new AxisMotion(syms,g.h,g.gap,g.bs,g.vc,g.be,(s,i,d)=>wraps.push(`${s.id}:${d}`),{polarity,mainProp:prop});
  m.snapToGrid();
  const frames=[];
  for(const d of ds){ m.advance(d); frames.push(syms.map(s=>`${s.id}@${s.view[prop].toFixed(6)}`).join('|')); }
  return {frames, wraps};
}

const run=async(id,name,p)=>{ try{ await fc.assert(p,{numRuns:400}); console.log(`PASS  ${id}  ${name}`);}
  catch(e){ console.log(`FAIL  ${id}  ${name}\n        ${String(e.message).split('\n').slice(0,8).join('\n        ')}`);} };

(async()=>{
await run('L12','ISOMORPHISM — horizontal trace is the vertical trace on the other axis',
  fc.asyncProperty(geo, steps, async (g, ds) => {
    const v=trace(g,{polarity:1,prop:'y'},ds), h=trace(g,{polarity:1,prop:'x'},ds);
    if(v.frames.join('#')!==h.frames.join('#')) throw new Error('position traces differ');
    if(v.wraps.join(',')!==h.wraps.join(',')) throw new Error('wrap traces differ');
  }));

await run('L13','MIRROR — reverse(d) is exactly forward(-d), polarity applied once and nowhere else',
  fc.asyncProperty(geo, steps, async (g, ds) => {
    const fwd=trace(g,{polarity:1,prop:'y'},ds.map(d=>-d));
    const rev=trace(g,{polarity:-1,prop:'y'},ds);
    if(fwd.frames.join('#')!==rev.frames.join('#')) throw new Error('position traces differ');
    if(fwd.wraps.join(',')!==rev.wraps.join(',')) throw new Error('wrap traces differ');
  }));

await run('L14','FEED EDGE — forward feeds at start, reverse feeds at end, always',
  fc.asyncProperty(geo, fc.array(fc.double({min:0.25,max:1,noNaN:true}),{minLength:40,maxLength:60}),
  async (g, fracs) => {
    // scale steps to the geometry so the run always covers several slots
    const ds = fracs.map(f => f * (g.h + g.gap));
    for (const pol of [1,-1]) {
      const t=trace(g,{polarity:pol,prop:'y'},ds);
      const want = pol>0 ? 'toStart' : 'toEnd';
      const bad = t.wraps.find(w=>!w.endsWith(want));
      if (t.wraps.length===0) throw new Error('no wraps observed');
      if (bad) throw new Error(`polarity ${pol} produced ${bad}, expected every wrap to be ${want}`);
    }
  }));
})();
