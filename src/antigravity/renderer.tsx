import { Icon, List } from "@vicinae/api";
import React from "react";

import type { Accessory } from "../agents/types.ts";
import { formatCountdown, LiveResetLabel } from "../agents/countdown.tsx";
import { formatErrorOrNoData, generateAsciiBar, getLoadingAccessory, getNoDataAccessory, renderErrorOrNoData } from "../agents/ui.tsx";
import type { AntigravityError, AntigravityPool, AntigravityUsage } from "./types.ts";

const VIA_OMP_NOTE = "Values via omp — may lag behind the live quota.";

function poolTitle(pool: AntigravityPool): string {
  return pool.windowLabel ? `${pool.label} (${pool.windowLabel})` : pool.label;
}

function poolBarText(pool: AntigravityPool): string {
  return `${generateAsciiBar(pool.percentRemaining)} ${pool.percentRemaining}% remaining`;
}

function resetsInSeconds(pool: AntigravityPool): number | null {
  if (pool.resetsAtMs === null) return null;
  const seconds = Math.round((pool.resetsAtMs - Date.now()) / 1000);
  return seconds > 0 ? seconds : null;
}

function worstPool(pools: AntigravityPool[]): AntigravityPool {
  return pools.reduce((worst, pool) => (pool.percentRemaining < worst.percentRemaining ? pool : worst));
}

export function formatAntigravityUsageText(usage: AntigravityUsage | null, error: AntigravityError | null): string {
  const fallback = formatErrorOrNoData("Antigravity", usage, error);
  if (fallback !== null) return fallback;
  const u = usage as AntigravityUsage;

  let text = `Antigravity Usage\nSource: ${VIA_OMP_NOTE}`;
  for (const pool of u.pools) {
    text += `\n\n${poolTitle(pool)}: ${poolBarText(pool)} [${pool.status}]`;
    const seconds = resetsInSeconds(pool);
    if (seconds !== null) {
      text += `\nResets In: ${formatCountdown(seconds)}`;
    }
  }
  return text;
}

export function renderAntigravityDetail(usage: AntigravityUsage | null, error: AntigravityError | null): React.ReactNode {
  const fallback = renderErrorOrNoData(usage, error);
  if (fallback !== null) return fallback;
  const u = usage as AntigravityUsage;

  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Source" text="via omp" />
      {u.pools.map((pool) => (
        <React.Fragment key={pool.id}>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title={poolTitle(pool)} text={`${poolBarText(pool)} [${pool.status}]`} />
          {resetsInSeconds(pool) !== null && <LiveResetLabel seconds={resetsInSeconds(pool)} />}
        </React.Fragment>
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
    tooltip: usage.pools.map((pool) => `${poolTitle(pool)}: ${pool.percentRemaining}% remaining`).join("\n") + `\n${VIA_OMP_NOTE}`,
  };
}
