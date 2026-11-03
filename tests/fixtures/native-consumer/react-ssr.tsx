import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { defineAuraAssets } from "@aura3d/engine";
import { AuraCanvas, Model, Scene } from "@aura3d/react";

assert.equal(typeof globalThis.document, "undefined");
const assets = defineAuraAssets({
  product: { type: "model", format: "glb", url: "/product.glb", hash: `sha256-${"a".repeat(64)}` }
} as const);
const descriptor = { id: "product", url: "/product.glb" };
let loaderCalls = 0;
let fetchCalls = 0;
let readyCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { fetchCalls++; throw new Error("Server rendering unexpectedly fetched an asset."); };
try {
  const html = renderToString(
    <AuraCanvas autoStart={false} onReady={() => { readyCalls++; }}>
      <Scene>
        <Model
          asset={assets.product}
          suspendOnLoad={[descriptor]}
          fallback={<span data-loading="product">Loading product</span>}
          loader={async () => { loaderCalls++; throw new Error("Server rendering unexpectedly started a preload."); }}
        />
      </Scene>
    </AuraCanvas>
  );
  assert.match(html, /<canvas\b/);
  assert.match(html, /data-loading="product"/);
  assert.match(html, /Loading product/);
  assert.equal(loaderCalls, 0);
  assert.equal(fetchCalls, 0);
  assert.equal(readyCalls, 0);
} finally {
  globalThis.fetch = originalFetch;
}
