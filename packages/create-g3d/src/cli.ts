#!/usr/bin/env node
import { createG3DProject } from "./index.js";

const [, , targetDir = "g3d-app", template = "v4-product-viewer"] = process.argv;
const result = createG3DProject({ targetDir, template: template as Parameters<typeof createG3DProject>[0]["template"] });
console.log(JSON.stringify(result, null, 2));
