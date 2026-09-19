import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, ShieldCheck, ShieldOff, Lock, Unlock, Eye, EyeOff,
  CheckCircle2, AlertTriangle, Trash2, RefreshCw, Info,
  X, Ban, Tag, DoorOpen, Minus,
} from "lucide-react";

// ─── API helper ───────────────────────────────────────────────────────────────
const BASE = "/api/fb/settings";
async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("hms_token");
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

// ─── Protected actions config ─────────────────────────────────────────────────
const ACTIONS = [
  { id: "cancel_order", label: "Скасування замовлення", icon: Ban, desc: "Вимагати PIN при скасуванні відкритого замовлення" },
  { id: "apply_discount", label: "Застосування знижки", icon: Tag, desc: "Вимагати PIN при ручній знижці або промокоді" },
  { id: "open_shift", label: "Відкриття зміни (каси)", icon: DoorOpen, desc: "Вимагати PIN при відкритті касової зміни" },
  { id: "delete_item", label: "Видалення позиції з чеку", icon: Minus, desc: "Вимагати PIN при видаленні страви з вже відправленого замовлення" },
];

// ─── PIN Pad ──────────────────────────────────────────────────────────────────
function PinPad({ value, onChange, maxLen = 6 }: { value: string; onChange: (v: string) => void; maxLen?: number }) {
  function press(d: string) { if (value.length < maxLen) onChange(value + d); }
  function del() { onChange(value.slice(0, -1)); }

  return (
    <div className="space-y-3">
      {/* Display */}
      <div className="flex justify-center gap-3">
        {Array.from({ length: maxLen }).map((_, i) => (
          <div key={i} className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-colors ${
            i < value.length ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"
          }`}>
            {i < value.length ? "●" : ""}
          </div>
        ))}
      </div>
      {/* Pad */}
      <div className="grid grid-cols-3 gap-2 max-w-[200px] mx-auto">
        {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => (
          k === "" ? <div key={i} /> :
          k === "⌫" ? (
            <button key={i} onClick={del} disabled={!value}
              className="h-10 rounded-lg border text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors font-medium">
              ⌫
            </button>
          ) : (
            <button key={i} onClick={() => press(k)} disabled={value.length >= maxLen}
              className="h-10 rounded-lg border font-semibold hover:bg-muted disabled:opacity-50 transition-colors">
              {k}
            </button>
          )
        ))}
      </div>
    </div>
  );
}

// ─── Verify dialog (for testing) ─────────────────────────────────────────────
function VerifyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [pin, setPin] = useState("");
  const [result, setResult] = useState<boolean | null>(null);

  const verify = useMutation({
    mutationFn: () => apiFetch("/admin-pin/verify", { method: "POST", body: JSON.stringify({ pin }) }),
    onSuccess: (d) => { setResult(d.valid); },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  function close() { setPin(""); setResult(null); onClose(); }

  return (
    <AlertDialog open={open} onOpenChange={v => !v && close()}>
      <AlertDialogContent className="max-w-xs">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-center">Перевірити PIN</AlertDialogTitle>
          <AlertDialogDescription className="text-center">Введіть PIN щоб перевірити чи він правильний</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-3 space-y-4">
          {result === null ? (
            <PinPad value={pin} onChange={setPin} />
          ) : result ? (
            <div className="text-center space-y-2">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
              <p className="font-semibold text-green-700">PIN правильний!</p>
            </div>
          ) : (
            <div className="text-center space-y-2">
              <X className="w-12 h-12 text-red-500 mx-auto" />
              <p className="font-semibold text-red-700">Невірний PIN</p>
              <Button size="sm" variant="outline" onClick={() => { setPin(""); setResult(null); }}>Спробувати ще</Button>
            </div>
          )}
        </div>
        <AlertDialogFooter>
          {result === null && (
            <>
              <AlertDialogCancel onClick={close}>Скасувати</AlertDialogCancel>
              <AlertDialogAction onClick={() => pin.length >= 4 && verify.mutate()} disabled={pin.length < 4}>
                Перевірити
              </AlertDialogAction>
            </>
          )}
          {result !== null && (
            <Button className="w-full" onClick={close}>Закрити</Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function FbAdminPin() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [step, setStep] = useState<"enter" | "confirm">("enter");
  const [actions, setActions] = useState<string[]>(["cancel_order", "apply_discount", "open_shift", "delete_item"]);
  const [showTest, setShowTest] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["fb-admin-pin"],
    queryFn: () => apiFetch("/admin-pin"),
  });
  const pinIsSet = data?.pin?.is_set;

  const setPin = useMutation({
    mutationFn: (d: { pin: string; actions: string[] }) =>
      apiFetch("/admin-pin", { method: "POST", body: JSON.stringify(d) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fb-admin-pin"] });
      setNewPin(""); setConfirmPin(""); setStep("enter");
      toast({ title: "PIN встановлено" });
    },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  const removePin = useMutation({
    mutationFn: () => apiFetch("/admin-pin", { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fb-admin-pin"] }); setDeleteConfirm(false); toast({ title: "PIN видалено" }); },
    onError: (e: any) => toast({ title: e.message, variant: "destructive" }),
  });

  function toggleAction(id: string) {
    setActions(a => a.includes(id) ? a.filter(x => x !== id) : [...a, id]);
  }

  function handlePinEnter(v: string) {
    setNewPin(v);
    if (v.length === 4) setTimeout(() => setStep("confirm"), 200);
  }

  function handlePinConfirm(v: string) {
    setConfirmPin(v);
    if (v.length === 4) {
      if (v === newPin) {
        setTimeout(() => setPin.mutate({ pin: v, actions }), 200);
      } else {
        setTimeout(() => {
          toast({ title: "PIN не збігається. Спробуйте ще раз.", variant: "destructive" });
          setNewPin(""); setConfirmPin(""); setStep("enter");
        }, 200);
      }
    }
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        {/* Header */}
        <div className="px-5 py-4 border-b bg-background shrink-0">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-muted-foreground" />
            <div>
              <h1 className="text-lg font-bold">Admin PIN-захист</h1>
              <p className="text-xs text-muted-foreground">Захист критичних дій у F&B від несанкціонованих змін</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="max-w-xl mx-auto space-y-5">

            {/* Status card */}
            <div className={`border rounded-xl p-5 flex items-center gap-4 ${pinIsSet ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}>
              {pinIsSet ? (
                <ShieldCheck className="w-10 h-10 text-green-600 shrink-0" />
              ) : (
                <ShieldOff className="w-10 h-10 text-amber-600 shrink-0" />
              )}
              <div className="flex-1">
                <div className={`font-semibold ${pinIsSet ? "text-green-800" : "text-amber-800"}`}>
                  {pinIsSet ? "PIN-захист активний" : "PIN ще не встановлено"}
                </div>
                <div className={`text-sm ${pinIsSet ? "text-green-700" : "text-amber-700"}`}>
                  {pinIsSet
                    ? `Захищено ${data.pin.actions?.length || 0} дій. Касири не зможуть їх виконати без PIN адміністратора.`
                    : "Без PIN будь-хто з доступом до POS-терміналу може виконувати будь-які дії."}
                </div>
              </div>
              {pinIsSet && (
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setShowTest(true)} className="border-green-300 text-green-800 hover:bg-green-100">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Перевірити
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDeleteConfirm(true)} className="border-red-200 text-red-700 hover:bg-red-50">
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Видалити
                  </Button>
                </div>
              )}
            </div>

            {/* Set/Change PIN */}
            <div className="border rounded-xl p-5 bg-card space-y-4">
              <h2 className="font-semibold">{pinIsSet ? "Змінити PIN" : "Встановити PIN"}</h2>

              <div className="text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  {step === "enter" ? "Введіть новий 4-значний PIN:" : "Підтвердіть PIN — введіть ще раз:"}
                </p>
                {step === "enter"
                  ? <PinPad value={newPin} onChange={handlePinEnter} maxLen={4} />
                  : <PinPad value={confirmPin} onChange={handlePinConfirm} maxLen={4} />
                }
                {step === "confirm" && (
                  <button onClick={() => { setStep("enter"); setNewPin(""); setConfirmPin(""); }}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                    ← Ввести інший PIN
                  </button>
                )}
                {setPin.isPending && (
                  <p className="text-sm text-muted-foreground animate-pulse">Зберігаємо...</p>
                )}
              </div>
            </div>

            {/* Protected actions */}
            <div className="border rounded-xl p-5 bg-card space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Захищені дії</h2>
                <span className="text-xs text-muted-foreground">{actions.length} з {ACTIONS.length} обрано</span>
              </div>
              <p className="text-xs text-muted-foreground">Оберіть дії, для яких касир повинен вводити PIN адміністратора:</p>
              <div className="space-y-2">
                {ACTIONS.map(a => (
                  <div key={a.id} onClick={() => toggleAction(a.id)}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      actions.includes(a.id) ? "border-primary/40 bg-primary/5" : "hover:bg-muted/50"
                    }`}>
                    <Switch checked={actions.includes(a.id)} onCheckedChange={() => toggleAction(a.id)} onClick={e => e.stopPropagation()} />
                    <a.icon className={`w-4 h-4 shrink-0 ${actions.includes(a.id) ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <div className="text-sm font-medium">{a.label}</div>
                      <div className="text-xs text-muted-foreground">{a.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              {pinIsSet && (
                <Button size="sm" variant="outline" className="w-full mt-2"
                  onClick={() => setPin.mutate({ pin: "_keep_", actions })}
                  disabled={setPin.isPending}>
                  Зберегти налаштування дій
                </Button>
              )}
            </div>

            {/* Info */}
            <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 text-sm text-blue-800 space-y-1.5">
              <div className="flex items-center gap-2 font-medium"><Info className="w-4 h-4" /> Як це працює</div>
              <ul className="text-xs text-blue-700 list-disc list-inside space-y-1">
                <li>PIN зберігається у зашифрованому вигляді (SHA-256)</li>
                <li>Касирам показується PIN-пад при спробі виконати захищену дію</li>
                <li>Адміністратор вводить свій PIN — і дія дозволяється</li>
                <li>Невірний PIN блокує дію без повідомлення про кількість спроб</li>
              </ul>
            </div>

          </div>
        </div>
      </div>

      <VerifyDialog open={showTest} onClose={() => setShowTest(false)} />

      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити PIN-захист?</AlertDialogTitle>
            <AlertDialogDescription>Після видалення будь-хто зможе виконувати всі дії без підтвердження.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removePin.mutate()}>Видалити PIN</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
