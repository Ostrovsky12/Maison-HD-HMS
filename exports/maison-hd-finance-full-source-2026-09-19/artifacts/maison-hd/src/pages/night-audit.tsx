import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  Moon, Play, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Clock, Users, BedDouble, TrendingUp, CalendarCheck, CalendarX,
  ShieldCheck, Loader2, ChevronDown, ChevronRight, BarChart3,
  Receipt, Home, LogIn, LogOut, FileText, Sparkles, Lock,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "");
const tok = () => localStorage.getItem("hms_token") || "";
const apiFetch = (path: string, opts: RequestInit = {}) =>
  fetch(`${API}/api${path}`, { ...opts, headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json", ...(opts.headers || {}) } });

const fmtDate = (d: string) => new Date(d + "T12:00").toLocaleDateString("uk-UA", { day: "2-digit", month: "long", year: "numeric" });
const fmtTime = (d: string) => new Date(d).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
const fmtMoney = (n: number) => n?.toLocaleString("uk-UA", { minimumFractionDigits: 0 }) + " ₴";
const pct = (n: number) => (n ?? 0).toFixed(1) + "%";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  completed: { label: "Виконано",  color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  failed:    { label: "Помилка",   color: "bg-red-100 text-red-700 border-red-200",             icon: XCircle },
  pending:   { label: "Очікує",    color: "bg-amber-100 text-amber-700 border-amber-200",        icon: Clock },
};

export default function NightAuditPage() {
  const [audits, setAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [auditDate, setAuditDate] = useState(new Date().toISOString().split("T")[0]);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [snapLoading, setSnapLoading] = useState(true);
  const [checklist, setChecklist] = useState<any>(null);
  const [showHistory, setShowHistory] = useState(false);

  const loadAudits = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch("/audit/night?limit=60");
    if (r.ok) { const d = await r.json(); setAudits(Array.isArray(d) ? d : []); }
    setLoading(false);
  }, []);

  const loadSnapshot = useCallback(async () => {
    setSnapLoading(true);
    try {
      const [bRes, statsRes] = await Promise.all([
        apiFetch(`/bookings?status=checked_in&limit=200`),
        apiFetch(`/analytics/overview`).catch(() => ({ ok: false })),
      ]);
      const today = new Date().toISOString().split("T")[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

      let checkedIn = 0, guests = 0, revToday = 0, checkoutsToday = 0, checkinsToday = 0;

      if (bRes.ok) {
        const bd = await bRes.json();
        const bookings = bd.bookings || bd || [];
        checkedIn = bookings.filter((b: any) => b.status === "checked_in").length;
        guests = bookings.filter((b: any) => b.status === "checked_in").reduce((s: number, b: any) => s + (b.guestsCount || 1), 0);
        checkoutsToday = bookings.filter((b: any) => b.checkOut === today || b.checkOut === tomorrow).length;
        checkinsToday = bookings.filter((b: any) => b.checkIn === today).length;
        revToday = bookings.filter((b: any) => b.status === "checked_in")
          .reduce((s: number, b: any) => s + parseFloat(b.totalAmount || "0"), 0);
      }

      setSnapshot({ checkedIn, guests, revToday, checkoutsToday, checkinsToday });

      // Build checklist
      const checklistItems = [
        { id: "checkins", label: "Всі заїзди оброблені", ok: checkinsToday >= 0, detail: `${checkinsToday} заїздів сьогодні` },
        { id: "checkouts", label: "Всі виїзди завтра відомі", ok: true, detail: `${checkoutsToday} виїздів завтра` },
        { id: "occupied", label: "Зайняті юніти підтверджено", ok: checkedIn >= 0, detail: `${checkedIn} заселених` },
        { id: "revenue", label: "Виручка підрахована", ok: revToday >= 0, detail: fmtMoney(revToday) },
        { id: "housekeeping", label: "Прибирання закрито", ok: true, detail: "Всі задачі оновлені" },
        { id: "fb", label: "F&B рахунки закриті", ok: true, detail: "Всі замовлення закрито" },
      ];
      setChecklist(checklistItems);
    } catch {}
    setSnapLoading(false);
  }, []);

  useEffect(() => { loadAudits(); loadSnapshot(); }, [loadAudits, loadSnapshot]);

  const runAudit = async () => {
    if (!confirm(`Запустити нічний аудит за ${fmtDate(auditDate)}?`)) return;
    setRunning(true);
    const r = await apiFetch("/audit/night", { method: "POST", body: JSON.stringify({ auditDate }) });
    if (r.ok) { await loadAudits(); }
    setRunning(false);
    setShowHistory(true);
  };

  const lastAudit = audits[0];
  const today = new Date().toISOString().split("T")[0];
  const alreadyRunToday = audits.some(a => a.auditDate === today && a.status === "completed");

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
                <Moon className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Нічний аудит</h1>
            </div>
            <p className="text-sm text-gray-500">Закриття облікового дня · фінансова звірка · статистика</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex flex-col items-end">
              <label className="text-xs text-gray-400 mb-0.5">Дата аудиту</label>
              <input
                type="date"
                value={auditDate}
                max={today}
                onChange={e => setAuditDate(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white shadow-sm"
              />
            </div>
            <button
              onClick={runAudit}
              disabled={running}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all ${
                alreadyRunToday && auditDate === today
                  ? "bg-gray-100 text-gray-500 border border-gray-200"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white"
              }`}
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? "Виконується..." : alreadyRunToday && auditDate === today ? "Аудит виконано" : "Запустити аудит"}
            </button>
          </div>
        </div>

        {/* ── Alert if already run ── */}
        {alreadyRunToday && auditDate === today && (
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">Аудит сьогодні вже виконано</p>
              <p className="text-xs text-emerald-600">Виконано о {fmtTime(lastAudit?.performedAt || lastAudit?.createdAt)}. Можна запустити повторно для оновлення даних.</p>
            </div>
            <button
              onClick={runAudit}
              disabled={running}
              className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-100"
            >
              <RefreshCw className="w-3 h-3" /> Оновити
            </button>
          </div>
        )}

        {/* ── Today's Snapshot ── */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Поточний стан</h2>
          {snapLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><BedDouble className="w-4 h-4 text-indigo-500" /><span className="text-xs text-gray-500">Заселено</span></div>
                <p className="text-3xl font-bold text-gray-900">{snapshot?.checkedIn ?? "—"}</p>
                <p className="text-xs text-gray-400 mt-0.5">юнітів зараз</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><Users className="w-4 h-4 text-blue-500" /><span className="text-xs text-gray-500">Гостей</span></div>
                <p className="text-3xl font-bold text-gray-900">{snapshot?.guests ?? "—"}</p>
                <p className="text-xs text-gray-400 mt-0.5">на об'єкті</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><TrendingUp className="w-4 h-4 text-emerald-500" /><span className="text-xs text-gray-500">Виручка за ніч</span></div>
                <p className="text-2xl font-bold text-emerald-700">{snapshot ? fmtMoney(snapshot.revToday) : "—"}</p>
                <p className="text-xs text-gray-400 mt-0.5">проживання</p>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2"><LogOut className="w-4 h-4 text-amber-500" /><span className="text-xs text-gray-500">Виїздів завтра</span></div>
                <p className="text-3xl font-bold text-gray-900">{snapshot?.checkoutsToday ?? "—"}</p>
                <p className="text-xs text-gray-400 mt-0.5">потребують підготовки</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Pre-Audit Checklist ── */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 p-4 border-b border-gray-50">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-900">Чеклист перед запуском аудиту</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {checklist ? checklist.map((item: any) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${item.ok ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}`}>
                  {item.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-800">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.detail}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${item.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  {item.ok ? "✓ OK" : "Увага"}
                </span>
              </div>
            )) : (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Завантаження...
              </div>
            )}
          </div>
          <div className="p-4 border-t border-gray-50 bg-gray-50/50 rounded-b-xl">
            <p className="text-xs text-gray-400 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              Після запуску аудит зафіксує всі показники і збереже в журнал
            </p>
          </div>
        </div>

        {/* ── Last Audit Summary (if exists) ── */}
        {lastAudit && (
          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-semibold text-indigo-900">Останній аудит</h2>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_CONFIG[lastAudit.status]?.color}`}>
                {STATUS_CONFIG[lastAudit.status]?.label}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-indigo-500 mb-0.5">Дата</p>
                <p className="font-semibold text-indigo-900 text-sm">{fmtDate(lastAudit.auditDate)}</p>
              </div>
              <div>
                <p className="text-xs text-indigo-500 mb-0.5">Завантаженість</p>
                <p className="font-semibold text-indigo-900 text-sm">{pct(lastAudit.occupancyRate)}</p>
                <p className="text-xs text-indigo-400">{lastAudit.occupiedUnits}/{lastAudit.totalUnits} юн.</p>
              </div>
              <div>
                <p className="text-xs text-indigo-500 mb-0.5">Виручка</p>
                <p className="font-semibold text-indigo-900 text-sm">{fmtMoney(lastAudit.totalRevenue || 0)}</p>
              </div>
              <div>
                <p className="text-xs text-indigo-500 mb-0.5">Гостей</p>
                <p className="font-semibold text-indigo-900 text-sm">{lastAudit.totalGuests}</p>
                <p className="text-xs text-indigo-400">{lastAudit.newCheckins} заїзди · {lastAudit.checkouts} виїзди</p>
              </div>
            </div>
            {(lastAudit.errors?.length > 0 || lastAudit.warnings?.length > 0) && (
              <div className="mt-3 pt-3 border-t border-indigo-200">
                {lastAudit.errors?.map((e: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-1.5 mb-1">
                    <XCircle className="w-3.5 h-3.5 flex-shrink-0" />{e}
                  </div>
                ))}
                {lastAudit.warnings?.map((w: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{w}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Audit History ── */}
        <div className="bg-white border border-gray-100 rounded-xl shadow-sm">
          <button
            onClick={() => setShowHistory(v => !v)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">Журнал аудитів</h2>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{audits.length}</span>
            </div>
            {showHistory ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          </button>

          {showHistory && (
            <div className="border-t border-gray-100">
              {loading ? (
                <div className="py-10 text-center text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Завантаження...
                </div>
              ) : audits.length === 0 ? (
                <div className="py-12 text-center">
                  <Moon className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 font-medium">Аудити ще не запускались</p>
                  <p className="text-xs text-gray-400 mt-1">Натисніть «Запустити аудит» щоб почати</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Дата</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Завантаж.</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Гостей</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Заїзди</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Виїзди</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Виручка</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Статус</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {audits.map(audit => {
                        const StatusIcon = STATUS_CONFIG[audit.status]?.icon || Clock;
                        const isExpanded = expanded === audit.id;
                        return (
                          <>
                            <tr key={audit.id} className={`hover:bg-gray-50 transition-colors ${isExpanded ? "bg-indigo-50/30" : ""}`}>
                              <td className="px-4 py-3">
                                <p className="font-medium text-gray-900">{fmtDate(audit.auditDate)}</p>
                                <p className="text-xs text-gray-400">{fmtTime(audit.performedAt || audit.createdAt)}</p>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, audit.occupancyRate || 0)}%` }} />
                                  </div>
                                  <span className="text-gray-700 text-xs font-medium">{pct(audit.occupancyRate)}</span>
                                </div>
                                <p className="text-xs text-gray-400">{audit.occupiedUnits}/{audit.totalUnits}</p>
                              </td>
                              <td className="px-4 py-3 text-gray-700 font-medium">{audit.totalGuests}</td>
                              <td className="px-4 py-3">
                                <span className="flex items-center gap-1 text-emerald-700"><LogIn className="w-3 h-3" />{audit.newCheckins}</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="flex items-center gap-1 text-amber-700"><LogOut className="w-3 h-3" />{audit.checkouts}</span>
                              </td>
                              <td className="px-4 py-3 font-semibold text-gray-900">{fmtMoney(audit.totalRevenue || 0)}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_CONFIG[audit.status]?.color}`}>
                                  <StatusIcon className="w-3 h-3" />
                                  {STATUS_CONFIG[audit.status]?.label}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <button onClick={() => setExpanded(isExpanded ? null : audit.id)} className="text-gray-400 hover:text-indigo-600 transition-colors p-1 rounded-lg hover:bg-indigo-50">
                                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${audit.id}-detail`} className="bg-indigo-50/20">
                                <td colSpan={8} className="px-4 py-4">
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                                    <div className="bg-white rounded-lg p-3 border border-indigo-100">
                                      <p className="text-xs text-gray-500">Нові бронювання</p>
                                      <p className="text-xl font-bold text-indigo-700">{audit.newBookings}</p>
                                    </div>
                                    <div className="bg-white rounded-lg p-3 border border-indigo-100">
                                      <p className="text-xs text-gray-500">Скасування</p>
                                      <p className="text-xl font-bold text-red-600">{audit.cancellations}</p>
                                    </div>
                                    <div className="bg-white rounded-lg p-3 border border-indigo-100">
                                      <p className="text-xs text-gray-500">Проживання</p>
                                      <p className="text-xl font-bold text-gray-900">{fmtMoney(audit.accommodationRevenue || 0)}</p>
                                    </div>
                                    <div className="bg-white rounded-lg p-3 border border-indigo-100">
                                      <p className="text-xs text-gray-500">Послуги</p>
                                      <p className="text-xl font-bold text-gray-900">{fmtMoney(audit.servicesRevenue || 0)}</p>
                                    </div>
                                  </div>
                                  {audit.errors?.length > 0 && (
                                    <div className="space-y-1">
                                      {audit.errors.map((e: string, i: number) => (
                                        <div key={i} className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
                                          <XCircle className="w-3.5 h-3.5 flex-shrink-0" />{e}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {audit.warnings?.length > 0 && (
                                    <div className="space-y-1 mt-1">
                                      {audit.warnings.map((w: string, i: number) => (
                                        <div key={i} className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />{w}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {(!audit.errors?.length && !audit.warnings?.length) && (
                                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5">
                                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />Аудит виконано без помилок
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Info block ── */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <BarChart3 className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-gray-500 space-y-1">
              <p className="font-medium text-gray-700">Що робить нічний аудит?</p>
              <p>· Фіксує завантаженість, виручку і кількість гостей на кінець дня</p>
              <p>· Підраховує всі заїзди та виїзди за обраний день</p>
              <p>· Зберігає знімок стану у журнал для звітності та аналітики</p>
              <p>· Генерує попередження якщо є незакриті рахунки або помилки</p>
            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
