import { ArrowUpRight } from "lucide-react";
import type { Lang } from "./content";
import { content } from "./content";
import { Reveal } from "./Reveal";

export function Products({ lang }: { lang: Lang }) {
  const p = content[lang].products;
  return (
    <section className="mh-sec" id="products">
      <div className="mh-wrap">
        <div className="mh-sh"><h2>{p.title}</h2><p>{p.sub}</p></div>
        {p.items.map((x, i) => (
          <Reveal key={x.id}>
            <article className="mh-prod">
              <span className="mh-mono" style={{ color: "var(--ink2)" }}>0{i + 1}</span>
              <div><h3>{x.name}</h3><span className="mh-mono">{x.tag}</span></div>
              <div><p>{x.desc}</p><ul>{x.points.map((pt) => <li key={pt}>{pt}</li>)}</ul></div>
              <div className="mh-prod-go">
                <a href={x.url} target="_blank" rel="noopener noreferrer" className="mh-btn sm" data-testid={`link-product-${x.id}`} aria-label={`${p.open} ${x.name}`}>
                  {p.open}<ArrowUpRight size={15} aria-hidden="true" />
                </a>
                <small>{x.host}</small>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
