#!/usr/bin/env node
import { createA3DProject } from "./index.js";

const [, , targetDir = "a3d-app", template = "external-parity-product-viewer"] = process.argv;
const result = createA3DProject({ targetDir, template: template as Parameters<typeof createA3DProject>[0]["template"] });
console.log(JSON.stringify(result, null, 2));
