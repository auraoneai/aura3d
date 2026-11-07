# React embedding host

Classification: `internal fixture` (embedding API host demo and real-GPU evidence page; not a catalogued example)

A foreign React app (it owns the page, the inputs and the data) that embeds two
`AuraCanvas` instances and pushes live data into them without remounting.

- Canvas A receives `value` from its parent's props. A `useEffect` writes it through the
  imperative handle: `handle.update("cube", { rotation, position })`.
- Canvas B is driven by `useAuraNodeUpdate("orb", patch)` from a child of the canvas.
- Neither write renders React inside the canvas or calls `setScene`. The page counters show
  apps created (`2`), `setScene` calls (`0`) and host renders.
- Both canvases use the defaults for an embedded canvas: no `document.body.dataset.aura3d*`, no
  `window.__AURA3D_ROUTE_READY__`, no `?a3d-qr=` URL flags; keys typed in the text input never reach
  Aura input.

Run from the repository root with the Vite dev server and open
`/examples/react-embedding-host/index.html` (add `?live=0` to stop the 20 Hz timer; drive it with
`window.__EMBED_HOST__.setValue(0..1)`).

This is a host demo for the embedding API, not one of the shipped games or templates.
