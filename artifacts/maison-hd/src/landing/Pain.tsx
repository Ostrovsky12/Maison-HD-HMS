import { ArrowRight } from "lucide-react";
import type { Lang } from "./content";
import { content } from "./content";

export function Pain({ lang }: { lang: Lang }) {
  const p = content[lang].pain;
  const [a, b] = lang === "ua" ? ["Дайте нам ", "ВАШ БІЛЬ"] : ["Give us ", "YOUR PAIN"];
  const rest = lang === "ua" ? " і ми знайдемо рішення." : ", and we will find the solution.";
  return (
    <section className="mh-sec mh-pain" aria-labelledby="pain-t">
      <div className="mh-wrap">
        <p className="mh-mono" style={{ marginBottom: "1.5rem" }}>{p.kicker}</p>
        <h2 id="pain-t">{a}<em>{b}</em>{lang === "ua" ? " —" : ""}{rest}</h2>
        <p>{p.body}</p>
        <a href="#contact" className="mh-btn" data-testid="link-pain-contact">{p.cta}<ArrowRight size={16} aria-hidden="true" /></a>
      </div>
    </section>
  );
}
