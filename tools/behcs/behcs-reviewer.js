#!/usr/bin/env node
// behcs-reviewer.js — ≤35LOC — scans memories for patterns, GCs mistakes
// D43(6967871)+D11(29791) | LAW-010 | symbols=code
const fs=require('fs'),p=require('path'),h=require('http'),c=require('crypto');
const M='C:/Users/acer/.claude/projects/E--/memory',B=4947;
const H=k=>c.createHash('sha256').update(k).digest('hex').slice(0,16);
const mds=fs.readdirSync(M).filter(f=>f.endsWith('.md')&&f!=='MEMORY.md');
const pat={};mds.forEach(f=>{
  const t=fs.readFileSync(p.join(M,f),'utf8');
  const tp=(t.match(/^type:\s*(.+)$/m)||[])[1]||'?';
  pat[tp]=(pat[tp]||0)+1;
  const kw=t.toLowerCase();
  ['mistake','behcs','law','falcon','liris','aether','cube','hookwall','gnn'].forEach(w=>{
    if(kw.includes(w)){pat['kw:'+w]=(pat['kw:'+w]||0)+1}
  });
});
const r={ts:new Date().toISOString(),files:mds.length,patterns:pat,
  hilbert:H('review-'+Date.now()),divergent:[]};
// Find divergent: keywords that appear in >30% of files = systemic pattern
Object.entries(pat).filter(([k,v])=>k.startsWith('kw:')&&v>mds.length*0.3)
  .forEach(([k,v])=>r.divergent.push({pattern:k,count:v,pct:((v/mds.length)*100)|0}));
const e=JSON.stringify({from:'acer-reviewer',to:'triad',mode:'shadow',type:'review',
  id:'rev-'+Date.now(),ts:r.ts,tuple:'(acer,behcs.review,triad,0,runtime,hookwall,complete,['+r.files+'f,'+r.divergent.length+'d],pulse,IX,signed,session,bus,light)',payload:r});
const q=h.request({hostname:'127.0.0.1',port:B,path:'/behcs/send',method:'POST',
  headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(e)}});
q.on('error',()=>{});q.write(e);q.end();
console.log('[reviewer]'+r.files+'f '+JSON.stringify(r.patterns));
console.log('[divergent]'+r.divergent.map(d=>d.pattern+'='+d.pct+'%').join(' '));
