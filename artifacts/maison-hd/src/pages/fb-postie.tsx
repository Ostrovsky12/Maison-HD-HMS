import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Cpu, TrendingUp, Package, FileText, Brain } from "lucide-react";

const TASKS = [
  {
    emoji: "🥑",
    title: "Розпізнати накладну",
    desc: "Введення накладної з фотографії",
    href: null,
    free: false,
  },
  {
    emoji: "🔮",
    title: "Проаналізувати дані",
    desc: "Аналіз продажів, складу та фінансів",
    href: null,
    free: true,
  },
  {
    emoji: "🤠",
    title: "Контроль фудкосту",
    desc: "Аналіз фудкосту та рекомендації по цінах",
    href: null,
    free: true,
    featured: true,
  },
  {
    emoji: "💰",
    title: "Імпортувати виписку з банку",
    desc: "Швидке створення фінансових транзакцій з файлу",
    href: null,
    free: false,
  },
];

export default function FbPostie() {
  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b bg-background shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cpu className="w-6 h-6 text-violet-600" />
            <h1 className="text-lg font-bold">Postie AI Assistant</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Використано</span>
            <button className="flex items-center gap-1 text-sm border rounded-lg px-3 py-1.5 hover:bg-muted/50">
              <span className="font-medium">0 з 120 дій</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Greeting */}
            <div className="flex items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center text-2xl shadow-lg">
                🤖
              </div>
              <div>
                <h2 className="text-xl font-bold">Добрий день!</h2>
                <p className="text-muted-foreground">Чим Postie може бути корисною сьогодні?</p>
              </div>
            </div>

            {/* Task cards */}
            <div className="grid grid-cols-2 gap-4">
              {TASKS.map(task => (
                <div key={task.title}
                  className={`relative border rounded-xl p-5 cursor-pointer transition-all hover:shadow-md hover:border-violet-300 ${task.featured ? "border-violet-200 bg-violet-50" : "bg-card"}`}>
                  {task.free && (
                    <Badge className="absolute top-3 right-3 text-[10px] bg-green-100 text-green-800 border-green-200 font-medium">
                      Безкоштовно
                    </Badge>
                  )}
                  <div className="text-3xl mb-3">{task.emoji}</div>
                  <h3 className="font-semibold text-sm mb-1">{task.title}</h3>
                  <p className="text-xs text-muted-foreground mb-4">{task.desc}</p>
                  <Button size="sm" variant={task.featured ? "default" : "outline"} className="w-full">
                    Розпочати
                  </Button>
                </div>
              ))}
            </div>

            {/* Info */}
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-sm text-violet-800">
              <div className="flex items-center gap-2 font-medium mb-1">
                <Brain className="w-4 h-4" />
                Як це працює?
              </div>
              <p className="text-xs text-violet-700">
                Postie — AI-асистент від Poster, що допомагає автоматизувати рутинні задачі вашого ресторанного бізнесу.
                Кожна дія використовує 1 кредит. Базовий план включає 120 дій на місяць.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
