import type { Lang } from "./content";
import { content } from "./content";

export function Pain({ lang }: { lang: Lang }) {
  const p = content[lang].pain;
  const m = p.title.match(/^(.*?)(ВАШ БІЛЬ|YOUR PAIN)(.*)$/);
  return (
    <section className="mh-sec mh-pain" id="pain">
      <div className="mh-pulse" aria-hidden="true"><i /><i /><i /></div>
      <div className="mh-wrap">
        <span className="mh-mono">{p.kicker}</span>
        <h2>{m ? <>{m[1]}<em>{m[2]}</em>{m[3]}</> : p.title}</h2>
        <p>{p.body}</p>
        <a href="#contact" className="mh-btn light" data-testid="link-pain-contact">{p.cta}</a>
      </div>
    </section>
  );
}
