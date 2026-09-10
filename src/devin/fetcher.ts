import { httpFetch } from "../agents/http.ts";
import type { HttpFetchError } from "../agents/http.ts";
import {
  buildDevinUsage,
  parseDevinAcuLimits,
  parseDevinCycles,
  parseDevinDailyConsumption,
  pickCurrentCycle,
} from "./parser.ts";
import type { DevinError, DevinUsage } from "./types.ts";

const DEVIN_API_BASE = "https://api.devin.ai";
const DEVIN_CYCLES_API = `${DEVIN_API_BASE}/v3/enterprise/consumption/cycles?first=200`;
const DEVIN_ACU_LIMITS_API = `${DEVIN_API_BASE}/v3/enterprise/consumption/acu-limits/devin?first=200`;
const DEVIN_DAILY_API = `${DEVIN_API_BASE}/v3/enterprise/consumption/daily`;
const REQUEST_TIMEOUT = 15000;

const FORBIDDEN_MESSAGE =
  "Devin consumption API requires an Enterprise plan and a cog_ service-user key with ViewAccountConsumption / ManageBilling permissions.";

export async function resolveDevinApiKey(preferenceKey?: string): Promise<string | null> {
  const fromPreference = preferenceKey?.trim();
  if (fromPreference) return fromPreference;
  const fromEnv = process.env.DEVIN_API_KEY?.trim();
  return fromEnv || null;
}

function mapHttpError(error: HttpFetchError): DevinError {
  if (error.status === 403) return { type: "forbidden", message: FORBIDDEN_MESSAGE };
  if (error.type === "unauthorized") {
    return { type: "unauthorized", message: "Devin service user key expired or invalid. Update it in extension settings." };
  }
  if (error.type === "network_error") return { type: "network_error", message: error.message };
  return { type: "unknown", message: error.message };
}

/**
 * Devin v3 consumption flow: billing cycles locate the current window, daily
 * consumption fills it in, and the acu-limits endpoint provides the caps.
 * All three are Enterprise-plan endpoints — a 403 is surfaced as `forbidden`,
 * not mistaken for an expired key.
 */
export async function fetchDevinUsage(apiKey: string): Promise<{ usage: DevinUsage | null; error: DevinError | null }> {
  const [cyclesRes, limitsRes] = await Promise.all([
    httpFetch({ url: DEVIN_CYCLES_API, token: apiKey, headers: { Accept: "application/json" }, timeoutMs: REQUEST_TIMEOUT }),
    httpFetch({ url: DEVIN_ACU_LIMITS_API, token: apiKey, headers: { Accept: "application/json" }, timeoutMs: REQUEST_TIMEOUT }),
  ]);

  if (cyclesRes.error) return { usage: null, error: mapHttpError(cyclesRes.error) };
  if (limitsRes.error) return { usage: null, error: mapHttpError(limitsRes.error) };

  const nowMs = Date.now();
  const cycles = parseDevinCycles(cyclesRes.data);
  const current = pickCurrentCycle(cycles, nowMs);
  if (!current) {
    return {
      usage: null,
      error: { type: "parse_error", message: "Devin returned no billing cycles." },
    };
  }

  const dailyRes = await httpFetch({
    url: `${DEVIN_DAILY_API}?time_after=${Math.floor(current.afterMs / 1000)}&time_before=${Math.floor(nowMs / 1000)}`,
    token: apiKey,
    headers: { Accept: "application/json" },
    timeoutMs: REQUEST_TIMEOUT,
  });
  if (dailyRes.error) return { usage: null, error: mapHttpError(dailyRes.error) };

  const usage = buildDevinUsage({
    limits: parseDevinAcuLimits(limitsRes.data),
    cycles,
    daily: parseDevinDailyConsumption(dailyRes.data),
    nowMs,
  });
  if (!usage) {
    return { usage: null, error: { type: "parse_error", message: "Devin returned no billing cycles." } };
  }
  return { usage, error: null };
}
