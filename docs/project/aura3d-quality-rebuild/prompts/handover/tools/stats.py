import json,sys,os
import numpy as np
from PIL import Image
def stats(path):
    a=np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    l=0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]
    h,w=l.shape
    c=l[h//4:3*h//4,w//4:3*w//4]
    clip=(a.max(-1)>=250).mean()
    return dict(mean=l.mean(),center=c.mean(),p5=np.percentile(l,5),p50=np.percentile(l,50),p99=np.percentile(l,99),clip=clip*100,black=(l<8).mean()*100)
base=sys.argv[1]; games=sys.argv[2].split(',') if len(sys.argv)>2 else None
r=json.load(open(os.path.join(base,'report.json')))
for g in r['games']:
    if games and not any(x in g['id'] for x in games): continue
    acc=[]
    for run in g['runs']:
        if not run['run'].startswith('desktop'): continue
        for s in run['shots']:
            p=os.path.join(base,s['file'])
            if os.path.exists(p): acc.append(stats(p))
    if not acc: print(g['id'],'no shots'); continue
    m={k:np.mean([x[k] for x in acc]) for k in acc[0]}
    print(f"{g['id']:28s} n={len(acc)} "+' '.join(f"{k}={v:.1f}" for k,v in m.items()))
