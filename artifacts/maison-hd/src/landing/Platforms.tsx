import type { Lang } from "./content";
import { content } from "./content";

export function Platforms({ lang }: { lang: Lang }) {
  const p = content[lang].platforms;
  return (
    <section className="mh-sec mh-dark" id="platforms">
      <div className="mh-wrap">
        <div className="mh-sh"><h2>{p.title}</h2><p>{p.sub}</p></div>
        <div className="mh-plats">
          {p.items.map((x) => (
            <article key={x.id} id={x.id} className="mh-plat" aria-labelledby={`${x.id}-t`}>
              <div className="mh-scan" aria-hidden="true" />
              <h3 id={`${x.id}-t`}>{x.name}</h3>
              <span className="mh-mono">{x.tag}</span>
              <p>{x.desc}</p>
              <ul>{x.points.map((pt) => <li key={pt}>{pt}</li>)}</ul>
              <a href="#contact" className="mh-btn sm ghost" data-testid={`link-${x.id}-contact`}>{p.cta}</a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
