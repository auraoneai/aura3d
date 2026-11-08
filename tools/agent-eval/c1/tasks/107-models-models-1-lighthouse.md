# Task 10: Procedural lighthouse

Build a single-page browser app with the provided framework, served by vite, rendering to the canvas with id #app. Model a coastal lighthouse entirely from code (no external model, texture or image files). It must read clearly as a lighthouse: a tapered tower with alternating painted bands (at least 3 bands in two contrasting colours), a gallery balcony with a railing near the top, a glass lantern room with a visible lamp, a conical or domed roof with a finial, a door and at least 4 small windows spiralling or stacked up the tower, and a rocky base made of several irregular rocks sitting on a patch of sea or ground. Add a small keeper's cottage next to the base. The camera must frame the whole lighthouse with some sky/horizon visible and slowly orbit it. Use lighting that gives clear form (a key light with shadows plus fill). When the first frame has rendered, set window.__TASK_STATE__ = { ready: true, partCount: <number of distinct visible mesh parts you created>, bandCount: <number of tower bands> }.

The provided framework is {{LIBRARY}}.

The rendering contract in the next section applies.
