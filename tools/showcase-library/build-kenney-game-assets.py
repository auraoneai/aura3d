import argparse, bpy, math, os, sys
from mathutils import Vector

parser=argparse.ArgumentParser(description='Build coherent CC0 Kenney game-world derivatives.')
parser.add_argument('--racing-root', required=True, help='Extracted Racing Kit GLB directory')
parser.add_argument('--platform-root', required=True, help='Extracted Platformer Kit GLB directory')
parser.add_argument('--output-dir', required=True)
args=parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
RACING_ROOT=os.path.abspath(args.racing_root)
PLATFORM_ROOT=os.path.abspath(args.platform_root)
OUT=os.path.abspath(args.output_dir)
os.makedirs(OUT, exist_ok=True)

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name,color,metal=0.0,rough=.6,emit=None):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(*color,1); bs.inputs['Roughness'].default_value=rough; bs.inputs['Metallic'].default_value=metal
    if emit:
        bs.inputs['Emission Color'].default_value=(*emit,1); bs.inputs['Emission Strength'].default_value=2.5
    return m

def cube(name,loc,scale,material,bevel=.08):
    bpy.ops.mesh.primitive_cube_add(location=loc); o=bpy.context.object; o.name=name; o.scale=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(material)
    if bevel:
        mod=o.modifiers.new('edge-softness','BEVEL'); mod.width=bevel; mod.segments=2
    return o

def cyl(name,loc,r,depth,material,verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=depth,location=loc); o=bpy.context.object; o.name=name; o.data.materials.append(material); return o

def ring_mesh(name,rx,ry,width,z,material,segments=96):
    verts=[]; faces=[]
    for i in range(segments):
        a=2*math.pi*i/segments
        for r in (1-width/(2*max(rx,ry)),1+width/(2*max(rx,ry))): verts.append((rx*r*math.cos(a),ry*r*math.sin(a),z))
    for i in range(segments):
        a=2*i; b=2*((i+1)%segments); faces.append((a,b,b+1,a+1))
    me=bpy.data.meshes.new(name+' mesh'); me.from_pydata(verts,[],faces); me.materials.append(material); o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); return o

def export(path):
    bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',export_apply=True,export_yup=True,export_materials='EXPORT',export_image_format='AUTO')

# Racing circuit world
reset()
grass=mat('terrain grass',(0.055,.19,.11),rough=.9); grass2=mat('infield grass',(0.08,.28,.16),rough=.9); road=mat('road asphalt',(.035,.045,.06),rough=.82); line=mat('road lane paint',(.9,.92,.86),rough=.65); red=mat('curb red',(.75,.045,.06),rough=.55); white=mat('curb white',(.92,.9,.82),rough=.55); concrete=mat('barrier concrete',(.22,.25,.29),rough=.8); cyan=mat('neon cyan',(.02,.45,.66),rough=.25,emit=(.03,.55,.9)); orange=mat('neon orange',(.8,.18,.03),rough=.3,emit=(1,.18,.02)); dark=mat('grandstand dark',(.025,.035,.055),metal=.25,rough=.45); seat=mat('grandstand seats',(.12,.2,.34),metal=.05,rough=.55); tree=mat('tree foliage',(.03,.22,.12),rough=.85); trunk=mat('tree trunk',(.18,.09,.035),rough=.9)
cube('terrain-ground',(0,0,-.32),(20,15,.35),grass,0)
cube('infield-ground',(0,0,-.08),(10.5,5.6,.12),grass2,.18)
ring_mesh('road-track-circuit',14,9,5.2,.08,road)
ring_mesh('road-inner-lane-line',14,9,4.35,.102,line)
# curbs alternating around inner/outer edges
for i in range(48):
    a=2*math.pi*i/48; m=red if i%2==0 else white
    for fac in (.78,1.22):
        o=cube(f'road-curb-{i}-{fac}',(14*fac*math.cos(a),9*fac*math.sin(a),.14),(.5,.22,.11),m,.04); o.rotation_euler[2]=a+math.pi/2
# start strip and arch
for j in range(10): cube(f'road-start-grid-{j}',(-2.25+j*.5,-9.0,.13),(.23,.18,.025),white if j%2==0 else dark,0)
for x in (-3.2,3.2): cube('start-arch-column',(x,-10.3,1.65),(.18,.22,1.65),dark,.05)
cube('start-arch-header',(0,-10.3,3.18),(3.4,.24,.22),dark,.06)
for x in (-2.5,-1.5,-.5,.5,1.5,2.5): cyl('start-light',(x,-10.52,3.16),.11,.12,cyan if x<0 else orange,16); bpy.context.object.rotation_euler[0]=math.pi/2
# stands, pit structures
for side,y in ((1,12.0),(-1,-12.6)):
    for x in (-8,-4,4,8):
        cube(f'grandstand-base-{side}-{x}',(x,y,.65),(1.7,.65,.65),dark,.12)
        for row in range(4): cube(f'grandstand-seat-{side}-{x}-{row}',(x,y-side*(.15+row*.25),1.05+row*.28),(1.55,.16,.12),seat,.04)
for x in (-8,-5,-2):
    cube(f'pit-garage-{x}',(x,-13.7,.8),(1.25,.65,.8),concrete,.08); cube(f'pit-awning-{x}',(x,-13.0,1.65),(1.3,.75,.08),cyan,.04)
# barriers and light posts
for i in range(28):
    a=2*math.pi*i/28; x=18.2*math.cos(a); y=12.6*math.sin(a); o=cube(f'barrier-{i}',(x,y,.34),(.65,.12,.34),concrete,.04); o.rotation_euler[2]=a+math.pi/2
for i in range(16):
    a=2*math.pi*i/16; x=19*math.cos(a); y=13.2*math.sin(a); cyl(f'light-post-{i}',(x,y,2),.07,4,dark,12); cube(f'light-head-{i}',(x,y,4),(.22,.12,.08),cyan,.03)
# trees around perimeter
for i in range(26):
    a=2*math.pi*i/26; x=(22+(i%3)) * math.cos(a); y=(16+(i%2)) * math.sin(a); cyl(f'tree-trunk-{i}',(x,y,.65),.16,1.3,trunk,10); bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1.0,location=(x,y,1.85)); bpy.context.object.name=f'tree-canopy-{i}'; bpy.context.object.scale=(.85,.85,1.25); bpy.context.object.data.materials.append(tree)
# decorative billboards
for x,c in ((-10,orange),(0,cyan),(10,orange)): cube(f'billboard-{x}',(x,13.8,2.1),(2.0,.12,1.0),c,.08)
export(os.path.join(OUT,'kenney-neon-race-circuit.glb'))

# Racing car derivative
reset(); bpy.ops.import_scene.gltf(filepath=os.path.join(RACING_ROOT,'raceCarRed.glb'))
for o in bpy.context.scene.objects: o.name='kenney-race-car-'+o.name
# center and orient long axis Z after gltf Y-up export through Blender conversion
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
export(os.path.join(OUT,'kenney-race-car-red.glb'))

# Platformer world
reset()
grass=mat('platform grass',(.08,.48,.22),rough=.82); soil=mat('platform cliff',(.20,.09,.055),rough=.9); stone=mat('platform stone',(.20,.27,.35),rough=.75); moss=mat('platform moss',(.16,.62,.32),rough=.75); hazard=mat('hazard lava',(.95,.12,.025),rough=.25,emit=(1,.08,.01)); gold=mat('collectible gold',(1,.58,.04),metal=.45,rough=.25,emit=(.6,.18,.01)); cyan=mat('finish portal',(.02,.65,.9),metal=.15,rough=.2,emit=(.02,.65,1)); purple=mat('accent purple',(.42,.12,.75),rough=.4,emit=(.25,.02,.5)); foliage=mat('foliage',(.02,.3,.16),rough=.9); bark=mat('bark',(.16,.07,.03),rough=.9); cloud=mat('background cloud',(.65,.82,.92),rough=.9)
# distant backdrop mountains
for i,(x,z,s) in enumerate([(-12,5,4),(-3,6,5),(7,5,4),(16,7,6),(27,5,4),(42,6,5),(57,5,4),(70,7,6)]):
    bpy.ops.mesh.primitive_cone_add(vertices=5,radius1=s,depth=s*1.8,location=(x,3,z)); o=bpy.context.object; o.name=f'background-mountain-{i}'; o.data.materials.append(stone)
# ground/platform chain: (center x, top z, width, depth)
platforms=[(-7,0,9,2.8),(1,1.2,5,2.4),(7,2.4,4.8,2.2),(13,1.3,5.2,2.4),(20,3.0,5.5,2.6),(28,1.8,7.0,2.8),(36,3.8,6.0,2.6),(44,2.6,5.5,2.5),(52,4.2,6.0,2.7),(60,2.8,5.5,2.5),(68,4.5,7.0,2.8)]
for i,(x,z,w,d) in enumerate(platforms):
    cube(f'platform-ground-{i}',(x,0,z-1.0),(w/2,d/2,1.0),soil,.16)
    cube(f'platform-grass-top-{i}',(x,0,z+.08),(w/2,d/2,.10),grass,.08)
    # rock accents under ledges
    for j in range(max(2,int(w//2))):
        cx=x-w/2+.8+j*1.6; bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.42,location=(cx,0,z-1.55)); ob=bpy.context.object; ob.name=f'cliff-rock-{i}-{j}'; ob.scale=(1.2,.8,1); ob.data.materials.append(stone)
# floating platforms
for i,(x,z,w) in enumerate([(3.5,4.4,2.4),(10,5.4,2.8),(16.3,4.8,2.3),(24,6.5,3.0),(32.5,6.2,2.4),(40.5,6.1,2.5),(48,7.0,2.8),(56.5,6.4,2.5),(64,7.5,3.0)]):
    cube(f'platform-floating-{i}',(x,0,z),(w/2,1.0,.18),stone,.12); cube(f'platform-moss-{i}',(x,0,z+.21),(w/2,1.0,.08),moss,.06)
# lava hazards in gaps
for i,(x,w) in enumerate([(-1.9,1.2),(4.2,1.1),(10.4,1.1),(16.5,1.3),(24,1.2),(32.2,1.2),(40,1.2),(48,1.2),(56,1.2),(64,1.2)]): cube(f'hazard-lava-{i}',(x,0,-1.0),(w/2,1.15,.10),hazard,.05)
# trees and foliage on platforms
for i,(x,z) in enumerate([(-10,.2),(-5,.2),(8,2.6),(14,1.5),(21,3.2),(29,2.0),(38,4.0),(45,2.8),(53,4.4),(61,3.0),(70,4.7)]):
    cyl(f'tree-trunk-{i}',(x,.55,z+1.0),.16,2,bark,10); bpy.context.object.rotation_euler[0]=math.pi/2
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=.9,location=(x,.55,z+2.15)); o=bpy.context.object; o.name=f'tree-canopy-{i}'; o.scale=(1.1,.8,1.2); o.data.materials.append(foliage)
# coins on route arc
coins=[(-7,1.2),(-4,1.2),(0,2.3),(3.5,5.2),(7,3.5),(10,6.2),(13,2.5),(16.3,5.7),(20,4.2),(24,7.3),(28,3),(32.5,7),(36,5),(40.5,6.9),(44,3.8),(48,7.8),(52,5.4),(56.5,7.2),(60,4.0),(64,8.3),(68,5.8)]
for i,(x,z) in enumerate(coins):
    bpy.ops.mesh.primitive_torus_add(major_radius=.24,minor_radius=.07,major_segments=16,minor_segments=8,location=(x,-.75,z)); o=bpy.context.object; o.name=f'collectible-coin-{i}'; o.rotation_euler[0]=math.pi/2; o.data.materials.append(gold)
# checkpoint arches and finish portal
for i,(x,z) in enumerate([(1,1.3),(13,1.4),(28,1.9),(44,2.7),(60,2.9)]):
    for dx in (-.8,.8): cube(f'checkpoint-column-{i}-{dx}',(x+dx,0,z+1),(.08,.15,1),purple,.04)
    cube(f'checkpoint-header-{i}',(x,0,z+2),(.9,.15,.08),purple,.04)
for dx in (-1,1): cube(f'finish-column-{dx}',(72+dx,0,5.7),(.12,.25,1.7),cyan,.06)
cube('finish-header',(72,0,7.4),(1.12,.25,.12),cyan,.06)
# clouds/background islands
for i,(x,z) in enumerate([(-6,9),(6,10),(20,10),(33,11),(47,10),(61,11)]):
    for j in range(3): bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=.75,location=(x+j*.75,2.5,z+(j%2)*.2)); o=bpy.context.object; o.name=f'background-cloud-{i}-{j}'; o.scale=(1.4,.7,.55); o.data.materials.append(cloud)
export(os.path.join(OUT,'kenney-verdant-platformer-world.glb'))

# Character derivative from platformer kit (distinct from old blocky character pack)
reset(); bpy.ops.import_scene.gltf(filepath=os.path.join(PLATFORM_ROOT,'character-oobi.glb'))
for o in bpy.context.scene.objects: o.name='kenney-oobi-hero-'+o.name
export(os.path.join(OUT,'kenney-oobi-platformer-hero.glb'))
print('BUILT',OUT)
