# Task 11: Procedural medieval handcart

Build a single-page browser app with the provided framework, served by vite, rendering to the canvas with id #app. Model a medieval wooden hand-cart entirely from code (no external model, texture or image files). It must include: a plank-built open box bed (at least 8 individual planks or boards, with slight variation in length, tone or tilt), two large spoked wooden wheels (each with a hub, a rim and at least 8 spokes) on a shared axle, two long push handles at the rear, a front support leg or prop stand, corner posts with at least 2 cross rails per side, and iron-coloured fittings (bands on the hubs, bolts or straps). Load the cart with a few props: at least 3 sacks or barrels and a couple of crates, placed convincingly. Place the cart on a simple dirt ground with a few scattered stones. Show it from a three-quarter view and rotate the wheels slowly in place, or turntable the whole cart, so it reads in 3D. Use warm natural lighting with soft shadows. After the first frame set window.__TASK_STATE__ = { ready: true, wheelCount: <wheels>, spokeCount: <total spokes>, plankCount: <planks in the bed> }.

The provided framework is {{LIBRARY}}.

The rendering contract in the next section applies.
