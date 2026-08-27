# Vicinae extension — submission & review

Verified against `github.com/vicinaehq/extensions` README and the
`skills/extension-reviewer/rules.json` catalog (version 3).

## Submission flow

1. **Fork** `github.com/vicinaehq/extensions`.
2. Add your extension under `extensions/<your-extension>/` (same structure as
   `extensions/bluetooth/`, `extensions/bitwarden/`, etc.).
3. Commit source + `package-lock.json` + `assets/` + `README.md` + `LICENSE`.
4. Open a **pull request** with a clear description (what it does, supported
   platforms, credentials it needs).
5. **CI runs** (deterministic checks: manifest schema, required fields, asset
   references, `package-lock.json` presence, `vici lint`).
6. **Human review** runs the semantic rule catalog (`rules.json`).
7. **Merge** → extension is auto-built, validated, and published to the store.
8. You are credited as a contributor of the extensions repo.

## CI-enforced requirements (do NOT skip)

- Extension directory + manifest schema validation.
- Required manifest fields, commands, categories, valid asset references.
- **Presence and consistency of `package-lock.json`** — run `npm install` and
  commit it; a missing lockfile blocks merge.
- Static extension validation, including `vici lint`.
- File-shape / generated-file / repository checks.

A PR is ready for human review only after CI passes AND semantic review has no
blocking findings.

## Semantic review rules (rules.json v3) — summary

Rules a reviewer applies to your code. Severities: **blocking** (must fix),
**warning** (real problem, may not block), **suggestion** (improvement).

| Rule ID | Title | What it catches | Severity |
|---|---|---|---|
| MANIFEST-001 | Manifest does not match behavior | Title/description/commands misrepresent what the code does | warning (blocking if obvious) |
| DEPENDENCY-001 | Dependency choice does not match implementation | Unused, powerful, incoherent, redundant deps | warning |
| ASSET-001 | Asset does not match stated purpose | Deceptive, executable, unauditable, or unexplained generated assets | warning |
| SECURITY-001 | Unsafe downloaded executable | Arbitrary downloaded binaries | **blocking** |
| SECURITY-002 | Command or code injection | Uncontrolled value altering executable syntax | **blocking** |
| SECURITY-003 | Credential or sensitive-data exposure | Credentials embedded/logged/sent to unrelated services | **blocking** |
| PROCESS-001 | Unsafe or unjustified native process | Spawned programs with no clear purpose | warning |
| API-001 | Environment-specific behavior duplicates @vicinae/api | You hand-rolled something `@vicinae/api` already provides | **blocking** |
| NETWORK-001 | Suspicious or deceptive network usage | Unrelated/suspicious endpoints, concealed exfiltration | **blocking** |
| UX-001 | Missing actionable error feedback | Operational failures with no useful feedback | warning |
| UX-002 | Missing loading or empty-state feedback | No observable loading/empty/success/failed states | warning |
| UX-003 | Non-English user-facing text | Hard-coded UI strings in non-English (unless content/data/proper noun) | **blocking** |
| CORRECTNESS-001 | Material logic error | Core behavior produces wrong results in common usage | **blocking** |
| FUNCTIONALITY-001 | Duplicates native Vicinae functionality | Obvious replica of built-in feature with no added value | **blocking** |
| QUALITY-001 | Obfuscated/minified/dead/generated code | Source that can't be audited, dead paths, dev blocks | warning |
| DECEPTION-001 | Behavior does not match presentation | Misleading names, hidden behavior, concealed execution | **blocking** |

## Pre-submission checklist

Before opening the PR, verify:

- [ ] `package-lock.json` committed (CI requires it).
- [ ] `LICENSE` file present (MIT recommended).
- [ ] `README.md` accurate (command names match manifest, preferences listed).
- [ ] `.gitignore` present (node_modules, build output, OS paths).
- [ ] No dead code: remove or move to `phase-2/` any provider not in the registry.
- [ ] Dependencies minimal: only `@vicinae/api` in `dependencies` (remove
  `@bufbuild/protobuf`, `undici` if not directly imported — `@vicinae/api`
  resolves those internally).
- [ ] All user-facing strings in English (UX-003).
- [ ] No `eval`, dynamic `Function`, or shell construction from remote data
  (SECURITY-002).
- [ ] Credentials read from system keychain / Secret Service / platform stores,
  never embedded in source (SECURITY-003).
- [ ] `npm run typecheck` clean, `npm test` 0 failures, `npm run build` succeeds.
- [ ] Manifest `title` distinct from command `title` (avoid "Name Name" in search).

## Real example: Limit Tracker submission prep

What we had to fix to be review-ready:
1. Removed `claudeLimitView` / `codexLimitView` dropdowns (z-index bug in
   Vicinae 0.27.1 settings UI — not fixable in extension code).
2. Removed `pinnedProviders` textfield (user preference).
3. Changed command `title` from "Limit Tracker" to "Usage" (avoid duplication).
4. Created custom SVG icon (`assets/limit-tracker-icon.svg`).
5. Added `Hide This Provider` action (⌘H) — persists in LocalStorage.
6. Added refresh debounce + cooldown (10s global, 1.5s between providers) to
   prevent HTTP 429.
7. Still needed before PR: `.gitignore`, `LICENSE`, `package-lock.json`,
   move phase-2 providers out of `src/`, update README.
