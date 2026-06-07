import { expect, test } from "@playwright/test";
import {
  createCartoonEpisodePackage,
  createCartoonRenderManifestArtifact,
  createRenderedPromptAnimationEvidenceArtifact
} from "../src/episode-renderer";
import { requiredCartoonEpisodePackageFiles } from "../src/review";

test("episode renderer package declares encoded video and required package files", () => {
  const pkg = createCartoonEpisodePackage("package");
  const filePaths = new Set(pkg.files.map((file) => file.path));
  const manifest = createCartoonRenderManifestArtifact();
  const evidence = createRenderedPromptAnimationEvidenceArtifact();

  expect(pkg.packageDirectory).toBe("dist/episodes/moon-garden-001");
  expect(pkg.hasWebm).toBe(true);
  expect(pkg.hasPngSequenceFallback).toBe(false);
  expect(pkg.requiredFiles).toEqual([...requiredCartoonEpisodePackageFiles]);
  expect([...requiredCartoonEpisodePackageFiles]
    .filter((file) => file !== "episode.webm" && file !== "thumbnail.png")
    .every((file) => filePaths.has(file))).toBe(true);
  expect(filePaths.has("episode.webm")).toBe(false);
  expect(filePaths.has("thumbnail.png")).toBe(false);
  expect(pkg.files.filter((file) => /^frames\/frame-\d+\.svg$/.test(file.path)).length).toBeGreaterThan(20);

  expect(manifest).toMatchObject({
    artifact: "cartoon-render-manifest",
    outputMode: "encoded-webm",
    hasEncodedVideo: true,
    encodedVideo: {
      path: "episode.webm",
      codec: "vp9"
    }
  });
  expect(evidence).toMatchObject({
    artifact: "prompt-animation-evidence",
    ok: true,
    renderOutput: {
      mode: "encoded-webm",
      encodedVideoPresent: true,
      pngSequenceFallbackPresent: false
    }
  });
});
