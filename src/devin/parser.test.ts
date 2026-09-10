import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDevinUsage,
  parseDevinAcuLimits,
  parseDevinCycles,
  parseDevinDailyConsumption,
  pickCurrentCycle,
} from "./parser.ts";

test("parseDevinCycles normalizes unix seconds to ms and drops malformed rows", () => {
  const cycles = parseDevinCycles({
    items: [
      { after: 1733385600, before: 1736064000 },
      { after: "bad", before: null },
      { after: 10, before: 5 },
    ],
  });
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].afterMs, 1733385600_000);
  assert.equal(cycles[0].beforeMs, 1736064000_000);
});

test("pickCurrentCycle picks the cycle containing now, else the latest", () => {
  const cycles = [
    { afterMs: 1_000, beforeMs: 2_000 },
    { afterMs: 2_000, beforeMs: 3_000 },
  ];
  assert.equal(pickCurrentCycle(cycles, 2_500)?.afterMs, 2_000);
  assert.equal(pickCurrentCycle(cycles, 9_999)?.beforeMs, 3_000);
  assert.equal(pickCurrentCycle([], 1_500), null);
});

test("parseDevinAcuLimits keeps valid scopes and drops junk", () => {
  const limits = parseDevinAcuLimits({
    items: [
      { scope: "enterprise", cycle_acu_limit: 1000, org_id: null, user_id: null },
      { scope: "org", cycle_acu_limit: 500, org_id: "org-1", user_id: null },
      { scope: "bogus", cycle_acu_limit: 10 },
      { scope: "user", cycle_acu_limit: "nope" },
    ],
  });
  assert.equal(limits.length, 2);
  assert.deepEqual(limits[1], { scope: "org", orgId: "org-1", userId: null, cycleAcuLimit: 500 });
});

test("parseDevinDailyConsumption sums totals and per-product ACUs", () => {
  const daily = parseDevinDailyConsumption({
    total_acus: 300,
    consumption_by_date: [
      { date: 1, acus: 100, acus_by_product: { devin: 80, cascade: 20, terminal: 0, review: null } },
      { date: 2, acus: 200, acus_by_product: { devin: 150, cascade: 30, terminal: 20, review: null } },
    ],
  });
  assert.equal(daily?.totalAcus, 300);
  assert.equal(daily?.devinAcus, 230);
  assert.deepEqual(daily?.byProduct, { devin: 230, cascade: 50, terminal: 20, review: 0 });
});

test("parseDevinDailyConsumption treats the total as Devin usage without a product breakdown", () => {
  const daily = parseDevinDailyConsumption({
    total_acus: 42,
    consumption_by_date: [{ date: 1, acus: 42, acus_by_product: null }],
  });
  assert.equal(daily?.devinAcus, 42);
  assert.equal(parseDevinDailyConsumption({ consumption_by_date: "nope" }), null);
});

test("buildDevinUsage needs a cycle and combines limits with consumption", () => {
  const usage = buildDevinUsage({
    limits: [{ scope: "enterprise", orgId: null, userId: null, cycleAcuLimit: 1000 }],
    cycles: [{ afterMs: 100, beforeMs: 200 }],
    daily: { totalAcus: 300, devinAcus: 250, byProduct: { devin: 250, cascade: 50, terminal: 0, review: 0 } },
    nowMs: 150,
  });
  assert.equal(usage?.cycleEndMs, 200);
  assert.equal(usage?.devinAcus, 250);
  assert.equal(buildDevinUsage({ limits: [], cycles: [], daily: null, nowMs: 0 }), null);
});
