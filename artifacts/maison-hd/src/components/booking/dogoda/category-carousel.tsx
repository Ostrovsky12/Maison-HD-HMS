import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./category-carousel.css";

export function CategoryCarousel({ children, initialIndex = 0 }: { children: ReactNode; initialIndex?: number }) {
  const items = Children.toArray(children);
  const [active, setActive] = useState(initialIndex);
  const viewport = useRef<HTMLDivElement>(null);
  const move = (index: number, smooth = true) => {
    const rail = viewport.current;
    const next = Math.max(0, Math.min(items.length - 1, index));
    const card = rail?.children[next] as HTMLElement | undefined;
    if (!rail || !card) return;
    const left = rail.scrollLeft + card.getBoundingClientRect().left - rail.getBoundingClientRect().left
      - (rail.clientWidth - card.offsetWidth) / 2;
    rail.scrollTo({ left, behavior: smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant" });
    setActive(next);
  };
  useEffect(() => {
    const frame = requestAnimationFrame(() => move(initialIndex, false));
    return () => cancelAnimationFrame(frame);
    // Restore the selected category when returning from guest details.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="dg-category-carousel" data-testid="category-carousel">
    <div ref={viewport} className="dc-viewport" role="region" aria-label="Номери й будинки" aria-roledescription="карусель"
      onScroll={() => {
        const rail = viewport.current;
        if (!rail) return;
        const center = rail.getBoundingClientRect().left + rail.clientWidth / 2;
        let nearest = 0, distance = Infinity;
        Array.from(rail.children).forEach((node, index) => {
          const rect = node.getBoundingClientRect();
          const d = Math.abs(rect.left + rect.width / 2 - center);
          if (d < distance) { distance = d; nearest = index; }
        });
        setActive(nearest);
      }}>
      {items.map((item, index) => <div key={(item as { key?: string }).key ?? index} className="dc-slide"
        role="group" aria-roledescription="слайд" aria-label={`${index + 1} з ${items.length}`} data-active={active === index}>
        {item}
      </div>)}
    </div>
    {items.length > 1 && <>
      <nav className="dc-controls" aria-label="Перегортання розміщень">
        <button type="button" onClick={() => move(active - 1)} disabled={active === 0} aria-label="Попереднє розміщення" data-testid="carousel-prev"><ChevronLeft size={18} /></button>
        <span aria-live="polite">{String(active + 1).padStart(2, "0")} — {String(items.length).padStart(2, "0")}</span>
        <button type="button" onClick={() => move(active + 1)} disabled={active === items.length - 1} aria-label="Наступне розміщення" data-testid="carousel-next"><ChevronRight size={18} /></button>
      </nav>
      <div className="dc-dots">{items.map((_, index) => <button key={index} type="button"
        aria-label={`До розміщення ${index + 1}`} aria-current={active === index} onClick={() => move(index)} />)}</div>
    </>}
  </div>;
}
