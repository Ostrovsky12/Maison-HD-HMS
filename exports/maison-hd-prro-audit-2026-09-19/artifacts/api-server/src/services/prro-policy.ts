export const PRRO_POLICY_VERSION = "2026-09-12.1";

export type FiscalPolicyInput = {
  itemKind: "goods" | "service" | "mixed";
  paymentChannel: "cash" | "pos_card" | "online_card" | "iban_transfer" | "remote_banking" | "money_transfer_service";
  exclusivelyRemoteServicePayments?: boolean;
  exemptionAuthority?: "individual_tax_consultation" | "statutory";
  exemptionReference?: string;
};

export type FiscalPolicyDecision = {
  decision: "fiscalize" | "exempt" | "manual_review";
  code: string;
  reason: string;
  version: string;
};

export function decideFiscalization(input: FiscalPolicyInput): FiscalPolicyDecision {
  const result = (decision: FiscalPolicyDecision["decision"], code: string, reason: string): FiscalPolicyDecision => ({
    decision, code, reason, version: PRRO_POLICY_VERSION,
  });

  if (input.paymentChannel === "iban_transfer") {
    return result("exempt", "BANK_TRANSFER_IBAN", "Переказ на поточний рахунок IBAN не класифіковано як розрахункову операцію.");
  }

  if (
    input.itemKind === "service" &&
    input.exclusivelyRemoteServicePayments &&
    ["remote_banking", "money_transfer_service"].includes(input.paymentChannel)
  ) {
    if (!input.exemptionAuthority || !input.exemptionReference) {
      return result("manual_review", "REMOTE_SERVICE_EVIDENCE_REQUIRED", "Для нефіскалізації дистанційної оплати послуги потрібна задокументована правова підстава.");
    }
    return result("exempt", "LAW_265_ARTICLE_9_CLAUSE_14", "Оплата послуги проводиться виключно через дозволений дистанційний канал і має задокументовану підставу.");
  }

  if (input.paymentChannel === "online_card") {
    return result("manual_review", "ONLINE_ACQUIRING_REVIEW", "Інтернет-еквайринг карткою потребує перевірки конкретної платіжної схеми та правової підстави.");
  }

  return result("fiscalize", "SETTLEMENT_OPERATION", "Операція підлягає фіскалізації за вибраним способом розрахунку.");
}