# Minimal CPU GLB preview: base-colour texture + lambert, node transforms, 4 views (front +Z, side, back, 3/4).
# Usage: python3 -I tools/idol/render-views.py in.glb out.png   (needs numpy + Pillow; no GPU, no browser)
import sys, json, warnings
warnings.filterwarnings('ignore')
import sys, json, struct, io, math, numpy as np
from PIL import Image
glb=open(sys.argv[1],'rb').read()
jl=struct.unpack('<I',glb[12:16])[0]; J=json.loads(glb[20:20+jl]); B=glb[20+jl+8:]
CT={5126:np.float32,5123:np.uint16,5125:np.uint32,5121:np.uint8}; NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
def acc(i):
    a=J['accessors'][i]; bv=J['bufferViews'][a['bufferView']]; off=bv.get('byteOffset',0)+a.get('byteOffset',0)
    n=NC[a['type']]; dt=np.dtype(CT[a['componentType']]); st=bv.get('byteStride',0) or dt.itemsize*n
    raw=np.frombuffer(B,dtype=np.uint8,count=st*(a['count']-1)+dt.itemsize*n,offset=off)
    out=np.lib.stride_tricks.as_strided(raw,shape=(a['count'],n*dt.itemsize),strides=(st,1)).copy().view(dt).reshape(a['count'],n)
    return out.astype(np.float32) if a.get('normalized') is None or dt==np.float32 else out.astype(np.float32)/np.iinfo(dt).max
def img(ti):
    s=J['images'][J['textures'][ti]['source']]; bv=J['bufferViews'][s['bufferView']]
    return np.asarray(Image.open(io.BytesIO(B[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])).convert('RGB'),dtype=np.float32)/255
def qmat(q):
    x,y,z,w=q
    return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
def local(n):
    if 'matrix' in n: return np.array(n['matrix'],dtype=np.float64).reshape(4,4).T
    M=np.eye(4); R=qmat(n.get('rotation',[0,0,0,1])); S=np.diag(n.get('scale',[1,1,1]))
    M[:3,:3]=R@S; M[:3,3]=n.get('translation',[0,0,0]); return M
P=[];UV=[];F=[];TEX=None
def walk(i,parent):
    global TEX
    n=J['nodes'][i]; W=parent@local(n)
    if 'mesh' in n:
        Wm=W if 'skin' not in n else parent  # skinned: positions are in skeleton-root space
        for pr in J['meshes'][n['mesh']]['primitives']:
            p=acc(pr['attributes']['POSITION']); p=(np.c_[p,np.ones(len(p))]@Wm.T)[:,:3]
            uv=acc(pr['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in pr['attributes'] else np.zeros((len(p),2),np.float32)
            f=acc(pr['indices']).astype(np.int64).reshape(-1,3)+sum(len(x) for x in P)
            P.append(p);UV.append(uv);F.append(f)
            mat=J['materials'][pr.get('material',0)].get('pbrMetallicRoughness',{})
            if TEX is None and 'baseColorTexture' in mat: TEX=img(mat['baseColorTexture']['index'])
    for c in n.get('children',[]): walk(c,W)
sc=J['scenes'][J.get('scene',0)]
for i in sc['nodes']: walk(i,np.eye(4))
P=np.concatenate(P);UV=np.concatenate(UV);F=np.concatenate(F)
P=P.astype(np.float64); P-= (P.max(0)+P.min(0))/2; P/=np.abs(P).max()
S=512
def view(yaw,pitch=0.25):
    cy,sy,cp,sp=math.cos(yaw),math.sin(yaw),math.cos(pitch),math.sin(pitch)
    R=np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]])@np.eye(3); R=np.array([[1,0,0],[0,cp,-sp],[0,sp,cp]])@R
    v=P@R.T; x=(v[:,0]*0.9+1)*S/2; y=(1-v[:,1]*0.9)*S/2; z=v[:,2]
    im=np.full((S,S,3),0.85,np.float32); zb=np.full((S,S),-1e9)
    tri=v[F]; n=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]); n/=np.linalg.norm(n,axis=1,keepdims=True)+1e-12
    L=np.array([0.3,0.6,0.75]);L/=np.linalg.norm(L); shade=0.35+0.65*np.abs(n@L)
    for t in np.argsort(z[F].mean(1)):
        i0,i1,i2=F[t]; xs=np.array([x[i0],x[i1],x[i2]]); ys=np.array([y[i0],y[i1],y[i2]])
        x0,x1=int(max(xs.min(),0)),int(min(xs.max()+1,S)); y0,y1=int(max(ys.min(),0)),int(min(ys.max()+1,S))
        if x1<=x0 or y1<=y0: continue
        gx,gy=np.meshgrid(np.arange(x0,x1)+.5,np.arange(y0,y1)+.5)
        d=(ys[1]-ys[2])*(xs[0]-xs[2])+(xs[2]-xs[1])*(ys[0]-ys[2])
        if abs(d)<1e-9: continue
        a=((ys[1]-ys[2])*(gx-xs[2])+(xs[2]-xs[1])*(gy-ys[2]))/d; b=((ys[2]-ys[0])*(gx-xs[2])+(xs[0]-xs[2])*(gy-ys[2]))/d; c=1-a-b
        m=(a>=0)&(b>=0)&(c>=0)
        if not m.any(): continue
        zz=a*z[i0]+b*z[i1]+c*z[i2]; sub=zb[y0:y1,x0:x1]; m&=zz>sub
        if not m.any(): continue
        if TEX is not None:
            u=a*UV[i0,0]+b*UV[i1,0]+c*UV[i2,0]; vv=a*UV[i0,1]+b*UV[i1,1]+c*UV[i2,1]
            h,w,_=TEX.shape; col=TEX[np.clip((vv%1)*h,0,h-1).astype(int),np.clip((u%1)*w,0,w-1).astype(int)]
        else: col=np.full(gx.shape+(3,),0.7)
        sub[m]=zz[m]; im[y0:y1,x0:x1][m]=col[m]*shade[t]
    return (np.clip(im,0,1)*255).astype(np.uint8)
views=[view(a) for a in (0,math.pi/2,math.pi,-math.pi/4)]  # front(+Z), side, back, three-quarter
Image.fromarray(np.concatenate(views,1)).save(sys.argv[2]); print('ok',len(F),'tris')
