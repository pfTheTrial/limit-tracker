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
  readOmpStore,
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
      const insert = setup.prepare("INSERT INTO auth_credentials VALUES (?, ?, ?)");
      insert.run("anthropic", "oauth", JSON.stringify({ access: "a1", refresh: "r1", expires: Date.now() + 3600000 }));
      insert.run("opencode-go", "api_key", JSON.stringify({ key: "k1" }));
      setup.close();

      clearOmpStoreCache();
      const store = await readOmpStore(dir);
      assert.equal(store?.oauth.length, 1);
      assert.equal(store?.apiKeys.length, 1);
      assert.equal(await getOmpApiKey("opencode-go", dir), "k1");
      assert.equal((await getOmpOAuth("anthropic", dir))?.access, "a1");
      assert.equal(await getOmpOAuth("missing", dir), null);
    } finally {
      clearOmpStoreCache();
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
