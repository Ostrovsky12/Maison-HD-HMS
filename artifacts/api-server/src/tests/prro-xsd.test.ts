import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateAgainstOfficialDpsXsd } from "../services/prro-xsd.js";

let directory: string | undefined;

afterEach(async () => {
  delete process.env.PRRO_DPS_CHECK_XSD;
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("official DPS XSD gate", () => {
  it("uses XSD validation rather than accepting well-formed XML only", async () => {
    directory = await mkdtemp(join(tmpdir(), "prro-xsd-"));
    const path = join(directory, "check.xsd");
    await writeFile(path, `<?xml version="1.0"?>
      <xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <xs:element name="CHECK"><xs:complexType><xs:sequence>
          <xs:element name="HEAD" type="xs:string"/>
        </xs:sequence></xs:complexType></xs:element>
      </xs:schema>`);
    process.env.PRRO_DPS_CHECK_XSD = path;
    await expect(validateAgainstOfficialDpsXsd("<CHECK><HEAD>ok</HEAD></CHECK>", "sale"))
      .resolves.toBeUndefined();
    await expect(validateAgainstOfficialDpsXsd("<CHECK><BODY>wrong</BODY></CHECK>", "sale"))
      .rejects.toThrow("DPS XSD validation failed");
  });
});