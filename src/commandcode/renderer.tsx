import { List } from "@vicinae/api";

import type { Accessory } from "../agents/types.ts";
import { formatErrorOrNoData, getLoadingAccessory, getNoDataAccessory, renderErrorOrNoData } from "../agents/ui.tsx";
import type { CommandcodeError, CommandcodeUsage } from "./types.ts";

function formatCredits(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatCommandcodeUsageText(usage: CommandcodeUsage | null, error: CommandcodeError | null): string {
  const fallback = formatErrorOrNoData("Command Code", usage, error);
  if (fallback !== null) return fallback;
  const u = usage as CommandcodeUsage;

  const lines = ["Command Code Usage"];
  if (u.plan) lines.push(`Plan: ${u.plan}`);
  if (u.percentUsed !== undefined) lines.push(`Used: ${u.percentUsed.toFixed(1)}%`);
  if (u.creditsUsed !== undefined && u.creditsTotal !== undefined) {
    lines.push(`Credits: ${formatCredits(u.creditsUsed)} of ${formatCredits(u.creditsTotal)}`);
  } else if (u.creditsTotal !== undefined) {
    lines.push(`Credits: ${formatCredits(u.creditsTotal)}`);
  }
  if (u.daysRemaining !== undefined && u.daysRemaining !== null) {
    lines.push(`Renews in: ${u.daysRemaining} day${u.daysRemaining === 1 ? "" : "s"}`);
  }
  return lines.join("\n");
}

export function renderCommandcodeDetail(usage: CommandcodeUsage | null, error: CommandcodeError | null): React.ReactNode {
  const fallback = renderErrorOrNoData(usage, error);
  if (fallback !== null) return fallback;
  const u = usage as CommandcodeUsage;

  return (
    <List.Item.Detail.Metadata>
      {u.plan ? <List.Item.Detail.Metadata.Label title="Plan" text={u.plan} /> : null}
      {u.percentUsed !== undefined ? (
        <List.Item.Detail.Metadata.Label title="Used" text={`${u.percentUsed.toFixed(1)}%`} />
      ) : null}
      {u.creditsUsed !== undefined && u.creditsTotal !== undefined ? (
        <List.Item.Detail.Metadata.Label
          title="Credits"
          text={`${formatCredits(u.creditsUsed)} of ${formatCredits(u.creditsTotal)}`}
        />
      ) : null}
      {u.creditsTotal !== undefined && u.creditsUsed === undefined ? (
        <List.Item.Detail.Metadata.Label title="Credits" text={formatCredits(u.creditsTotal)} />
      ) : null}
      {u.daysRemaining !== undefined && u.daysRemaining !== null ? (
        <List.Item.Detail.Metadata.Label
          title="Renews in"
          text={`${u.daysRemaining} day${u.daysRemaining === 1 ? "" : "s"}`}
        />
      ) : null}
    </List.Item.Detail.Metadata>
  );
}

export function getCommandcodeAccessory(
  usage: CommandcodeUsage | null,
  error: CommandcodeError | null,
  isLoading: boolean,
): Accessory {
  if (isLoading) return getLoadingAccessory("Command Code");

  if (error) {
    if (error.type === "not_configured") return { text: "Not Configured", tooltip: error.message };
    if (error.type === "unauthorized") return { text: "Key Invalid", tooltip: error.message };
    if (error.type === "network_error") return { text: "Network Error", tooltip: error.message };
    if (error.type === "parse_error") return { text: "Parse Error", tooltip: error.message };
    return { text: "Error", tooltip: error.message };
  }

  if (!usage) return getNoDataAccessory();

  if (usage.percentUsed !== undefined) {
    return {
      text: `${usage.percentUsed.toFixed(0)}%`,
      tooltip:
        `Used ${usage.percentUsed.toFixed(1)}%` +
        (usage.plan ? ` (${usage.plan})` : "") +
        (usage.daysRemaining !== undefined && usage.daysRemaining !== null ? ` — renews in ${usage.daysRemaining}d` : ""),
    };
  }
  if (usage.creditsTotal !== undefined) {
    const total = formatCredits(usage.creditsTotal);
    return { text: total, tooltip: `Balance: ${total}${usage.plan ? ` (${usage.plan})` : ""}` };
  }
  if (usage.plan) return { text: usage.plan, tooltip: `Plan: ${usage.plan}` };
  return getNoDataAccessory();
}
