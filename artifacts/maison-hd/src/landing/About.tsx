import type { Lang } from "./content";
import { content } from "./content";
import { Reveal } from "./Reveal";

export function About({ lang }: { lang: Lang }) {
  const a = content[lang].about;
  return (
    <section className="mh-sec" id="approach" style={{ marginTop: "clamp(3rem,6vw,5rem)" }}>
      <div className="mh-wrap">
        <Reveal className="mh-about">
          <div><h2>{a.title}</h2><p>{a.body}</p></div>
          <ol className="mh-steps">
            {a.items.map((i) => <li key={i.t}><strong>{i.t}</strong><span>{i.d}</span></li>)}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
