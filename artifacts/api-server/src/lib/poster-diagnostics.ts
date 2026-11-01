import type { PosterDispatchDiagnostic } from "@workspace/api-zod";

export type PosterDiagnostic = PosterDispatchDiagnostic;

// Fixed identifiers only: never copy a provider URL or arbitrary message here.
const operations = new Set([
  "menu.getProducts", "dash.getTransaction", "spots.getSpots", "spots.getTableHallTables",
  "access.getTablets", "access.getEmployees", "transactions.createTransaction",
  "transactions.changeComment", "transactions.addTransactionProduct",
  "transactions.changeTransactionProductCount",
]);

export function posterCode(value: unknown): number | undefined {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d{1,9}$/.test(value))) return;
  const code = Number(value);
  return Number.isSafeInteger(code) && code >= 0 && code <= 999999999 ? code : undefined;
}

export function providerErrorCode(body: any): number | undefined {
  for (const value of [body?.error?.code, body?.error_code, body?.response?.err_code, body?.error]) {
    const code = posterCode(value);
    if (code !== undefined && code > 0) return code;
  }
  return undefined;
}

function recommendation(outcome: PosterDiagnostic["outcome"], code?: number, http?: number): string {
  if (outcome === "uncertain") return "Спочатку звірте рахунок у Poster. Повторне надсилання заборонене, доки результат попереднього запиту не встановлено.";
  // Codes documented at dev.joinposter.com/en/docs/v3/web/errors.
  if ([10, 11, 12].includes(code ?? -1) || http === 401) return "Перевірте чинність збереженого підключення Poster у налаштуваннях закладу. Не надсилайте токен у чат.";
  if (code === 20) return "Застосунок не має дозволу на цю операцію Poster. Перевірте доступ інтеграції до зазначеного методу.";
  if ([54, 153].includes(code ?? -1) || http === 403) return "Poster заборонив доступ або зміни. Перевірте права інтеграції та обраного працівника.";
  if ([32, 404].includes(code ?? -1)) return "Об’єкт не знайдено в Poster. Перевірте зіставлення закладу, каси, столу та страви.";
  if ([34, 36, 50, 400, 701].includes(code ?? -1)) return "Poster відхилив параметри запиту. Передайте адміністратору код і назву операції для перевірки інтеграції.";
  if (code === 700 || http === 429) return "Досягнуто ліміт запитів Poster. Дочекайтеся його відновлення; автоматичного повтору запису немає.";
  if (outcome === "unavailable") return "Не вдалося підтвердити відповідь Poster. Перевірте з’єднання й оновіть статус, не створюючи повторного рахунку.";
  return "Передайте адміністратору код і назву операції. Причину ще не встановлено; не повторюйте надсилання навмання.";
}

export function posterDiagnostic(
  operation: string, outcome: PosterDiagnostic["outcome"], httpStatus?: unknown, providerCode?: unknown,
): PosterDiagnostic {
  const http = typeof httpStatus === "number" && Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? httpStatus : undefined;
  const code = posterCode(providerCode);
  return {
    operation: operations.has(operation) ? operation as PosterDiagnostic["operation"] : "unknown",
    outcome,
    ...(http !== undefined ? { httpStatus: http } : {}),
    ...(code !== undefined && code > 0 ? { providerCode: code } : {}),
    recommendation: recommendation(outcome, code, http),
  };
}

/** Reconstruct even persisted diagnostics, dropping extra keys and untrusted text. */
export function visiblePosterDiagnostic(value: unknown): PosterDiagnostic | undefined {
  if (!value || typeof value !== "object") return;
  const d = value as Record<string, unknown>;
  if (!["rejected", "uncertain", "unavailable"].includes(String(d.outcome))) return;
  return posterDiagnostic(
    typeof d.operation === "string" ? d.operation : "unknown",
    d.outcome as PosterDiagnostic["outcome"], d.httpStatus, d.providerCode,
  );
}

export class PosterWriteError extends Error {
  constructor(message: string, public uncertain = false, public diagnostic?: PosterDiagnostic) {
    super(message);
    this.name = "PosterWriteError";
  }
}
