export interface G11NamedTexture {
  readonly name: string;
  readonly slots: readonly string[];
}

export interface G11TextureRowRef {
  readonly index: number;
  readonly nodeName: unknown;
  readonly levelName: unknown;
  readonly status: unknown;
  readonly pixelBacked: unknown;
  readonly slots: unknown;
  readonly warnings: unknown;
  readonly stage: unknown;
  readonly pendingMs: unknown;
}

export interface G11TextureCheck {
  readonly issues: readonly string[];
  readonly pending: readonly G11TextureRowRef[];
  readonly fallback: readonly G11TextureRowRef[];
  readonly invalid: readonly G11TextureRowRef[];
  readonly unverified: readonly G11TextureRowRef[];
  readonly pixelBacked: readonly G11TextureRowRef[];
  readonly required: readonly {
    readonly name: string;
    readonly slots: readonly string[];
    readonly observed: readonly G11TextureRowRef[];
    readonly verified: boolean;
  }[];
}

/** Validate individual mounted diagnostic rows; aggregate counts cannot prove texture readiness. */
export function checkG11TextureRows(rows: unknown, required: readonly G11NamedTexture[]): G11TextureCheck {
  const pending: G11TextureRowRef[] = [];
  const fallback: G11TextureRowRef[] = [];
  const invalid: G11TextureRowRef[] = [];
  const unverified: G11TextureRowRef[] = [];
  const pixelBacked: G11TextureRowRef[] = [];
  const refs: G11TextureRowRef[] = [];
  const issues: string[] = [];
  if (!Array.isArray(rows) || rows.length === 0) issues.push("mounted texture rows are missing or empty");
  for (const [index, value] of (Array.isArray(rows) ? rows : []).entries()) {
    const row = value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
    const ref: G11TextureRowRef = {
      index, nodeName: row.nodeName, levelName: row.levelName, status: row.status, pixelBacked: row.pixelBacked,
      slots: row.slots, warnings: row.warnings, stage: row.stage, pendingMs: row.pendingMs
    };
    refs.push(ref);
    const slotsValid = Array.isArray(row.slots) && row.slots.every((slot) => typeof slot === "string" && slot.length > 0);
    const warningsValid = Array.isArray(row.warnings) && row.warnings.every((warning) => typeof warning === "string");
    const statusValid = row.status === "none" || row.status === "pending" || row.status === "fallback" || row.status === "textured";
    const fieldsValid = typeof row.nodeName === "string" && row.nodeName.length > 0 &&
      typeof row.levelName === "string" && row.levelName.length > 0 &&
      typeof row.pixelBacked === "boolean" && slotsValid && warningsValid && statusValid &&
      (row.stage === undefined || typeof row.stage === "string") &&
      (row.pendingMs === undefined || (typeof row.pendingMs === "number" && Number.isFinite(row.pendingMs) && row.pendingMs >= 0));
    if (!fieldsValid || (row.status === "none" && (row.pixelBacked !== false || !slotsValid || (row.slots as unknown[]).length !== 0))) {
      invalid.push(ref);
    }
    if (row.status === "pending") pending.push(ref);
    if (row.status === "fallback") fallback.push(ref);
    if (row.status === "textured") {
      if (row.pixelBacked === true) pixelBacked.push(ref);
      // The renderer marker means a textured material was swapped in; it is
      // not an independent receipt that this texture was sampled on screen.
      const suspectWarning = warningsValid && (row.warnings as string[]).some((warning) =>
        /fallback|fail(?:ed|ure)?|unavailable|invalid|missing|unverified|not.{0,30}pixel/i.test(warning));
      if (row.pixelBacked !== true || !slotsValid || (row.slots as unknown[]).length === 0 || suspectWarning) unverified.push(ref);
    }
  }
  const describe = (list: readonly G11TextureRowRef[]): string => list
    .map((row) => `${row.index}:${String(row.nodeName)}/${String(row.levelName)}=${String(row.status)}`).join(", ");
  if (pending.length) issues.push(`pending texture rows: ${describe(pending)}`);
  if (fallback.length) issues.push(`fallback texture rows: ${describe(fallback)}`);
  if (invalid.length) issues.push(`invalid texture rows: ${describe(invalid)}`);
  if (unverified.length) issues.push(`unverified textured rows: ${describe(unverified)}`);

  const checked = required.map(({ name, slots }) => {
    const observed = refs.filter((row) => row.nodeName === name);
    const verifiedRows = observed.filter((row) =>
      row.status === "textured" && row.pixelBacked === true && Array.isArray(row.slots) &&
      slots.every((slot) => (row.slots as unknown[]).includes(slot)) &&
      !invalid.includes(row) && !unverified.includes(row));
    const verified = verifiedRows.length === 1;
    if (!verified) issues.push(`required texture ${name} [${slots.join(", ")}] not verified: ${describe(observed) || "missing"}`);
    return { name, slots, observed, verified };
  });
  return { issues, pending, fallback, invalid, unverified, pixelBacked, required: checked };
}
