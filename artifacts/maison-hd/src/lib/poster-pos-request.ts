export type PosterPosRequest = (path: string, opts?: RequestInit) => Promise<any>;

export async function requestPosterPos(
  request: PosterPosRequest,
  opts: RequestInit = {},
  timeoutMs = 20000,
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(opts.method === "PUT"
        ? "Сервер не відповів вчасно. Результат зміни невідомий; код міг бути створений. За потреби створіть новий код — він замінить попередній."
        : "Не вдалося отримати стан каси вчасно. Натисніть «Оновити стан каси»."));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      request("/poster/pos-notifications", { ...opts, signal: controller.signal }),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function readPosterPairingCode(result: { pairingCode?: unknown }) {
  if (typeof result.pairingCode !== "string" || !/^[1-9]\d*\.[a-f0-9]{64}$/.test(result.pairingCode)) {
    throw new Error("Сервер не повернув повний код підключення. Оновіть стан каси та створіть новий код.");
  }
  return result.pairingCode;
}
