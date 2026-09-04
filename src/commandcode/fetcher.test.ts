import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readCommandcodeAuthFile } from "./auth.ts";
import { parseCommandcodeCreditsPayload, parseCommandcodeUsagePayload } from "./fetcher.ts";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

describe("parseCommandcodeUsagePayload", () => {
  it("parses the documented summary shape", () => {
    const usage = parseCommandcodeUsagePayload({
      subscription: { data: { planId: "individual-go" } },
      credits: { credits: { monthlyCredits: 10, purchasedCredits: 0, freeCredits: 0 }, periodEnd: "2099-01-01T00:00:00Z" },
      summary: { totalCost: 2.5 },
    });
    assert.equal(usage?.plan, "Go");
    assert.equal(usage?.creditsTotal, 10);
    assert.equal(usage?.creditsUsed, 2.5);
    assert.equal(usage?.percentUsed, 25);
    assert.ok((usage?.daysRemaining ?? 0) > 0);
    assert.equal(usage?.renewsAtMs, Date.parse("2099-01-01T00:00:00Z"));
  });

  it("accepts snake_case variants", () => {
    const usage = parseCommandcodeUsagePayload({
      subscription: { data: { plan_id: "individual-max" } },
      credits: { monthly_credits: 150, purchased_credits: 10, free_credits: 5 },
      summary: { total_cost: 82.5 },
    });
    assert.equal(usage?.plan, "Max");
    assert.equal(usage?.creditsTotal, 165);
    assert.equal(usage?.percentUsed, 50);
  });

  it("keeps plan-only payloads instead of fabricating numbers", () => {
    const usage = parseCommandcodeUsagePayload({ subscription: { data: { planId: "teams-pro" } } });
    assert.equal(usage?.plan, "Teams Pro");
    assert.equal(usage?.percentUsed, undefined);
  });

  it("returns null when nothing usable is present", () => {
    assert.equal(parseCommandcodeUsagePayload(null), null);
    assert.equal(parseCommandcodeUsagePayload({}), null);
    assert.equal(parseCommandcodeUsagePayload({ summary: {} }), null);
  });
});

describe("parseCommandcodeCreditsPayload", () => {
  it("parses balance shapes", () => {
    assert.equal(parseCommandcodeCreditsPayload({ credits: { balance: 7.5 } })?.creditsTotal, 7.5);
    assert.equal(parseCommandcodeCreditsPayload({ remaining: 3 })?.creditsTotal, 3);
    assert.equal(parseCommandcodeCreditsPayload({}), null);
  });
});

describe("readCommandcodeAuthFile", () => {
  function writeAuthHome(files: Record<string, string>): string {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "cc-auth-"));
    const dir = path.join(home, ".commandcode");
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content, "utf-8");
    }
    return home;
  }

  it("reads top-level, nested and profile shapes", () => {
    const top = writeAuthHome({ "auth.json": JSON.stringify({ apiKey: "k-top" }) });
    const nested = writeAuthHome({ "auth.json": JSON.stringify({ default: { token: "k-nested" } }) });
    const profiles = writeAuthHome({ "auth.json": JSON.stringify({ profiles: { work: { api_key: "k-prof" } } }) });
    try {
      assert.equal(readCommandcodeAuthFile(top), "k-top");
      assert.equal(readCommandcodeAuthFile(nested), "k-nested");
      assert.equal(readCommandcodeAuthFile(profiles), "k-prof");
    } finally {
      for (const home of [top, nested, profiles]) fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("returns null when absent or malformed", () => {
    const empty = writeAuthHome({});
    const broken = writeAuthHome({ "auth.json": "not-json" });
    const nokeys = writeAuthHome({ "auth.json": JSON.stringify({ theme: "dark" }) });
    try {
      assert.equal(readCommandcodeAuthFile(empty), null);
      assert.equal(readCommandcodeAuthFile(broken), null);
      assert.equal(readCommandcodeAuthFile(nokeys), null);
    } finally {
      for (const home of [empty, broken, nokeys]) fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
