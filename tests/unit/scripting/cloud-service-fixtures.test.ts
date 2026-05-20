import { describe, expect, it } from "vitest";
import { sampleCloudServiceFixture } from "../../../packages/scripting/src";

describe("cloud service fixtures", () => {
  it("samples deterministic old-branch cloud service telemetry with blocked online-service claims", () => {
    const fixture = sampleCloudServiceFixture({
      seed: 0xc10d,
      playerId: "cloud-player",
      score: 12400,
      sessionSeconds: 240,
      offlineMode: true
    });

    expect(fixture).toMatchObject({
      source: "origin-master-cloud-services-adapted",
      productionReadiness: {
        cloudServiceTelemetry: true,
        offlineQueueTelemetry: true,
        remoteConfigTelemetry: true,
        leaderboardTelemetry: true,
        matchmakingTelemetry: true,
        contentDeliveryTelemetry: true
      }
    });
    expect(fixture.services.authentication.provider).toBe("guest");
    expect(fixture.services.authentication.authenticated).toBe(false);
    expect(fixture.services.authentication.tokenIssued).toBe(false);
    expect(fixture.services.cloudSave.status).toBe("queued");
    expect(fixture.services.cloudSave.checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(fixture.services.achievements.unlocked).toContain("first-run");
    expect(fixture.services.achievements.totalPoints).toBeGreaterThan(0);
    expect(fixture.services.leaderboard.score).toBe(12400);
    expect(fixture.services.leaderboard.rank).toBeGreaterThan(0);
    expect(fixture.services.remoteConfig.activated).toBe(true);
    expect(fixture.services.remoteConfig.parameterCount).toBeGreaterThanOrEqual(4);
    expect(fixture.services.matchmaking.status).toBe("simulated-match");
    expect(fixture.services.contentDelivery.assetCount).toBe(fixture.services.contentDelivery.integrityHashes.length);
    expect(fixture.services.contentDelivery.integrityHashes.every((hash) => /^[0-9a-f]{8}$/.test(hash))).toBe(true);
    expect(fixture.blockedClaims).toEqual(expect.arrayContaining([
      "real cloud authentication backend",
      "Unity Gaming Services parity",
      "Unreal Online Services parity"
    ]));
    expect(fixture.claimBoundary).toContain("does not contact a backend");
    expect(fixture.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(sampleCloudServiceFixture({
      seed: 0xc10d,
      playerId: "cloud-player",
      score: 12400,
      sessionSeconds: 240,
      offlineMode: true
    }).hash).toBe(fixture.hash);
  });

  it("changes rank and hash as score changes", () => {
    const lowScore = sampleCloudServiceFixture({ score: 3000 });
    const highScore = sampleCloudServiceFixture({ score: 24000 });

    expect(lowScore.hash).not.toBe(highScore.hash);
    expect(highScore.services.leaderboard.rank).toBeLessThan(lowScore.services.leaderboard.rank);
  });

  it("rejects invalid cloud fixture inputs", () => {
    expect(() => sampleCloudServiceFixture({ seed: -1 })).toThrow(/seed/);
    expect(() => sampleCloudServiceFixture({ playerId: " " })).toThrow(/playerId/);
    expect(() => sampleCloudServiceFixture({ score: 0 })).toThrow(/score/);
    expect(() => sampleCloudServiceFixture({ sessionSeconds: 0 })).toThrow(/sessionSeconds/);
  });
});
