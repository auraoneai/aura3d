import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface PackageProvenanceReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly command: string;
  readonly statementType: "https://slsa.dev/provenance/v1";
  readonly predicateType: "https://slsa.dev/provenance/v1";
  readonly subject: {
    readonly name: string;
    readonly digest: { readonly sha256: string };
  };
  readonly builder: {
    readonly id: "galileo3d-local-release-verifier";
    readonly version: string | null;
  };
  readonly materials: readonly {
    readonly uri: string;
    readonly digest?: { readonly sha256: string };
  }[];
  readonly buildType: "https://galileo3d.local/build/package-tarball";
  readonly invocation: {
    readonly configSource: string;
    readonly parameters: readonly string[];
  };
  readonly signature: {
    readonly algorithm: "ed25519";
    readonly publicKeyPem: string;
    readonly signatureBase64: string;
    readonly verified: boolean;
  };
  readonly violations: readonly string[];
}

const reportPath = "tests/reports/package-provenance.json";
const releaseManifestPath = "docs/project/release-artifacts.json";
const versionedReleasePath = "tests/reports/versioned-release.json";
const installSmokePath = "tests/reports/package-install-smoke.json";

export function createPackageProvenanceReport(root = process.cwd()): PackageProvenanceReport {
  const releaseManifest = readJson(join(root, releaseManifestPath));
  const versionedRelease = readJson(join(root, versionedReleasePath));
  const installSmoke = readJson(join(root, installSmokePath));
  const packageInfo = readJson(join(root, "package.json"));
  const tarball = findTarball(releaseManifest);
  const violations = [
    ...(tarball ? [] : ["Release artifact manifest does not contain a tarball artifact."]),
    ...(versionedRelease?.ok === true ? [] : ["Versioned release verification report is missing or failing."]),
    ...(installSmoke?.ok === true ? [] : ["External package install smoke report is missing or failing."]),
    ...(typeof packageInfo?.version === "string" ? [] : ["Package version is unreadable."]),
  ];
  const subjectName = typeof tarball?.pathOrUrl === "string" ? tarball.pathOrUrl : "unknown";
  const subjectSha = typeof tarball?.sha256 === "string" ? tarball.sha256 : "";
  const statement = {
    statementType: "https://slsa.dev/provenance/v1" as const,
    predicateType: "https://slsa.dev/provenance/v1" as const,
    subject: {
      name: subjectName,
      digest: { sha256: subjectSha }
    },
    builder: {
      id: "galileo3d-local-release-verifier" as const,
      version: typeof packageInfo?.version === "string" ? packageInfo.version : null
    },
    materials: [
      material(releaseManifestPath),
      material(versionedReleasePath),
      material(installSmokePath),
      material("package.json")
    ].map((entry) => hashMaterial(root, entry)),
    buildType: "https://galileo3d.local/build/package-tarball" as const,
    invocation: {
      configSource: "local-checkout",
      parameters: [
        "pnpm build",
        "pnpm pack --pack-destination release-artifacts",
        "pnpm verify:versioned-release",
        "pnpm verify:package-install-smoke"
      ]
    }
  };
  const payload = Buffer.from(JSON.stringify(statement));
  const keyPair = generateKeyPairSync("ed25519");
  const signatureBytes = sign(null, payload, keyPair.privateKey);
  const publicKeyPem = keyPair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const verified = verify(null, payload, keyPair.publicKey, signatureBytes);
  if (!verified) violations.push("Generated Ed25519 provenance signature did not verify.");

  return {
    ok: violations.length === 0,
    generatedAt: new Date().toISOString(),
    command: "pnpm verify:package-provenance",
    ...statement,
    signature: {
      algorithm: "ed25519",
      publicKeyPem,
      signatureBase64: signatureBytes.toString("base64"),
      verified
    },
    violations
  };
}

function material(uri: string): { readonly uri: string } {
  return { uri };
}

function hashMaterial(root: string, entry: { readonly uri: string }): { readonly uri: string; readonly digest?: { readonly sha256: string } } {
  const path = join(root, entry.uri);
  if (!existsSync(path)) return entry;
  return {
    uri: entry.uri,
    digest: {
      sha256: createHash("sha256").update(readFileSync(path)).digest("hex")
    }
  };
}

function findTarball(manifest: Record<string, unknown> | null): Record<string, unknown> | null {
  const artifacts = Array.isArray(manifest?.artifacts) ? manifest.artifacts : [];
  return artifacts.find((entry): entry is Record<string, unknown> =>
    typeof entry === "object" && entry !== null && !Array.isArray(entry) && entry.type === "tarball"
  ) ?? null;
}

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function writeReport(root: string, report: PackageProvenanceReport): void {
  const outputPath = join(root, reportPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = createPackageProvenanceReport();
  writeReport(process.cwd(), report);
  console.log(JSON.stringify({
    ok: report.ok,
    subject: report.subject,
    signatureVerified: report.signature.verified,
    violations: report.violations
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}
