import { useEffect, useState } from "react";
import "@/landing/landing.css";
import type { Lang } from "@/landing/content";
import { Header } from "@/landing/Header";
import { Hero } from "@/landing/Hero";
import { About } from "@/landing/About";
import { Platforms } from "@/landing/Platforms";
import { Products } from "@/landing/Products";
import { Pain } from "@/landing/Pain";
import { Contact } from "@/landing/Contact";
import { Footer } from "@/landing/Footer";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API_URL = BASE.replace("/maison-hd", "") + "/api";

export default function DemoPage() {
  const [lang, setLang] = useState<Lang>("ua");
  useEffect(() => {
    document.documentElement.lang = lang === "ua" ? "uk" : "en";
    document.title = lang === "ua" ? "MAISON HD — сучасні рішення для бізнесу" : "MAISON HD — modern solutions for business";
  }, [lang]);
  return (
    <div className="mh">
      <a href="#main" className="mh-skip">{lang === "ua" ? "Перейти до змісту" : "Skip to content"}</a>
      <Header lang={lang} setLang={setLang} base={BASE} />
      <main id="main">
        <Hero lang={lang} />
        <About lang={lang} />
        <Platforms lang={lang} />
        <Products lang={lang} />
        <Pain lang={lang} />
        <Contact lang={lang} apiUrl={API_URL} />
      </main>
      <Footer lang={lang} base={BASE} />
    </div>
  );
}
