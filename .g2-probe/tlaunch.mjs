import { chromium } from "@playwright/test";
console.log("launching...");
const b = await chromium.launch({ args: ["--enable-unsafe-webgpu"] });
console.log("launched ok");
await b.close();
