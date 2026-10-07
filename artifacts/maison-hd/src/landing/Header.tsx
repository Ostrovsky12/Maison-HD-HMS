import type { Lang } from "./content";
import { content } from "./content";

export function Header({ lang, setLang, base }: { lang: Lang; setLang: (l: Lang) => void; base: string }) {
  const n = content[lang].nav;
  return (
    <header className="mh-head">
      <div className="mh-wrap mh-head-in">
        <a href="#top" className="mh-brand" aria-label="Maison HD">
          <span className="mh-mark" aria-hidden="true">HD</span>MAISON HD
        </a>
        <nav className="mh-nav" aria-label="Main">
          <a href="#platforms">{n.solutions}</a>
          <a href="#products">{n.products}</a>
          <a href="#approach">{n.approach}</a>
          <a href="#contact">{n.contact}</a>
        </nav>
        <div className="mh-act">
          <div className="mh-lang" role="group" aria-label={n.langLabel}>
            <button type="button" aria-pressed={lang === "ua"} onClick={() => setLang("ua")} data-testid="button-lang-ua">UA</button>
            <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")} data-testid="button-lang-en">EN</button>
          </div>
          <a href={`${base}/login`} className="mh-signin" data-testid="link-login">{n.login}</a>
          <a href="#contact" className="mh-btn sm pri" data-testid="link-nav-contact">{n.cta}</a>
        </div>
      </div>
    </header>
  );
}
