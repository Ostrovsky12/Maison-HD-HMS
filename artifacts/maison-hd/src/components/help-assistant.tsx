import { useState, useRef, useEffect } from "react";
import { MessageCircleQuestion, X, Send, Loader2, Bot, ChevronDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = BASE.replace("/maison-hd", "") + "/api";

const authFetch = (url: string, opts: RequestInit = {}) =>
  fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
      ...(opts.headers || {}),
    },
  });

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Як налаштувати Telegram?",
  "Як підключити LiqPay?",
  "Як додати нового співробітника?",
  "Як виставити рахунок?",
  "Як налаштувати юридичну особу?",
  "Як зробити check-in гостя?",
];

function formatMessage(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={key++} className="h-1.5" />);
      continue;
    }

    // Numbered steps: "1. ..."
    const stepMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (stepMatch) {
      elements.push(
        <div key={key++} className="flex gap-2 my-0.5">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
            {stepMatch[1]}
          </span>
          <span className="text-sm leading-relaxed">{stepMatch[2]}</span>
        </div>,
      );
      continue;
    }

    // Bullet: "• ..."
    if (trimmed.startsWith("•") || trimmed.startsWith("-")) {
      elements.push(
        <div key={key++} className="flex gap-2 my-0.5 ml-1">
          <span className="flex-shrink-0 text-primary mt-1 text-xs">▸</span>
          <span className="text-sm leading-relaxed">{trimmed.replace(/^[•\-]\s*/, "")}</span>
        </div>,
      );
      continue;
    }

    // Section headers (all caps with ━)
    if (trimmed.startsWith("━") || trimmed.match(/^[▸►]/) || trimmed.endsWith("━")) {
      elements.push(
        <div key={key++} className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-2 mb-0.5">
          {trimmed.replace(/━/g, "").replace(/[▸►]/g, "").trim()}
        </div>,
      );
      continue;
    }

    elements.push(
      <p key={key++} className="text-sm leading-relaxed">
        {trimmed}
      </p>,
    );
  }

  return <div className="space-y-0.5">{elements}</div>;
}

export function HelpAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, messages]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setShowSuggestions(false);
    const userMsg: Message = { role: "user", content: trimmed };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setLoading(true);

    // Add empty assistant message to stream into
    const assistantIdx = newHistory.length;
    setMessages([...newHistory, { role: "assistant", content: "" }]);

    try {
      const r = await authFetch(`${API}/assist/stream`, {
        method: "POST",
        body: JSON.stringify({
          message: trimmed,
          history: messages.slice(-8),
        }),
      });

      if (!r.ok || !r.body) throw new Error("Stream unavailable");

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      setLoading(false);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.delta) {
              accumulated += parsed.delta;
              setMessages((prev) => {
                const updated = [...prev];
                updated[assistantIdx] = { role: "assistant", content: accumulated };
                return updated;
              });
            }
          } catch {}
        }
      }

      // Ensure final state has full accumulated content
      if (!accumulated) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[assistantIdx] = { role: "assistant", content: "Вибачте, не вдалось отримати відповідь." };
          return updated;
        });
      }
    } catch {
      setLoading(false);
      setMessages((prev) => {
        const updated = [...prev];
        updated[assistantIdx] = { role: "assistant", content: "❌ Помилка з'єднання. Перевірте мережу та спробуйте ще раз." };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setMessages([]);
    setShowSuggestions(true);
    setInput("");
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`
          fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full shadow-lg
          flex items-center justify-center transition-all duration-300
          ${open
            ? "bg-muted text-muted-foreground rotate-180"
            : "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105"
          }
        `}
        title="Помічник налаштувань"
      >
        {open ? <ChevronDown className="w-5 h-5" /> : <MessageCircleQuestion className="w-5 h-5" />}
      </button>

      {/* Chat window */}
      {open && (
        <div
          className="fixed bottom-20 right-5 z-50 w-[360px] max-h-[540px] rounded-2xl shadow-2xl border bg-background flex flex-col overflow-hidden"
          style={{ maxWidth: "calc(100vw - 2.5rem)" }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-primary text-primary-foreground flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm leading-tight">Помічник Maison HD</div>
              <div className="text-xs opacity-75">Запитайте про будь-яку функцію</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="opacity-70 hover:opacity-100 transition-opacity ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
            {/* Welcome */}
            {messages.length === 0 && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center mt-0.5">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-none px-3 py-2 max-w-[85%]">
                  <p className="text-sm leading-relaxed">
                    Привіт! 👋 Я помічник Maison HD. Запитайте мене про будь-яку функцію системи — налаштування, бронювання, рахунки, фінанси, хаускіпінг або інтеграції.
                  </p>
                </div>
              </div>
            )}

            {/* Suggestions */}
            {showSuggestions && messages.length === 0 && (
              <div className="mt-2 space-y-1.5">
                <p className="text-xs text-muted-foreground px-1">Популярні запитання:</p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs bg-primary/8 hover:bg-primary/15 text-primary border border-primary/20 rounded-full px-3 py-1 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center mt-0.5">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div
                  className={`rounded-2xl px-3 py-2 max-w-[85%] ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-none text-sm leading-relaxed"
                      : "bg-muted rounded-tl-none"
                  }`}
                >
                  {m.role === "user" ? m.content : formatMessage(m.content)}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="border-t px-3 py-2.5 flex-shrink-0 bg-background">
            <div className="flex gap-2 items-center">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder="Запитайте що-небудь..."
                className="flex-1 text-sm bg-muted rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60"
              />
              <Button
                size="icon"
                className="w-8 h-8 rounded-xl flex-shrink-0"
                onClick={() => send(input)}
                disabled={!input.trim() || loading}
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </Button>
            </div>
            {messages.length > 0 && (
              <button
                onClick={clear}
                className="text-xs text-muted-foreground hover:text-foreground mt-1.5 ml-1 transition-colors"
              >
                Очистити розмову
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
