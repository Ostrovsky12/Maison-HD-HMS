import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

// External production change: run ONLY after explicit user approval.
// Deliberately does not build or print credentials, signature, or provider bodies.
if (!process.argv.includes("--confirm-live-upload")) throw new Error("Explicit live-upload confirmation is required.");
const applicationId = process.argv.find(a => /^--application-id=\d+$/.test(a))?.split("=")[1];
const secret = process.env.POSTER_POS_APPLICATION_SECRET;
if (!applicationId || !secret) throw new Error("Application ID and configured secret are required.");
const bytes = await readFile(new URL("../../../generated-artifacts/poster-pos/bundle.js", import.meta.url));
if (bytes.includes(Buffer.from("__MAISON_POS_ORIGIN__"))) throw new Error("Build the bundle first.");
const md5 = b => createHash("md5").update(b).digest("hex");
const sign = md5(`${applicationId}:${md5(bytes)}:${secret}`);
const form = new FormData();
form.append("application_id", applicationId);
form.append("sign", sign);
form.append("bundle", new Blob([bytes], { type: "application/javascript" }), "bundle.js");
let response;
try {
  response = await fetch("https://platform.joinposter.com/api/application.uploadPOSPlatformBundle?format=json",
    { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
} catch { throw new Error("Upload result unknown. Check the installed version in Poster before retrying."); }
let result;
try { result = await response.json(); } catch { throw new Error("Upload confirmation unreadable; verify in Poster before retrying."); }
if (!response.ok || result?.error || result?.error_code) throw new Error("Poster did not confirm upload. Check application permissions and configuration.");
if (result?.response !== true && result?.response !== 1 && result?.response?.success !== true && result?.success !== true) {
  throw new Error("Unexpected upload response; verify the application version in Poster before retrying.");
}
console.info("Poster confirmed the bundle upload. Restart the register to load it.");
