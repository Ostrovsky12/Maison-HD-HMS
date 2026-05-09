import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from "@/components/ui/shared";
import { useAuth } from "@/hooks/use-auth";
import { Download, Upload, CheckCircle, XCircle, AlertCircle, RefreshCw, FileJson } from "lucide-react";

const API_BASE = "";

type ImportStatus = "idle" | "fetching" | "success" | "error";

interface ImportStats {
  guests: number;
  bookings: number;
  skipped: number;
}

export default function ImportPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [rawPreview, setRawPreview] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("2024-01-01");

  const getToken = () => localStorage.getItem("hms_token") || "";

  const fetchFromDogoda = async () => {
    setStatus("fetching");
    setMessage("Підключення до dogoda.me...");
    setStats(null);
    setRawPreview(null);

    try {
      const res = await fetch(`${API_BASE}/api/import/fetch?start_date=${startDate}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.error === "timeout") {
          setStatus("error");
          setMessage("⏱ Сервер dogoda.me не відповів (таймаут). Спробуйте вручну завантажити дані нижче.");
        } else {
          setStatus("error");
          setMessage(json.message || "Помилка підключення до dogoda.me");
        }
        return;
      }

      if (json.raw) {
        setRawPreview(json.raw);
        setStatus("error");
        setMessage("Отримано дані у невідомому форматі. Перегляньте попередній перегляд нижче.");
        return;
      }

      if (!json.data) {
        setStatus("error");
        setMessage("Порожня відповідь від dogoda.me");
        return;
      }

      setMessage("Дані отримано! Імпортую...");
      await importData(json.data);
    } catch (err: any) {
      setStatus("error");
      setMessage("Помилка мережі: " + err.message);
    }
  };

  const importData = async (data: any) => {
    if (!user?.organizationId) {
      setStatus("error");
      setMessage("Не визначено організацію");
      return;
    }

    const res = await fetch(`${API_BASE}/api/import/data`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({ data, organizationId: user.organizationId }),
    });

    const json = await res.json();
    if (res.ok && json.success) {
      setStatus("success");
      setStats(json.stats);
      setMessage("Імпорт завершено успішно!");
    } else {
      setStatus("error");
      setMessage(json.message || "Помилка імпорту");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("fetching");
    setMessage("Читаю файл...");
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setMessage("Файл завантажено, імпортую...");
      await importData(data);
    } catch {
      setStatus("error");
      setMessage("Помилка: файл не є коректним JSON");
    }
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Імпорт даних</h1>
          <p className="text-muted-foreground mt-1">Перенесення бронювань та гостей з попередньої системи Dogoda.</p>
        </div>

        {/* Auto Fetch Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5 text-primary" />
              Автоматичний імпорт з dogoda.me
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Система спробує автоматично завантажити всі бронювання з вашої поточної системи dogoda.me через API.
            </p>

            <div className="flex items-center gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Дата початку</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="mt-5">
                <Button
                  onClick={fetchFromDogoda}
                  disabled={status === "fetching"}
                >
                  {status === "fetching"
                    ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Завантаження...</>
                    : <><Download className="w-4 h-4 mr-2" /> Імпортувати з dogoda.me</>
                  }
                </Button>
              </div>
            </div>

            {/* Status Block */}
            {status !== "idle" && (
              <div className={`flex items-start gap-3 p-4 rounded-lg text-sm ${
                status === "success" ? "bg-emerald-500/10 text-emerald-700" :
                status === "error" ? "bg-red-500/10 text-red-700" :
                "bg-primary/10 text-primary"
              }`}>
                {status === "success" && <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
                {status === "error" && <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
                {status === "fetching" && <RefreshCw className="w-5 h-5 flex-shrink-0 mt-0.5 animate-spin" />}
                <div>
                  <div className="font-medium">{message}</div>
                  {stats && (
                    <div className="flex gap-4 mt-2">
                      <span>Гостей: <strong>{stats.guests}</strong></span>
                      <span>Бронювань: <strong>{stats.bookings}</strong></span>
                      <span>Пропущено: <strong>{stats.skipped}</strong></span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {rawPreview && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Попередній перегляд відповіді:</p>
                <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto max-h-40">{rawPreview}</pre>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Manual Upload Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              Ручний імпорт (JSON файл)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Якщо автоматичний імпорт не працює — завантажте дані вручну. Відкрийте наступне посилання в браузері, збережіть відповідь як .json файл і завантажте сюди:
            </p>
            <div className="bg-muted p-3 rounded-lg">
              <code className="text-xs break-all">
                https://dogoda.me/dogodaStatsDumperGet.php?scode=D0gdsa3crt&start_date={startDate}
              </code>
            </div>

            <div>
              <label className="flex items-center justify-center gap-2 w-full p-8 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group">
                <FileJson className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Натисніть або перетягніть JSON файл</span>
                <input type="file" accept=".json,application/json" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-700">
              <div className="font-medium mb-1">Важливо перед імпортом</div>
              <ul className="space-y-1 text-xs opacity-90">
                <li>• Імпорт додає нові записи, не перезаписує існуючі</li>
                <li>• Гості та бронювання будуть прив'язані до організації Dogoda Resort</li>
                <li>• Юніти мають мати однакові назви в обох системах для коректного зіставлення</li>
                <li>• Рекомендується зробити резервну копію перед імпортом</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
