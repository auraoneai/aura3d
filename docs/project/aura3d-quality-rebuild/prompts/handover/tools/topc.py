import sys,numpy as np
from PIL import Image
for p in sys.argv[1:]:
    a=np.asarray(Image.open(p).convert('RGB'))
    f=a.reshape(-1,3); q=(f//4)*4
    u,c=np.unique(q,axis=0,return_counts=True); o=np.argsort(-c)[:5]
    print(p.split('/')[-1], [(tuple(u[i]),round(c[i]/len(f)*100,1)) for i in o])
