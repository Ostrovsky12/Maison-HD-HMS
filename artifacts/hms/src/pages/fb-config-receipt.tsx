import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Save, Loader2, Receipt, Eye, Wifi, QrCode, MessageSquare,
  Store, Clock, User, Image,
} from "lucide-react";

const API = "/api/fb/config";
async function apiFetch(url: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

interface ReceiptCfg {
  auto_print?: boolean;
  print_number?: boolean;
  print_comment?: boolean;
  print_client_contacts?: boolean;
  print_tax_subtotals?: boolean;
  print_forecast?: boolean;
  print_wifi?: boolean;
  print_address?: boolean;
  receipt_language?: string;
  print_name_from?: string;
  wifi_name?: string;
  wifi_password?: string;
  establishment_name?: string;
  logo_url?: string;
  show_waiter?: boolean;
  show_date?: boolean;
  show_time?: boolean;
  guest_message?: string;
  show_qr?: boolean;
  qr_url?: string;
  footer_text?: string;
}

const DEFAULTS: ReceiptCfg = {
  auto_print: false, print_number: true, print_comment: false,
  print_client_contacts: true, print_tax_subtotals: false,
  print_forecast: false, print_wifi: false, print_address: false,
  receipt_language: "Українська", print_name_from: "Назва закладу",
  show_waiter: true, show_date: true, show_time: true,
  show_qr: false, qr_url: "",
  establishment_name: "", logo_url: "",
  guest_message: "", footer_text: "",
};

const SAMPLE_ITEMS = [
  { name: "Капучино 300мл", qty: 2, price: 90 },
  { name: "Авокадо тост", qty: 1, price: 185 },
  { name: "Сік апельсиновий", qty: 1, price: 75 },
];
const SAMPLE = {
  table: "Стіл №5", guest: "Андрій П.", waiter: "Марія",
  number: "R-035-00042",
  date: new Date().toLocaleDateString("uk-UA"),
  time: new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }),
  payment: "Картка",
};

// ─── Live Receipt Preview ─────────────────────────────────────────────────────
function ReceiptPreview({ cfg }: { cfg: ReceiptCfg }) {
  const total = SAMPLE_ITEMS.reduce((s, i) => s + i.qty * i.price, 0);
  const name = cfg.establishment_name || "Maison HD";

  return (
    <div className="sticky top-6">
      <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        <Eye className="w-4 h-4" /> Попередній перегляд
      </div>

      <div className="flex justify-center">
        <div
          style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: 11, width: 270, background: "#fff" }}
          className="shadow-2xl border rounded-sm p-3 space-y-0.5 text-gray-900"
        >
          {/* Logo */}
          {cfg.logo_url && (
            <div style={{ textAlign: "center", marginBottom: 6 }}>
              <img src={cfg.logo_url} alt="logo" style={{ maxHeight: 48, maxWidth: 180, margin: "0 auto", display: "block" }}
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            </div>
          )}

          {/* Header */}
          <div style={{ textAlign: "center", fontWeight: "bold", fontSize: 13, marginBottom: 2 }}>{name}</div>

          {(cfg.print_number ?? true) && (
            <div style={{ textAlign: "center", fontSize: 10, color: "#666" }}>Чек: {SAMPLE.number}</div>
          )}

          <div style={{ borderTop: "1px dashed #aaa", margin: "6px 0" }} />

          {/* Order info */}
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: "bold" }}>{SAMPLE.table}</span>
            <span style={{ color: "#555" }}>{SAMPLE.guest}</span>
          </div>

          {(cfg.show_waiter ?? true) && (
            <div style={{ fontSize: 10, color: "#555" }}>Офіціант: {SAMPLE.waiter}</div>
          )}

          {(cfg.show_date || cfg.show_time) && (
            <div style={{ fontSize: 10, color: "#555" }}>
              {cfg.show_date && SAMPLE.date}
              {cfg.show_date && cfg.show_time && " "}
              {cfg.show_time && SAMPLE.time}
            </div>
          )}

          <div style={{ borderTop: "1px dashed #aaa", margin: "6px 0" }} />

          {/* Items */}
          {SAMPLE_ITEMS.map((it, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", margin: "2px 0" }}>
              <span style={{ flex: 1, marginRight: 6 }}>{it.qty}×{it.name}</span>
              <span>{(it.qty * it.price).toFixed(2)} ₴</span>
            </div>
          ))}

          <div style={{ borderTop: "1px dashed #aaa", margin: "6px 0" }} />

          {/* Total */}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: 13 }}>
            <span>РАЗОМ:</span><span>{total.toFixed(2)} ₴</span>
          </div>
          <div style={{ fontSize: 10, color: "#555", textAlign: "right" }}>{SAMPLE.payment}</div>

          {/* Guest message */}
          {cfg.guest_message && (
            <>
              <div style={{ borderTop: "1px dashed #aaa", margin: "6px 0" }} />
              <div style={{ textAlign: "center", fontSize: 10, color: "#333", fontStyle: "italic" }}>
                {cfg.guest_message}
              </div>
            </>
          )}

          {/* QR */}
          {cfg.show_qr && cfg.qr_url && (
            <>
              <div style={{ borderTop: "1px dashed #aaa", margin: "6px 0" }} />
              <div style={{ textAlign: "center" }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(cfg.qr_url)}`}
                  alt="QR" style={{ width: 80, height: 80, margin: "0 auto", display: "block" }}
                />
                <div style={{ fontSize: 9, color: "#666", marginTop: 2 }}>Відскануйте QR</div>
              </div>
            </>
          )}

          {/* WiFi */}
          {cfg.print_wifi && cfg.wifi_name && (
            <>
              <div style={{ borderTop: "1px dashed #aaa", margin: "6px 0" }} />
              <div style={{ fontSize: 10, textAlign: "center" }}>
                <div>Wi-Fi: <b>{cfg.wifi_name}</b></div>
                {cfg.wifi_password && <div>Пароль: {cfg.wifi_password}</div>}
              </div>
            </>
          )}

          {/* Footer */}
          {cfg.footer_text && (
            <>
              <div style={{ borderTop: "1px dashed #aaa", margin: "6px 0" }} />
              <div style={{ textAlign: "center", fontSize: 10, color: "#555" }}>{cfg.footer_text}</div>
            </>
          )}

          <div style={{ borderTop: "1px dashed #aaa", margin: "6px 0" }} />
          <div style={{ textAlign: "center", fontSize: 9, color: "#999" }}>Дякуємо за відвідування!</div>
        </div>
      </div>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 pt-6 pb-3 border-b mb-3">
      <span className="text-muted-foreground">{icon}</span>
      <span className="font-semibold text-sm text-gray-700">{title}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FbConfigReceipt() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cfg, setCfg] = useState<ReceiptCfg>(DEFAULTS);

  const { isLoading } = useQuery({
    queryKey: ["fb-config-receipt"],
    queryFn: () => apiFetch(`${API}/section/receipt`),
    onSuccess: (d: any) => {
      if (d.data && Object.keys(d.data).length > 0) setCfg({ ...DEFAULTS, ...d.data });
    },
  });

  const set = <K extends keyof ReceiptCfg>(k: K, v: ReceiptCfg[K]) =>
    setCfg(p => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: () => apiFetch(`${API}/section/receipt`, { method: "PUT", body: JSON.stringify({ data: cfg }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fb-config-receipt"] });
      toast({ title: "Налаштування чека збережено" });
    },
    onError: (e: any) => toast({ title: "Помилка", description: e.message, variant: "destructive" }),
  });

  function Check({
    id, label, desc, val, onChange, children,
  }: { id: string; label: string; desc?: string; val: boolean; onChange: (v: boolean) => void; children?: React.ReactNode }) {
    return (
      <div>
        <label className="flex items-start gap-2.5 cursor-pointer py-1.5 group">
          <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${val ? "bg-blue-500 border-blue-500" : "border-gray-300 group-hover:border-gray-400"}`}>
            {val && <svg viewBox="0 0 12 12" className="w-3 h-3 text-white fill-white"><path d="M2 6l3 3 5-5"/><polyline points="2,6 5,9 10,4" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>}
          </div>
          <input type="checkbox" id={id} checked={val} onChange={e => onChange(e.target.checked)} className="sr-only" />
          <span>
            <span className="text-sm text-gray-800">{label}</span>
            {desc && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>}
          </span>
        </label>
        {val && children && <div className="ml-7 mt-1 mb-1">{children}</div>}
      </div>
    );
  }

  function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
      <div className="grid grid-cols-[180px_1fr] gap-3 items-start py-2">
        <span className="text-sm text-gray-700 pt-2">{label}</span>
        <div>
          {children}
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <AppLayout><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Receipt className="w-5 h-5 text-slate-600" />
            <div>
              <h1 className="text-lg font-bold">Налаштування чека</h1>
              <p className="text-xs text-muted-foreground">Зміни одразу відображаються у попередньому перегляді</p>
            </div>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending} size="sm">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
            Зберегти
          </Button>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="flex gap-0 h-full">

            {/* ─── LEFT: Settings ─── */}
            <div className="flex-1 overflow-auto p-6 border-r">
              <div className="max-w-lg space-y-0">

                {/* BRAND */}
                <SectionHeader icon={<Store className="w-4 h-4" />} title="Брендинг" />

                <Field label="Назва закладу" hint="Відображається у шапці чека. Якщо порожньо — береться з налаштувань організації.">
                  <input
                    value={cfg.establishment_name || ""} onChange={e => set("establishment_name", e.target.value)}
                    placeholder="напр. Maison HD"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </Field>

                <Field label="URL логотипу" hint="Вставте посилання на зображення (PNG/JPG). Логотип буде надруковано у шапці чека.">
                  <div className="flex gap-2">
                    <input
                      value={cfg.logo_url || ""} onChange={e => set("logo_url", e.target.value)}
                      placeholder="https://example.com/logo.png"
                      className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    {cfg.logo_url && (
                      <div className="w-10 h-10 rounded-lg border bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                        <img src={cfg.logo_url} alt="logo" className="max-w-full max-h-full object-contain"
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      </div>
                    )}
                  </div>
                </Field>

                {/* CONTENT */}
                <SectionHeader icon={<Eye className="w-4 h-4" />} title="Вміст чека" />

                <div className="space-y-0.5">
                  <Check id="sn" label="Друкувати номер чека" val={cfg.print_number ?? true} onChange={v => set("print_number", v)} />
                  <Check id="sw" label="Відображати ім'я офіціанта" val={cfg.show_waiter ?? true} onChange={v => set("show_waiter", v)} />
                  <Check id="sd" label="Відображати дату" val={cfg.show_date ?? true} onChange={v => set("show_date", v)} />
                  <Check id="st" label="Відображати час" val={cfg.show_time ?? true} onChange={v => set("show_time", v)} />
                  <Check id="pc" label="Друкувати коментар до чека"
                    desc="Коментар, який залишають працівники при закритті замовлення"
                    val={cfg.print_comment ?? false} onChange={v => set("print_comment", v)} />
                  <Check id="ts" label="Розбивка за податками"
                    desc="Підсумкова сума розділяється за групами (Бар / Кухня)"
                    val={cfg.print_tax_subtotals ?? false} onChange={v => set("print_tax_subtotals", v)} />
                  <Check id="pa" label="Друкувати адресу закладу" val={cfg.print_address ?? false} onChange={v => set("print_address", v)} />
                </div>

                {/* WAITER / DATE */}
                <SectionHeader icon={<MessageSquare className="w-4 h-4" />} title="Повідомлення для гостя" />

                <div>
                  <textarea
                    value={cfg.guest_message || ""}
                    onChange={e => set("guest_message", e.target.value)}
                    placeholder="напр. Дякуємо за відвідування! Чекаємо вас знову 🙏"
                    rows={3}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Виводиться перед QR-кодом і підвалом чека</p>
                </div>

                <Field label="Підвал (footer)">
                  <input
                    value={cfg.footer_text || ""}
                    onChange={e => set("footer_text", e.target.value)}
                    placeholder="напр. Тел: +380 44 000 0000 · maisonhd.com"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </Field>

                {/* QR */}
                <SectionHeader icon={<QrCode className="w-4 h-4" />} title="QR-код" />

                <Check id="sq" label="Додати QR-код на чек" val={cfg.show_qr ?? false} onChange={v => set("show_qr", v)}>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Посилання для QR-коду</label>
                      <input
                        value={cfg.qr_url || ""}
                        onChange={e => set("qr_url", e.target.value)}
                        placeholder="https://your-site.com або Google Maps посилання"
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Може бути посиланням на відгуки, Instagram, сайт або меню
                    </p>
                    {cfg.qr_url && (
                      <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-2">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=${encodeURIComponent(cfg.qr_url)}`}
                          alt="QR preview" className="w-16 h-16 rounded"
                        />
                        <div className="text-xs text-gray-600 break-all">{cfg.qr_url}</div>
                      </div>
                    )}
                  </div>
                </Check>

                {/* Wi-Fi */}
                <SectionHeader icon={<Wifi className="w-4 h-4" />} title="Wi-Fi" />

                <Check id="wf" label="Друкувати Wi-Fi на чеку" val={cfg.print_wifi ?? false} onChange={v => set("print_wifi", v)}>
                  <div className="space-y-2">
                    <input
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="Назва мережі Wi-Fi"
                      value={cfg.wifi_name || ""} onChange={e => set("wifi_name", e.target.value)}
                    />
                    <input
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="Пароль Wi-Fi"
                      type="text"
                      value={cfg.wifi_password || ""} onChange={e => set("wifi_password", e.target.value)}
                    />
                  </div>
                </Check>

                {/* Auto print */}
                <SectionHeader icon={<Clock className="w-4 h-4" />} title="Автоматичний друк" />

                <Check id="ap" label="Автоматично друкувати чек при закритті замовлення"
                  desc="Потребує налаштованого принтера типу 'Чек' у розділі Принтери"
                  val={cfg.auto_print ?? false} onChange={v => set("auto_print", v)} />

                <div className="pt-8" />
              </div>
            </div>

            {/* ─── RIGHT: Preview ─── */}
            <div className="w-80 shrink-0 p-6 bg-gray-50/60 overflow-auto">
              <ReceiptPreview cfg={cfg} />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
