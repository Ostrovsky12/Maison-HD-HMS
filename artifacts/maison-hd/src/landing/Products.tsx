import type { Lang } from "./content";
import { content } from "./content";

export function Products({ lang }: { lang: Lang }) {
  const p = content[lang].products;
  return (
    <section className="mh-sec mh-light mh-products" id="products">
      <div className="mh-wrap">
        <div className="mh-sh"><h2>{p.title}</h2><p>{p.sub}</p></div>
        <div className="mh-pgrid">
          {p.items.map((x, i) => (
            <a key={x.id} href={x.url} target="_blank" rel="noopener noreferrer" className={`mh-pcard c${i}`} data-testid={`link-product-${x.id}`}>
              <span className="mh-mono mh-pn">0{i + 1}</span>
              <h3>{x.name}</h3>
              <span className="mh-mono mh-ptag">{x.tag}</span>
              <p>{x.desc}</p>
              <ul>{x.points.map((pt) => <li key={pt}>{pt}</li>)}</ul>
              <span className="mh-pgo">{p.open} <b>{x.host}</b><i aria-hidden="true">&#8599;</i></span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
