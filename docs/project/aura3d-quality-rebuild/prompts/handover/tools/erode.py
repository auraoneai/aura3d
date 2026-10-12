import sys
import numpy as np
from PIL import Image, ImageFilter
def L(img): a=np.asarray(img.convert("RGB"),dtype=np.float32); return 0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]
a=Image.open(sys.argv[1]); b=Image.open(sys.argv[2])
A,B=L(a),L(b)
print(f"off {A.mean():.1f} on {B.mean():.1f} off-min3 {L(a.filter(ImageFilter.MinFilter(3))).mean():.1f} off-min5 {L(a.filter(ImageFilter.MinFilter(5))).mean():.1f} off-blur {L(a.filter(ImageFilter.BoxBlur(2))).mean():.1f}")
