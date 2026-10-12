import json,sys,os,numpy as np
from PIL import Image
# foreground = pixels farther than 12 (L1/3) from the frame's dominant colour
def fg(p):
    a=np.asarray(Image.open(p).convert('RGB')).astype(np.int16)
    f=a.reshape(-1,3); q=(f//4)
    u,c=np.unique(q,axis=0,return_counts=True); bg=u[np.argmax(c)]*4+2
    d=np.abs(f-bg).sum(1)/3; m=d>12
    l=(0.2126*f[:,0]+0.7152*f[:,1]+0.0722*f[:,2])
    return m.mean()*100, (l[m].mean() if m.any() else 0), (np.percentile(l[m],90) if m.any() else 0), c.max()/len(f)*100
base=sys.argv[1]; want=sys.argv[2].split(',') if len(sys.argv)>2 and sys.argv[2] else None
r=json.load(open(os.path.join(base,'report.json')))
for g in r['games']:
    if want and not any(w in g['id'] for w in want): continue
    v=[]
    for run in g['runs']:
        if not run['run'].startswith('desktop'): continue
        for s in run['shots']:
            p=os.path.join(base,s['file'])
            if os.path.exists(p): v.append(fg(p))
    if v:
        v=np.array(v).mean(0); print(f"{g['id']:28s} fgFrac={v[0]:.0f}% fgMean={v[1]:.1f} fgP90={v[2]:.0f} bgTop={v[3]:.0f}%")
