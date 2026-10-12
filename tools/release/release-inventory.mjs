// PRD-15 removes five public packages starting with the 4.0 release line.
// Earlier releases retain their exact historical inventory, including muse301.
export function expectedPublicPackageCount(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error(`Invalid release version: ${version}`);
  return Number(version.split('.')[0]) >= 4 ? 24 : 29;
}
