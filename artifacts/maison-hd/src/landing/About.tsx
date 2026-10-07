import type { Lang } from "./content";
import { content } from "./content";

export function About({ lang }: { lang: Lang }) {
  const a = content[lang].about;
  return (
    <section className="mh-sec mh-light" id="approach">
      <div className="mh-wrap mh-about">
        <div><h2>{a.title}</h2><p>{a.body}</p></div>
        <ol className="mh-steps">{a.items.map((i) => <li key={i.t}><strong>{i.t}</strong><span>{i.d}</span></li>)}</ol>
      </div>
    </section>
  );
}
