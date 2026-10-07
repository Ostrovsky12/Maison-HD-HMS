import type { Lang } from "./content";
import { content } from "./content";

export function Footer({ lang, base }: { lang: Lang; base: string }) {
  const c = content[lang];
  return (
    <footer className="mh-foot">
      <div className="mh-wrap">
        <div className="mh-foot-in">
          <div><div className="mh-brand"><span className="mh-mark" aria-hidden="true">HD</span>MAISON HD</div><p style={{ marginTop: ".8rem" }}>{c.footer.desc}</p></div>
          <div><span className="mh-mono">{c.footer.products}</span>
            <ul>{c.products.items.map((p) => <li key={p.id}><a href={p.url} target="_blank" rel="noopener noreferrer">{p.name}</a></li>)}<li><a href="#hms">HMS</a></li><li><a href="#pos">POS</a></li></ul></div>
          <div><span className="mh-mono">{c.footer.access}</span><ul><li><a href={`${base}/login`}>{c.footer.login}</a></li></ul></div>
        </div>
        <p className="mh-copy">© {new Date().getFullYear()} {c.footer.copy}</p>
      </div>
    </footer>
  );
}
