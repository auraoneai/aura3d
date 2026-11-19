// Surface interpolation is in the car's finished metre-space (+Z toward the nose).
const saturate = n => Math.min(1, Math.max(0, n));
const ease = n => { const t = saturate(n); return t * t * (3 - 2 * t); };
const unit = a => { const len = Math.hypot(...a); return a.map(n => n / len); };

function hoodHeight(x, z) {
  // Symmetric fit of the scan's upper envelope; two shallow beads flank the centre pressing.
  const d = z - 1.15, x2 = x*x;
  const shoulder = Math.exp(-(((Math.abs(x)-.71)/.12)**2) - (((z-1.12)/.58)**2));
  const bead = .016 * Math.exp(-(((Math.abs(x)-(.39-.12*d))/.065)**2)) * Math.exp(-(((z-1.12)/.75)**4));
  return .9765-.12238*d-.1057*d*d-.03734*d**3
    + x2*(-.0512-.15831*d-.16822*d*d) + x2*x2*(-.23969+.26788*d) + .10995*shoulder + bead;
}

function canopy(t, v) {
  const s = Math.abs(v), arch = Math.max(0, Math.sin(Math.PI*t));
  const halfWidth = .48 + .203 * arch**.67;
  const x = v * halfWidth - .023;
  const z = -1.74 + 2.38*t + s*s*(.26-.58*t);
  const sill = .855 + .173*t - .013*s*s;
  // A relatively flat roof rolls into steeper side glass and an arched windshield.
  const crown = .374 * arch**.89 * (1.12-.25*t);
  const y = sill + crown * (1 - .19*s*s - .81*s**6);
  return [x,y,z];
}

function canopyHeight(x,z) {
  let t = saturate((z+1.74)/2.38), v = 0;
  for (let i=0;i<5;i++) {
    v=(x+.023)/(.48+.203*Math.max(0,Math.sin(Math.PI*t))**.67);
    t=saturate((z+1.74-.26*v*v)/(2.38-.58*v*v));
  }
  if (Math.abs(v)>1 || t<=0 || t>=1) return null;
  return canopy(t,v)[1];
}

export function fairPanels(pos, normals) {
  const n = pos.length / 3;
  const paintWeights = new Float32Array(n);
  for (let i=0;i<n;i++) {
    const k=i*3, x=pos[k], y=pos[k+1], z=pos[k+2];
    const cap=canopyHeight(x,z);
    if (cap!==null && y>cap-.06) {
      // Sink reconstructed interior fragments beneath the continuous new exterior shell.
      pos[k+1]=Math.min(y,cap-.022);
    }
    if (z<.40 || z>2.355) continue;
    const top=hoodHeight(x,z);
    // Keep lamp openings, splitter and undercuts. Blend along the crease above each wheel arch.
    const w=ease((y-top+.106)/.091) * ease((z-.40)/.23)
      * ease((2.37-z)/.12) * ease((.92-Math.abs(x))/.14);
    if (w<=0) continue;
    const h=.001;
    const normal=unit([-(hoodHeight(x+h,z)-hoodHeight(x-h,z))/(2*h), 1,
      -(hoodHeight(x,z+h)-hoodHeight(x,z-h))/(2*h)]);
    const mix=ease(w);
    pos[k+1]+=mix*(top-y);
    const result=unit(normal.map((a,c)=>a*mix+normals[k+c]*(1-mix)));
    normals.set(result,k);
    paintWeights[i]=mix;
  }
  return paintWeights;
}

export function addGlazing(doc, mesh, glass, paint) {
  const buffer=doc.getRoot().listBuffers()[0];
  const surround=doc.createMaterial("Graphite window surround").setBaseColorFactor([.018,.025,.028,1]).setMetallicFactor(.48).setRoughnessFactor(.32);
  const roof=paint.clone().setName("Garnet roof panel").setBaseColorTexture(null);
  const mats=[glass,roof,surround], positions=[],normals=[],triangles=mats.map(()=>[]);
  // Include each seal / pillar boundary as an exact tessellation line.
  const rows=Array.from(new Set([...Array.from({length:97},(_,i)=>i/96),.027,.23,.265,.438,.46,.64,.668,.865,.976])).sort((a,b)=>a-b);
  const columns=Array.from(new Set([...Array.from({length:65},(_,i)=>i/32-1),-.985,-.765,-.735,.735,.765,.985])).sort((a,b)=>a-b);
  for (const t of rows) for (const v of columns) {
    const h=.0001, p=canopy(t,v), a=canopy(Math.max(0,t-h),v), b=canopy(Math.min(1,t+h),v);
    const c=canopy(t,Math.max(-1,v-h)),d=canopy(t,Math.min(1,v+h));
    const u=b.map((n,i)=>n-a[i]),w=d.map((n,i)=>n-c[i]);
    positions.push(...p); normals.push(...unit([u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]]));
  }
  const width=columns.length;
  for (let r=0;r<rows.length-1;r++) for(let c=0;c<width-1;c++) {
    const s=Math.abs((columns[c]+columns[c+1])/2),t=(rows[r]+rows[r+1])/2;
    const perimeter=s>.985 || t<.027 || t>.976;
    const longitudinal=s>.735 && s<.765;
    const crossSeal=s<.735 && ((t>.23 && t<.265)||(t>.64 && t<.668));
    const pillar=s>.765 && ((t>.438 && t<.46)||t<.18||t>.865);
    const roofPanel=s<.735 && t>.265 && t<.64;
    const slot=perimeter||longitudinal||crossSeal||pillar ? 2 : roofPanel ? 1 : 0;
    const i=r*width+c;
    triangles[slot].push(i,i+width,i+1,i+1,i+width,i+width+1);
  }
  const attribute=(type,arr)=>doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
  const pos=attribute('VEC3',Float32Array.from(positions)), nor=attribute('VEC3',Float32Array.from(normals));
  for(let i=0;i<mats.length;i++) {
    mesh.addPrimitive(doc.createPrimitive().setMaterial(mats[i]).setAttribute('POSITION',pos).setAttribute('NORMAL',nor)
      .setIndices(attribute('SCALAR',Uint16Array.from(triangles[i]))));
  }
}
