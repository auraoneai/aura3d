#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const output = new URL("./", import.meta.url);
const assets = new URL("../../../marketing/public/", output);
const mark = await readFile(new URL("favicon.svg", assets));
const lockup = await readFile(new URL("store-assets/brand/aura3d-logo-light.svg", assets));
const ink = "#14252a";

async function render(file, width, height, artwork, artworkWidth) {
  const foreground = await sharp(artwork, { density: 480 }).resize({ width: artworkWidth }).png().toBuffer();
  await sharp({ create: { width, height, channels: 3, background: ink } })
    .composite([{ input: foreground, gravity: "centre" }])
    .png()
    .toFile(fileURLToPath(new URL(file, output)));
}

// The symbol fits within a circular avatar crop. On wide banners the complete
// horizontal lockup fits inside the shared central desktop/mobile safe area.
await render("profile-400.png", 400, 400, mark, 280);
await render("profile-800.png", 800, 800, mark, 560);
await render("banner-x-1500x500.png", 1500, 500, lockup, 480);
await render("banner-cover-2560x1440.png", 2560, 1440, lockup, 800);
