import { readOmpUsageSnapshots } from "./store.ts";

export interface OmpSummaryLimit {
  limitId: string;
  label: string;
  windowLabel: string;
  /** Percent remaining, 0..100. */
  percentRemaining: number;
  status: string;
  /** Epoch milliseconds, when omp records one. */
  resetsAtMs: number | null;
}

export interface OmpSummaryProvider {
  providerId: string;
  displayName: string;
  limits: OmpSummaryLimit[];
}

export interface OmpSummaryUsage {
  providers: OmpSummaryProvider[];
}

export interface OmpSummaryError {
  type: "not_configured" | "disabled" | "network_error" | "parse_error" | "unknown";
  message: string;
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  anthropic: "Claude",
  "openai-codex": "Codex",
  "google-antigravity": "Antigravity",
  "opencode-go": "OpenCode Go",
};

export function displayNameForProvider(providerId: string): string {
  return PROVIDER_DISPLAY_NAMES[providerId] ?? providerId;
}

/**
 * Group harness snapshots by connected provider. Pure function (tested).
 */
export function mapSnapshotsToOmpSummary(
  rows: Array<{
    provider: string;
    limitId: string;
    label: string;
    windowLabel: string;
    usedFraction: number;
    status: string;
    resetsAtMs: number | null;
  }>,
): OmpSummaryUsage {
  const byProvider = new Map<string, OmpSummaryLimit[]>();
  for (const row of rows) {
    const list = byProvider.get(row.provider) ?? [];
    list.push({
      limitId: row.limitId,
      label: row.label,
      windowLabel: row.windowLabel,
      percentRemaining: Math.round((1 - row.usedFraction) * 100),
      status: row.status,
      resetsAtMs: row.resetsAtMs,
    });
    byProvider.set(row.provider, list);
  }
  return {
    providers: [...byProvider.entries()].map(([providerId, limits]) => ({
      providerId,
      displayName: displayNameForProvider(providerId),
      limits,
    })),
  };
}

/**
 * Limits of everything connected through the harness, from local snapshots.
 * No direct API calls. Disabled integration surfaces as "disabled" (not a
 * missing-login error); an empty snapshot table surfaces as not_configured.
 */
export async function fetchOmpSummaryUsage(
  agentDir?: string,
  enabled = true,
): Promise<{ usage: OmpSummaryUsage | null; error: OmpSummaryError | null }> {
  if (!enabled) {
    return {
      usage: null,
      error: {
        type: "disabled",
        message: "oh-my-pi integration is disabled. Enable “Use oh-my-pi harness” in extension settings.",
      },
    };
  }
  let rows;
  try {
    rows = await readOmpUsageSnapshots(undefined, agentDir, enabled);
  } catch {
    rows = null;
  }
  if (!rows || rows.length === 0) {
    return {
      usage: null,
      error: {
        type: "not_configured",
        message: "No omp usage recorded. Log in via `omp auth-broker login <provider>` and run a session.",
      },
    };
  }
  return { usage: mapSnapshotsToOmpSummary(rows), error: null };
}
