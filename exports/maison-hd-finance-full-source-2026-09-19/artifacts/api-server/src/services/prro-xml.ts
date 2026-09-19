export type PrroDocumentKind = "open_shift" | "sale" | "refund" | "x_report" | "z_report";

export interface PrroXmlLine {
  name: string;
  quantity: number;
  unitPrice: number;
  taxCode?: string;
  productCode?: string;
  unitName?: string;
}

export interface PrroXmlInput {
  kind: PrroDocumentKind;
  fiscalNumber: string;
  localNumber: number;
  occurredAt: Date;
  sellerTaxId: string;
  sellerName: string;
  locationName: string;
  locationAddress: string;
  deviceId: string;
  cashierName: string;
  totalAmount: number;
  paymentChannel: string;
  lines: PrroXmlLine[];
  previousHash?: string | null;
}

const money = (value: number) => value.toFixed(2);
const quantity = (value: number) => Number(value.toFixed(3)).toString();
const esc = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll("\"", "&quot;").replaceAll("'", "&apos;");
const element = (name: string, value: unknown) => `<${name}>${esc(value)}</${name}>`;
function kyivParts(value: Date): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(value).map(part => [part.type, part.value]));
}
const date = (value: Date) => {
  const p = kyivParts(value);
  return `${p.year}${p.month}${p.day}`;
};
const time = (value: Date) => {
  const p = kyivParts(value);
  return `${p.hour}${p.minute}${p.second}`;
};

function checkType(kind: PrroDocumentKind): number {
  if (kind === "refund") return 1;
  if (kind === "open_shift") return 108;
  if (kind === "x_report") return 6;
  return 0;
}

function paymentCode(channel: string): number {
  return channel === "cash" ? 0 : 1;
}

export function buildPrroXml(input: PrroXmlInput): string {
  if (!Number.isFinite(input.totalAmount) || input.totalAmount < 0 ||
      input.lines.some(line => !line.name || !Number.isFinite(line.quantity) || line.quantity <= 0 ||
        !Number.isFinite(line.unitPrice) || line.unitPrice < 0)) {
    throw new Error("DPS XML schema: invalid monetary or line value");
  }
  if (input.kind === "sale" || input.kind === "refund") {
    const linesTotal = input.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    if (Math.abs(linesTotal - input.totalAmount) > 0.005) {
      throw new Error("DPS XML schema: line total does not match document total");
    }
  }
  if (input.kind === "z_report") return buildZReportXml(input);
  const body = input.lines.map((line, index) => {
    const cost = line.quantity * line.unitPrice;
    return `<ROW ROWNUM="${index + 1}">${element("CODE", line.productCode ?? index + 1)}${element("NAME", line.name)}${element("UNITCD", 2009)}${element("UNITNM", line.unitName ?? "шт")}${element("AMOUNT", quantity(line.quantity))}${element("PRICE", money(line.unitPrice))}${element("COST", money(cost))}${line.taxCode ? element("LETTERS", line.taxCode) : ""}</ROW>`;
  }).join("");
  const xml = `<?xml version="1.0" encoding="windows-1251"?><CHECK CT="${checkType(input.kind)}"><HEAD>${element("TIN", input.sellerTaxId)}${element("ORGNM", input.sellerName)}${element("POINTNM", input.locationName)}${element("POINTADDR", input.locationAddress)}${element("ORDERDATE", date(input.occurredAt))}${element("ORDERTIME", time(input.occurredAt))}${element("ORDERNUM", input.localNumber)}${element("CASHDESKNUM", input.deviceId)}${element("CASHREGISTERNUM", input.fiscalNumber)}${element("CASHIER", input.cashierName)}${input.previousHash ? element("MAC", input.previousHash) : ""}${element("VER", 1)}</HEAD>${body ? `<BODY>${body}</BODY>` : ""}<PAY><ROW ROWNUM="1">${element("PAYFORMCD", paymentCode(input.paymentChannel))}${element("PAYFORMNM", input.paymentChannel === "cash" ? "ГОТІВКА" : "БЕЗГОТІВКОВА")}${element("SUM", money(input.totalAmount))}</ROW></PAY><TOTAL>${element("SUM", money(input.totalAmount))}</TOTAL></CHECK>`;
  validatePrroXml(xml, input.kind);
  return xml;
}

function buildZReportXml(input: PrroXmlInput): string {
  const xml = `<?xml version="1.0" encoding="windows-1251"?><ZREPORT><ZREPHEAD>${element("TIN", input.sellerTaxId)}${element("ORGNM", input.sellerName)}${element("POINTNM", input.locationName)}${element("POINTADDR", input.locationAddress)}${element("ORDERDATE", date(input.occurredAt))}${element("ORDERTIME", time(input.occurredAt))}${element("ORDERNUM", input.localNumber)}${element("CASHDESKNUM", input.deviceId)}${element("CASHREGISTERNUM", input.fiscalNumber)}${element("CASHIER", input.cashierName)}${input.previousHash ? element("MAC", input.previousHash) : ""}${element("VER", 1)}</ZREPHEAD><ZREPREALIZ>${element("SUM", money(input.totalAmount))}</ZREPREALIZ></ZREPORT>`;
  validatePrroXml(xml, input.kind);
  return xml;
}

/**
 * Enforces the mandatory structure from the DPS RRO data-transfer protocol
 * before a document reaches the signer or gRPC transport.
 */
export function validatePrroXml(xml: string, kind: PrroDocumentKind): void {
  const root = kind === "z_report" ? "ZREPORT" : "CHECK";
  if (!xml.startsWith("<?xml version=\"1.0\" encoding=\"windows-1251\"?>") ||
      !xml.includes(`<${root}`) || !xml.endsWith(`</${root}>`)) {
    throw new Error(`DPS XML schema: invalid ${root} root`);
  }
  const required = kind === "z_report"
    ? ["TIN", "ORGNM", "ORDERDATE", "ORDERTIME", "ORDERNUM", "CASHREGISTERNUM", "SUM"]
    : ["TIN", "ORGNM", "ORDERDATE", "ORDERTIME", "ORDERNUM", "CASHREGISTERNUM", "PAYFORMCD", "SUM"];
  for (const tag of required) {
    if (!new RegExp(`<${tag}>[^<]+</${tag}>`).test(xml)) {
      throw new Error(`DPS XML schema: ${tag} is required`);
    }
  }
  if (kind === "open_shift" && !xml.includes("<CHECK CT=\"108\">")) {
    throw new Error("DPS XML schema: shift opening must use CT=108");
  }
  if ((kind === "sale" || kind === "refund") && !xml.includes("<BODY>")) {
    throw new Error("DPS XML schema: fiscal receipt body is required");
  }
}