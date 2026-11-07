import sharp from "/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_0a753117-9f6-2/node_modules/sharp/lib/index.js";
// usage: crop.mjs out x y w h scale in1 in2 ...
const [o, x, y, w, h, sc, ...ins] = process.argv.slice(2);
const [X, Y, W, H, S] = [x, y, w, h, sc].map(Number);
const tiles = await Promise.all(ins.map(f => sharp(f).extract({ left: X, top: Y, width: W, height: H }).resize(W * S, H * S, { kernel: "nearest" }).toBuffer()));
await sharp({ create: { width: W * S * tiles.length, height: H * S, channels: 3, background: "#000" } }).composite(tiles.map((t, i) => ({ input: t, left: i * W * S, top: 0 }))).png().toFile(o);
