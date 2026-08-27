# Loading & testing a Vicinae extension in the running Windows app

Discovered 2026-08-26 while getting `vicinae-notes` to actually run on Windows
(alpha build). The static checks (`tsc`, `vici build`) pass, but the app does
NOT auto-load an extension installed while the server is already running.

## Where things live (Windows)
- Server / backend: `%LOCALAPPDATA%\\Programs\\Vicinae\\bin\\vicinae-server.exe`
  (run it in background; it stays alive as a daemon).
- UI toggle hint from the log: `Call \"vicinae toggle\" to toggle the window`.
- Extension install dir (0.27.x): `%LOCALAPPDATA%\\Vicinae\\data\\extensions\\<name>\\`
  (note: `data`, NOT `Roaming\\vicinae\\extensions` like the 0.8.5 era).
- Extension-manager log: `%LOCALAPPDATA%\\Vicinae\\state\\vicinae.log`

## ⚠️ CRITICAL 0.27.1 path mismatch (the #1 "extension does not appear" cause)

`vici build` and `vici develop` write the bundle to:
```
%APPDATA%\\vicinae\\extensions\\<name>\\   (Roaming)
```
But the **app 0.27.1 reads extensions from**:
```
%LOCALAPPDATA%\\vicinae\\data\\extensions\\<name>\\   (Local\\data)
```
These are DIFFERENT directories. The app registers the dev session (log shows
`Start extension development session for "<name>"`) but never copies the bundle
to where it actually loads → the extension does not appear in search.

**Reliable fix (Windows 0.27.1):** after building, copy the bundle to `Local\\data`
and REMOVE it from `Roaming` (or the app lists it TWICE — see Armadilha 3):
```bash
# build (writes to Roaming)
node node_modules/@vicinae/api/bin/run.js build
# copy to where the app actually loads
rm -rf "$LOCALAPPDATA/vicinae/data/extensions/<name>"
cp -r  "$APPDATA/vicinae/extensions/<name>" "$LOCALAPPDATA/vicinae/data/extensions/<name>"
# remove from Roaming to avoid duplicate listing
rm -rf "$APPDATA/vicinae/extensions/<name>"
```
`$APPDATA` = `C:\\Users\\<you>\\AppData\\Roaming`
`$LOCALAPPDATA` = `C:\\Users\\<you>\\AppData\\Local`

`vici develop` on Windows 0.27.1 registers the session but does NOT make the
command appear in the UI — only the manual copy above does. On Linux/macOS the
`vici develop` flow works directly.

## Two ways to get the extension to load
1. **`vici develop` (preferred for dev).** Run it from the project dir:
   ```
   npx vici develop
   ```
   It registers a dev session — the log shows
   `Refreshing extension development for "<name>"` then
   `Start extension development session for "<name>"`. The extension is now
   known to the app; invoke its command from the search bar to spin up its
   worker. **PITFALL:** `vici develop` is a long-lived watcher. Do NOT wrap it
   in `timeout` or `&`/nohup — it gets killed (exit 124) and the session is
   lost. Launch it as a background terminal process and leave it running.
   **Windows 0.27.1 caveat:** even after `vici develop`, you still need the
   Roaming→Local/data copy above for the command to appear in search.
2. **Restart the server.** If `vici develop` isn't used, kill `vicinae-server.exe`
   (`taskkill /IM vicinae-server.exe /F`) and relaunch it; the extension
   manager discovers installed extensions at startup ("Started extension
   manager ...", then "Loaded extension <name>" / dev session lines).

## Validate with the log
```
grep -i "Loaded extension\|Start extension development session\|Refreshing extension development\|extension manager\|exited with code" "%LOCALAPPDATA%\\Vicinae\\state\\vicinae.log"
```
- "Loaded extension <name>" / dev-session lines = success.
- `Worker <name> exited with code 1` AFTER `Unloaded extension <name>` = NORMAL
  worker teardown (command closed / navigated away). It is NOT a crash. The
  limit-tracker extension shows the same `exited with code 1` line with no error
  preceding it. A REAL crash shows `error - Got crash "..."` or `Worker ... exited
  with code 1` with a stack/error ABOVE it (e.g. `module is not defined`,
  `Could not find package.json`). Only treat `exited with code 1` as failure if an
  `error -` line for that extension appears first.
- A real load failure looks like:
  `error - Failed to load bundle ... "Could not find package.json"` (stale/incomplete build)
  or `error - Got crash "ReferenceError: module is not defined..."` (package.json has
  `"type":"module"`, or bundle in wrong dir).
- A DIFFERENT extension erroring (e.g. `limit-tracker`: `module is not defined
  in ES module scope` because its `package.json` has `"type":"module"` but code
  uses `module`) is NOT your extension — don't chase it.

## `vici lint`
```
npx vici lint      # -> "ready - Manifest is valid"  (validates package.json schema)
```

## What NOT to wait on
The periodic `Scanning apps again, following a directory change...` line is the
system-app scanner (~every 5 min). It does NOT load extensions — don't block on
it. Touching a file inside the extension dir also does not trigger a reload; use
`vici develop` or a server restart.

## Acceptance bar
Runtime load (dev session or "Loaded extension") is the real bar. If you can't
invoke the command in the app, say so — don't claim it "runs".
