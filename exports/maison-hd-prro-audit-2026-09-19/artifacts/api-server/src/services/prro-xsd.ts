import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateXML } from "xmllint-wasm";
import type { PrroDocumentKind } from "./prro-xml.js";

const schemas = new Map<string, string>();

async function schema(path: string): Promise<string> {
  const cached = schemas.get(path);
  if (cached) return cached;
  const value = await readFile(path, "utf8");
  schemas.set(path, value);
  return value;
}

export async function validateAgainstOfficialDpsXsd(xml: string, kind: PrroDocumentKind): Promise<void> {
  const bundled = fileURLToPath(new URL(
    kind === "z_report" ? "./schemas/dps-zreport.xsd" : "./schemas/dps-check.xsd",
    import.meta.url,
  ));
  const path = kind === "z_report"
    ? process.env.PRRO_DPS_ZREPORT_XSD || bundled
    : process.env.PRRO_DPS_CHECK_XSD || bundled;
  const result = await validateXML({
    xml: [{ fileName: "document.xml", contents: xml }],
    schema: [await schema(path)],
  });
  if (!result.valid) {
    throw new Error(`DPS XSD validation failed: ${result.errors.map(error => error.message).join("; ")}`);
  }
}