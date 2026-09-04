import { Icon, List } from "@vicinae/api";
import React from "react";

import type { Accessory } from "../agents/types.ts";
import { formatCountdown, LiveResetLabel } from "../agents/countdown.tsx";
import { formatErrorOrNoData, generateAsciiBar, getLoadingAccessory, getNoDataAccessory, renderErrorOrNoData } from "../agents/ui.tsx";
import type { OmpSummaryError, OmpSummaryLimit, OmpSummaryProvider, OmpSummaryUsage } from "./summary.ts";

function limitTitle(provider: OmpSummaryProvider, limit: OmpSummaryLimit): string {
  const window = limit.windowLabel ? ` (${limit.windowLabel})` : "";
  return `${provider.displayName}: ${limit.label}${window}`;
}

function limitBarText(limit: OmpSummaryLimit): string {
  return `${generateAsciiBar(limit.percentRemaining)} ${limit.percentRemaining}% remaining`;
}

function resetsInSeconds(limit: OmpSummaryLimit): number | null {
  if (limit.resetsAtMs === null) return null;
  const seconds = Math.round((limit.resetsAtMs - Date.now()) / 1000);
  return seconds > 0 ? seconds : null;
}

export function formatOmpSummaryUsageText(usage: OmpSummaryUsage | null, error: OmpSummaryError | null): string {
  const fallback = formatErrorOrNoData("oh-my-pi", usage, error);
  if (fallback !== null) return fallback;
  const u = usage as OmpSummaryUsage;

  let text = "oh-my-pi Usage (harness snapshots)";
  for (const provider of u.providers) {
    for (const limit of provider.limits) {
      text += `\n\n${limitTitle(provider, limit)}: ${limitBarText(limit)} [${limit.status}]`;
      const seconds = resetsInSeconds(limit);
      if (seconds !== null) {
        text += `\nResets In: ${formatCountdown(seconds)}`;
      }
    }
  }
  return text;
}

export function renderOmpSummaryDetail(usage: OmpSummaryUsage | null, error: OmpSummaryError | null): React.ReactNode {
  const fallback = renderErrorOrNoData(usage, error);
  if (fallback !== null) return fallback;
  const u = usage as OmpSummaryUsage;

  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Source" text="Harness snapshots (via omp)" />
      {u.providers.flatMap((provider) =>
        provider.limits.map((limit) => (
          <React.Fragment key={`${provider.providerId}:${limit.limitId}`}>
            <List.Item.Detail.Metadata.Separator />
            <List.Item.Detail.Metadata.Label
              title={limitTitle(provider, limit)}
              text={`${limitBarText(limit)} [${limit.status}]`}
            />
            {resetsInSeconds(limit) !== null && <LiveResetLabel seconds={resetsInSeconds(limit)} />}
          </React.Fragment>
        )),
      )}
    </List.Item.Detail.Metadata>
  );
}

export function getOmpSummaryAccessory(
  usage: OmpSummaryUsage | null,
  error: OmpSummaryError | null,
  isLoading: boolean,
): Accessory {
  if (isLoading) return getLoadingAccessory("oh-my-pi");

  if (error) {
    if (error.type === "not_configured" || error.type === "disabled") {
      return { text: "Not Configured", tooltip: error.message };
    }
    if (error.type === "network_error") return { text: "Network Error", tooltip: error.message };
    if (error.type === "parse_error") return { text: "Parse Error", tooltip: error.message };
    return { text: "Error", tooltip: error.message };
  }

  if (!usage || usage.providers.length === 0) return getNoDataAccessory();

  const all = usage.providers.flatMap((provider) => provider.limits);
  const worst = all.reduce((acc, limit) => (limit.percentRemaining < acc.percentRemaining ? limit : acc));
  if (worst.status === "exhausted" || worst.percentRemaining <= 0) {
    return { icon: Icon.Warning, text: "Exhausted", tooltip: "A connected limit is exhausted — open details." };
  }
  return {
    text: `${worst.percentRemaining}%`,
    tooltip: `Lowest connected limit: ${worst.percentRemaining}% remaining`,
  };
}
