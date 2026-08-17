import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
function walk(d,o=[]){for(const f of readdirSync(d)){const p=join(d,f);
 if(statSync(p).isDirectory()){if(!['node_modules','.next','.git'].includes(f))walk(p,o);}
 else if(f.endsWith('.jsx'))o.push(p);}return o;}
const GLOB=new Set(['window','document','console','Math','JSON','Date','Object','Array',
 'String','Number','Boolean','Promise','Set','Map','URL','navigator','localStorage',
 'sessionStorage','crypto','fetch','setTimeout','React','true','false','null','undefined',
 'requestAnimationFrame','process','indexedDB','Intl','TextEncoder']);
const bad=[];
for(const file of walk('app')){
  const raw=readFileSync(file,'utf8'); const lines=raw.split('\n');
  const blocks=[]; let cur=null;
  lines.forEach((l,i)=>{
    if(/^(export )?(default )?function [A-Z]/.test(l)){cur={from:i,to:lines.length,name:(l.match(/function (\w+)/)||[])[1]};blocks.push(cur);}
    else if(cur&&/^\}/.test(l)){cur.to=i;cur=null;}
  });
  const fileScope=new Set();
  for(const m of raw.matchAll(/import\s+\{([^}]+)\}/g)) m[1].split(',').forEach(x=>fileScope.add(x.trim().split(' as ').pop().trim()));
  for(const m of raw.matchAll(/import\s+(\w+)\s+from/g)) fileScope.add(m[1]);
  for(const m of raw.matchAll(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/gm)) fileScope.add(m[1]);
  for(const m of raw.matchAll(/^(?:export\s+)?const\s+(\w+)/gm)) fileScope.add(m[1]);
  for(const blk of blocks){
    const body=lines.slice(blk.from,blk.to); const text=body.join('\n');
    const scope=new Set(fileScope);
    let sig=''; for(let k=0;k<8&&blk.from+k<blk.to;k++){sig+=' '+body[k]; if(sig.includes(') {'))break;}
    const pm=sig.match(/\(\s*\{([\s\S]*?)\}\s*\)/);
    if(pm) pm[1].split(',').forEach(x=>scope.add(x.trim().split(/[:=]/)[0].trim().replace('...','')));
    for(const m of text.matchAll(/(?:const|let|var)\s+(?:\{([^}]+)\}|\[([^\]]+)\]|(\w+))/g))
      ((m[1]||m[2]||m[3]||'')).split(',').forEach(x=>{const n=x.trim().split(/[:=]/).pop().trim().replace('...',''); if(n)scope.add(n);});
    for(const m of text.matchAll(/^\s*(?:const|let|var)\s+([^;\n]+)/gm)){
      if(m[1].includes('=>')||m[1].trim().startsWith('{')||m[1].trim().startsWith('['))continue;
      for(const p2 of m[1].split(',')){const n=p2.trim().split('=')[0].trim(); if(/^\w+$/.test(n))scope.add(n);}}
    for(const m of text.matchAll(/function\s+(\w+)/g)) scope.add(m[1]);
    for(const m of text.matchAll(/\(([^)]*)\)\s*=>/g)) for(const id of m[1].matchAll(/(\w+)/g)) scope.add(id[1]);
    for(const m of text.matchAll(/(\w+)\s*=>/g)) scope.add(m[1]);
    for(const m of text.matchAll(/catch\s*\((\w+)\)/g)) scope.add(m[1]);
    for(const m of text.matchAll(/function\s+\w*\s*\(\s*\{([\s\S]{0,300}?)\}\s*\)/g))
      for(const id of m[1].matchAll(/(\w+)/g)) scope.add(id[1]);
    body.forEach((l,rel)=>{
      const t=l.trim();
      if(!t||t.startsWith('//')||t.startsWith('*')||t.startsWith('/*'))return;
      for(const m of l.matchAll(/\{(\w+)\s*(?:&&|\?|\}|\s*\})/g)){
        const n=m[1];
        if(GLOB.has(n)||/^[0-9]/.test(n)||scope.has(n))continue;
        bad.push(file+':'+(blk.from+rel+1)+' -> '+n+' ('+(blk.name||'?')+')');
      }});
  }
}
const u=[...new Set(bad)];
console.log(u.length? '✗ '+u.length+' tanimsiz:\n  '+u.join('\n  ') : '✓ Tanimsiz degisken yok');
process.exit(u.length?1:0);
