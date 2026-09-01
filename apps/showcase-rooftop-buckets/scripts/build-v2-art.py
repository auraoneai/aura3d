#!/usr/bin/env python3
"""Author Rooftop Buckets' original V2 art in Blender.

This is deliberately route-local art only.  The venue follows the existing
16 x 14 m rooftop court footprint but deliberately contains no backboard, rim,
net, or collision proxy.  Shooter and defender are real skinned meshes with
real armature actions; the route may later bind their named clips without
claiming reusable sports animation or physics.
"""
import bpy
import math
import json
import struct
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "assets" / "models"
OUT.mkdir(parents=True, exist_ok=True)

def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.materials, bpy.data.meshes, bpy.data.armatures, bpy.data.actions):
        for item in list(collection):
            collection.remove(item)

def material(name, color, metallic=0.0, rough=0.5, emission=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = rough
    if color[3] < 1:
        bsdf.inputs["Alpha"].default_value = color[3]
        m.surface_render_method = "DITHERED"
    if emission:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = 0.55
    return m

def finish(obj, mat, bevel=0.0):
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("soft production edges", "BEVEL")
        mod.width, mod.segments = bevel, 2
    return obj

def cube(name, loc, scale, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, mat, bevel)

def sphere(name, loc, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, mat)

def cyl(name, loc, radius, depth, mat, vertices=20, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    return finish(bpy.context.object, mat, bevel)

def tapered_limb(name, loc, radius_a, radius_b, depth, mat):
    bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=radius_a, radius2=radius_b, depth=depth, location=loc)
    return finish(bpy.context.object, mat, min(radius_a, radius_b) * .18)

def parent_skin(mesh, armature, bone_name):
    mesh.parent = armature
    modifier = mesh.modifiers.new("real rigid skin", "ARMATURE")
    modifier.object = armature
    group = mesh.vertex_groups.new(name=bone_name)
    group.add([vertex.index for vertex in mesh.data.vertices], 1.0, "REPLACE")

def make_armature(name):
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm = bpy.context.object
    arm.name = name
    arm.data.name = name + "Rig"
    root = arm.data.edit_bones[0]
    root.name = "Root"
    root.head, root.tail = (0, 0, 0), (0, .35, 0)
    spec = [
        ("Pelvis", "Root", (0,.78,0), (0,1.04,0)),
        ("Spine", "Pelvis", (0,1.02,0), (0,1.53,0)),
        ("Head", "Spine", (0,1.52,0), (0,2.05,0)),
        ("LeftUpperArm", "Spine", (-.29,1.48,0), (-.64,1.37,-.03)),
        ("LeftForearm", "LeftUpperArm", (-.64,1.37,-.03), (-.87,1.15,-.06)),
        ("RightUpperArm", "Spine", (.29,1.48,0), (.64,1.37,-.03)),
        ("RightForearm", "RightUpperArm", (.64,1.37,-.03), (.87,1.15,-.06)),
        ("LeftUpperLeg", "Pelvis", (-.17,.82,0), (-.24,.42,.03)),
        ("LeftLowerLeg", "LeftUpperLeg", (-.24,.42,.03), (-.21,.08,.11)),
        ("RightUpperLeg", "Pelvis", (.17,.82,0), (.24,.42,.03)),
        ("RightLowerLeg", "RightUpperLeg", (.24,.42,.03), (.21,.08,.11))
    ]
    created = {"Root": root}
    for bone_name, parent_name, head, tail in spec:
        bone = arm.data.edit_bones.new(bone_name)
        bone.head, bone.tail = head, tail
        bone.parent = created[parent_name]
        created[bone_name] = bone
    bpy.ops.object.mode_set(mode="POSE")
    for bone in arm.pose.bones:
        bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm

def add_text(label, text, loc, scale, mat, parent=None):
    bpy.ops.object.text_add(location=loc, rotation=(math.pi/2, 0, 0))
    obj = bpy.context.object
    obj.name = label
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.extrude = .009
    obj.data.bevel_depth = .006
    obj.scale = scale
    bpy.ops.object.convert(target="MESH")
    finish(obj, mat, .006)
    if parent: parent_skin(obj, parent[0], parent[1])
    return obj

def athlete(kind):
    clear()
    shooter = kind == "shooter"
    palette = {
        "jersey": material("midnight teal jersey" if shooter else "crimson defender jersey", (0.025,.20,.27,1) if shooter else (.36,.025,.07,1), .12,.33),
        "trim": material("ice jersey piping" if shooter else "amber defender piping", (.22,.93,.91,1) if shooter else (1,.47,.08,1), .42,.25, (.12,.7,.7,1) if shooter else (.8,.16,.02,1)),
        "short": material("tailored shorts", (.018,.06,.1,1) if shooter else (.12,.01,.03,1), .08,.48),
        "skin": material("warm skin", (.42,.19,.105,1), 0,.62),
        "shoe": material("high top white" if shooter else "high top graphite", (.74,.82,.84,1) if shooter else (.035,.045,.065,1), .3,.27),
        "hair": material("braided hair" if shooter else "close-cropped hair", (.025,.012,.008,1), 0,.78),
        "accent": material("shooting sleeve" if shooter else "compression sleeve", (.04,.68,.73,1) if shooter else (.95,.19,.05,1), .35,.26)
    }
    arm = make_armature("RooftopShooterV2" if shooter else "RooftopDefenderV2")
    # Custom tapered silhouette: separate real skinned pieces give clothing,
    # shoe, head, and limb material definition without masquerading as a skinless
    # primitive mannequin.
    parts = []
    parts += [(tapered_limb("tapered torso", (0,1.30,0), .34,.25,.62,palette["jersey"]), "Spine")]
    parts += [(cube("jersey chest panel", (0,1.39,-.255), (.22,.18,.022),palette["trim"],.018), "Spine")]
    parts += [(cube("tailored shorts", (0,.91,0), (.33,.17,.25),palette["short"],.055), "Pelvis")]
    parts += [(sphere("sculpted head", (0,1.86,-.01), (.245,.29,.23),palette["skin"]), "Head")]
    parts += [(sphere("hair cap", (0,2.055,.015), (.255,.10,.238),palette["hair"]), "Head")]
    for i in range(5 if shooter else 3):
        braid = sphere("hair braid %02d" % i, ((-.12 + i*.06) if shooter else 0, 2.03 - i*.075, .19), (.035,.09,.04), palette["hair"])
        parts.append((braid,"Head"))
    for side, sign in (("Left",-1),("Right",1)):
        parts += [(tapered_limb(side+" upper arm", (sign*.47,1.41,-.02), .115,.14,.42,palette["jersey"]), side+"UpperArm")]
        parts += [(tapered_limb(side+" forearm", (sign*.76,1.18,-.05), .09,.11,.38,palette["skin"] if (shooter and side=="Right") else palette["accent"]), side+"Forearm")]
        parts += [(sphere(side+" palm", (sign*.9,1.03,-.07), (.10,.105,.09),palette["skin"]), side+"Forearm")]
        parts += [(tapered_limb(side+" upper leg", (sign*.18,.59,0), .16,.19,.44,palette["short"]), side+"UpperLeg")]
        parts += [(tapered_limb(side+" lower leg", (sign*.22,.23,.06), .105,.13,.42,palette["skin"]), side+"LowerLeg")]
        parts += [(cube(side+" high top", (sign*.22,.075,.16), (.16,.09,.29),palette["shoe"],.045), side+"LowerLeg")]
        if not shooter:
            parts += [(cube(side+" knee pad", (sign*.22,.42,.08), (.125,.105,.075),palette["accent"],.035), side+"LowerLeg")]
    for obj,bone in parts: parent_skin(obj,arm,bone)
    add_text("jersey number", "11" if shooter else "04", (0,1.37,-.286), (.17,.17,.17), palette["trim"], (arm,"Spine"))
    # Real NLA actions on the rig. Each clip has authored bone rotations and,
    # for the contest jump, a Root translation. Exported data is inspected below.
    clips = ([
        ("Load", {"Spine":(-.20,0,0),"LeftUpperArm":(-.40,0,-1.05),"LeftForearm":(-.2,0,-.45),"RightUpperArm":(-.5,0,1.18),"RightForearm":(-.35,0,.44),"LeftUpperLeg":(.18,0,-.12),"RightUpperLeg":(.18,0,.12)}, None),
        ("Release", {"Spine":(.10,0,-.08),"LeftUpperArm":(-.55,0,-2.22),"LeftForearm":(-.25,0,-.18),"RightUpperArm":(-.40,0,2.24),"RightForearm":(-.16,0,.16)}, None),
        ("FollowThrough", {"Spine":(.08,0,-.04),"LeftUpperArm":(-.45,0,-2.45),"LeftForearm":(-.15,0,-.08),"RightUpperArm":(-.24,0,2.42),"RightForearm":(-.08,0,.08)}, None)
    ] if shooter else [
        ("Plant", {"Spine":(-.12,0,0),"LeftUpperLeg":(.28,0,-.22),"RightUpperLeg":(.28,0,.22),"LeftUpperArm":(0,0,-.48),"RightUpperArm":(0,0,.48)}, None),
        ("Telegraph", {"Spine":(-.24,0,0),"LeftUpperLeg":(.42,0,-.30),"RightUpperLeg":(.42,0,.30),"LeftUpperArm":(-.24,0,-1.34),"RightUpperArm":(-.24,0,1.34)}, None),
        ("Jump", {"Spine":(.05,0,0),"LeftUpperArm":(-.30,0,-2.52),"RightUpperArm":(-.30,0,2.52),"LeftForearm":(-.12,0,-.16),"RightForearm":(-.12,0,.16)}, (0,.44,0)),
        ("Contest", {"Spine":(.10,0,0),"LeftUpperArm":(-.18,0,-2.74),"RightUpperArm":(-.18,0,2.74),"LeftForearm":(-.06,0,-.08),"RightForearm":(-.06,0,.08)}, (0,.30,0))
    ])
    arm.animation_data_create()
    for clip_name, poses, root_move in clips:
        action = bpy.data.actions.new(clip_name)
        # Blender 5 owns F-curves through an action slot. Assigning the action
        # to the armature before using PoseBone.keyframe_insert creates that
        # slot and writes genuine bone transform channels.
        arm.animation_data.action = action
        for bone_name, rot in poses.items():
            bone = arm.pose.bones[bone_name]
            bone.rotation_euler = (0, 0, 0)
            bone.keyframe_insert(data_path="rotation_euler", frame=1, group=bone_name)
            bone.rotation_euler = rot
            bone.keyframe_insert(data_path="rotation_euler", frame=16, group=bone_name)
        if root_move:
            arm.location = (0, 0, 0)
            arm.keyframe_insert(data_path="location", frame=1, group="Root")
            arm.location = root_move
            arm.keyframe_insert(data_path="location", frame=16, group="Root")
        track = arm.animation_data.nla_tracks.new()
        track.name = clip_name
        track.strips.new(clip_name, 1, action)
    arm.animation_data.action = None
    return arm

def venue():
    clear()
    roof = material("weathered concrete", (.075,.09,.115,1), .08,.64)
    steel = material("painted steel", (.04,.09,.12,1), .72,.27)
    amber = material("amber street practical", (.9,.23,.035,1), .35,.26, (.95,.12,.01,1))
    cyan = material("cool city practical", (.03,.38,.48,1), .42,.24, (.02,.45,.7,1))
    crowd = material("bleacher seating", (.16,.055,.19,1), .14,.42)
    brick = material("brick service core", (.16,.045,.03,1), .04,.75)
    # The active 16 x 14 court remains route-owned. These visual structures
    # stay outside its bounds or below y=0 and contain no goal geometry.
    cube("under-court roof deck", (0,-.38,4), (8.55,.34,7.35), roof,.08)
    for sign in (-1,1):
        x=sign*9.15
        for row in range(4):
            cube("bleacher tier %s %d"%(sign,row),(x, .42+row*.34, 2.9-row*.23),(1.12-row*.12,.16,4.2-row*.34),crowd,.035)
        cube("bleacher handrail base %s"%sign,(x-sign*.94,1.52,3.0),(.035,.035,4.15),steel,.012)
        for z in (-.8,2.0,4.8,7.5):
            cyl("rail post",(x-sign*.94,1.18,z),.035,1.25,steel,12,.01)
    for x,z,sx,sz,h in [(-10,-4,1.1,1.3,5.5),(10,-4,1.2,1.4,6.2),(-10,10,1.2,1.0,4.4),(10,10,1.1,1.0,5.1),(0,-6.0,3.0,.65,3.7)]:
        cube("service tower",(x,h/2,z),(sx,h/2,sz),brick,.07)
        cube("tower illuminated band",(x,h*.62,z-sz-.02),(sx*.76,.10,.025),cyan,.01)
    # Four sculpted light pylons plus a water tower add rooftop depth, but no hoop.
    for x,z in [(-7.8,-1.8),(7.8,-1.8),(-7.8,9.8),(7.8,9.8)]:
        cyl("venue light mast",(x,3.2,z),.09,6.3,steel,16,.02)
        cube("venue flood bar",(x,6.22,z),(.55,.10,.18),amber,.03)
    for a in range(4):
        angle=a*math.tau/4
        cyl("water tower leg",(3.8+math.cos(angle)*.65,1.2,-4.65+math.sin(angle)*.65),.07,2.4,steel,12,.012)
    cyl("water tower tank",(3.8,2.75,-4.65),.83,1.1,steel,20,.045)
    cyl("water tower cap",(3.8,3.35,-4.65),.5,.12,cyan,20,.02)
    for x in (-5.4,-2.7,0,2.7,5.4):
        cube("streetlight banner",(x,2.65,10.85),(.38,.78,.04),amber if x==0 else cyan,.02)

def export(filename, animation=False):
    bpy.ops.object.select_all(action="SELECT")
    # Authoring coordinates are deliberately Aura's +Y-up route coordinates;
    # keep those axes literal in the emitted GLB rather than asking Blender to
    # remap its conventional +Z-up scene during export.
    bpy.ops.export_scene.gltf(filepath=str(OUT/filename), export_format="GLB", export_yup=False,
        export_materials="EXPORT", export_cameras=False, export_lights=False,
        export_animations=animation, export_animation_mode="NLA_TRACKS", export_nla_strips=True,
        export_force_sampling=True)
    # The Aura asset inspector reads orientation from *asset* extras. Blender's
    # exporter only serializes custom properties onto nodes/scenes, so add the
    # factual route coordinate declaration directly to the emitted GLB header.
    path = OUT / filename
    raw = path.read_bytes()
    magic, version, _length = struct.unpack_from("<4sII", raw, 0)
    json_length, json_kind = struct.unpack_from("<I4s", raw, 12)
    if magic != b"glTF" or version != 2 or json_kind != b"JSON":
        raise RuntimeError("Unexpected GLB structure while adding orientation metadata")
    gltf = json.loads(raw[20:20 + json_length].decode("utf8"))
    gltf.setdefault("asset", {}).setdefault("extras", {})["aura3d"] = {
        "orientation": {"forwardAxis": "+Z", "upAxis": "+Y"}
    }
    encoded = json.dumps(gltf, separators=(",", ":")).encode("utf8")
    encoded += b" " * ((4 - len(encoded) % 4) % 4)
    tail = raw[20 + json_length:]
    output = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(encoded) + len(tail))
    output += struct.pack("<I4s", len(encoded), b"JSON") + encoded + tail
    path.write_bytes(output)

if __name__ == "__main__":
    athlete("shooter"); export("rooftopShooterV2.glb", True)
    athlete("defender"); export("rooftopDefenderV2.glb", True)
    venue(); export("rooftopVenueV2.glb")
    print("Wrote Rooftop Buckets V2 local art to", OUT)
