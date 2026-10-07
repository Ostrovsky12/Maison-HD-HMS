import { ArrowRight, ArrowDown } from "lucide-react";
import type { Lang } from "./content";
import { content } from "./content";

export function Hero({ lang }: { lang: Lang }) {
  const h = content[lang].hero;
  return (
    <section className="mh-hero" id="top">
      <div className="mh-grid-art" aria-hidden="true" />
      <div className="mh-wrap" style={{ position: "relative" }}>
        <p className="mh-mono mh-in" style={{ color: "var(--sig)", marginBottom: "1.5rem" }}>{h.kicker}</p>
        <h1 className="mh-in d1">MAISON <b>HD</b></h1>
        <p className="mh-sub mh-in d2">{h.sub}</p>
        <div className="mh-hero-grid mh-in d3">
          <p>{h.body}</p>
          <div className="mh-cta" style={{ marginTop: 0 }}>
            <a href="#contact" className="mh-btn pri" data-testid="link-hero-contact">{h.cta1}<ArrowRight size={16} aria-hidden="true" /></a>
            <a href="#products" className="mh-btn" data-testid="link-hero-products">{h.cta2}<ArrowDown size={16} aria-hidden="true" /></a>
          </div>
        </div>
        <div className="mh-tape mh-mono">{h.index.map((i) => <span key={i}>{i}</span>)}</div>
      </div>
    </section>
  );
}
