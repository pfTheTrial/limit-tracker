import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
function discover(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? discover(path) : entry.isFile() && entry.name.endsWith(".test.ts") ? [path] : [];
  });
}
const files = discover(join(root, "src")).sort();
if (!files.length) throw new Error("No test files discovered; refusing an empty test run.");
console.log(`Running ${files.length} test files`);
const result = spawnSync(process.execPath, ["--test", "--experimental-strip-types", ...files], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
