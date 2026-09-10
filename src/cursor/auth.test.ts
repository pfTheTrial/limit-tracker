import assert from "node:assert/strict";
import test from "node:test";

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

function makeJwt(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

test("buildCursorCookieHeader derives the WorkOS cookie from Cursor app access token", async () => {
  const { buildCursorCookieHeader } = await import("./auth.ts");
  const token = makeJwt({ sub: "auth0|user_123", exp: Math.floor(Date.now() / 1000) + 3600 });

  assert.equal(buildCursorCookieHeader(token), `WorkosCursorSessionToken=user_123%3A%3A${token}`);
});

test("isCursorAccessTokenUsable rejects expired or malformed Cursor app tokens", async () => {
  const { isCursorAccessTokenUsable } = await import("./auth.ts");
  const now = Date.UTC(2026, 0, 1);

  assert.equal(isCursorAccessTokenUsable(makeJwt({ sub: "auth0|user", exp: now / 1000 + 120 }), now), true);
  assert.equal(isCursorAccessTokenUsable(makeJwt({ sub: "auth0|user", exp: now / 1000 + 30 }), now), false);
  assert.equal(isCursorAccessTokenUsable(makeJwt({ sub: "auth0|bad user", exp: now / 1000 + 120 }), now), false);
  assert.equal(isCursorAccessTokenUsable("not-a-jwt", now), false);
});

test("readCursorAppAccessToken returns null for a missing database", async () => {
  const { readCursorAppAccessToken } = await import("./auth.ts");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-auth-test-"));
  try {
    assert.equal(await readCursorAppAccessToken(path.join(dir, "state.vscdb")), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readCursorAppAccessToken reads the token through the snapshot reader", async (t) => {
  let DatabaseSync: typeof import("node:sqlite").DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    t.skip("node:sqlite is not available in this runtime");
    return;
  }

  const { readCursorAppAccessToken } = await import("./auth.ts");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-auth-test-"));
  try {
    const dbPath = path.join(dir, "state.vscdb");
    const db = new DatabaseSync(dbPath);
    db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)");
    db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run("cursorAuth/accessToken", "token-abc");
    db.close();

    assert.equal(await readCursorAppAccessToken(dbPath), "token-abc");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readCursorAppAccessToken sees rows that only live in the WAL file", async (t) => {
  let DatabaseSync: typeof import("node:sqlite").DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    t.skip("node:sqlite is not available in this runtime");
    return;
  }

  const { readCursorAppAccessToken } = await import("./auth.ts");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-auth-test-"));
  let db: import("node:sqlite").DatabaseSync | null = null;
  try {
    const dbPath = path.join(dir, "state.vscdb");
    db = new DatabaseSync(dbPath);
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB)");
    // Keep the connection open so the row stays in -wal, like the live Cursor DB.
    db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run("cursorAuth/accessToken", "wal-token");

    assert.equal(await readCursorAppAccessToken(dbPath), "wal-token");
  } finally {
    try {
      db?.close();
    } catch {
      // Ignore close failures in test cleanup.
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
