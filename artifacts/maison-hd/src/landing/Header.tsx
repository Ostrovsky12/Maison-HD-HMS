import { useState } from "react";
import type { Lang } from "./content";
import { content } from "./content";
import { MaisonLogoMark } from "@/components/MaisonLogo";

export function Header({ lang, setLang, base }: { lang: Lang; setLang: (l: Lang) => void; base: string }) {
  const n = content[lang].nav;
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const links = [["#platforms", n.solutions], ["#products", n.products], ["#approach", n.approach], ["#contact", n.contact]];
  return (
    <header className="mh-head">
      <div className="mh-wrap mh-head-in">
        <a href="#top" className="mh-brand" aria-label="Maison HD" onClick={close}>
          <MaisonLogoMark size={34} /><span>MAISON <b>HD</b></span>
        </a>
        <nav className="mh-nav" aria-label="Main">
          {links.map(([h, t]) => <a key={h} href={h}>{t}</a>)}
        </nav>
        <div className="mh-act">
          <div className="mh-lang" role="group" aria-label={n.langLabel}>
            <button type="button" aria-pressed={lang === "ua"} onClick={() => setLang("ua")} data-testid="button-lang-ua">UA</button>
            <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")} data-testid="button-lang-en">EN</button>
          </div>
          <a href={`${base}/login`} className="mh-signin" data-testid="link-login">{n.login}</a>
          <a href="#contact" className="mh-btn sm pri mh-hide-m" data-testid="link-nav-contact">{n.cta}</a>
          <button type="button" className="mh-burger" aria-expanded={open} aria-controls="mh-drawer" aria-label={n.menu} onClick={() => setOpen(!open)} data-testid="button-menu">
            <i /><i />
          </button>
        </div>
      </div>
      {open && (
        <div id="mh-drawer" className="mh-drawer">
          {links.map(([h, t]) => <a key={h} href={h} onClick={close}>{t}</a>)}
          <a href={`${base}/login`} onClick={close} data-testid="link-login-mobile" className="mh-drawer-login">{n.login}</a>
          <a href="#contact" className="mh-btn pri" onClick={close}>{n.cta}</a>
        </div>
      )}
    </header>
  );
}
