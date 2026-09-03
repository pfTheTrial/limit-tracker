import { Icon, List } from "@vicinae/api";

import type { Accessory } from "../agents/types.ts";
import { formatErrorOrNoData, getLoadingAccessory, getNoDataAccessory, renderErrorOrNoData } from "../agents/ui.tsx";
import type { AntigravityError, AntigravityPool, AntigravityUsage } from "./types.ts";

const VIA_OMP_NOTE = "Snapshot via omp — may lag behind the live quota.";

function worstPool(pools: AntigravityPool[]): AntigravityPool {
  return pools.reduce((worst, pool) => (pool.percentRemaining < worst.percentRemaining ? pool : worst));
}

export function formatAntigravityUsageText(usage: AntigravityUsage | null, error: AntigravityError | null): string {
  const fallback = formatErrorOrNoData("Antigravity", usage, error);
  if (fallback !== null) return fallback;
  const u = usage as AntigravityUsage;

  const lines = ["Antigravity Usage", VIA_OMP_NOTE];
  for (const pool of u.pools) {
    lines.push(`${pool.label} (${pool.windowLabel}): ${pool.percentRemaining}% remaining [${pool.status}]`);
  }
  return lines.join("\n");
}

export function renderAntigravityDetail(usage: AntigravityUsage | null, error: AntigravityError | null): React.ReactNode {
  const fallback = renderErrorOrNoData(usage, error);
  if (fallback !== null) return fallback;
  const u = usage as AntigravityUsage;

  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Source" text="Snapshot via omp" />
      <List.Item.Detail.Metadata.Separator />
      {u.pools.map((pool) => (
        <List.Item.Detail.Metadata.Label
          key={pool.id}
          title={`${pool.label} (${pool.windowLabel})`}
          text={`${pool.percentRemaining}% remaining [${pool.status}]`}
        />
      ))}
    </List.Item.Detail.Metadata>
  );
}

export function getAntigravityAccessory(
  usage: AntigravityUsage | null,
  error: AntigravityError | null,
  isLoading: boolean,
): Accessory {
  if (isLoading) return getLoadingAccessory("Antigravity");

  if (error) {
    if (error.type === "not_configured") return { text: "Not Configured", tooltip: error.message };
    if (error.type === "network_error") return { text: "Network Error", tooltip: error.message };
    if (error.type === "parse_error") return { text: "Parse Error", tooltip: error.message };
    return { text: "Error", tooltip: error.message };
  }

  if (!usage || usage.pools.length === 0) return getNoDataAccessory();

  const worst = worstPool(usage.pools);
  if (worst.status === "exhausted" || worst.percentRemaining <= 0) {
    return {
      icon: Icon.Warning,
      text: "Exhausted",
      tooltip: `${worst.label}: exhausted (${VIA_OMP_NOTE})`,
    };
  }
  return {
    text: `${worst.percentRemaining}%`,
    tooltip: usage.pools.map((pool) => `${pool.label}: ${pool.percentRemaining}% remaining`).join("\n") + `\n${VIA_OMP_NOTE}`,
  };
}
