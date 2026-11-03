import { describe, expect, it } from "vitest";
import { Texture } from "../../../packages/rendering/src/Texture";

describe("texture full-content revision lifecycle", () => {
  it("distinguishes a full-content mark from an already-pending mip edit", () => {
    const texture = new Texture({
      width: 2, height: 2, mipLevelCount: 2, generateMipmaps: false,
      mipLevels: [
        { width: 2, height: 2, data: new Uint8Array(16) },
        { width: 1, height: 1, data: new Uint8Array(4) }
      ]
    });
    texture.updateMip(1, new Uint8Array(4).fill(4));
    expect(texture.needsUpdate).toBe(true);
    const mipRevision = texture.revision;

    texture.markNeedsUpdate();
    expect(texture.revision).toBe(mipRevision + 1);
    expect(texture.getMipRevision(0)).toBe(texture.revision);
    expect(texture.getMipRevision(1)).toBe(texture.revision);

    texture.needsUpdate = true;
    texture.markNeedsUpdate();
    expect(texture.revision).toBe(mipRevision + 1);
    texture.needsUpdate = false;
    expect(texture.getMipRevision(0)).toBe(mipRevision + 1);
    texture.needsUpdate = true;
    expect(texture.revision).toBe(mipRevision + 2);
    texture.dispose();
    expect(texture.getMipRevision(0)).toBe(0);
  });

  it("preserves a full-content mark when metadata was already dirty", () => {
    const texture = new Texture({
      width: 2, height: 2, mipLevelCount: 2, generateMipmaps: false,
      mipLevels: [
        { width: 2, height: 2, data: new Uint8Array(16) },
        { width: 1, height: 1, data: new Uint8Array(4) }
      ]
    });
    texture.markMetadataNeedsUpdate();
    const metadataRevision = texture.revision;
    texture.markNeedsUpdate();
    expect(texture.revision).toBe(metadataRevision + 1);
    expect(texture.getMipRevision(0)).toBe(texture.revision);
    expect(texture.getMipRevision(1)).toBe(texture.revision);

    texture.recordContentChange();
    expect(texture.revision).toBe(metadataRevision + 2);
    expect(texture.getMipRevision(0)).toBe(texture.revision);
    expect(texture.getMipRevision(1)).toBe(texture.revision);
    texture.dispose();
  });

  it("records a new full mark after another edit, even before the first mark is acknowledged", () => {
    const texture = new Texture({
      width: 2, height: 2, mipLevelCount: 2, generateMipmaps: false,
      mipLevels: [
        { width: 2, height: 2, data: new Uint8Array(16) },
        { width: 1, height: 1, data: new Uint8Array(4) }
      ]
    });
    texture.markNeedsUpdate();
    const firstMark = texture.revision;
    texture.updateMip(1, new Uint8Array(4).fill(9));
    texture.markNeedsUpdate();
    expect(texture.revision).toBe(firstMark + 2);
    expect(texture.getMipRevision(0)).toBe(texture.revision);
    expect(texture.getMipRevision(1)).toBe(texture.revision);
    texture.dispose();
  });

  it("rearms marks after a region edit without discarding the pending region", () => {
    const texture = new Texture({ width: 2, height: 2, dynamic: true, data: new Uint8Array(16) });
    texture.markNeedsUpdate();
    const firstMark = texture.revision;
    const region = { x: 1, y: 1, width: 1, height: 1 };
    texture.update(new Uint8Array([1, 2, 3, 4]), region);
    texture.getMipLevel(0)!.data[0] = 7;
    texture.markNeedsUpdate();
    expect(texture.revision).toBe(firstMark + 2);
    expect(texture.getMipRevision(0)).toBe(texture.revision);
    expect(texture.pendingUpdateRegion).toBe(region);
    expect(Array.from(texture.getMipLevel(0)!.data)).toEqual([7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4]);
    texture.dispose();
  });

  it("restores failed attempts without resurrecting a mark acknowledged by another device", () => {
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array(4) });
    texture.markNeedsUpdate();
    const revision = texture.revision;
    const restore = texture.beginUploadAttempt();
    expect(texture.needsUpdate).toBe(false);
    restore();
    expect(texture.needsUpdate).toBe(true);
    texture.markNeedsUpdate();
    expect(texture.revision).toBe(revision);

    const restoreAfterOtherDevice = texture.beginUploadAttempt();
    texture.needsUpdate = false;
    restoreAfterOtherDevice();
    expect(texture.needsUpdate).toBe(false);
    texture.markNeedsUpdate();
    expect(texture.revision).toBe(revision + 1);
    texture.dispose();
  });
});
