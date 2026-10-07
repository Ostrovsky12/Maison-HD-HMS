import type { Lang } from "./content";
import { content } from "./content";
import { ContactForm } from "./ContactForm";

export function Contact({ lang, apiUrl }: { lang: Lang; apiUrl: string }) {
  const f = content[lang].form;
  return (
    <section className="mh-sec mh-dark mh-contact-sec" id="contact">
      <div className="mh-wrap mh-contact">
        <div><h2>{f.title}</h2><p>{f.sub}</p></div>
        <ContactForm lang={lang} apiUrl={apiUrl} />
      </div>
    </section>
  );
}
