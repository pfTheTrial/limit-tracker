import type { DevinAcuLimit, DevinLimitScope, DevinProductAcus, DevinUsage } from "./types.ts";

/**
 * Pure parsers for the Devin v3 consumption API. No @vicinae/api imports —
 * exercised under the plain Node test runner.
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNum(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

/** v3 returns Unix seconds (e.g. 1733385600); tolerate ms too. */
function epochToMs(value: unknown): number | null {
  const n = asNum(value);
  if (n === undefined || n <= 0) return null;
  return n > 1e12 ? Math.round(n) : Math.round(n * 1000);
}

function items(data: unknown): Record<string, unknown>[] {
  const root = asRecord(data);
  const list = root?.items;
  if (!Array.isArray(list)) return [];
  return list.map(asRecord).filter((item): item is Record<string, unknown> => item !== null);
}

export interface DevinCycle {
  afterMs: number;
  beforeMs: number;
}

export function parseDevinCycles(data: unknown): DevinCycle[] {
  return items(data)
    .map((item) => ({ afterMs: epochToMs(item.after), beforeMs: epochToMs(item.before) }))
    .filter((cycle): cycle is DevinCycle => cycle.afterMs !== null && cycle.beforeMs !== null && cycle.beforeMs > cycle.afterMs);
}

/** The cycle containing `nowMs`, else the latest one listed. */
export function pickCurrentCycle(cycles: DevinCycle[], nowMs: number): DevinCycle | null {
  const current = cycles.find((cycle) => cycle.afterMs <= nowMs && nowMs < cycle.beforeMs);
  if (current) return current;
  if (cycles.length === 0) return null;
  return cycles.reduce((latest, cycle) => (cycle.beforeMs > latest.beforeMs ? cycle : latest));
}

const SCOPES: ReadonlySet<string> = new Set(["enterprise", "org", "user"]);

export function parseDevinAcuLimits(data: unknown): DevinAcuLimit[] {
  const limits: DevinAcuLimit[] = [];
  for (const item of items(data)) {
    const limit = asNum(item.cycle_acu_limit);
    const scope = typeof item.scope === "string" && SCOPES.has(item.scope) ? (item.scope as DevinLimitScope) : null;
    if (limit === undefined || scope === null) continue;
    limits.push({
      scope,
      orgId: typeof item.org_id === "string" ? item.org_id : null,
      userId: typeof item.user_id === "string" ? item.user_id : null,
      cycleAcuLimit: limit,
    });
  }
  return limits;
}

export interface DevinDailyConsumption {
  totalAcus: number;
  devinAcus: number;
  byProduct: DevinProductAcus;
}

export function parseDevinDailyConsumption(data: unknown): DevinDailyConsumption | null {
  const root = asRecord(data);
  const rows = root?.consumption_by_date;
  if (!Array.isArray(rows)) return null;

  const byProduct: DevinProductAcus = { devin: 0, cascade: 0, terminal: 0, review: 0 };
  let sawBreakdown = false;
  let totalAcus = 0;
  for (const rowValue of rows) {
    const row = asRecord(rowValue);
    if (!row) continue;
    totalAcus += asNum(row.acus) ?? 0;
    const products = asRecord(row.acus_by_product);
    if (products) {
      sawBreakdown = true;
      byProduct.devin += asNum(products.devin) ?? 0;
      byProduct.cascade += asNum(products.cascade) ?? 0;
      byProduct.terminal += asNum(products.terminal) ?? 0;
      byProduct.review += asNum(products.review) ?? 0;
    }
  }

  // When no per-product breakdown exists, the total is all we have — treat it
  // as Devin usage (the product these limits apply to).
  const devinAcus = sawBreakdown ? byProduct.devin : totalAcus;
  return { totalAcus, devinAcus, byProduct };
}

/**
 * Combine the three v3 responses into the display model. Returns null when no
 * billing cycle exists — without one there is no reset date and no window to
 * sum consumption over, so nothing honest can be shown.
 */
export function buildDevinUsage(input: {
  limits: DevinAcuLimit[];
  cycles: DevinCycle[];
  daily: DevinDailyConsumption | null;
  nowMs: number;
}): DevinUsage | null {
  const cycle = pickCurrentCycle(input.cycles, input.nowMs);
  if (!cycle) return null;
  return {
    cycleStartMs: cycle.afterMs,
    cycleEndMs: cycle.beforeMs,
    limits: input.limits,
    totalAcus: input.daily?.totalAcus ?? 0,
    devinAcus: input.daily?.devinAcus ?? 0,
    byProduct: input.daily?.byProduct ?? { devin: 0, cascade: 0, terminal: 0, review: 0 },
  };
}
