import { useCallback, useEffect, useRef, useState } from "react";
import { BedDouble, Check, ChevronLeft, ChevronRight, Expand, Maximize2, Sofa, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { previewRooms } from "./_data";
import "./_carousel.css";

const money = (value: number) =>
  new Intl.NumberFormat("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + " грн";

export function GuidedCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [descriptionId, setDescriptionId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [rulesId, setRulesId] = useState<string | null>(null);
  const [galleryId, setGalleryId] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);

  const scrollTo = useCallback((index: number) => {
    const next = (index + previewRooms.length) % previewRooms.length;
    setActiveIndex(next);
    cardRefs.current[next]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, []);

  const updateActiveFromScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const midpoint = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    cardRefs.current.forEach((card, index) => {
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const currentDistance = Math.abs(rect.left + rect.width / 2 - midpoint);
      if (currentDistance < distance) {
        nearest = index;
        distance = currentDistance;
      }
    });
    setActiveIndex(nearest);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.addEventListener("scroll", updateActiveFromScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", updateActiveFromScroll);
  }, [updateActiveFromScroll]);

  return (
    <main className="dogoda-root dogoda-cards-preview dogoda-carousel">
      <div className="dc-shell">
        <p className="dc-demo-note">Демонстраційний макет · приклади цін і розміщень не є пропозицією</p>

        <div className="dc-step" aria-label="Крок 2 з 3">
          <span className="dc-step-mark" />
          <span>Крок 2 з 3</span>
          <span className="dc-step-mark" />
          <span>Дати й гості обрані</span>
        </div>
        <header className="dc-heading">
          <h1>Знайдіть своє місце</h1>
          <p>Оберіть розміщення для відпочинку в DOGODA</p>
        </header>
        <div className="dc-property">
          <strong>Заміський комплекс DOGODA</strong>
          Порівняйте варіанти розміщення
        </div>

        <section className="dc-carousel" aria-label="Варіанти розміщення">
          <div className="dc-viewport" ref={viewportRef} aria-roledescription="карусель">
            <div className="dc-track">
              {previewRooms.map((room, index) => {
                const roomId = room.key;
                const selected = selectedId === roomId;
                const isActive = activeIndex === index;
                const rate = {
                  id: index + 1,
                  rateName: "Тариф DOGODA",
                  total: room.total,
                  charges: [] as Array<{ serviceName: string; date: string; amount: number }>,
                  viewOnlyReason: undefined as string | undefined,
                };
                const viewOnlyReason = rate.viewOnlyReason;
                const roomTitle = room.name;
                return (
                  <article
                    className="dc-card"
                    key={room.key}
                    ref={(element) => { cardRefs.current[index] = element; }}
                    data-active={isActive}
                    data-rate-id={rate.id}
                    aria-label={`${roomTitle}, ${index + 1} з ${previewRooms.length}`}
                  >
                    <div className="dc-card-main">
                      <div className="dc-photo">
                        {room.photo
                          ? <img src={room.photo} alt={`${roomTitle}`} loading="lazy" />
                          : <div className="dc-no-photo"><span>Фото цього варіанта ще не додано</span></div>}
                        <button
                          type="button"
                          className="dc-photo-open"
                          onClick={() => setGalleryId(roomId)}
                          aria-label={`Відкрити перегляд фото: ${roomTitle}`}
                        >
                          <Expand size={14} strokeWidth={1.8} />
                          Фото
                        </button>
                      </div>
                      <div className="dc-card-content">
                        <div className="dc-title-row">
                          <h2>{roomTitle}</h2>
                          <span className="dc-position">{String(index + 1).padStart(2, "0")} / {String(previewRooms.length).padStart(2, "0")}</span>
                        </div>
                        <div className="dc-facts" aria-label="Основні характеристики">
                          <span className="dc-fact"><Users size={12} /> До {room.capacity} гостей</span>
                          {room.beds && <span className="dc-fact"><BedDouble size={12} /> {room.beds}</span>}
                        </div>
                        {descriptionId === roomId && room.description && (
                          <p className="dc-description">{room.description}</p>
                        )}
                        <button
                          type="button"
                          className="dc-disclosure"
                          aria-expanded={descriptionId === roomId}
                          onClick={() => setDescriptionId(descriptionId === roomId ? null : roomId)}
                        >
                          {descriptionId === roomId ? "Сховати опис" : "Про це розміщення"}
                        </button>
                        <button
                          type="button"
                          className="dc-disclosure"
                          aria-expanded={detailsId === roomId}
                          onClick={() => setDetailsId(detailsId === roomId ? null : roomId)}
                        >
                          {detailsId === roomId ? "Сховати деталі" : "Характеристики"}
                        </button>
                        {detailsId === roomId && (
                          <div className="dc-details">
                            {room.area && <span className="dc-fact"><Maximize2 size={12} /> {room.area}</span>}
                            {room.sofa && <span className="dc-fact"><Sofa size={12} /> {room.sofa}</span>}
                            {room.amenities.map((amenity) => <span className="dc-fact" key={amenity}>{amenity}</span>)}
                          </div>
                        )}
                        <div className="dc-rate-row">
                          <div>
                            <div className="dc-rate-label">Тариф · неповоротний</div>
                            <div className="dc-price">{money(rate.total)}</div>
                            <div className="dc-price-period">за весь період проживання</div>
                          </div>
                          <button
                            type="button"
                            className="dc-select"
                            data-selected={selected}
                            disabled={!!viewOnlyReason}
                            onClick={() => {
                              if (!viewOnlyReason) setSelectedId(roomId);
                            }}
                            aria-pressed={selected}
                            aria-label={`${selected ? "Обрано" : "Обрати"}: ${roomTitle}`}
                          >
                            {selected ? <><Check size={15} /> Обрано</> : "Обрати"}
                          </button>
                        </div>
                        <button
                          type="button"
                          className="dc-disclosure"
                          aria-expanded={rulesId === roomId}
                          onClick={() => setRulesId(rulesId === roomId ? null : roomId)}
                        >
                          {rulesId === roomId ? "Сховати умови" : "Умови тарифу"}
                        </button>
                        {rulesId === roomId && (
                          <div className="dc-rules">
                            <strong>Неповоротний тариф.</strong> Оплата за цим тарифом не повертається у разі скасування.
                            <div>Загальна вартість за весь період: <strong>{money(rate.total)}</strong></div>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <nav className="dc-controls" aria-label="Навігація варіантами">
            <button type="button" className="dc-arrow" onClick={() => scrollTo(activeIndex - 1)} aria-label="Попередній варіант">
              <ChevronLeft size={18} />
            </button>
            <span className="dc-counter" aria-live="polite">
              {String(activeIndex + 1).padStart(2, "0")} <span aria-hidden="true">—</span> {String(previewRooms.length).padStart(2, "0")}
            </span>
            <button type="button" className="dc-arrow" onClick={() => scrollTo(activeIndex + 1)} aria-label="Наступний варіант">
              <ChevronRight size={18} />
            </button>
          </nav>
          <div className="dc-dots" aria-label="Перейти до варіанта">
            {previewRooms.map((room, index) => (
              <button
                type="button"
                className="dc-dot"
                key={room.key}
                aria-label={`Варіант ${index + 1}: ${room.name}`}
                aria-current={activeIndex === index}
                onClick={() => scrollTo(index)}
              />
            ))}
          </div>
        </section>

        <aside className="dc-wishes">
          <p>Подбаємо про ваш ідеальний відпочинок.</p>
          <small>Окремі побажання узгодимо додатково, зокрема їхню вартість.</small>
        </aside>

        {selectedId && (
          <div className="dc-selection" role="status" aria-live="polite">
            <strong>Обрано для перегляду:</strong> {previewRooms.find((room) => room.key === selectedId)?.name}.
            <span> Це демонстраційний вибір, бронювання не створено.</span>
          </div>
        )}
      </div>

      <Dialog open={!!galleryId} onOpenChange={(open) => { if (!open) setGalleryId(null); }}>
        <DialogContent className="dc-dialog">
          {(() => {
            const room = previewRooms.find((entry) => entry.key === galleryId);
            if (!room) return null;
            return (
              <>
                <DialogTitle>{room.name}</DialogTitle>
                <DialogDescription>Перегляд фотографії розміщення</DialogDescription>
                {room.photo
                  ? <div className="dc-dialog-image"><img src={room.photo} alt={room.name} /></div>
                  : <div className="dc-empty-gallery">Для цього демонстраційного варіанта фото не надано.</div>}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </main>
  );
}

export default GuidedCarousel;
