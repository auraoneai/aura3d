import { createHash } from "node:crypto";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const outputImage = resolve(
  repositoryRoot,
  "tests/reports/_visual-critic-refs/ref-infinifactory-2.jpg",
);
const outputMetadata = resolve(
  repositoryRoot,
  "tests/reports/_visual-critic-refs/ref-infinifactory-2.provenance.json",
);

const steamAppId = 300570;
const screenshotId = 1;
const steamPageUrl =
  "https://store.steampowered.com/app/300570/Infinifactory/";
const steamApiUrl =
  "https://store.steampowered.com/api/appdetails?appids=300570&l=english";
const expectedImageUrl =
  "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/300570/ss_b5dc8cd012171e5b404e9c52cb5cd5eaafe41a8f.1920x1080.jpg?t=1667071348";
const expectedSha256 =
  "5db3dd84989223a665640156fc1791f0a0007c9380822c69e3fcf9bd110cd026";

const appResponse = await fetch(steamApiUrl);
if (!appResponse.ok) {
  throw new Error(`Steam appdetails request failed: HTTP ${appResponse.status}`);
}

const appDetails = await appResponse.json();
const product = appDetails[String(steamAppId)]?.data;
if (
  product?.name !== "Infinifactory" ||
  !product.developers?.includes("Zachtronics") ||
  !product.publishers?.includes("Zachtronics")
) {
  throw new Error("Steam appdetails no longer identifies the expected product");
}

const selectedScreenshot = product.screenshots?.find(
  (screenshot) => screenshot.id === screenshotId,
);
if (selectedScreenshot?.path_full !== expectedImageUrl) {
  throw new Error(
    `Steam screenshot ${screenshotId} changed: ${selectedScreenshot?.path_full ?? "missing"}`,
  );
}

const imageResponse = await fetch(expectedImageUrl);
if (!imageResponse.ok) {
  throw new Error(`Steam image request failed: HTTP ${imageResponse.status}`);
}

const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
const sha256 = createHash("sha256").update(imageBytes).digest("hex");
if (sha256 !== expectedSha256) {
  throw new Error(
    `Steam image bytes changed: expected ${expectedSha256}, received ${sha256}`,
  );
}

mkdirSync(dirname(outputImage), { recursive: true });
writeFileSync(outputImage, imageBytes);
writeFileSync(
  outputMetadata,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      game: "Infinifactory",
      productIdentity: {
        developer: "Zachtronics",
        publisher: "Zachtronics",
        steamAppId,
      },
      moment:
        "Live factory operation on an open-air industrial platform, with a manufactured cube moving through a readable conveyor-and-machine assembly",
      image: "tests/reports/_visual-critic-refs/ref-infinifactory-2.jpg",
      sha256: `sha256-${sha256}`,
      width: 1920,
      height: 1080,
      source: {
        kind: "official-steam-store-screenshot",
        pageUrl: steamPageUrl,
        apiUrl: steamApiUrl,
        directUrl: expectedImageUrl,
        screenshotId,
      },
      retrievedAt: new Date().toISOString(),
      generatedBy: "pnpm premium-indie:reference:infinifactory-gameplay",
      limitedComparisonDimensions: [
        "open-air industrial-platform readability",
        "central machine or transported-object hierarchy",
        "foreground-to-background structure and destination-path legibility",
        "material, lighting, and environmental finish",
      ],
      nonComparableDimensions: [
        "landing-flight mechanics",
        "lander vehicle design or animation",
        "flight telemetry and extraction-state UI",
      ],
      licenseAndSourceNotes:
        "Copyright Zachtronics. Retained only as a provenance-bound visual-comparison reference fetched from the official Steam product listing; no redistribution or ownership claim is made.",
      notes:
        "This is the closest official Infinifactory storefront frame to Aurora Lander's spacious industrial destination staging. The products remain cross-genre, so the reference is valid only for the explicitly limited visual dimensions above.",
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  JSON.stringify(
    {
      outputImage,
      outputMetadata,
      sha256: `sha256-${sha256}`,
      sizeBytes: statSync(outputImage).size,
      width: 1920,
      height: 1080,
    },
    null,
    2,
  ),
);
