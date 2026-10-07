import { useState, type FormEvent } from "react";
import type { Lang } from "./content";
import { content } from "./content";

type Status = "idle" | "pending" | "error" | "success";

export function ContactForm({ lang, apiUrl }: { lang: Lang; apiUrl: string }) {
  const f = content[lang].form;
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");
  const [v, setV] = useState({ name: "", email: "", phone: "", company: "", message: "" });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (status === "pending") return;
    const d = { name: v.name.trim(), email: v.email.trim(), phone: v.phone.trim(), company: v.company.trim(), message: v.message.trim() };
    if (!d.name || !d.email || !d.company || !d.message) { setMsg(f.req); setStatus("error"); return; }
    if (!/^\S+@\S+\.\S+$/.test(d.email)) { setMsg(f.badEmail); setStatus("error"); return; }
    setStatus("pending");
    try {
      const res = await fetch(`${apiUrl}/demo-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(d),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("success");
      setV({ name: "", email: "", phone: "", company: "", message: "" });
    } catch {
      setMsg(f.err);
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="mh-ok" role="status" data-testid="status-form-success">
        <h3>{f.okTitle}</h3><p>{f.okBody}</p>
        <button type="button" className="mh-btn sm" onClick={() => setStatus("idle")} data-testid="button-form-again">{f.again}</button>
      </div>
    );
  }
  const pending = status === "pending";
  return (
    <form className="mh-form" onSubmit={submit} noValidate aria-busy={pending}>
      <div className="mh-row">
        <div className="mh-f"><label htmlFor="c-name">{f.name} *</label><input id="c-name" autoComplete="name" required value={v.name} onChange={set("name")} data-testid="input-name" /></div>
        <div className="mh-f"><label htmlFor="c-email">{f.email} *</label><input id="c-email" type="email" autoComplete="email" required value={v.email} onChange={set("email")} data-testid="input-email" /></div>
      </div>
      <div className="mh-row">
        <div className="mh-f"><label htmlFor="c-company">{f.company} *</label><input id="c-company" autoComplete="organization" required value={v.company} onChange={set("company")} data-testid="input-company" /></div>
        <div className="mh-f"><label htmlFor="c-phone">{f.phone}</label><input id="c-phone" type="tel" autoComplete="tel" value={v.phone} onChange={set("phone")} data-testid="input-phone" /></div>
      </div>
      <div className="mh-f"><label htmlFor="c-msg">{f.message} *</label><textarea id="c-msg" required value={v.message} onChange={set("message")} data-testid="input-message" /></div>
      {status === "error" && <div className="mh-err" role="alert" data-testid="status-form-error">{msg}</div>}
      <div><button type="submit" className="mh-btn pri" disabled={pending} data-testid="button-submit-request">{pending ? f.sending : f.submit}</button></div>
    </form>
  );
}
