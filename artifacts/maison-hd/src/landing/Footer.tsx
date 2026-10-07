import type { Lang } from "./content";
import { content } from "./content";
import { MaisonLogoMark } from "@/components/MaisonLogo";

export function Footer({ lang, base }: { lang: Lang; base: string }) {
  const c = content[lang];
  return (
    <footer className="mh-foot">
      <div className="mh-foot-glow" aria-hidden="true" />
      <div className="mh-wrap">
        <div className="mh-foot-in">
          <div>
            <div className="mh-brand"><MaisonLogoMark size={44} /><span>MAISON <b>HD</b></span></div>
            <p style={{ marginTop: ".9rem" }}>{c.footer.desc}</p>
          </div>
          <div><span className="mh-mono">{c.footer.products}</span>
            <ul>{c.products.items.map((p) => <li key={p.id}><a href={p.url} target="_blank" rel="noopener noreferrer">{p.name}</a></li>)}<li><a href="#hms">HMS</a></li><li><a href="#pos">POS</a></li></ul></div>
          <div><span className="mh-mono">{c.footer.access}</span><ul><li><a href={`${base}/login`} data-testid="link-footer-login">{c.footer.login}</a></li></ul></div>
        </div>
        <p className="mh-copy">© {new Date().getFullYear()} {c.footer.copy}</p>
      </div>
    </footer>
  );
}
