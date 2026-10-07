# Reference frames

Named three.js r185 examples (https://threejs.org/examples/) — the day-0 frame
set. When the C-30 v2 reference scenes and the licensed stills in
`benchmarks/quality-rebuild/refs/` land on main, they replace rows here. Every
frame carries "what you should see" so the file is complete without images.

## webgl_animation_skinning_blending

https://threejs.org/examples/#webgl_animation_skinning_blending

What you should see: a rigged character blending between locomotion clips under
a real key light with shadows that track the feet. Use for: platformer,
character — how a typed GLB hero should sit in a lit world.

## webgl_animation_skinning_morph

https://threejs.org/examples/#webgl_animation_skinning_morph

What you should see: a creature head deforming through morph targets with skin
and eye materials responding to environment light. Use for: fighting — facial
and secondary motion quality on real materials.

## webgl_animation_cloth

https://threejs.org/examples/#webgl_animation_cloth

What you should see: draped cloth catching directional light with soft,
contact-darkened shadows on the floor. Use for: cinematic — fabric motion plus
moody lighting discipline.

## webgl_materials_car

https://threejs.org/examples/#webgl_materials_car

What you should see: a car body with clearcoat reflections pulling the
environment into the paint, grounded by contact shadow. Use for: racing — how
glossy materials and IBL should look on a vehicle.

## webgl_materials_video

https://threejs.org/examples/#webgl_materials_video

What you should see: a product-like object under studio lighting with clean
softboxes and a controlled backdrop. Use for: product — framing and soft studio
key.

## webgl_materials_lightmap

https://threejs.org/examples/#webgl_materials_lightmap

What you should see: baked light/detail on an architectural interior with warm
bounce in corners. Use for: sports/table and interior — indoor light richness
without dynamic lights.

## webgl_lights_physical

https://threejs.org/examples/#webgl_lights_physical

What you should see: physically-motivated lamps in a simple room, falloff that
reads as real. Use for: outdoor environment, interior — key/fill discipline.

## webgl_lights_spotlights

https://threejs.org/examples/#webgl_lights_spotlights

What you should see: spot cones with visible falloff on a dark floor, haze
inside the beam. Use for: night city — motivated practical lighting after dark.

## webgl_shaders_sky

https://threejs.org/examples/#webgl_shaders_sky

What you should see: a full-bleed sky dome with sun, horizon gradient and haze —
never a void. Use for: space, arena shooter, outdoor — background treatment.

## webgl_water

https://threejs.org/examples/#webgl_water

What you should see: an animated water surface with normals, reflections and
shore interaction. Use for: underwater — surface/caustic atmosphere cues.
