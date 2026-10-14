"""Original CC0 Neon Corridor hard-surface family. Visual assets only."""
import bpy, math, os

ROOT=os.path.abspath(os.getcwd()); OUT=os.path.join(ROOT,"examples/neon-corridor-strike/assets/models"); os.makedirs(OUT,exist_ok=True)
def xyz(v): return (v[0],-v[2],v[1])
def dims(v): return (v[0],v[2],v[1])
def euler(v): return (v[0],-v[2],v[1])
def clean(): bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=.2,rough=.55,emit=None,strength=1):
 m=bpy.data.materials.get(name) or bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True; b=m.node_tree.nodes.get("Principled BSDF"); b.inputs["Base Color"].default_value=(*color,1); b.inputs["Metallic"].default_value=metal; b.inputs["Roughness"].default_value=rough
 if emit: b.inputs["Emission Color"].default_value=(*emit,1); b.inputs["Emission Strength"].default_value=strength
 return m
def finish(o,m,bev=.03,smooth=False):
 o.data.materials.append(m)
 if bev:
  mod=o.modifiers.new("machined bevel","BEVEL"); mod.width=bev; mod.segments=2; mod.limit_method="ANGLE"; mod.angle_limit=math.radians(22); bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier=mod.name)
 for p in o.data.polygons:p.use_smooth=smooth
 return o
def cube(n,loc,dims,m,bev=.03,rot=(0,0,0)):
 original=dims; bpy.ops.mesh.primitive_cube_add(location=xyz(loc),rotation=euler(rot)); o=bpy.context.object;o.name=n;o.dimensions=globals()["dims"](original);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,m,min(bev,min(original)*.16))
def cyl(n,loc,r,d,m,verts=16,rot=(0,0,0),bev=.02):
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=d,location=xyz(loc),rotation=euler(rot));o=bpy.context.object;o.name=n;return finish(o,m,bev,True)
def sphere(n,loc,scale,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=10,location=xyz(loc));o=bpy.context.object;o.name=n;o.scale=dims(scale);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,m,0,True)
def wedge(n,loc,dims,m,t=.55,rot=(0,0,0),bev=.025):
 x,y,z=[v/2 for v in dims];raw=[(-x,-y,-z),(x,-y,-z),(x,-y,z),(-x,-y,z),(-x*t,y,-z*t),(x*t,y,-z*t),(x*t,y,z*t),(-x*t,y,z*t)];v=[xyz(point) for point in raw];f=[(0,3,2,1),(4,5,6,7),(1,2,6,5),(3,0,4,7),(0,1,5,4),(2,3,7,6)];me=bpy.data.meshes.new(n+" mesh");me.from_pydata(v,[],f);me.update();o=bpy.data.objects.new(n,me);bpy.context.collection.objects.link(o);o.location=xyz(loc);o.rotation_euler=euler(rot);return finish(o,m,bev)
def merge(prefix):
 groups={}
 for o in list(bpy.context.scene.objects):
  if o.type=="MESH" and o.data.materials:groups.setdefault(o.data.materials[0].name,[]).append(o)
 for mn,obs in groups.items():
  bpy.ops.object.select_all(action="DESELECT")
  for o in obs:o.select_set(True)
  bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();bpy.context.object.name=prefix+" — "+mn
def export(name):
 path=os.path.join(OUT,name+".glb");bpy.ops.object.select_all(action="SELECT");bpy.ops.export_scene.gltf(filepath=path,export_format="GLB",use_selection=True,export_apply=True,export_yup=True,export_materials="EXPORT",export_cameras=False,export_lights=False,export_extras=True);print("NEON_MODEL",name,os.path.getsize(path))

def world():
 clean();deck=mat("NC deck gunmetal",(.16,.23,.25),.45,.48);shell=mat("NC blue steel shell",(.13,.24,.27),.38,.54);trim=mat("NC aged bronze",(.42,.24,.1),.62,.38);inset=mat("NC teal panels",(.14,.42,.43),.18,.7);machine=mat("NC service machinery",(.08,.13,.15),.58,.42);cyan=mat("NC cyan containment light",(.2,.8,.86),.1,.25,(.12,.72,.82),2);amber=mat("NC amber hazard light",(.95,.34,.05),.12,.28,(.85,.14,.01),1.5)
 cube("continuous deck",(0,-.1,-1),(6.12,.22,22.2),deck,.08);cube("traction lane",(0,.035,-1),(2.65,.045,21.6),inset,.018);cube("ceiling spine",(0,2.57,-1),(1.1,.18,22),shell,.06)
 zs=(8,5.05,2.1,-.85,-3.8,-6.75,-9.4)
 for s in (-1,1):
  cube("wall foundation",(s*2.96,1.25,-1),(.22,2.65,22.15),shell,.07);cube("bronze skirting",(s*2.78,.34,-1),(.13,.42,21.9),trim,.04);cube("service sill",(s*2.58,.18,-1),(.32,.18,21.8),machine,.04)
  for i,z in enumerate(zs):
   cube(f"panel backing {s} {i}",(s*2.74,1.34,z),(.055,1.48,2.34),machine,.018);cube(f"recessed panel {s} {i}",(s*2.80,1.34,z),(.065,1.27,2.12),inset,.025);cube(f"bay rib {s} {i}",(s*2.66,1.4,z+1.25),(.21,2.38,.16),trim,.035);cube(f"upper cap {s} {i}",(s*2.62,2.26,z),(.22,.19,2.28),trim,.035);cube(f"bay light {s} {i}",(s*2.725,1.67,z),(.032,.13,1.02),cyan,.014);cyl(f"tank {s} {i}",(s*2.42,.72,z-.68),.18,.76,machine,18,bev=.025);cyl(f"tank ring {s} {i}",(s*2.42,.98,z-.68),.22,.08,trim,18,bev=.012);cube(f"combat anchor {s} {i}",(s*2.34,.23,z+.45),(.48,.32,.62),machine,.05);cube(f"hazard face {s} {i}",(s*2.08,.25,z+.45),(.035,.18,.38),amber,.012)
  for y,r in ((.72,.075),(1.98,.06)):cyl("long conduit",(s*2.49,y,-1),r,21.55,trim,14,(math.pi/2,0,0),.012)
 for i,z in enumerate((8.4,5.45,2.5,-.45,-3.4,-6.35,-9.3)):
  cube(f"ceiling frame {i}",(0,2.5,z),(5.78,.17,.22),trim,.045);cube(f"ceiling light {i}",(0,2.385,z),(1.35,.045,.105),cyan,.016)
  for s in (-1,1):wedge(f"ceiling haunch {s} {i}",(s*2.36,2.25,z),(.66,.58,.22),shell,.42,(0,0,s*math.radians(18)),.035)
 cube("exit bulkhead",(0,1.27,-11),(6.18,2.72,.26),shell,.075);cube("exit door",(0,1.24,-10.82),(3.55,2.2,.16),machine,.055)
 for s in (-1,1):cube("exit jamb",(s*2.02,1.25,-10.62),(.34,2.42,.24),trim,.045);cyl("exit actuator",(s*2.42,1.08,-10.54),.25,1.42,machine,18,bev=.03)
 cube("exit header",(0,2.23,-10.58),(3.85,.28,.3),trim,.045);cube("exit light",(0,2.19,-10.39),(1.16,.075,.04),cyan,.014);merge("Containment Corridor");export("neonCorridorContainmentWorld")

def rifle():
 clean();black=mat("Rifle charcoal",(.055,.075,.085),.78,.3);steel=mat("Rifle steel",(.36,.46,.49),.72,.25);bronze=mat("Rifle bronze",(.56,.27,.08),.68,.32);blue=mat("Rifle cobalt",(.03,.22,.46),.35,.28);glow=mat("Rifle charged bore",(.5,.9,1),.05,.18,(.2,.7,1),2.6)
 wedge("receiver",(0,0,0),(.42,.28,1.18),black,.72,bev=.045);cube("rail",(0,.18,-.05),(.25,.1,.68),steel,.025)
 for z in (-.38,-.12,.14,.4):cube("heat rib",(0,.04,z),(.49,.08,.055),bronze,.016)
 cyl("field coil",(0,.07,.56),.13,.42,blue,20,(math.pi/2,0,0),.018);cyl("muzzle",(0,.07,.84),.095,.24,glow,20,(math.pi/2,0,0),.014);wedge("stock",(0,-.02,-.72),(.34,.24,.52),black,.58,(math.radians(-4),0,0),.04);cube("grip",(0,-.31,-.12),(.18,.46,.21),black,.035,(math.radians(-14),0,0));cube("trigger guard",(0,-.18,.12),(.22,.08,.24),steel,.02)
 for s in (-1,1):cube("power cell",(s*.21,-.02,.22),(.09,.2,.58),blue,.025);cube("side brace",(s*.24,.09,-.25),(.065,.11,.42),bronze,.018)
 merge("Containment Pulse Rifle");export("neonContainmentPulseRifle")

def warden_a():
 clean();armor=mat("Warden A graphite",(.07,.11,.13),.62,.36);steel=mat("Warden A steel",(.36,.48,.5),.66,.28);orange=mat("Warden A hazard ceramic",(.92,.22,.025),.22,.34);bronze=mat("Warden A mechanics",(.48,.24,.07),.58,.36);red=mat("Warden A optic",(1,.08,.015),.05,.18,(1,.015,.002),3.2)
 wedge("armored torso",(0,1.46,0),(.95,.82,.52),armor,.72,bev=.07);wedge("chest glacis",(0,1.5,.31),(.66,.46,.13),orange,.62,(math.radians(-7),0,0),.04);wedge("helmet",(0,2.04,.02),(.62,.48,.52),armor,.58,bev=.06);cube("visor",(0,2.07,.3),(.39,.075,.045),red,.016);cube("brow",(0,2.2,.24),(.54,.11,.13),steel,.025)
 for s in (-1,1):
  sphere("shoulder joint",(s*.6,1.65,0),(.18,.18,.18),bronze);wedge("pauldron",(s*.69,1.73,0),(.42,.34,.48),orange,.56,(0,0,s*math.radians(12)),.04);cube("upper arm",(s*.69,1.27,.02),(.24,.55,.27),armor,.04,(0,0,s*math.radians(7)));sphere("elbow",(s*.72,.96,.03),(.14,.14,.14),bronze);wedge("forearm",(s*.75,.72,.14),(.3,.52,.42),steel,.45,(s*math.radians(5),0,s*math.radians(-4)),.04);cube("hip",(s*.3,1.02,0),(.3,.3,.34),bronze,.04);wedge("thigh",(s*.34,.72,0),(.36,.54,.4),armor,.68,(0,0,s*math.radians(5)),.045);sphere("knee",(s*.36,.39,.04),(.15,.15,.15),bronze);wedge("shin",(s*.37,.18,.07),(.33,.4,.34),orange,.62,bev=.04);wedge("foot",(s*.37,.055,.22),(.38,.11,.62),armor,.78,bev=.03)
 cyl("spine reactor",(0,1.46,-.31),.2,.3,red,18,(math.pi/2,0,0),.018);merge("Containment Warden A");export("neonContainmentWardenA")

def warden_b():
 clean();armor=mat("Warden B wing armor",(.045,.075,.11),.68,.3);steel=mat("Warden B steel edges",(.18,.38,.52),.62,.28);crimson=mat("Warden B threat plates",(.65,.025,.02),.28,.3);bronze=mat("Warden B turbine",(.42,.2,.055),.62,.32);eye=mat("Warden B tri-eye",(1,.15,.02),.04,.16,(1,.025,.002),3.4)
 wedge("interceptor hull",(0,1.3,0),(.82,.56,.8),armor,.54,(math.radians(4),0,0),.06);sphere("central turbine",(0,1.31,.43),(.29,.29,.16),bronze);cyl("turbine iris",(0,1.31,.59),.17,.05,eye,20,(math.pi/2,0,0),.008)
 for s in (-1,1):
  wedge("primary wing",(s*.86,1.38,-.05),(1.25,.2,.74),armor,.22,(0,s*math.radians(-10),s*math.radians(-7)),.04);wedge("wing blade",(s*1.18,1.49,.03),(.76,.1,.46),crimson,.18,(0,s*math.radians(-13),s*math.radians(-8)),.022);wedge("outer fork",(s*1.53,1.21,-.14),(.42,.64,.28),steel,.2,(s*math.radians(15),0,s*math.radians(24)),.03);cyl("wing turbine",(s*.76,1.2,.2),.2,.2,bronze,18,(math.pi/2,0,0),.018);cyl("wing glow",(s*.76,1.2,.32),.11,.035,eye,18,(math.pi/2,0,0),.006);wedge("talon",(s*.58,.53,-.03),(.28,1,.24),steel,.25,(s*math.radians(5),0,s*math.radians(-13)),.03);wedge("claw",(s*.67,.06,.13),(.38,.12,.52),armor,.64,bev=.028)
 wedge("command fin",(0,1.95,-.12),(.2,.88,.52),crimson,.18,bev=.03)
 for x in (-.16,0,.16):sphere("command optic",(x,1.46,.46),(.052,.042,.03),eye)
 merge("Containment Warden B");export("neonContainmentWardenB")

world();rifle();warden_a();warden_b()
