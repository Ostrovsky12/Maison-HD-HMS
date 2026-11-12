import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Explicit canonical URL obtained through deployment metadata, never REPLIT_DOMAINS.
const origin = new URL(process.argv[2] || "");
if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
  throw new Error("Supply the verified HTTPS production origin, with no path or credentials.");
}
const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = await readFile(new URL("./terminal.js", import.meta.url), "utf8");
const out = path.join(workspace, "generated-artifacts/poster-pos");
await mkdir(out, { recursive: true });
await writeFile(path.join(out, "bundle.js"), source.replace("__MAISON_POS_ORIGIN__", origin.origin));
console.info("Poster POS bundle prepared under generated-artifacts/poster-pos; no upload performed.");
