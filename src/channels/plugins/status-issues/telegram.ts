import type { ChannelAccountSnapshot, ChannelStatusIssue } from "../types.js";
import {
  appendMatchMetadata,
  asString,
  isRecord,
  resolveEnabledConfiguredAccountId,
} from "./shared.js";

type TelegramAccountStatus = {
  accountId?: unknown;
  enabled?: unknown;
  configured?: unknown;
  allowUnmentionedGroups?: unknown;
  audit?: unknown;
  probe?: unknown;
  running?: unknown;
  connected?: unknown;
  lastError?: unknown;
};

type TelegramGroupMembershipAuditSummary = {
  unresolvedGroups?: number;
  hasWildcardUnmentionedGroups?: boolean;
  groups?: Array<{
    chatId: string;
    ok?: boolean;
    status?: string | null;
    error?: string | null;
    matchKey?: string;
    matchSource?: string;
  }>;
};

type TelegramProbeSummary = {
  ok?: boolean;
  status?: number | null;
  error?: string | null;
};

function readTelegramAccountStatus(value: ChannelAccountSnapshot): TelegramAccountStatus | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    accountId: value.accountId,
    enabled: value.enabled,
    configured: value.configured,
    allowUnmentionedGroups: value.allowUnmentionedGroups,
    audit: value.audit,
    probe: value.probe,
    running: value.running,
    connected: value.connected,
    lastError: value.lastError,
  };
}

function readTelegramGroupMembershipAuditSummary(
  value: unknown,
): TelegramGroupMembershipAuditSummary {
  if (!isRecord(value)) {
    return {};
  }
  const unresolvedGroups =
    typeof value.unresolvedGroups === "number" && Number.isFinite(value.unresolvedGroups)
      ? value.unresolvedGroups
      : undefined;
  const hasWildcardUnmentionedGroups =
    typeof value.hasWildcardUnmentionedGroups === "boolean"
      ? value.hasWildcardUnmentionedGroups
      : undefined;
  const groupsRaw = value.groups;
  const groups = Array.isArray(groupsRaw)
    ? (groupsRaw
        .map((entry) => {
          if (!isRecord(entry)) {
            return null;
          }
          const chatId = asString(entry.chatId);
          if (!chatId) {
            return null;
          }
          const ok = typeof entry.ok === "boolean" ? entry.ok : undefined;
          const status = asString(entry.status) ?? null;
          const error = asString(entry.error) ?? null;
          const matchKey = asString(entry.matchKey) ?? undefined;
          const matchSource = asString(entry.matchSource) ?? undefined;
          return { chatId, ok, status, error, matchKey, matchSource };
        })
        .filter(Boolean) as TelegramGroupMembershipAuditSummary["groups"])
    : undefined;
  return { unresolvedGroups, hasWildcardUnmentionedGroups, groups };
}

function readTelegramProbeSummary(value: unknown): TelegramProbeSummary | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    ok: typeof value.ok === "boolean" ? value.ok : undefined,
    status: typeof value.status === "number" && Number.isFinite(value.status) ? value.status : null,
    error: asString(value.error) ?? null,
  };
}

function isAuthErrorSummary(errorText: string | undefined, status: number | null | undefined) {
  const normalized = errorText?.toLowerCase();
  return (
    status === 401 ||
    status === 403 ||
    normalized?.includes("unauthorized") === true ||
    normalized?.includes("invalid token") === true ||
    normalized?.includes("not authorized") === true ||
    normalized?.includes("bad request") === true
  );
}

function isNetworkErrorSummary(errorText: string | undefined, status: number | null | undefined) {
  if (status != null) {
    return false;
  }
  const normalized = errorText?.toLowerCase();
  if (!normalized) {
    return true;
  }
  return (
    normalized.includes("econnrefused") ||
    normalized.includes("econnreset") ||
    normalized.includes("enotfound") ||
    normalized.includes("eai_again") ||
    normalized.includes("etimedout") ||
    normalized.includes("net::err") ||
    normalized.includes("getaddrinfo") ||
    normalized.includes("network is down") ||
    normalized.includes("socket hang up") ||
    normalized.includes("fetch failed") ||
    normalized.includes("dns") ||
    normalized.includes("network") ||
    normalized.includes("timeout")
  );
}

function isDnsResolutionFailure(errorText: string | undefined): boolean {
  const normalized = errorText?.toLowerCase() ?? "";
  return (
    normalized.includes("could not resolve host") ||
    normalized.includes("enotfound") ||
    normalized.includes("eai_again") ||
    normalized.includes("getaddrinfo") ||
    normalized.includes("dns") ||
    normalized.includes("name or service not known") ||
    normalized.includes("temporarily unresolvable")
  );
}

function formatProbeIssueLabel(
  summary: TelegramProbeSummary,
  kindLabel: "auth" | "runtime",
): string {
  const status = summary.status != null ? ` (HTTP ${summary.status})` : "";
  if (summary.error) {
    return kindLabel === "auth"
      ? `Token validation failed${status}: ${summary.error}`
      : `${summary.error}${status}`;
  }
  return kindLabel === "auth" ? `Token validation failed${status}` : `Probe failed${status}`;
}

export function collectTelegramStatusIssues(
  accounts: ChannelAccountSnapshot[],
): ChannelStatusIssue[] {
  const issues: ChannelStatusIssue[] = [];
  for (const entry of accounts) {
    const account = readTelegramAccountStatus(entry);
    if (!account) {
      continue;
    }
    const accountId = resolveEnabledConfiguredAccountId(account);
    if (!accountId) {
      continue;
    }

    if (account.allowUnmentionedGroups === true) {
      issues.push({
        channel: "telegram",
        accountId,
        kind: "config",
        message:
          "Config allows unmentioned group messages (requireMention=false). Telegram Bot API privacy mode will block most group messages unless disabled.",
        fix: "In BotFather run /setprivacy → Disable for this bot (then restart the gateway).",
      });
    }

    const audit = readTelegramGroupMembershipAuditSummary(account.audit);
    if (audit.hasWildcardUnmentionedGroups === true) {
      issues.push({
        channel: "telegram",
        accountId,
        kind: "config",
        message:
          'Telegram groups config uses "*" with requireMention=false; membership probing is not possible without explicit group IDs.',
        fix: "Add explicit numeric group ids under channels.telegram.groups (or per-account groups) to enable probing.",
      });
    }
    if (audit.unresolvedGroups && audit.unresolvedGroups > 0) {
      issues.push({
        channel: "telegram",
        accountId,
        kind: "config",
        message: `Some configured Telegram groups are not numeric IDs (unresolvedGroups=${audit.unresolvedGroups}). Membership probe can only check numeric group IDs.`,
        fix: "Use numeric chat IDs (e.g. -100...) as keys in channels.telegram.groups for requireMention=false groups.",
      });
    }
    for (const group of audit.groups ?? []) {
      if (group.ok === true) {
        continue;
      }
      const status = group.status ? ` status=${group.status}` : "";
      const err = group.error ? `: ${group.error}` : "";
      const baseMessage = `Group ${group.chatId} not reachable by bot.${status}${err}`;
      issues.push({
        channel: "telegram",
        accountId,
        kind: "runtime",
        message: appendMatchMetadata(baseMessage, {
          matchKey: group.matchKey,
          matchSource: group.matchSource,
        }),
        fix: "Invite the bot to the group, then DM the bot once (/start) and restart the gateway.",
      });
    }

    const running = account.running === true;
    const connected = account.connected === true;
    const lastError = asString(account.lastError);
    if (running && !connected) {
      const isDnsIssue = isDnsResolutionFailure(lastError ?? "");
      issues.push({
        channel: "telegram",
        accountId,
        kind: "runtime",
        message: `Telegram runtime disconnected${lastError ? `: ${lastError}` : "."}`,
        fix: isDnsIssue
          ? "Restore DNS/network access from this host to api.telegram.org (or set channels.telegram.proxy / OPENCLAW_TELEGRAM_PROXY) and restart the gateway."
          : "Check Telegram API connectivity and token validity, then restart the gateway.",
      });
    }

    const probe = readTelegramProbeSummary(account.probe);
    if (probe && probe.ok === false) {
      const isAuthFailure = isAuthErrorSummary(probe.error ?? undefined, probe.status);
      if (isAuthFailure) {
        issues.push({
          channel: "telegram",
          accountId,
          kind: "auth",
          message: formatProbeIssueLabel(probe, "auth"),
          fix: "Update channels.telegram.* token from BotFather for this bot and restart the gateway.",
        });
        continue;
      }

      const isNetworkFailure = isNetworkErrorSummary(probe.error ?? undefined, probe.status);
      if (isNetworkFailure) {
        const isDnsFailure = isDnsResolutionFailure(probe.error ?? undefined);
        issues.push({
          channel: "telegram",
          accountId,
          kind: "runtime",
          message: `Telegram bot API probe is not reachable: ${formatProbeIssueLabel(probe, "runtime")}`,
          fix: isDnsFailure
            ? "Restore DNS/network access from this host to api.telegram.org (or set channels.telegram.proxy / OPENCLAW_TELEGRAM_PROXY)."
            : "Check gateway network/DNS egress to api.telegram.org and retry after connectivity is restored.",
        });
      } else {
        issues.push({
          channel: "telegram",
          accountId,
          kind: "runtime",
          message: `Telegram bot probe failed: ${formatProbeIssueLabel(probe, "runtime")}`,
          fix: "Verify the bot token and Telegram API access from the gateway host; restart gateway after any changes.",
        });
      }
    }
  }
  return issues;
}
