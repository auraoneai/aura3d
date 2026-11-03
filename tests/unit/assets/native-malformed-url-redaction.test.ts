import { describe, expect, it } from "vitest";
import { AssetLoadError, redactAssetUrl } from "../../../packages/assets/src/AssetLoader";

describe("asset diagnostic URL redaction", () => {
  it.each([
    "https://sample-user:sample-password@not valid.test/model?token=sample-token#fragment",
    "//sample-user:sample-password@not valid.test/model?token=sample-token#fragment",
    "https://sample-user@sample-password@not valid.test/model?token=sample-token#fragment",
    "https:////sample-user:sample-password@not valid.test/model?token=sample-token#fragment",
    "https:sample-user:sample-password@not valid.test/model?token=sample-token#fragment",
    "https://sample-user:sample-password@not valid.test/model?token=sample-token\ncontinuation"
  ])("removes user information from malformed authority case %#", (url) => {
    const safe = redactAssetUrl(url);
    expect(safe).not.toMatch(/sample-user|sample-password|sample-token|fragment/);
    expect(safe).toContain("not valid.test/model");

    const error = new AssetLoadError(`Could not load ${url}`, url, [url], new Error(`Invalid ${url}`));
    const diagnostics = JSON.stringify({
      message: error.message,
      url: error.url,
      dependencyChain: error.dependencyChain,
      cause: String(error.cause)
    });
    expect(diagnostics).not.toMatch(/sample-user|sample-password|sample-token|fragment/);
  });

  it.each([
    "  data:text/plain,sample-inline-payload",
    "\nblob:https://example.test/sample-inline-payload"
  ])("redacts inline and blob content with leading whitespace", (url) => {
    expect(redactAssetUrl(url)).not.toContain("sample-inline-payload");
    const error = new AssetLoadError(`Could not load ${url}`, url, [url], new Error(`Invalid ${url}`));
    expect(JSON.stringify({ message: error.message, url: error.url, cause: String(error.cause) }))
      .not.toContain("sample-inline-payload");
  });

  it("continues to retain the safe path for a valid signed URL", () => {
    expect(redactAssetUrl("https://example.test/models/robot.glb?token=sample-token#part"))
      .toBe("https://example.test/models/robot.glb");
    expect(redactAssetUrl("https://example.test/models/user@robot.glb?token=sample-token"))
      .toBe("https://example.test/models/user@robot.glb");
  });
});
