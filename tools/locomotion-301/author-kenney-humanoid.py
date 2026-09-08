#!/usr/bin/env python3
"""Author a candidate weighted-chain derivative. Original mesh/animations are retained.
New joints use declared fractions of measured existing rigid-group extents; this is
asset authoring, not a correction profile or evidence of retargeted pose quality.
"""
import json, struct, hashlib, pathlib, math
source=pathlib.Path('public/aura-assets/showcaseKenneyOobiPlatformerHero.3f821141.glb')
out=pathlib.Path('tests/fixtures/locomotion-301/kenney-articulated-candidate.glb')
b=source.read_bytes(); jl=struct.unpack_from('<I',b,12)[0]; g=json.loads(b[20:20+jl]); binary=bytearray(b[28+jl:])
def read(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];f={5126:'f',5123:'H',5121:'B'}[a['componentType']];c={'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];off=v.get('byteOffset',0)+a.get('byteOffset',0);step=v.get('byteStride',struct.calcsize(f)*c);return [list(struct.unpack_from('<'+f*c,binary,off+k*step))for k in range(a['count'])]
def mul(a,b):return [[sum(a[r][k]*b[k][c]for k in range(4))for c in range(4)]for r in range(4)]
def inv(a):
 m=[row[:]+[float(i==j)for j in range(4)]for i,row in enumerate(a)]
 for c in range(4):
  pivot=max(range(c,4),key=lambda r:abs(m[r][c]));m[c],m[pivot]=m[pivot],m[c];v=m[c][c]
  if abs(v)<1e-12:raise ValueError('Singular bind matrix')
  m[c]=[x/v for x in m[c]]
  for r in range(4):
   if r!=c:
    v=m[r][c];m[r]=[x-v*y for x,y in zip(m[r],m[c])]
 return [row[4:]for row in m]
def trs(n):
 x,y,z,w=n.get('rotation',[0,0,0,1]);s=n.get('scale',[1,1,1]);t=n.get('translation',[0,0,0]);r=[[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w],[2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w],[2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y]]
 return [[r[i][j]*s[j]for j in range(3)]+[t[i]]for i in range(3)]+[[0,0,0,1]]
parents={c:i for i,n in enumerate(g['nodes'])for c in n.get('children',[])}
def world(i):return mul(world(parents[i]),trs(g['nodes'][i]))if i in parents else trs(g['nodes'][i])
skin=g['skins'][0];primitive=g['meshes'][0]['primitives'][0];attrs=primitive['attributes'];positions=read(attrs['POSITION']);joints=read(attrs['JOINTS_0']);weights=read(attrs['WEIGHTS_0']);old_ibm=read(skin['inverseBindMatrices']);groups={}
for p,j,w in zip(positions,joints,weights):groups.setdefault(j[max(range(4),key=lambda k:w[k])],[]).append(p)
height=max(p[1]for p in positions)-min(p[1]for p in positions);authoring=[];splits={};new_ibm=[]
def add_joint(name,parent,point):
 parent_world=world(parent);local=[sum(inv(parent_world)[r][c]*([*point,1][c])for c in range(4))for r in range(3)]
 index=len(g['nodes']);g['nodes'].append({'name':name,'translation':local,'extras':{'aura3dAuthoredJoint':True}});g['nodes'][parent].setdefault('children',[]).append(index);parents[index]=parent
 inverse=inv(world(index));new_ibm.append([inverse[r][c]for c in range(4)for r in range(4)]);slot=len(skin['joints']);skin['joints'].append(index);return index,slot
for slot,side in [(1,'left'),(2,'right')]:
 node=skin['joints'][slot];g['nodes'][node]['name']=side+'UpperLeg';origin=[world(node)[r][3]for r in range(3)];low=min(p[1]for p in groups[slot]);ankle=low+height*0.04;knee=(origin[1]+ankle)/2
 knee_node,knee_slot=add_joint(side+'LowerLeg',node,[origin[0],knee,origin[2]]);foot_node,foot_slot=add_joint(side+'Foot',knee_node,[origin[0],ankle,origin[2]])
 splits[slot]=(1,-1,knee,ankle,knee_slot,foot_slot);authoring.append({'group':slot,'upper':origin,'kneeY':knee,'ankleY':ankle,'method':'knee midpoint between original leg pivot and 4%-height ankle'})
for slot,side,sign in [(4,'left',1),(5,'right',-1)]:
 node=skin['joints'][slot];g['nodes'][node]['name']=side+'UpperArm';origin=[world(node)[r][3]for r in range(3)];end=max(p[0]*sign for p in groups[slot])*sign;elbow=origin[0]+(end-origin[0])*0.5;hand=origin[0]+(end-origin[0])*0.8
 elbow_node,elbow_slot=add_joint(side+'LowerArm',node,[elbow,origin[1],origin[2]]);hand_node,hand_slot=add_joint(side+'Hand',elbow_node,[hand,origin[1],origin[2]])
 splits[slot]=(0,sign,elbow,hand,elbow_slot,hand_slot);authoring.append({'group':slot,'upper':origin,'elbowX':elbow,'handX':hand,'method':'50% / 80% original pivot to measured extremity'})
torso=skin['joints'][3];g['nodes'][torso]['name']='spine';points=groups[3];min_y=min(p[1]for p in points);max_y=max(p[1]for p in points);neck_y=min_y+(max_y-min_y)*0.6;head_y=min_y+(max_y-min_y)*0.75;center=[(min(p[k]for p in points)+max(p[k]for p in points))/2 for k in [0,2]]
neck,neck_slot=add_joint('neck',torso,[center[0],neck_y,center[1]]);head,head_slot=add_joint('head',neck,[center[0],head_y,center[1]]);splits[3]=(1,1,neck_y,head_y,neck_slot,head_slot);authoring.append({'group':3,'neckY':neck_y,'headY':head_y,'method':'60% / 75% measured torso vertical extent'})
# Smooth weights across each authored joint; endpoints must have actual influenced vertices.
for i,(p,js,ws)in enumerate(zip(positions,joints,weights)):
 slot=js[max(range(4),key=lambda k:ws[k])]
 if slot not in splits:continue
 axis,sign,a,c,mid,last=splits[slot];v=p[axis]*sign;a*=sign;c*=sign;band=max(height*.025,1e-5)
 t=max(0,min(1,(v-a+band)/(2*band)));u=max(0,min(1,(v-c+band)/(2*band)));joints[i]=[slot,mid,last,0];weights[i]=[1-t,t*(1-u),t*u,0]
def append(rows,component,kind):
 while len(binary)%4:binary.append(0)
 offset=len(binary);fmt={5126:'f',5123:'H'}[component]
 for row in rows:binary.extend(struct.pack('<'+fmt*len(row),*row))
 view=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(binary)-offset});accessor=len(g['accessors']);g['accessors'].append({'bufferView':view,'componentType':component,'count':len(rows),'type':kind});return accessor
attrs['JOINTS_0']=append(joints,5123,'VEC4');attrs['WEIGHTS_0']=append(weights,5126,'VEC4');skin['inverseBindMatrices']=append(old_ibm+new_ibm,5126,'MAT4');g['buffers'][0]['byteLength']=len(binary)
g.setdefault('extras',{})['aura3dRigAuthoring']={'status':'candidate-unverified','source':str(source),'parameters':authoring,'geometry':'original positions/indices/UVs/normals unchanged','originalAnimation':'existing channel node indices retained; new joints inherit parent motion','requiredQuality':['bind-pose mesh equivalence','joint articulation deformation','retargeted rendered pose and contact quality']}
j=json.dumps(g,separators=(',',':')).encode();j+=b' '*((-len(j))%4);result=struct.pack('<5I',0x46546c67,2,28+len(j)+len(binary),len(j),0x4e4f534a)+j+struct.pack('<2I',len(binary),0x004e4942)+binary
out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(result)
manifest=json.load(open('aura.assets.json'));source_meta=next(x for x in manifest['assets']if x['id']=='showcaseKenneyOobiPlatformerHero')
sha=lambda x:hashlib.sha256(x).hexdigest();prov={'schema':'aura3d-authored-rig/v1','source':str(source),'sourceSha256':sha(b),'sourceProvenance':source_meta['provenance'],'outputSha256':sha(result),'tool':__file__,'toolSha256':sha(pathlib.Path(__file__).read_bytes()),'status':'candidate-unverified','authoring':authoring,'originalJointCount':6,'jointCount':len(skin['joints']),'changed':['Added weighted articulated chains from declared measured-extent rules; source geometry and clips retained.'],'requiredValidation':g['extras']['aura3dRigAuthoring']['requiredQuality']}
pathlib.Path(str(out)+'.provenance.json').write_text(json.dumps(prov,indent=2)+'\n');print(json.dumps({'output':str(out),'sha256':sha(result),'joints':len(skin['joints'])}))
