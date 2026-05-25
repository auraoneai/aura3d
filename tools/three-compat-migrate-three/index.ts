import { readFileSync, writeFileSync } from "node:fs";
import { migrateThreeToG3D } from "../../packages/three-compat/src";

const [input, output] = process.argv.slice(2);
if (!input) {
  console.error("Usage: three-compat-migrate-three <input.ts> [output.ts]");
  process.exit(1);
}
const result = migrateThreeToG3D(readFileSync(input, "utf8"));
if (output) writeFileSync(output, result.code);
else process.stdout.write(result.code);
