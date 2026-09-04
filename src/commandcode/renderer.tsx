import { List } from "@vicinae/api";

import type { Accessory } from "../agents/types.ts";
import { formatCountdown, LiveResetLabel } from "../agents/countdown.tsx";
import { formatErrorOrNoData, generateAsciiBar, getLoadingAccessory, getNoDataAccessory, renderErrorOrNoData } from "../agents/ui.tsx";
import type { CommandcodeError, CommandcodeUsage } from "./types.ts";

function formatCredits(value: number): string {
  return `$${value.toFixed(2)}`;
}

function renewsInSeconds(usage: CommandcodeUsage): number | null {
  if (usage.renewsAtMs === undefined || usage.renewsAtMs === null) return null;
  const seconds = Math.round((usage.renewsAtMs - Date.now()) / 1000);
  return seconds > 0 ? seconds : null;
}

function percentRemaining(usage: CommandcodeUsage): number | null {
  if (usage.percentUsed === undefined) return null;
  return Math.min(100, Math.max(0, 100 - usage.percentUsed));
}

function limitBarText(usage: CommandcodeUsage): string | null {
  const remaining = percentRemaining(usage);
  if (remaining === null) return null;
  return `${generateAsciiBar(remaining)} ${remaining.toFixed(1)}% remaining`;
}

export function formatCommandcodeUsageText(usage: CommandcodeUsage | null, error: CommandcodeError | null): string {
  const fallback = formatErrorOrNoData("Command Code", usage, error);
  if (fallback !== null) return fallback;
  const u = usage as CommandcodeUsage;

  let text = "Command Code Usage";
  if (u.plan) text += `\nPlan: ${u.plan}`;
  const bar = limitBarText(u);
  if (bar) {
    text += `\n\nCredit Limit: ${bar}`;
    const seconds = renewsInSeconds(u);
    if (seconds !== null) {
      text += `\nResets In: ${formatCountdown(seconds)}`;
    } else if (u.daysRemaining !== undefined && u.daysRemaining !== null) {
      text += `\nResets In: ${u.daysRemaining}d`;
    }
  }
  if (u.creditsUsed !== undefined && u.creditsTotal !== undefined) {
    text += `\n\nCredits: ${formatCredits(u.creditsUsed)} of ${formatCredits(u.creditsTotal)}`;
  } else if (u.creditsTotal !== undefined) {
    text += `\n\nCredits: ${formatCredits(u.creditsTotal)}`;
  }
  return text;
}

export function renderCommandcodeDetail(usage: CommandcodeUsage | null, error: CommandcodeError | null): React.ReactNode {
  const fallback = renderErrorOrNoData(usage, error);
  if (fallback !== null) return fallback;
  const u = usage as CommandcodeUsage;
  const bar = limitBarText(u);
  const seconds = renewsInSeconds(u);

  return (
    <List.Item.Detail.Metadata>
      {u.plan ? <List.Item.Detail.Metadata.Label title="Plan" text={u.plan} /> : null}
      {bar ? (
        <>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Credit Limit" text={bar} />
          {seconds !== null ? (
            <LiveResetLabel seconds={seconds} />
          ) : u.daysRemaining !== undefined && u.daysRemaining !== null ? (
            <List.Item.Detail.Metadata.Label title="Resets In" text={`${u.daysRemaining}d`} />
          ) : null}
        </>
      ) : null}
      {u.creditsUsed !== undefined && u.creditsTotal !== undefined ? (
        <>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label
            title="Credits"
            text={`${formatCredits(u.creditsUsed)} of ${formatCredits(u.creditsTotal)}`}
          />
        </>
      ) : null}
      {u.creditsTotal !== undefined && u.creditsUsed === undefined ? (
        <>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="Credits" text={formatCredits(u.creditsTotal)} />
        </>
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

  const remaining = percentRemaining(usage);
  if (remaining !== null) {
    return {
      text: `${remaining.toFixed(0)}%`,
      tooltip:
        `${remaining.toFixed(1)}% remaining` +
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
