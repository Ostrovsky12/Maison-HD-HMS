import { AppLayout } from "@/components/layout/AppLayout";
import { useListGuideLocations } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Leaf, TreePine, Bird, Droplets, Mountain } from "lucide-react";

const natureCards = [
  {
    icon: TreePine,
    color: "bg-green-50 text-green-700 border-green-100",
    title: "Сосновий ліс",
    text: "Ліс навколо Дзвінкового — переважно сосновий, посаджений у середині XX ст. Смолистий аромат, тихі алеї, сонячні галявини.",
  },
  {
    icon: Bird,
    color: "bg-sky-50 text-sky-700 border-sky-100",
    title: "Птахи Ірпеня",
    text: "Річка Ірпінь приваблює понад 80 видів птахів. Навесні і восени тут зупиняються перелітні птахи: чаплі, качки, мартини.",
  },
  {
    icon: Droplets,
    color: "bg-teal-50 text-teal-700 border-teal-100",
    title: "Лісове джерело",
    text: "На схилі урочища б'є природне джерело. Вода чиста, холодна влітку. Місцеві жителі вважають її цілющою.",
  },
  {
    icon: Mountain,
    color: "bg-amber-50 text-amber-700 border-amber-100",
    title: "Рельєф та ґрунти",
    text: "Пагорбисте плато Вишгородщини. Піщані ґрунти чудово дренуються, тому навіть після дощу стежки швидко сохнуть.",
  },
  {
    icon: Leaf,
    color: "bg-emerald-50 text-emerald-700 border-emerald-100",
    title: "Гриби та ягоди",
    text: "З серпня по жовтень — сезон грибів: підберезники, лисички, маслюки. Наприкінці літа достигає чорниця та шипшина.",
  },
];

const seasonTips = [
  { season: "Весна (кв–трав)", tip: "Цвітуть перші квіти, прилітають птахи. Дощово — гумові чоботи обов'язкові.", badge: "bg-green-100 text-green-700" },
  { season: "Літо (чер–серп)", tip: "Спека — виходьте зранку або ввечері. Репелент від комарів на заплавних ділянках.", badge: "bg-yellow-100 text-yellow-700" },
  { season: "Осінь (вер–жовт)", tip: "Золота листопадна краса, гриби, суха погода — найкращий сезон для прогулянок.", badge: "bg-orange-100 text-orange-700" },
  { season: "Зима (лис–бер)", tip: "Лижня прокладається після снігопадів. Тиша лісу, сліди звірів, морозне повітря.", badge: "bg-blue-100 text-blue-700" },
];

export default function NaturePage() {
  const { data: locations, isLoading } = useListGuideLocations({});

  return (
    <AppLayout>
      <div className="px-6 py-8 pb-28 space-y-8 animate-in fade-in duration-500">
        <header className="space-y-2">
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs px-3 py-1 font-medium tracking-wide rounded-full">
            Природа DOGODA
          </Badge>
          <h1 className="text-3xl font-serif text-foreground leading-tight">
            Живий ліс<br />
            <span className="text-primary italic">Дзвінкового</span>
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Дзвінкове розташоване на межі соснового лісу та заплави Ірпеня — унікальне поєднання для Київської області.
          </p>
        </header>

        <div className="space-y-4">
          {natureCards.map((card) => (
            <Card key={card.title} className={`rounded-2xl border shadow-none ${card.color}`}>
              <CardContent className="p-5 flex gap-4 items-start">
                <div className="p-2 rounded-xl bg-white/60 shrink-0">
                  <card.icon className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">{card.title}</h3>
                  <p className="text-xs leading-relaxed opacity-80">{card.text}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-serif text-foreground">Сезонний календар</h2>
          <div className="space-y-3">
            {seasonTips.map((s) => (
              <div key={s.season} className="flex gap-3 items-start">
                <Badge className={`rounded-full font-medium text-xs shrink-0 ${s.badge} border-none`}>{s.season}</Badge>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.tip}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-serif text-foreground flex items-center justify-between">
            <span>Всі локації</span>
            <Link href="/map" className="text-xs font-sans font-medium text-primary hover:underline">
              Відкрити карту
            </Link>
          </h2>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ) : (
            <div className="space-y-2">
              {locations?.map((loc) => (
                <Link key={loc.id} href={`/locations/${loc.id}`} className="block">
                  <Card className="rounded-xl border-border bg-card shadow-none hover:shadow-sm hover:border-primary/30 transition-all duration-200">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <Leaf className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-foreground truncate">{loc.titleUa}</h3>
                        {loc.shortDescUa && (
                          <p className="text-xs text-muted-foreground truncate">{loc.shortDescUa}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
