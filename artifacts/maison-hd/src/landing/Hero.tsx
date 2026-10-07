import type { Lang } from "./content";
import { content } from "./content";
import { MaisonLogoMark } from "@/components/MaisonLogo";
import { Marquee } from "./Marquee";

export function Hero({ lang }: { lang: Lang }) {
  const h = content[lang].hero;
  const items = content[lang].products.items;
  return (
    <section className="mh-hero" id="top">
      <div className="mh-aurora" aria-hidden="true"><i /><i /><i /></div>
      <div className="mh-floor" aria-hidden="true" />
      <div className="mh-wrap mh-hero-grid">
        <div className="mh-in">
          <span className="mh-kick"><em />{h.kicker}</span>
          <h1>{h.title}</h1>
          <p className="mh-sub">{h.sub}</p>
          <p className="mh-lead">{h.body}</p>
          <div className="mh-cta">
            <a href="#contact" className="mh-btn pri" data-testid="link-hero-contact">{h.cta1}</a>
            <a href="#products" className="mh-btn ghost" data-testid="link-hero-products">{h.cta2}</a>
          </div>
        </div>
        <div className="mh-orbit" aria-hidden="true">
          <div className="mh-ring r1" /><div className="mh-ring r2" /><div className="mh-ring r3" />
          <div className="mh-core"><MaisonLogoMark size={132} /></div>
          <div className="mh-spin s1">{items.slice(0, 3).map((p, i) => <span key={p.id} className={`mh-node n${i}`}>{p.name}</span>)}</div>
          <div className="mh-spin s2">{items.slice(3).map((p, i) => <span key={p.id} className={`mh-node n${i}`}>{p.name}</span>)}</div>
        </div>
      </div>
      <div className="mh-wrap mh-tape">{h.index.map((x) => <span key={x} className="mh-mono">{x}</span>)}</div>
      <Marquee lang={lang} />
    </section>
  );
}
