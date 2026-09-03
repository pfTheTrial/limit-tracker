import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  clearOmpStoreCache,
  findOmpAgentDir,
  getOmpApiKey,
  getOmpOAuth,
  isOmpTokenFresh,
  parseOmpAuthRow,
  parseOmpUsageSnapshotRow,
  readOmpStore,
  readOmpUsageSnapshots,
} from "./store.ts";

describe("parseOmpAuthRow", () => {
  it("parses a full oauth row", () => {
    const data = JSON.stringify({
      access: "  sk-ant-oat-123 ",
      refresh: "sk-ant-ort-456",
      expires: 1789321344888,
      accountId: "acc-1",
      email: "nicolas@example.com",
    });
    const { oauth, apiKey } = parseOmpAuthRow("anthropic", "oauth", data);
    assert.equal(apiKey, undefined);
    assert.equal(oauth?.provider, "anthropic");
    assert.equal(oauth?.access, "sk-ant-oat-123");
    assert.equal(oauth?.refresh, "sk-ant-ort-456");
    assert.equal(oauth?.expires, 1789321344888);
    assert.equal(oauth?.accountId, "acc-1");
    assert.equal(oauth?.email, "nicolas@example.com");
  });

  it("parses an api_key row", () => {
    const { oauth, apiKey } = parseOmpAuthRow("opencode-go", "api_key", JSON.stringify({ key: " key-1 " }));
    assert.equal(oauth, undefined);
    assert.deepEqual(apiKey, { provider: "opencode-go", key: "key-1" });
  });

  it("rejects malformed or empty rows", () => {
    assert.deepEqual(parseOmpAuthRow("", "oauth", "{}"), {});
    assert.deepEqual(parseOmpAuthRow("anthropic", "oauth", "not-json"), {});
    assert.deepEqual(parseOmpAuthRow("anthropic", "oauth", JSON.stringify({ refresh: "x" })), {});
    assert.deepEqual(parseOmpAuthRow("x", "api_key", JSON.stringify({ key: "   " })), {});
    assert.deepEqual(parseOmpAuthRow("x", "oauth", JSON.stringify([])), {});
    assert.deepEqual(parseOmpAuthRow(null, "oauth", "{}"), {});
  });

  it("ignores non-string fields instead of throwing", () => {
    const { oauth } = parseOmpAuthRow(
      "anthropic",
      "oauth",
      JSON.stringify({ access: "tok", expires: "tomorrow", accountId: 42 }),
    );
    assert.equal(oauth?.access, "tok");
    assert.equal(oauth?.expires, undefined);
    assert.equal(oauth?.accountId, undefined);
  });
});

describe("isOmpTokenFresh", () => {
  const now = 1788471200000;
  it("treats missing expiry as fresh", () => {
    assert.equal(isOmpTokenFresh({}, now), true);
  });
  it("accepts tokens far from expiry", () => {
    assert.equal(isOmpTokenFresh({ expires: now + 60 * 60 * 1000 }, now), true);
  });
  it("rejects expired tokens and tokens inside the margin", () => {
    assert.equal(isOmpTokenFresh({ expires: now - 1000 }, now), false);
    assert.equal(isOmpTokenFresh({ expires: now + 60 * 1000 }, now, 5 * 60 * 1000), false);
  });
});

describe("findOmpAgentDir", () => {
  it("returns null when omp is absent", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "omp-home-empty-"));
    try {
      assert.equal(findOmpAgentDir(home), null);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("finds the agent dir", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "omp-home-"));
    const dir = path.join(home, ".omp", "agent");
    fs.mkdirSync(dir, { recursive: true });
    try {
      assert.equal(findOmpAgentDir(home), dir);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("parseOmpUsageSnapshotRow", () => {
  it("parses a full row", () => {
    const parsed = parseOmpUsageSnapshotRow({
      provider: "google-antigravity",
      limit_id: "google-antigravity:google:default:daily",
      label: "Usage (Google)",
      window_label: "Daily",
      used_fraction: 0.7131424,
      status: "ok",
      resets_at: null,
    });
    assert.equal(parsed?.provider, "google-antigravity");
    assert.equal(parsed?.label, "Usage (Google)");
    assert.equal(parsed?.windowLabel, "Daily");
    assert.equal(parsed?.usedFraction, 0.7131424);
    assert.equal(parsed?.status, "ok");
    assert.equal(parsed?.resetsAtMs, null);
  });

  it("clamps fractions and converts reset timestamps", () => {
    const parsed = parseOmpUsageSnapshotRow({
      provider: "p",
      limit_id: "p:x",
      label: "",
      window_label: "",
      used_fraction: 1.5,
      status: "",
      resets_at: 1789000000,
    });
    assert.equal(parsed?.usedFraction, 1);
    assert.equal(parsed?.label, "p:x");
    assert.equal(parsed?.status, "unknown");
    assert.equal(parsed?.resetsAtMs, 1789000000000);
  });

  it("rejects rows without usable data", () => {
    assert.equal(
      parseOmpUsageSnapshotRow({ provider: "", limit_id: "x", label: "", window_label: "", used_fraction: 0.5, status: "ok", resets_at: null }),
      null,
    );
    assert.equal(
      parseOmpUsageSnapshotRow({ provider: "p", limit_id: "x", label: "", window_label: "", used_fraction: NaN, status: "ok", resets_at: null }),
      null,
    );
    assert.equal(
      parseOmpUsageSnapshotRow({ provider: "p", limit_id: "x", label: "", window_label: "", used_fraction: "half", status: "ok", resets_at: null }),
      null,
    );
  });

});

describe("readOmpUsageSnapshots", () => {
  it("returns null snapshots for a missing agent dir", async () => {
    clearOmpStoreCache();
    assert.equal(await readOmpUsageSnapshots("google-antigravity", path.join(os.tmpdir(), "omp-missing-dir-xyz")), null);
  });

  it("returns null immediately when disabled, without touching disk", async () => {
    clearOmpStoreCache();
    assert.equal(await readOmpStore(undefined, false), null);
    assert.equal(await readOmpUsageSnapshots("google-antigravity", undefined, false), null);
    assert.equal(await getOmpApiKey("opencode-go", undefined, false), null);
    assert.equal(await getOmpOAuth("anthropic", undefined, false), null);
  });
});

describe("readOmpStore", () => {
  it("returns null for a missing agent dir", async () => {
    clearOmpStoreCache();
    const missing = path.join(os.tmpdir(), "omp-missing-dir-xyz");
    assert.equal(await readOmpStore(missing), null);
    assert.equal(await getOmpApiKey("opencode-go", missing), null);
    assert.equal(await getOmpOAuth("anthropic", missing), null);
  });

  it("round-trips a fixture database", async (t) => {
    let DatabaseSync: new (path: string) => { exec(s: string): void; prepare(s: string): unknown; close(): void };
    try {
      ({ DatabaseSync } = await import("node:sqlite"));
    } catch {
      t.skip("node:sqlite unavailable in this runtime");
      return;
    }
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "omp-fixture-home-"));
    const dir = path.join(home, ".omp", "agent");
    fs.mkdirSync(dir, { recursive: true });
    try {
      const setup = new DatabaseSync(path.join(dir, "agent.db"));
      setup.exec("CREATE TABLE auth_credentials (provider TEXT, credential_type TEXT, data TEXT)");
      setup.exec(
        "CREATE TABLE usage_history (provider TEXT, limit_id TEXT, label TEXT, window_label TEXT, used_fraction REAL, status TEXT, resets_at INTEGER)",
      );
      const insert = setup.prepare("INSERT INTO auth_credentials VALUES (?, ?, ?)");
      insert.run("anthropic", "oauth", JSON.stringify({ access: "a1", refresh: "r1", expires: Date.now() + 3600000 }));
      insert.run("opencode-go", "api_key", JSON.stringify({ key: "k1" }));
      const insertUsage = setup.prepare("INSERT INTO usage_history VALUES (?, ?, ?, ?, ?, ?, ?)");
      insertUsage.run("google-antigravity", "google-antigravity:google:default:daily", "Usage (Google)", "Daily", 0.71, "ok", null);
      insertUsage.run("google-antigravity", "google-antigravity:anthropic:default:daily", "Usage (Anthropic)", "Daily", 1.0, "exhausted", 1789000000);
      setup.close();

      clearOmpStoreCache();
      const store = await readOmpStore(dir);
      assert.equal(store?.oauth.length, 1);
      assert.equal(store?.apiKeys.length, 1);
      assert.equal(await getOmpApiKey("opencode-go", dir), "k1");
      assert.equal((await getOmpOAuth("anthropic", dir))?.access, "a1");
      assert.equal(await getOmpOAuth("missing", dir), null);

      const snapshots = await readOmpUsageSnapshots("google-antigravity", dir);
      assert.equal(snapshots?.length, 2);
      assert.equal(snapshots?.[0].label, "Usage (Google)");
      assert.equal(snapshots?.[0].usedFraction, 0.71);
      assert.equal(snapshots?.[0].resetsAtMs, null);
      assert.equal(snapshots?.[1].status, "exhausted");
      assert.equal(snapshots?.[1].resetsAtMs, 1789000000000);
      assert.deepEqual(await readOmpUsageSnapshots("unknown-provider", dir), []);
    } finally {
      clearOmpStoreCache();
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
