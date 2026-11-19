/**
 * glTF-Transform's default logger prints transform progress ("prune: Removed types...") to stdout, which would corrupt
 * `--json` output. Asset-post commands install this one: debug/info are dropped, warnings and errors go to stderr.
 */
export const QUIET_GLTF_LOGGER = {
  debug(): void {},
  info(): void {},
  warn(text: string): void { process.stderr.write(`glTF-Transform: ${text}\n`); },
  error(text: string): void { process.stderr.write(`glTF-Transform: ${text}\n`); }
};
