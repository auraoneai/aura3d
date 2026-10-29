// Per-channel absolute difference of two same-size frames. Usage: node evidence/thermal-drift/audit-fix/diff.mjs <a.jpg> <b.jpg>
import sharp from "sharp";
const [a,b]=process.argv.slice(2);
const A=await sharp(a).raw().toBuffer({resolveWithObject:true}), B=await sharp(b).raw().toBuffer({resolveWithObject:true});
let s=0,mx=0,over=0;const n=A.data.length;
for(let i=0;i<n;i++){const d=Math.abs(A.data[i]-B.data[i]);s+=d;if(d>mx)mx=d;if(d>8)over++;}
console.log(a.split("/").pop(),"vs",b.split("/").pop(),"meanAbs",(s/n).toFixed(3),"max",mx,"frac>8",(over/n).toFixed(4));
