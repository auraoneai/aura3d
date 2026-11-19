#!/usr/bin/env node
// The article cards use the same typography and mark as the main site.
process.argv.push("--docs-only");
await import("./generate-og.mjs");
