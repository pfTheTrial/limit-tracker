import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCountdown,
  formatErrorMarkdown,
  formatLimitsText,
  generateAsciiBar,
  isCompactLimitList,
  limitItemText,
  limitResetText,
} from "./detail-format.ts";
import type { LimitItem } from "./detail-format.ts";

test("generateAsciiBar reserves room for the percentage label at narrow detail widths", () => {
  assert.equal(generateAsciiBar(50), "▰▰▰▰▰▰▱▱▱▱▱▱");
});

test("formatErrorMarkdown keeps a long error message in a wrappable Markdown paragraph", () => {
  const message = "Cursor is not configured. Sign in to cursor.com or paste the Cookie header in extension settings.";

  assert.equal(formatErrorMarkdown(message), `### Message\n\n${message}`);
});

test("formatCountdown renders days/hours/minutes without seconds", () => {
  assert.equal(formatCountdown(0), "now");
  assert.equal(formatCountdown(600), "10m");
  assert.equal(formatCountdown(7_500), "2h 5m");
  assert.equal(formatCountdown(158_400), "1d 20h");
});

test("limitItemText renders bar, percent, absolute values and note in one line", () => {
  const item: LimitItem = {
    id: "x",
    title: "Token Limit",
    percentRemaining: 75,
    valueText: "420/500",
    note: "warning",
  };
  assert.equal(limitItemText(item), `${generateAsciiBar(75)} 75% remaining · 420/500 · warning`);
});

test("limitItemText trims decimal percents and falls back to valueText or N/A", () => {
  assert.equal(
    limitItemText({ id: "a", title: "Auto", percentRemaining: 45.333 }),
    `${generateAsciiBar(45.333)} 45.3% remaining`,
  );
  assert.equal(limitItemText({ id: "b", title: "Chat", percentRemaining: null, valueText: "N/A remaining" }), "N/A remaining");
  assert.equal(limitItemText({ id: "c", title: "Chat", percentRemaining: null }), "N/A");
});

test("limitResetText prefers live seconds, then resetsText, then null", () => {
  const item: LimitItem = { id: "x", title: "5h", percentRemaining: 50, resetsInSeconds: 3_600, resetsText: "soon" };
  assert.equal(limitResetText(item), "1h 0m");
  assert.equal(limitResetText(item, 60), "1m");
  assert.equal(limitResetText({ resetsText: "Apr 1" }), "Apr 1");
  assert.equal(limitResetText({}), null);
});

test("isCompactLimitList switches to compact rows past the threshold", () => {
  const make = (id: string): LimitItem => ({ id, title: id, percentRemaining: 50 });
  assert.equal(isCompactLimitList(["a", "b", "c"].map(make)), false);
  assert.equal(isCompactLimitList(["a", "b", "c", "d"].map(make)), true);
});

test("formatLimitsText emits one block per window with an optional reset line", () => {
  const text = formatLimitsText([
    { id: "5h", title: "5h Limit", percentRemaining: 80, resetsInSeconds: 7_200 },
    { id: "w", title: "Weekly Limit", percentRemaining: 60 },
  ]);
  assert.equal(
    text,
    `\n\n5h Limit: ${generateAsciiBar(80)} 80% remaining\nResets In: 2h 0m` +
      `\n\nWeekly Limit: ${generateAsciiBar(60)} 60% remaining`,
  );
});
