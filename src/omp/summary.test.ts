import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { displayNameForProvider, fetchOmpSummaryUsage, mapSnapshotsToOmpSummary } from "./summary.ts";

describe("displayNameForProvider", () => {
  it("maps known ids and passes through unknown ones", () => {
    assert.equal(displayNameForProvider("anthropic"), "Claude");
    assert.equal(displayNameForProvider("openai-codex"), "Codex");
    assert.equal(displayNameForProvider("some-future-provider"), "some-future-provider");
  });
});

describe("mapSnapshotsToOmpSummary", () => {
  it("groups limits by provider", () => {
    const usage = mapSnapshotsToOmpSummary([
      { provider: "anthropic", limitId: "anthropic:5h", label: "Claude 5 Hour", windowLabel: "5 Hour", usedFraction: 0.2, status: "ok", resetsAtMs: null },
      { provider: "anthropic", limitId: "anthropic:7d", label: "Claude 7 Day", windowLabel: "7 Day", usedFraction: 1.0, status: "exhausted", resetsAtMs: 1789000000000 },
      { provider: "opencode-go", limitId: "weekly", label: "Weekly limit", windowLabel: "Weekly", usedFraction: 0.09, status: "ok", resetsAtMs: null },
    ]);
    assert.equal(usage.providers.length, 2);
    assert.equal(usage.providers[0].displayName, "Claude");
    assert.equal(usage.providers[0].limits[0].percentRemaining, 80);
    assert.equal(usage.providers[0].limits[1].percentRemaining, 0);
    assert.equal(usage.providers[0].limits[1].resetsAtMs, 1789000000000);
    assert.equal(usage.providers[1].displayName, "OpenCode Go");
  });
});

describe("fetchOmpSummaryUsage", () => {
  it("reports disabled when the integration is off", async () => {
    const { usage, error } = await fetchOmpSummaryUsage(undefined, false);
    assert.equal(usage, null);
    assert.equal(error?.type, "disabled");
  });

  it("reports not_configured without omp data", async () => {
    const { usage, error } = await fetchOmpSummaryUsage("/nonexistent-omp-agent-dir-xyz", true);
    assert.equal(usage, null);
    assert.equal(error?.type, "not_configured");
  });
});
