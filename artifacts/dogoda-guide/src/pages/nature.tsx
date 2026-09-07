import { AppLayout } from "@/components/layout/AppLayout";
import { useListGuideLocations } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Leaf, TreePine, Bird, Droplets, Mountain, ShieldCheck, CloudRain } from "lucide-react";

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
    color: "bg-amber-50 text-amber-800 border-amber-200",
    title: "Осінній грибний сезон",
    text: "Найкращий час для пошуку — ранок після кількох теплих дощових днів. У сосновому та змішаному лісі трапляються маслюки, лисички й підберезники.",
  },
];

const seasonTips = [
  { season: "Весна (кв–трав)", tip: "Цвітуть перші квіти, прилітають птахи. Дощово — гумові чоботи обов'язкові.", badge: "bg-green-100 text-green-700" },
  { season: "Літо (чер–серп)", tip: "Спека — виходьте зранку або ввечері. Репелент від комарів на заплавних ділянках.", badge: "bg-yellow-100 text-yellow-700" },
  { season: "Осінь (вер–лист)", tip: "Головний грибний сезон. Після дощу стежки вологі — беріть водостійке взуття, кошик і заряджений телефон.", badge: "bg-orange-100 text-orange-700" },
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
            Осінній ліс<br />
            <span className="text-primary italic">і грибні прогулянки</span>
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Дзвінкове розташоване на межі соснового лісу та заплави Ірпеня. Восени це місце наповнюється ароматом хвої, золотим листям і тихим полюванням.
          </p>
        </header>

        <section className="rounded-3xl bg-gradient-to-br from-amber-100 via-orange-50 to-stone-100 border border-amber-200 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-white/70 text-amber-800">
              <Leaf className="w-6 h-6" />
            </div>
            <div>
              <Badge className="bg-amber-800 text-white border-none rounded-full mb-1">У фокусі цієї осені</Badge>
              <h2 className="text-xl font-serif text-stone-900">На тихе полювання</h2>
            </div>
          </div>
          <div className="grid gap-3">
            <div className="flex gap-3 text-sm text-stone-700">
              <CloudRain className="w-4 h-4 mt-0.5 shrink-0 text-amber-800" />
              <p><strong>Коли йти:</strong> зранку, через 1–3 дні після теплого дощу.</p>
            </div>
            <div className="flex gap-3 text-sm text-stone-700">
              <TreePine className="w-4 h-4 mt-0.5 shrink-0 text-amber-800" />
              <p><strong>Де шукати:</strong> вздовж світлих узлісь, старих лісових доріг і серед моху — не сходячи далеко з відомих стежок.</p>
            </div>
            <div className="flex gap-3 text-sm text-stone-700">
              <Leaf className="w-4 h-4 mt-0.5 shrink-0 text-amber-800" />
              <p><strong>Що взяти:</strong> плетений кошик, невеликий ніж, воду, дощовик і засіб від кліщів.</p>
            </div>
          </div>
        </section>

        <Card className="rounded-2xl border-red-200 bg-red-50 text-red-950 shadow-none">
          <CardContent className="p-5 flex gap-4 items-start">
            <div className="p-2 rounded-xl bg-white/70 text-red-700 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">Безпека понад усе</h2>
              <ul className="text-xs leading-relaxed opacity-80 space-y-1 list-disc pl-4">
                <li>Не беріть гриб, якщо не впевнені у ньому на 100%.</li>
                <li>Не куштуйте сирі гриби та не покладайтеся лише на фото чи мобільний застосунок.</li>
                <li>Не збирайте біля доріг, смітників та оброблених хімікатами ділянок.</li>
                <li>Перед вживанням покажіть збір досвідченому грибнику або фахівцю.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

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
          <h2 className="text-lg font-serif text-foreground">Календар природи</h2>
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
