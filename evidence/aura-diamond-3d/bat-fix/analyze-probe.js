const fs=require("fs");
const OFF=Number(process.env.OFF ?? 0.94);
const sub=(a,b)=>a.map((x,i)=>x-b[i]),len=v=>Math.hypot(...v),dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
for(const r of process.argv.slice(2)){
 console.log("=== "+r+" (bat frame shifted by -"+OFF+" in y)");
 const rows=fs.readFileSync(`/tmp/dbat-${r}-probe.jsonl`,"utf8").trim().split("\n").map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean).filter(x=>x.rightPalm);
 for(const x of rows){
  const knob=[x.knob[0],x.knob[1]-OFF,x.knob[2]], tip=[x.tip[0],x.tip[1]-OFF,x.tip[2]];
  const d=sub(tip,knob),L=len(d),dir=d.map(v=>v/L);
  const axisDist=p=>len(cross(sub(p,knob),dir)), along=p=>dot(sub(p,knob),dir);
  console.log(`${(x.view||"").padEnd(6)}${String(x.hold).padEnd(6)}${(x.phase||"").padEnd(15)} knob->Rpalm ${(len(sub(x.rightPalm,knob))*100).toFixed(1)}cm  Rpalm->axis ${(axisDist(x.rightPalm)*100).toFixed(1)}  Lpalm->axis ${(axisDist(x.leftPalm)*100).toFixed(1)}  Lpalm along ${(along(x.leftPalm)*100).toFixed(1)}cm  Rpalm along ${(along(x.rightPalm)*100).toFixed(1)}cm  palmsApart ${(x.palmsApart*100).toFixed(1)}cm  knobY ${knob[1].toFixed(2)} tipY ${tip[1].toFixed(2)}`);
 }
}
