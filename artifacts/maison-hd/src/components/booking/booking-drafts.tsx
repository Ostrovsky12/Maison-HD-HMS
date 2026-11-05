import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListBookingDrafts, useUpdateBookingDraft, useDeleteBookingDraft, getListBookingDraftsQueryKey,
} from "@workspace/api-client-react";
import type { BookingDraft, BookingDraftUpdate, ListBookingDraftsParams } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, Mail, NotebookPen, Phone, RefreshCw, Save, Trash2, X,
} from "lucide-react";

type Filter = "all" | "abandoned" | "new" | "working" | "contacted" | "closed" | "converted";
type EditStatus = "new" | "working" | "contacted" | "closed";
const PAGE = 50;

const FILTERS: { v: Filter; label: string }[] = [
  { v: "all", label: "Усі" }, { v: "abandoned", label: "Покинуті" }, { v: "new", label: "Нові" },
  { v: "working", label: "В роботі" }, { v: "contacted", label: "Зв'язались" },
  { v: "closed", label: "Закриті" }, { v: "converted", label: "Заброньовано" },
];

const STATUS: Record<string, { label: string; c: string }> = {
  new: { label: "Новий", c: "bg-sky-50 text-sky-900 border-sky-200" },
  working: { label: "В роботі", c: "bg-amber-50 text-amber-900 border-amber-200" },
  contacted: { label: "Зв'язались", c: "bg-violet-50 text-violet-900 border-violet-200" },
  closed: { label: "Закрито", c: "bg-stone-100 text-stone-600 border-stone-200" },
  converted: { label: "Заброньовано й оплачено", c: "bg-emerald-50 text-emerald-800 border-emerald-200" },
};
const EDIT_STATUSES: EditStatus[] = ["new", "working", "contacted", "closed"];

const STAGE: Record<string, string> = {
  contacts: "Ввів контакти",
  review: "Перевіряв замовлення",
  reservation_created: "Бронювання створено, не завершено",
  bill_ready: "Рахунок готовий",
  awaiting_payment: "Очікує оплату",
  creating: "Створюється в PMS",
  confirmed: "Підтверджено",
  cancelled: "Скасовано",
  failed: "Помилка створення",
  expiring: "Строк оплати минає",
  cancelling: "Скасовується",
};

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const t = Date.parse(String(s).slice(0, 10) + "T00:00:00Z");
  return Number.isFinite(t) ? new Date(t).toLocaleDateString("uk-UA", { timeZone: "UTC" }) : String(s);
};
const fmtTs = (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? s : d.toLocaleString("uk-UA"); };
const fmtMoney = (n: unknown, cur: unknown) => {
  const v = Number(n);
  if (n == null || !Number.isFinite(v) || v <= 0) return null;
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(v) + " " + (typeof cur === "string" ? cur : "");
};
const safeErr = (e: unknown, fb: string) => {
  const d = (e as { data?: { error?: unknown; message?: unknown } })?.data;
  const m = typeof d?.error === "string" ? d.error : typeof d?.message === "string" ? d.message : "";
  return m && m.length < 400 ? m : fb;
};
const httpStatus = (e: unknown) => { const s = (e as { status?: unknown })?.status; return typeof s === "number" ? s : null; };

const telHref = (p: unknown) => {
  if (typeof p !== "string") return null;
  const t = p.trim();
  if (!/^[+0-9()\-\s]{7,30}$/.test(t)) return null;
  const digits = t.replace(/[^\d]/g, "");
  if (digits.length < 9 || digits.length > 15) return null;
  return "tel:" + (t.startsWith("+") ? "+" : "") + digits;
};
const mailHref = (m: unknown) => {
  if (typeof m !== "string") return null;
  const t = m.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) && t.length <= 200 ? "mailto:" + t : null;
};
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

type EditorState = {
  id: string;
  baseline: string; // exact raw row.updatedAt at open time; never refreshed
  notes: string;
  status: EditStatus | null; // null when converted (status omitted)
  dirty: boolean;
  error: string | null;
  conflict: boolean;
};

export function BookingDraftsJournal({ organizationId }: { organizationId: number | null }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [offset, setOffset] = useState(0);
  const params: ListBookingDraftsParams = { offset, filter };
  const queryKey = useMemo(() => [...getListBookingDraftsQueryKey({ offset, filter }), organizationId], [offset, filter, organizationId]);
  const list = useListBookingDrafts(params, { query: { queryKey, refetchInterval: 15000, enabled: organizationId != null } });
  const update = useUpdateBookingDraft();
  const del = useDeleteBookingDraft();

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [discardFor, setDiscardFor] = useState<BookingDraft | null>(null);
  const [deleteFor, setDeleteFor] = useState<BookingDraft | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListBookingDraftsQueryKey() });

  const data = list.data;
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit || PAGE;

  useEffect(() => {
    if (data && offset > 0 && rows.length === 0 && total > 0) setOffset(Math.max(0, Math.floor((total - 1) / limit) * limit));
  }, [data, offset, rows.length, total, limit]);

  const openEditor = (r: BookingDraft) => {
    if (editor?.dirty && editor.id === r.id) return;
    if (editor?.dirty) { setDiscardFor(r); return; }
    startEdit(r);
  };
  const startEdit = (r: BookingDraft) => setEditor({
    id: r.id, baseline: r.updatedAt, notes: r.notes ?? "",
    status: r.status === "converted" ? null : (r.status as EditStatus), dirty: false, error: null, conflict: false,
  });
  const reopenLatest = (r: BookingDraft) => { setDiscardFor(r); };

  const save = async () => {
    if (!editor || update.isPending) return;
    const body: BookingDraftUpdate = { notes: editor.notes, expectedUpdatedAt: editor.baseline };
    if (editor.status) body.status = editor.status;
    setEditor((e) => (e ? { ...e, error: null } : e));
    try {
      await update.mutateAsync({ id: editor.id, data: body });
      setEditor(null);
      await invalidate();
    } catch (e) {
      const s = httpStatus(e);
      setEditor((cur) => cur ? {
        ...cur,
        conflict: s === 409,
        error: s === 409
          ? "Запис уже змінив інший менеджер або сервер. Ваш текст збережено тут, нічого не перезаписано. Скопіюйте нотатку й відкрийте актуальну версію."
          : safeErr(e, "Не вдалося зберегти. Текст залишається у формі, спробуйте ще раз."),
      } : cur);
      if (s === 409) invalidate();
    }
  };

  const confirmDelete = async () => {
    if (!deleteFor || del.isPending) return;
    setDeleteErr(null);
    try {
      await del.mutateAsync({ id: deleteFor.id });
      if (editor?.id === deleteFor.id) setEditor(null);
      setDeleteFor(null);
      await invalidate();
    } catch (e) {
      setDeleteErr(safeErr(e, "Не вдалося видалити запис журналу."));
    }
  };

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + rows.length, total);

  return (
    <div className="mt-5 rounded-xl border border-stone-200 bg-white" data-testid="booking-drafts-journal">
      <div className="px-4 py-3 border-b border-stone-200 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-stone-900 flex items-center gap-1.5"><NotebookPen className="w-4 h-4 text-stone-500" />Незавершені бронювання</p>
          <p className="text-[11px] text-stone-500 mt-0.5">Гості, які ввели контакти, але не завершили бронювання · оновлюється кожні 15 с</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => list.refetch()} disabled={list.isFetching} data-testid="button-refresh-drafts">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${list.isFetching ? "animate-spin" : ""}`} />Оновити
        </Button>
      </div>

      <div className="px-4 py-2.5 bg-[#f4f1ea] border-b border-stone-200 text-[11px] text-stone-700 space-y-1" data-testid="text-drafts-policy">
        <p>Гість бачить повідомлення, що введені дані зберігаються автоматично. Номер за ним <b>не утримується</b>, наявність не резервується.</p>
        <p>«Активний» — гість друкував протягом останніх 15 хв і ще може завершити сам; такі записи не вважаються покинутими. Записи зберігаються 90 днів.</p>
        <p>Система не пише й не дзвонить гостям і не створює бронювань. Зв'язок — лише вручну.</p>
      </div>

      <div className="px-4 py-2.5 border-b border-stone-100 flex gap-1.5 overflow-x-auto" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.v} type="button" role="tab" aria-selected={filter === f.v} data-testid={`filter-drafts-${f.v}`}
            onClick={() => { setFilter(f.v); setOffset(0); }}
            className={`shrink-0 text-xs rounded-full border px-3 py-1 transition-colors ${filter === f.v ? "border-stone-900 bg-stone-900 text-[#fbfaf7]" : "border-stone-200 text-stone-600 hover:border-stone-400"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <div className="p-4 space-y-2"><div className="h-24 rounded-lg bg-stone-100 animate-pulse" /><div className="h-24 rounded-lg bg-stone-100 animate-pulse" /></div>
      ) : list.error && !data ? (
        <div role="alert" className="p-4 text-sm text-red-700 flex flex-wrap items-center gap-2" data-testid="text-drafts-error">
          <AlertTriangle className="w-4 h-4" />{safeErr(list.error, "Не вдалося завантажити журнал.")}
          <Button size="sm" variant="outline" onClick={() => list.refetch()} data-testid="button-retry-drafts">Повторити</Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-stone-400" data-testid="text-drafts-empty">
          <Inbox className="w-7 h-7 mx-auto mb-2" />
          {filter === "all" ? (
            <><p className="text-sm">Незавершених бронювань немає</p><p className="text-[11px] mt-1">Тут з'являться гості, які ввели контакти на сторінці бронювання.</p></>
          ) : (
            <><p className="text-sm">За фільтром «{FILTERS.find((f) => f.v === filter)?.label}» записів немає</p>
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => { setFilter("all"); setOffset(0); }} data-testid="button-drafts-reset-filter">Показати всі</Button></>
          )}
        </div>
      ) : (
        <>
          {list.error && <p className="px-4 py-2 text-[11px] text-amber-800 bg-amber-50 border-b border-amber-200">Останнє оновлення не вдалося; показано попередні дані.</p>}
          <ul className="divide-y divide-stone-100">
            {rows.map((r) => (
              <DraftRow key={r.id} r={r}
                editor={editor?.id === r.id ? editor : null}
                saving={update.isPending && editor?.id === r.id}
                onOpen={() => openEditor(r)}
                onChange={(patch) => setEditor((e) => (e && e.id === r.id ? { ...e, ...patch, dirty: true } : e))}
                onCancel={() => { if (editor?.dirty && !window.confirm("Закрити форму й відкинути незбережені зміни?")) return; setEditor(null); }}
                onSave={save}
                onReopen={() => reopenLatest(r)}
                onDelete={() => { setDeleteErr(null); setDeleteFor(r); }} />
            ))}
          </ul>
          <div className="px-4 py-3 border-t border-stone-100 flex items-center justify-between gap-2 text-xs text-stone-500">
            <span data-testid="text-drafts-range">{from}–{to} з {total}</span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} data-testid="button-drafts-prev"><ChevronLeft className="w-4 h-4" /></Button>
              <Button size="sm" variant="outline" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)} data-testid="button-drafts-next"><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        </>
      )}

      <AlertDialog open={!!discardFor} onOpenChange={(o) => { if (!o) setDiscardFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Відкинути незбережену нотатку?</AlertDialogTitle>
            <AlertDialogDescription>Ваш незбережений текст буде втрачено, форма відкриється з актуальною версією з сервера. Скопіюйте текст, якщо він потрібен.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-discard-cancel">Залишити мій текст</AlertDialogCancel>
            <AlertDialogAction data-testid="button-discard-confirm" onClick={() => { if (discardFor) startEdit(discardFor); setDiscardFor(null); }}>Відкинути й відкрити</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteFor} onOpenChange={(o) => { if (!o && !del.isPending) setDeleteFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити запис із журналу?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Буде видалено лише контакт і нотатки з цього журналу незавершених бронювань{deleteFor ? ` (${text(deleteFor.details?.guestName) || "гість без імені"})` : ""}.</p>
                <p><b>Жодне справжнє бронювання, рахунок чи оплата не видаляються і не скасовуються.</b></p>
                {deleteErr && <p className="text-red-700" role="alert">{deleteErr}</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Назад</AlertDialogCancel>
            <Button data-testid="button-delete-draft-confirm" className="bg-red-800 hover:bg-red-900" disabled={del.isPending} onClick={confirmDelete}>
              {del.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}Видалити запис журналу
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DraftRow({ r, editor, saving, onOpen, onChange, onCancel, onSave, onReopen, onDelete }: {
  r: BookingDraft; editor: EditorState | null; saving: boolean;
  onOpen: () => void; onChange: (p: Partial<EditorState>) => void; onCancel: () => void; onSave: () => void; onReopen: () => void; onDelete: () => void;
}) {
  const d = (r.details ?? {}) as Record<string, unknown>;
  const st = STATUS[r.status] ?? { label: r.status, c: "bg-stone-100 text-stone-700 border-stone-200" };
  const name = text(d.guestName);
  const phone = text(d.phone); const email = text(d.email);
  const tel = telHref(phone); const mail = mailHref(email);
  const amount = fmtMoney(d.totalAmount, d.currency);
  const adults = Number(d.adults) || 0; const children = Number(d.children) || 0;
  const notesRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (editor && !editor.dirty) notesRef.current?.focus(); }, [editor?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <li className="px-4 py-4" data-testid={`row-draft-${r.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-900" data-testid={`text-draft-name-${r.id}`}>{name || <span className="text-stone-400">Ім'я не вказано</span>}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {tel ? <a href={tel} className="inline-flex items-center gap-1 text-stone-800 underline underline-offset-2" data-testid={`link-draft-tel-${r.id}`}><Phone className="w-3 h-3" />{phone}</a>
              : phone ? <span className="inline-flex items-center gap-1 text-stone-500" title="Неповний номер"><Phone className="w-3 h-3" />{phone} <i className="text-[10px]">(неповний)</i></span> : null}
            {mail ? <a href={mail} className="inline-flex items-center gap-1 text-stone-800 underline underline-offset-2 break-all" data-testid={`link-draft-mail-${r.id}`}><Mail className="w-3 h-3" />{email}</a>
              : email ? <span className="inline-flex items-center gap-1 text-stone-500 break-all"><Mail className="w-3 h-3" />{email} <i className="text-[10px]">(неповний)</i></span> : null}
            {!phone && !email && <span className="text-stone-400">Контактів немає</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {r.active && <span className="text-[11px] font-medium rounded-full border px-2 py-0.5 border-emerald-300 bg-emerald-50 text-emerald-800" data-testid={`status-draft-active-${r.id}`}>Активний зараз</span>}
          <span className={`text-[11px] font-medium rounded-full border px-2 py-0.5 ${st.c}`} data-testid={`status-draft-${r.id}`}>{st.label}</span>
          <span className="text-[11px] rounded-full border border-stone-200 px-2 py-0.5 text-stone-600" data-testid={`text-draft-stage-${r.id}`}>{STAGE[r.stage] ?? r.stage}</span>
        </div>
      </div>

      <div className="mt-2 grid sm:grid-cols-[1fr_auto] gap-2 text-xs text-stone-700">
        <p>
          {[text(d.categoryName), text(d.rateName)].filter(Boolean).join(" · ") || "Номер не обрано"}
          {" · "}{fmtDate(d.checkIn as string)} – {fmtDate(d.checkOut as string)}
          {(adults || children) ? ` · ${adults} дор.${children ? `, ${children} діт.` : ""}` : ""}
        </p>
        {amount && (
          <p className="sm:text-right" data-testid={`text-draft-amount-${r.id}`}>
            <span className="font-mono font-medium text-stone-900">≈ {amount}</span>
            <span className="block text-[10px] text-stone-400">вибір гостя, не рахунок до сплати</span>
          </p>
        )}
      </div>
      <p className="text-[11px] text-stone-400 font-mono mt-1.5">
        активність {fmtTs(r.lastSeen)} · створено {fmtTs(r.createdAt)} · змінено {fmtTs(r.updatedAt)}
      </p>

      {!editor && r.notes && <p className="mt-2 text-xs text-stone-700 whitespace-pre-wrap rounded-lg bg-[#fbfaf7] border border-stone-100 px-3 py-2" data-testid={`text-draft-notes-${r.id}`}>{r.notes}</p>}

      {editor ? (
        <div className="mt-3 rounded-lg border border-stone-300 bg-[#fbfaf7] p-3 space-y-3" data-testid={`editor-draft-${r.id}`}>
          {editor.status ? (
            <div className="flex flex-wrap gap-1.5">
              {EDIT_STATUSES.map((s) => (
                <button key={s} type="button" disabled={saving} data-testid={`button-draft-status-${s}-${r.id}`}
                  onClick={() => onChange({ status: s })}
                  className={`text-xs rounded-full border px-3 py-1 ${editor.status === s ? "border-stone-900 bg-stone-900 text-[#fbfaf7]" : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"}`}>
                  {STATUS[s].label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-emerald-800">Статус «Заброньовано» визначається сервером за оплаченим бронюванням і не змінюється вручну.</p>
          )}
          <div className="space-y-1">
            <Label htmlFor={`draft-notes-${r.id}`} className="text-xs text-stone-600">Нотатки менеджера</Label>
            <Textarea id={`draft-notes-${r.id}`} ref={notesRef} rows={3} maxLength={4000} value={editor.notes} disabled={saving}
              onChange={(e) => onChange({ notes: e.target.value })} className="bg-white" data-testid={`input-draft-notes-${r.id}`} />
            <p className="text-[10px] text-stone-400 text-right">{editor.notes.length}/4000</p>
          </div>
          {editor.error && (
            <div role="alert" className={`rounded-lg border px-3 py-2 text-xs space-y-2 ${editor.conflict ? "border-amber-300 bg-amber-50 text-amber-900" : "border-red-300 bg-red-50 text-red-900"}`} data-testid={`text-draft-error-${r.id}`}>
              <p>{editor.error}</p>
              {editor.conflict && <Button size="sm" variant="outline" onClick={onReopen} data-testid={`button-draft-reopen-${r.id}`}><RefreshCw className="w-3.5 h-3.5 mr-1" />Відкрити актуальну версію</Button>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onSave} disabled={saving || editor.conflict || !editor.dirty} data-testid={`button-draft-save-${r.id}`}>
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}Зберегти
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving} data-testid={`button-draft-cancel-${r.id}`}><X className="w-3.5 h-3.5 mr-1.5" />Закрити</Button>
            {editor.dirty && <span className="self-center text-[11px] text-amber-700">Є незбережені зміни</span>}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onOpen} data-testid={`button-draft-edit-${r.id}`}><NotebookPen className="w-3.5 h-3.5 mr-1.5" />Статус і нотатки</Button>
          <Button size="sm" variant="ghost" className="text-red-800 hover:text-red-900" onClick={onDelete} data-testid={`button-draft-delete-${r.id}`}><Trash2 className="w-3.5 h-3.5 mr-1.5" />Видалити з журналу</Button>
        </div>
      )}
    </li>
  );
}
