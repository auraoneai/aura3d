import { readFileSync } from "node:fs";
const path = process.argv[2];
const b = readFileSync(path);
const jl = b.readUInt32LE(12); const j = JSON.parse(b.subarray(20, 20 + jl).toString());
const bin = b.subarray(20 + jl + 8);
const acc = (i) => { const a = j.accessors[i]; const v = j.bufferViews[a.bufferView]; const n = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
  const ct = a.componentType; const sz = {5121:1,5123:2,5125:4,5126:4}[ct]; const off=(v.byteOffset||0)+(a.byteOffset||0); const stride=v.byteStride||n*sz; const out=[];
  for (let k=0;k<a.count;k++){ const row=[]; for(let c=0;c<n;c++){ const o=off+k*stride+c*sz; row.push(ct===5126?bin.readFloatLE(o):ct===5121?bin.readUInt8(o):ct===5123?bin.readUInt16LE(o):bin.readUInt32LE(o)); } out.push(row);} return out; };
const p = j.meshes[0].primitives[0];
const pos = acc(p.attributes.POSITION), jt = acc(p.attributes.JOINTS_0), w = acc(p.attributes.WEIGHTS_0);
const names = j.skins[0].joints.map(i => j.nodes[i].name);
const wn = ct => w; 
const norm = p => p;
const wscale = j.accessors[p.attributes.WEIGHTS_0].componentType===5121?255:j.accessors[p.attributes.WEIGHTS_0].componentType===5123?65535:1;
for (const hand of ["LeftHand","RightHand"]) {
  const idx = names.indexOf(hand); const pts=[];
  pos.forEach((q,i)=>{ let ww=0; for(let k=0;k<4;k++) if(jt[i][k]===idx) ww+=w[i][k]/wscale; if(ww>0.6) pts.push(q); });
  const m=[0,0,0]; pts.forEach(q=>q.forEach((v,k)=>m[k]+=v/pts.length));
  const C=[[0,0,0],[0,0,0],[0,0,0]]; pts.forEach(q=>{for(let a=0;a<3;a++)for(let c=0;c<3;c++)C[a][c]+=(q[a]-m[a])*(q[c]-m[c])/pts.length;});
  // power iteration for eigen decomposition via jacobi
  let A=C.map(r=>r.slice()), V=[[1,0,0],[0,1,0],[0,0,1]];
  for(let it=0;it<50;it++){ for(let p_=0;p_<3;p_++)for(let q_=p_+1;q_<3;q_++){ if(Math.abs(A[p_][q_])<1e-14)continue; const th=(A[q_][q_]-A[p_][p_])/(2*A[p_][q_]); const t=Math.sign(th||1)/(Math.abs(th)+Math.sqrt(th*th+1)); const c=1/Math.sqrt(t*t+1), s=t*c;
    for(let k=0;k<3;k++){const akp=A[k][p_],akq=A[k][q_];A[k][p_]=c*akp-s*akq;A[k][q_]=s*akp+c*akq;}
    for(let k=0;k<3;k++){const apk=A[p_][k],aqk=A[q_][k];A[p_][k]=c*apk-s*aqk;A[q_][k]=s*apk+c*aqk;}
    for(let k=0;k<3;k++){const vkp=V[k][p_],vkq=V[k][q_];V[k][p_]=c*vkp-s*vkq;V[k][q_]=s*vkp+c*vkq;} } }
  const ev=[0,1,2].map(i=>({val:A[i][i],vec:[V[0][i],V[1][i],V[2][i]].map(x=>+x.toFixed(3))})).sort((a,b)=>a.val-b.val);
  console.log(hand, "n",pts.length,"centroid",m.map(x=>+x.toFixed(3)), ev.map(e=>`${Math.sqrt(e.val).toFixed(3)}:${e.vec}`).join("  "));
}
