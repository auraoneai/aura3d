import json,os,glob,sys
import numpy as np
from PIL import Image
REPO=open('/tmp/b505-animation.path').read().strip()
E=os.path.join(REPO,"evidence/agent-eval-505/animation"); F=os.path.join(E,"frames")
def L(p): return np.asarray(Image.open(p).convert("L"),dtype=np.float32)
def C(p): return np.asarray(Image.open(p).convert("RGB"))
def crop(a,x0,x1,y0,y1):
    h,w=a.shape[:2]; return a[int(h*y0):int(h*y1),int(w*x0):int(w*x1)]
codes=json.load(open('/tmp/b505-codes.json'))
out={}
for code,c in codes.items():
    rid=c["runId"]; t=int(code[1:3])
    names=["1","m2","m3","m4","m5","m6"]; fr=[L(f"{F}/{rid}-{n}.png") for n in names]; last=L(f"{F}/{rid}-2.png")
    d=lambda a,b,box=(0,1,0,1):float((np.abs(crop(a,*box)-crop(b,*box))>8).mean())
    pairs=[d(fr[i],fr[i+1]) for i in range(5)]
    diff12=float(np.abs(fr[0]-last).mean()); ch12=d(fr[0],last)
    rgb=C(f"{F}/{rid}-2.png"); q=(rgb//64).reshape(-1,3); keys=q[:,0]*16+q[:,1]*4+q[:,2]
    cnt=np.bincount(keys,minlength=64)/len(keys); clusters=int((cnt>0.003).sum())
    nonblack=float((last>8).mean()); std=float(last.std())
    blank=not(nonblack>0.2 and std>3)
    s={"mean":round(float(last.mean()),1),"std":round(std,1),"nonblack":round(nonblack,3),"diff":round(diff12,2),"changedFrac":round(ch12,4),
       "consecutiveChanged":[round(p,4) for p in pairs],"clusters":clusters}
    if t==10:
        cen=[d(fr[i],fr[i+1],(0.2,0.8,0.2,0.8)) for i in range(5)]
        ok=sum(x>0.005 for x in cen)>=4 and clusters>=5 and not blank
        s["centralChanged"]=[round(x,4) for x in cen]; s["motionOk"]=bool(ok); s["loopClosure"]="not measured (frames not 2.0 s apart)"
    elif t==11:
        pend=(0.3,0.7,0.5,0.95); face=(0.3,0.7,0.15,0.5)
        pc=[d(fr[i],fr[i+1],pend) for i in range(5)]
        # centroid of changed pixels in pendulum crop across pairs
        cx=[]
        for i in range(5):
            m=np.abs(crop(fr[i],*pend)-crop(fr[i+1],*pend))>8
            if m.sum()>20: cx.append(float(np.nonzero(m)[1].mean()/m.shape[1]*(pend[1]-pend[0])+pend[0]))
        spread=(max(cx)-min(cx)) if cx else 0
        fstatic=max(d(fr[1],fr[2],face),d(fr[2],fr[3],face)); fchg=d(fr[0],last,face)
        ok=sum(x>0.002 for x in pc)>=4 and spread>=0.03 and fchg>fstatic and not blank
        s.update({"pendulumChanged":[round(x,4) for x in pc],"centroidSpread":round(spread,3),"faceStaticShort":round(fstatic,4),"faceChanged3s":round(fchg,4),"motionOk":bool(ok),"loopClosure":"not measured","note":"crop boxes assume a roughly centred clock; approximate"})
    else:
        ok=all(p>0.003 for p in pairs) and not blank
        s["motionOk"]=bool(ok); s["loopClosure"]="not measured (8 s)"
    out[rid]=s
json.dump(out,open(f"{E}/motion-probe.json","w"),indent=1)
for k,v in out.items(): print(k.replace("bench505-animation-",""),v["motionOk"],v["clusters"],v["nonblack"],[round(x,3) for x in v["consecutiveChanged"]])
