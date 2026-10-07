import type { Lang } from "./content";
import { content } from "./content";

export function Marquee({ lang }: { lang: Lang }) {
  const names = ["HMS", "POS", ...content[lang].products.items.map((p) => p.name)];
  const row = (hide: boolean) => (
    <div className="mh-mq-row" aria-hidden={hide || undefined}>
      {[0, 1].map((k) => names.map((n) => <span key={`${k}${n}`}>{n}<i /></span>))}
    </div>
  );
  return <div className="mh-mq"><div className="mh-mq-track">{row(false)}{row(true)}</div></div>;
}
