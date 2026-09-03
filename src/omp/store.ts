/**
 * oh-my-pi (`omp`) harness credential source.
 *
 * `omp` is a coding-agent harness where the user logs in once per provider
 * (`omp auth-broker login <provider>`). Logins live in a local SQLite store at
 * `~/.omp/agent/agent.db`, table `auth_credentials(provider, credential_type, data)`.
 *
 * This module exposes those credentials as a *fallback* source for the fetchers:
 * explicit preferences, environment variables and native app logins always win.
 * Rules:
 * - Best-effort only: any failure (no omp install, no node:sqlite in the host,
 *   locked DB, schema drift) resolves to null — never throws, never blocks.
 * - Never persist omp tokens anywhere (no writes to the omp DB, no writes to
 *   native credential files). Refresh results stay in memory.
 * - Never log credential material; only provider ids appear in diagnostics.
 * - Reads go through a temp-file snapshot (db + wal + shm) so the live DB is
 *   never locked and reads are consistent.
 * - Results are TTL-cached in memory (60s) to keep refresh cycles light.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { DatabaseSync } from "node:sqlite";

export interface OmpOAuthCredential {
  provider: string;
  access: string;
  refresh?: string;
  /** Epoch milliseconds, when present. */
  expires?: number;
  accountId?: string;
  email?: string;
}

export interface OmpApiKeyCredential {
  provider: string;
  key: string;
}

export interface OmpStore {
  oauth: OmpOAuthCredential[];
  apiKeys: OmpApiKeyCredential[];
}

const OMP_STORE_TTL_MS = 60_000;
const OMP_DB_FILES = ["agent.db", "agent.db-wal", "agent.db-shm"] as const;

let cachedDir: string | null = null;
let cachedStore: OmpStore | null = null;
let cachedAt = 0;

/** Test hook: drop the in-memory cache. */
export function clearOmpStoreCache(): void {
  cachedDir = null;
  cachedStore = null;
  cachedAt = 0;
}

export function findOmpAgentDir(homeDir: string = os.homedir()): string | null {
  try {
    const dir = path.join(homeDir, ".omp", "agent");
    return fs.statSync(dir).isDirectory() ? dir : null;
  } catch {
    return null;
  }
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asEpochMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  return undefined;
}

/**
 * Parse one `auth_credentials` row. Pure function (tested).
 * Returns an OAuth credential, an API-key credential, or null when the row
 * carries nothing usable. Never throws.
 */
export function parseOmpAuthRow(
  provider: unknown,
  credentialType: unknown,
  data: unknown,
): { oauth?: OmpOAuthCredential; apiKey?: OmpApiKeyCredential } {
  if (typeof provider !== "string" || !provider.trim()) return {};
  const id = provider.trim();
  if (typeof data !== "string" || !data.trim()) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(data) as unknown;
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const record = parsed as Record<string, unknown>;

  if (credentialType === "api_key") {
    const key = asTrimmedString(record.key);
    if (!key) return {};
    return { apiKey: { provider: id, key } };
  }

  const access = asTrimmedString(record.access);
  if (!access) return {};
  const credential: OmpOAuthCredential = { provider: id, access };
  const refresh = asTrimmedString(record.refresh);
  if (refresh) credential.refresh = refresh;
  const expires = asEpochMs(record.expires);
  if (expires !== undefined) credential.expires = expires;
  const accountId = asTrimmedString(record.accountId ?? record.account_id);
  if (accountId) credential.accountId = accountId;
  const email = asTrimmedString(record.email);
  if (email) credential.email = email;
  return { oauth: credential };
}

/**
 * An OAuth access token is usable only while it is not (almost) expired.
 * omp credentials cannot be refreshed from here (the OAuth client belongs to
 * omp), so expired tokens are skipped instead of attempted.
 */
export function isOmpTokenFresh(
  credential: Pick<OmpOAuthCredential, "expires">,
  nowMs: number = Date.now(),
  marginMs: number = 5 * 60 * 1000,
): boolean {
  if (credential.expires === undefined) return true;
  return credential.expires - nowMs > marginMs;
}

interface OmpSnapshot {
  db: DatabaseSync;
  dispose: () => void;
}

async function openOmpSnapshot(agentDir: string): Promise<OmpSnapshot | null> {
  let snapshotDir: string | null = null;
  try {
    const { default: nodeSqlite } = (await import("node:sqlite")) as unknown as {
      default: { DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => DatabaseSync };
    };
    snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-store-"));
    let copied = false;
    for (const file of OMP_DB_FILES) {
      const source = path.join(agentDir, file);
      try {
        if (!fs.statSync(source).isFile()) continue;
      } catch {
        continue;
      }
      fs.copyFileSync(source, path.join(snapshotDir, file));
      copied = true;
    }
    if (!copied) return null;
    const dir = snapshotDir;
    const db = new nodeSqlite.DatabaseSync(path.join(dir, "agent.db"), { readOnly: true });
    return {
      db,
      dispose: () => {
        try {
          db.close();
        } catch {
          // Ignore close failures.
        }
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup failures.
        }
      },
    };
  } catch {
    if (snapshotDir) {
      try {
        fs.rmSync(snapshotDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failures.
      }
    }
    return null;
  }
}

/**
 * Read the omp credential store. Returns null when omp is absent, the host
 * cannot open SQLite, or anything goes wrong. Results are TTL-cached.
 */
export async function readOmpStore(agentDir?: string): Promise<OmpStore | null> {
  const dir = agentDir ?? findOmpAgentDir();
  if (!dir) return null;

  const now = Date.now();
  if (cachedDir === dir && now - cachedAt < OMP_STORE_TTL_MS) return cachedStore;

  const store: OmpStore = { oauth: [], apiKeys: [] };
  const snapshot = await openOmpSnapshot(dir);
  if (!snapshot) {
    cachedDir = dir;
    cachedStore = null;
    cachedAt = now;
    return null;
  }
  try {
    const rows = snapshot.db
      .prepare("SELECT provider, credential_type, data FROM auth_credentials")
      .all() as Array<{ provider: unknown; credential_type: unknown; data: unknown }>;
    for (const row of rows) {
      const { oauth, apiKey } = parseOmpAuthRow(row.provider, row.credential_type, row.data);
      if (oauth) store.oauth.push(oauth);
      if (apiKey) store.apiKeys.push(apiKey);
    }
  } catch {
    cachedDir = dir;
    cachedStore = null;
    cachedAt = now;
    return null;
  } finally {
    snapshot.dispose();
  }

  cachedDir = dir;
  cachedStore = store;
  cachedAt = now;
  return store;
}

/** API-key credential for an omp provider id (e.g. "opencode-go"). Pure lookup. */
export async function getOmpApiKey(providerId: string, agentDir?: string): Promise<string | null> {
  const store = await readOmpStore(agentDir);
  return store?.apiKeys.find((entry) => entry.provider === providerId)?.key ?? null;
}

/** OAuth credential for an omp provider id (e.g. "anthropic", "openai-codex"). */
export async function getOmpOAuth(providerId: string, agentDir?: string): Promise<OmpOAuthCredential | null> {
  const store = await readOmpStore(agentDir);
  return store?.oauth.find((entry) => entry.provider === providerId) ?? null;
}
