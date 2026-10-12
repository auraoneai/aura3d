import sys
import numpy as np
from PIL import Image, ImageFilter
def lin(p):
    a=np.asarray(Image.open(p).convert("RGB"),dtype=np.float32)/255.0
    a=np.where(a<=0.04045,a/12.92,((a+0.055)/1.055)**2.4)
    return 0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]
A,B=lin(sys.argv[1]),lin(sys.argv[2])
D=np.clip(A-B,0,None)
def box(x,r):
    c=np.cumsum(np.pad(x,((r+1,r),(0,0)),mode="edge"),0); x=(c[2*r+1:]-c[:-2*r-1])/(2*r+1)
    c=np.cumsum(np.pad(x,((0,0),(r+1,r)),mode="edge"),1); return (c[:,2*r+1:]-c[:,:-2*r-1])/(2*r+1)
Db=box(D,8)
ratio=B.mean()/max(A.mean(),1e-6)
print(f"lin off {A.mean():.4f} on {B.mean():.4f} ratio {ratio:.2f}  diff {D.mean():.4f} hf-part {np.abs(D-Db).mean():.4f}  corr(diff,off) {np.corrcoef(D.ravel(),A.ravel())[0,1]:.2f}")
