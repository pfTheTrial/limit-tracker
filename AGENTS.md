# Agent Coding Guidelines — Limit Tracker (Vicinae native extension)

This is a **Vicinae** native extension (launcher like Raycast, C++/React/QML) built with
TypeScript and React. It was forked from a Raycast extension but is **fully native to Vicinae**:
it uses **`@vicinae/api`** exclusively — never `@raycast/api` or `@raycast/utils`.

> ⚠️ **Windows 0.27.1 testing gotcha:** the app loads extensions from
> `Local\vicinae\data\extensions\` but `vici build`/`vici develop` write to
> `Roaming\vicinae\extensions\`. You must copy the built bundle to `Local\data\extensions` and
> remove it from `Roaming` (or the app lists it twice / not at all). See `WINDOWS-TEST.md`.
> Also: `package.json` must NOT have `"type": "module"` and must have an `"author"` field.

## Build / Test Commands

```bash
# Setup
npm install                 # Install deps (@vicinae/api, @bufbuild/protobuf, typescript)

# Build (writes to Roaming\vicinae\extensions\limit-tracker)
npm run build               # vici build
node node_modules/@vicinae/api/bin/run.js build   # same, explicit

# Type check + tests (no app needed)
npm run typecheck           # tsc --noEmit   (expect exit 0)
npm test                    # node --test --experimental-strip-types (expect 0 fail)

# Develop
npm run dev                 # vici develop  (watch; on Windows copy output to Local\data — see WINDOWS-TEST.md)
```

## Tech Stack

- **Framework**: Vicinae API (`@vicinae/api`) + React
- **Language**: TypeScript (strict mode)
- **Module**: CommonJS at runtime (esbuild `format: "cjs"`); `package.json` has **no** `"type": "module"`
- **Runtime tests**: Node test runner with `--experimental-strip-types`
- **Formatting**: Prettier (120 char width, double quotes)

## Code Style Guidelines

### Imports

- Use `@vicinae/api` for `List`, `Action`, `ActionPanel`, `Icon`, `LocalStorage`, `getPreferenceValues`,
  `showToast`, `environment`, `Image`, etc. **Never** `@raycast/api` / `@raycast/utils`.
- Specify the file extension for local imports (e.g. `.ts`, `.tsx`).
- Order: React/Vicinae imports first, then local modules.

### Formatting

- Line width: 120 characters, double quotes, 2-space indent, semicolons, trailing commas in multi-line.

### Types / Naming / React

- `strict: true`; explicit return types; avoid `any`.
- Components: PascalCase. Functions: camelCase. Files: camelCase or match component name.
- Functional components + hooks (`useState`/`useEffect`/`useCallback`/`useMemo`).

## Provider Architecture (core 8)

Supported providers: **claude, codex, copilot, cursor, deepseek, gemini, opencode-go, zai**.
(Phase-2 providers exist in repo but are not wired in the command registry.)

- List-view registry: `src/agent-usage.tsx` → `AGENT_REGISTRY` (keyed by `CoreAgentId`). Keep in sync
  with `AgentUsageById`, `AgentErrorById`, preferences in `package.json`, and the menu-bar command.
- Menu-bar command: `src/agent-usage-menubar.tsx` (separate wiring; add providers there too if they
  should appear in the menu bar).
- Each provider keeps `fetcher`, `renderer`, `types` separate. `fetcher`/`parser` must NOT import
  `@vicinae/api` or `src/agents/hooks.ts` (breaks Node test runner). Hook wiring + preference reads +
  caching live in `src/agents/provider-hooks.ts` and `src/agents/hooks.ts`.
- Multi-account providers (codex, zai) use `src/accounts` storage/types and expose account-aware hooks
  (`useCodexAccounts`, `useZaiAccounts`).

## Live UI Notes

- **Countdown "Resets In"** is live: `src/agents/countdown.tsx` → `LiveResetLabel` (React timer,
  formats days/hours/minutes, no seconds). Claude: `resetsInSeconds` derived in `claude/fetcher.ts`
  from the API `resets_at` ISO. Codex: `resetsInSeconds` already in API payload.
- **Progress ring** in list rows: `generatePieIcon` in `src/agents/ui.tsx` (SVG data-URI; local
  replacement for `@raycast/utils` `getProgressIcon`).
- **Claude model windows** render as sub-sections in the Detail (`modelWindows`).
- **Codex reset-credit bank** (`resetCredits`) renders in the Detail as "Limit Reset Credits".

## File Organization

```
src/
  agent-usage.tsx          # Main list-view command (AGENT_REGISTRY)
  agent-usage-menubar.tsx  # Menu bar command
  accounts/                # Multi-account storage, types, management UI
  agents/
    types.ts               # Shared agent types (AgentDefinition, UsageState, CoreAgentId, LimitView)
    ui.tsx                 # Detail/Accessory helpers (error/loading/empty, generatePieIcon, getListIcon)
    countdown.tsx          # LiveResetLabel (live "Resets In" countdown)
    format.ts              # Shared usage formatting (formatDuration, formatClock, formatResetTime)
    hooks.ts               # Shared cached-hook factories (TTL cache)
    provider-hooks.ts      # All provider hook wirings (fetchers + auth + preferences)
    usage-cache.ts         # Pure cache-payload helpers (tested)
    http.ts, jwt.ts        # Shared HTTP / JWT helpers
  claude/  codex/  copilot/  cursor/  deepseek/  gemini/  opencode-go/  zai/   # per-provider fetcher/renderer/types
  **/*.test.ts             # Node test-runner tests colocated with modules
assets/                    # SVG/PNG icons (referenced by manifest `icon` + command `icon`)
WINDOWS-TEST.md            # How to run/validate on Windows 0.27.1 (read this before testing on Windows)
LINUX-TEST.md              # How to validate on Linux (Arch + niri) — preferred runtime path
```

## Minimal Changes Principle

- Minimize edits to other modules; prefer editing existing files over creating new ones.
- Keep PRs focused on single concerns.
- When adding a provider, update BOTH `agent-usage.tsx` and `agent-usage-menubar.tsx` registries,
  the `package.json` preferences, and `types.ts` (`AgentVisibilityPreferences`, `AgentUsageById`, etc.).
