// usage: node fc-var.mjs <prefix> <preLog> <headLog>   (frames named <prefix>.l<N>.a)
import sharp from "sharp";
import { readFileSync } from "node:fs";
const [, , key, preLog, headLog] = process.argv;
function load(path){const ch={};for(const line of readFileSync(path,"utf8").split("\n")){const m=line.match(/@@FC (\S+) (\S+) (\d+) (\d+) (\S+)/);if(m){const k=`${m[1]}/${m[2]}`;(ch[k]??=[])[+m[3]]=m[5];}}const o={};for(const [k,p] of Object.entries(ch))o[k]=Buffer.from(p.join(""),"base64");return o;}
async function raw(b){const {data,info}=await sharp(b).removeAlpha().raw().toBuffer({resolveWithObject:true});return {data,n:info.width*info.height};}
async function d(a,b){const A=await raw(a),B=await raw(b);let s=0,o=0;for(let i=0;i<A.n;i++){const k=i*3;s+=Math.abs(.2126*A.data[k]+.7152*A.data[k+1]+.0722*A.data[k+2]-(.2126*B.data[k]+.7152*B.data[k+1]+.0722*B.data[k+2]));if(Math.max(Math.abs(A.data[k]-B.data[k]),Math.abs(A.data[k+1]-B.data[k+1]),Math.abs(A.data[k+2]-B.data[k+2]))>16)o++;}return {l:+(s/A.n).toFixed(3),p:+(100*o/A.n).toFixed(3)};}
const P=load(preLog),H=load(headLog);
const names=[...new Set([...Object.keys(P),...Object.keys(H)].filter(k=>k.endsWith(".a")&&k.includes(key)).map(k=>k.replace(/\.l\d+\.a$/,"")))];
for(const nm of names){
  const get=(S)=>Object.keys(S).filter(k=>k.startsWith(nm+".l")&&k.endsWith(".a")).sort().map(k=>S[k]);
  const pf=get(P),hf=get(H);
  const within=async(fs)=>{const r=[];for(let i=0;i<fs.length;i++)for(let j=i+1;j<fs.length;j++)r.push(await d(fs[i],fs[j]));return r;};
  const cross=[];for(const a of pf)for(const b of hf)cross.push(await d(a,b));
  const sum=(r)=>r.length?`min ${Math.min(...r.map(x=>x.l))} med ${r.map(x=>x.l).sort((a,b)=>a-b)[r.length>>1]} max ${Math.max(...r.map(x=>x.l))} (luma); pct>16 max ${Math.max(...r.map(x=>x.p))}`:"n/a";
  console.log(nm,`loads pre=${pf.length} head=${hf.length}`);
  console.log("  within pre :",sum(await within(pf)));
  console.log("  within head:",sum(await within(hf)));
  console.log("  pre vs head:",sum(cross));
}
