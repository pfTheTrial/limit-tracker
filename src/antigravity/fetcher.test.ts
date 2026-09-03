import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchAntigravityUsage, mapSnapshotsToAntigravityUsage } from "./fetcher.ts";

describe("mapSnapshotsToAntigravityUsage", () => {
  it("derives percent remaining per pool", () => {
    const usage = mapSnapshotsToAntigravityUsage([
      { provider: "google-antigravity", limitId: "g", label: "Usage (Google)", windowLabel: "Daily", usedFraction: 0.7131424, status: "ok", resetsAtMs: null },
      { provider: "google-antigravity", limitId: "a", label: "Usage (Anthropic)", windowLabel: "Daily", usedFraction: 1.0, status: "exhausted", resetsAtMs: null },
    ]);
    assert.equal(usage.viaOmp, true);
    assert.equal(usage.pools.length, 2);
    assert.equal(usage.pools[0].percentRemaining, 29);
    assert.equal(usage.pools[1].percentRemaining, 0);
    assert.equal(usage.pools[1].status, "exhausted");
  });
});

describe("fetchAntigravityUsage", () => {
  it("reports not_configured without omp data", async () => {
    const { usage, error } = await fetchAntigravityUsage("/nonexistent-omp-agent-dir-xyz");
    // Must be not_configured, never fabricated data.
    assert.equal(usage, null);
    assert.equal(error?.type, "not_configured");
  });
});
