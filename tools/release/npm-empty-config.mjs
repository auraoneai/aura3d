// Isolated, empty npm config files for hermetic installs.
//
// `--userconfig /dev/null --globalconfig /dev/null` works on older npm but newer npm
// (the ACR image's) refuses it: `double-loading config "/dev/null" as "global",
// previously loaded as "user"`. Two distinct empty files give the same isolation.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let cached;
/** Two distinct, empty npm config files (created once per process). */
export function emptyNpmConfigs() {
  if (!cached) {
    const dir = mkdtempSync(join(tmpdir(), "a3d-npm-empty-config-"));
    const userconfig = join(dir, "user.npmrc");
    const globalconfig = join(dir, "global.npmrc");
    writeFileSync(userconfig, "");
    writeFileSync(globalconfig, "");
    cached = { userconfig, globalconfig };
  }
  return cached;
}
