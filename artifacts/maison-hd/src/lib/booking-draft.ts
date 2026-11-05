import { useCallback, useEffect, useRef, useState } from "react";
import type { BookingDraftInput } from "@workspace/api-client-react";

export const BOOKING_DRAFT_NOTICE = "Контактні дані та ваш вибір зберігаються автоматично під час заповнення. Якщо ви не завершите бронювання, готель може зв’язатися з вами, щоб допомогти. Чернетка не резервує номер. Дані журналу зберігаються до 90 днів.";
type Details = Omit<BookingDraftInput, "token" | "revision" | "noticeVersion">;

export function useBookingDraft(slug: string, api: string, enabled: boolean, details: Details) {
  const identity = useRef({ slug: "", token: "" });
  if (identity.current.slug !== slug) {
    let token = "";
    try {
      token = sessionStorage.getItem(`booking-draft:${slug}`) || crypto.randomUUID();
      sessionStorage.setItem(`booking-draft:${slug}`, token);
    } catch { token = crypto.randomUUID(); }
    identity.current = { slug, token };
  }
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const revision = useRef(Date.now());
  const latest = useRef({ enabled, details, fingerprint: JSON.stringify(details) });
  latest.current = { enabled, details, fingerprint: JSON.stringify(details) };
  const saved = useRef("");
  const sent = useRef(false);
  const submitted = useRef(false);
  const flush = useCallback(async () => {
    const current = latest.current;
    if (submitted.current || !current.enabled || current.fingerprint === saved.current
      || (!sent.current && ![current.details.guestName, current.details.phone, current.details.email].some(value => value.trim().length >= 2))) return;
    sent.current = true;
    const fingerprint = current.fingerprint;
    revision.current = Math.max(Date.now(), revision.current + 1);
    setSaveState("saving");
    try {
      const response = await fetch(`${api}/booking-engine/${encodeURIComponent(slug)}/draft`, {
        method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ ...current.details, token: identity.current.token, revision: revision.current, noticeVersion: "booking-draft-v1" }),
      });
      if (!response.ok) throw new Error("draft_save_failed");
      // Never let an older response claim that newer edits have been saved.
      if (fingerprint === latest.current.fingerprint) { saved.current = fingerprint; setSaveState("saved"); }
    } catch { if (fingerprint === latest.current.fingerprint) setSaveState("error"); }
  }, [slug, api]);
  const fingerprint = latest.current.fingerprint;
  useEffect(() => {
    if (!enabled) return;
    const debounce = window.setTimeout(() => { void flush(); }, 900);
    return () => clearTimeout(debounce);
  }, [enabled, fingerprint, flush]);
  useEffect(() => {
    if (!enabled) return;
    const hide = () => { if (document.visibilityState === "hidden") void flush(); };
    const leave = () => { void flush(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    window.addEventListener("online", leave);
    const retry = window.setInterval(leave, 15000);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("online", leave);
      clearInterval(retry);
    };
  }, [enabled, flush]);
  const markSubmitted = () => {
    submitted.current = true;
    try { sessionStorage.removeItem(`booking-draft:${slug}`); } catch { /* storage may be unavailable */ }
  };
  return { token: identity.current.token, flush, saveState, markSubmitted };
}
