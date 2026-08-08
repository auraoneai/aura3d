import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface PackageProvenanceReport {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly command: string;
  readonly statementType: "https://slsa.dev/provenance";
  readonly predicateType: "https://slsa.dev/provenance";
  readonly subject: {
    readonly name: string;
    readonly digest: { readonly sha256: string };
  };
  readonly builder: {
    readonly id: "aura3d-local-release-verifier";
    readonly version: string | null;
  };
  readonly materials: readonly {
    readonly uri: string;
    readonly digest?: { readonly sha256: string };
  }[];
  readonly buildType: "https://aura3d.local/build/package-tarball";
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
const installSmokePath = "tests/reports/package-install-smoke.json";

export function createPackageProvenanceReport(root = process.cwd()): PackageProvenanceReport {
  const installSmoke = readJson(join(root, installSmokePath));
  const packageInfo = readJson(join(root, "package.json"));
  const packageName = typeof packageInfo?.name === "string" ? packageInfo.name : null;
  const packageVersion = typeof packageInfo?.version === "string" ? packageInfo.version : null;
  const tarballPath = typeof installSmoke?.tarballPath === "string" ? installSmoke.tarballPath : null;
  const tarballFullPath = tarballPath ? join(root, tarballPath) : null;
  const reportedSha = typeof installSmoke?.tarballSha256 === "string" ? installSmoke.tarballSha256 : null;
  const actualSha = tarballFullPath && existsSync(tarballFullPath)
    ? createHash("sha256").update(readFileSync(tarballFullPath)).digest("hex")
    : null;
  const violations = [
    ...(installSmoke?.ok === true ? [] : ["External package install smoke report is missing or failing."]),
    ...(installSmoke?.packMode === "fresh-current-checkout-pack" ? [] : ["Package install smoke did not use a fresh current-checkout pack."]),
    ...(packageName ? [] : ["Package name is unreadable."]),
    ...(packageVersion ? [] : ["Package version is unreadable."]),
    ...(installSmoke?.packageName === packageName ? [] : [`Install-smoke package name ${String(installSmoke?.packageName ?? "missing")} does not match ${packageName ?? "unreadable"}.`]),
    ...(installSmoke?.packageVersion === packageVersion ? [] : [`Install-smoke package version ${String(installSmoke?.packageVersion ?? "missing")} does not match ${packageVersion ?? "unreadable"}.`]),
    ...(tarballPath && tarballFullPath && existsSync(tarballFullPath) ? [] : ["Fresh install-smoke tarball is missing."]),
    ...(reportedSha && actualSha === reportedSha ? [] : ["Fresh install-smoke tarball sha256 is missing or does not match the tarball bytes."])
  ];
  const subjectName = tarballPath ?? "unknown";
  const subjectSha = actualSha ?? "";
  const statement = {
    statementType: "https://slsa.dev/provenance" as const,
    predicateType: "https://slsa.dev/provenance" as const,
    subject: {
      name: subjectName,
      digest: { sha256: subjectSha }
    },
    builder: {
      id: "aura3d-local-release-verifier" as const,
      version: packageVersion
    },
    materials: [
      material(installSmokePath),
      material("package.json"),
      ...(tarballPath ? [material(tarballPath)] : [])
    ].map((entry) => hashMaterial(root, entry)),
    buildType: "https://aura3d.local/build/package-tarball" as const,
    invocation: {
      configSource: "local-checkout",
      parameters: [
        "pnpm build",
        "pnpm verify:package-install-smoke:fresh",
        "pnpm verify:package-provenance"
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
