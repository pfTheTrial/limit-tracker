import { List } from "@vicinae/api";

import { formatLimitsText } from "../agents/detail-format.ts";
import type { LimitItem } from "../agents/detail-format.ts";
import { LimitItems } from "../agents/limits.tsx";
import type { Accessory } from "../agents/types.ts";
import {
  formatErrorOrNoData,
  generatePieIcon,
  getLoadingAccessory,
  getNoDataAccessory,
  renderErrorOrNoData,
} from "../agents/ui.tsx";
import type { DevinAcuLimit, DevinError, DevinUsage } from "./types.ts";

function formatAcus(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ACUs`;
}

function scopeLabel(limit: DevinAcuLimit): string {
  if (limit.scope === "enterprise") return "Enterprise";
  const id = limit.scope === "org" ? limit.orgId : limit.userId;
  const suffix = id ? ` ${id}` : "";
  return limit.scope === "org" ? `Org${suffix}` : `User${suffix}`;
}

function devinLimitItems(u: DevinUsage): LimitItem[] {
  const ordered = [...u.limits].sort((a, b) => (a.scope === "enterprise" ? -1 : b.scope === "enterprise" ? 1 : 0));
  return ordered.map((limit, index) => {
    const title = `ACU Limit — ${scopeLabel(limit)}`;
    if (limit.scope !== "enterprise") {
      // Consumption data is enterprise-wide; per-org/user usage isn't exposed,
      // so narrower caps render as text rather than a fake percentage.
      return { id: `limit-${index}`, title, percentRemaining: null, valueText: `${formatAcus(limit.cycleAcuLimit)}/cycle` };
    }
    const remaining = Math.max(0, limit.cycleAcuLimit - u.devinAcus);
    const percent = limit.cycleAcuLimit > 0 ? Math.min(100, Math.max(0, (remaining / limit.cycleAcuLimit) * 100)) : 0;
    return {
      id: `limit-${index}`,
      title,
      percentRemaining: percent,
      valueText: `${formatAcus(u.devinAcus)}/${formatAcus(limit.cycleAcuLimit)}`,
      resetsInSeconds: Math.max(0, Math.round((u.cycleEndMs - Date.now()) / 1000)),
    };
  });
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function productBreakdown(u: DevinUsage): string {
  const parts = [`Devin ${formatAcus(u.byProduct.devin)}`];
  if (u.byProduct.cascade > 0) parts.push(`Cascade ${formatAcus(u.byProduct.cascade)}`);
  if (u.byProduct.terminal > 0) parts.push(`Terminal ${formatAcus(u.byProduct.terminal)}`);
  if (u.byProduct.review > 0) parts.push(`Review ${formatAcus(u.byProduct.review)}`);
  return parts.join(" · ");
}

export function formatDevinUsageText(usage: DevinUsage | null, error: DevinError | null): string {
  const fallback = formatErrorOrNoData("Devin", usage, error);
  if (fallback !== null) return fallback;
  const u = usage as DevinUsage;

  let text = `Devin Usage\nPlan: Enterprise\nCycle: ${formatDate(u.cycleStartMs)} – ${formatDate(u.cycleEndMs)}`;
  text += formatLimitsText(devinLimitItems(u));
  text += `\n\nCycle Consumption: ${formatAcus(u.totalAcus)} (${productBreakdown(u)})`;
  return text;
}

export function renderDevinDetail(usage: DevinUsage | null, error: DevinError | null): React.ReactNode {
  const fallback = renderErrorOrNoData(usage, error);
  if (fallback !== null) return fallback;
  const u = usage as DevinUsage;

  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Plan" text="Enterprise" />
      <List.Item.Detail.Metadata.Label
        title="Cycle"
        text={`${formatDate(u.cycleStartMs)} – ${formatDate(u.cycleEndMs)}`}
      />

      <LimitItems items={devinLimitItems(u)} />

      <List.Item.Detail.Metadata.Separator />
      <List.Item.Detail.Metadata.Label title="Cycle Consumption" text={formatAcus(u.totalAcus)} />
      <List.Item.Detail.Metadata.Label title="By Product" text={productBreakdown(u)} />
    </List.Item.Detail.Metadata>
  );
}

export function getDevinAccessory(usage: DevinUsage | null, error: DevinError | null, isLoading: boolean): Accessory {
  if (isLoading) return getLoadingAccessory("Devin");

  if (error) {
    if (error.type === "not_configured") return { text: "Not Configured", tooltip: error.message };
    if (error.type === "unauthorized") return { text: "Key Expired", tooltip: error.message };
    if (error.type === "forbidden") return { text: "Enterprise Only", tooltip: error.message };
    if (error.type === "network_error") return { text: "Network Error", tooltip: error.message };
    return { text: "Error", tooltip: error.message };
  }

  if (!usage) return getNoDataAccessory();

  const enterprise = usage.limits.find((limit) => limit.scope === "enterprise");
  const tooltip = [
    ...usage.limits.map((limit) => `${scopeLabel(limit)}: ${formatAcus(limit.cycleAcuLimit)}/cycle`),
    `This cycle: ${formatAcus(usage.totalAcus)}`,
  ].join(" | ");

  if (enterprise && enterprise.cycleAcuLimit > 0) {
    const remaining = Math.max(0, enterprise.cycleAcuLimit - usage.devinAcus);
    const percent = Math.min(100, Math.max(0, Math.round((remaining / enterprise.cycleAcuLimit) * 100)));
    return { icon: generatePieIcon(percent), text: `${percent}%`, tooltip };
  }
  return { text: formatAcus(usage.totalAcus), tooltip };
}
