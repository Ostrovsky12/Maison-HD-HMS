import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BedDouble, Check, ChevronRight, Maximize2, Sparkles, Users, X } from "lucide-react";
import { previewRooms } from "./_data";
import "./_grid.css";

const money = (value: number) =>
  new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value) + " грн";

export function CompactGrid() {
  const [selected, setSelected] = useState<string | null>(null);
  const [detailsRoom, setDetailsRoom] = useState<(typeof previewRooms)[number] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const detailsButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!detailsRoom) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailsRoom(null);
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      (previousFocus?.isConnected ? previousFocus : detailsButtonRef.current)?.focus();
    };
  }, [detailsRoom]);

  const moveTo = (index: number) => {
    const nextIndex = Math.max(0, Math.min(previewRooms.length - 1, index));
    setActiveIndex(nextIndex);
    const card = railRef.current?.querySelector<HTMLElement>(`[data-room-index="${nextIndex}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  };

  return (
    <main className="dogoda-root dg-font-brand dogoda-cards-preview dg-grid-preview">
      <div className="dg-grid-shell">
        <header className="dg-grid-heading">
          <div className="dg-step-label"><span>КРОК 2</span><i aria-hidden="true" /><span>ОБЕРІТЬ РОЗМІЩЕННЯ</span></div>
          <h1>Відпочинок у DOGODA</h1>
          <p className="dg-grid-intro">Оберіть будинок або номер для вашої подорожі</p>
          <p className="dg-grid-intro">Заміський комплекс DOGODA</p>
          <div className="dg-search-context">
            <span>Дати та гості</span>
            <span className="dg-context-dot" aria-hidden="true">·</span>
            <span>обрані на попередньому кроці</span>
          </div>
        </header>

        {selected && (
          <div className="dg-selection-note" role="status">
            <Check size={16} strokeWidth={2.5} />
            <span>Обрано: {previewRooms.find((room) => room.key === selected)?.name}</span>
            <span className="dg-selection-hint">Вибір збережено на цій сторінці</span>
          </div>
        )}

        <div className="dg-grid-controls" aria-label="Навігація помешканнями">
          <span>{String(activeIndex + 1).padStart(2, "0")} <i>/</i> {String(previewRooms.length).padStart(2, "0")}</span>
          <div>
            <button type="button" onClick={() => moveTo(activeIndex - 1)} disabled={activeIndex === 0} aria-label="Попереднє помешкання">
              <ArrowLeft size={17} />
            </button>
            <button type="button" onClick={() => moveTo(activeIndex + 1)} disabled={activeIndex === previewRooms.length - 1} aria-label="Наступне помешкання">
              <ArrowRight size={17} />
            </button>
          </div>
        </div>

        <section className="dg-room-grid" ref={railRef} aria-label="Доступні категорії розміщення"
          onScroll={() => {
            const rail = railRef.current;
            if (!rail || window.matchMedia("(min-width: 768px)").matches) return;
            const left = rail.getBoundingClientRect().left;
            const cards = Array.from(rail.querySelectorAll<HTMLElement>("[data-room-index]"));
            const nearest = cards.reduce((best, card, index) =>
              Math.abs(card.getBoundingClientRect().left - left) < Math.abs(cards[best].getBoundingClientRect().left - left) ? index : best, 0);
            setActiveIndex(nearest);
          }}>
          {previewRooms.map((room, index) => {
            const isSelected = selected === room.key;
            return (
              <article
                className={`dg-room-card${isSelected ? " is-selected" : ""}`}
                key={room.key}
                data-room-index={index}
                onFocus={() => setActiveIndex(index)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <div className="dg-room-media">
                  {room.photo ? (
                    <img src={room.photo} alt="" />
                  ) : (
                    <div className="dg-room-placeholder" aria-hidden="true">
                      <span className="dg-placeholder-mark"><BedDouble size={25} strokeWidth={1.35} /></span>
                      <span>DOGODA <i>·</i> для вашого відпочинку</span>
                    </div>
                  )}
                  {isSelected && <span className="dg-selected-chip"><Check size={13} /> Ваш вибір</span>}
                </div>
                <div className="dg-room-content">
                  <div className="dg-room-topline">
                    <h2>{room.name}</h2>
                    <span className="dg-capacity"><Users size={15} /> до {room.capacity}</span>
                  </div>
                  <div className="dg-room-facts">
                    {room.area && <span><Maximize2 size={14} />{room.area}</span>}
                    <span><BedDouble size={14} />{room.beds}</span>
                  </div>
                  <div className="dg-room-footer">
                    <div className="dg-price">
                      <span>Вартість за весь період</span>
                      <strong>{money(room.total)}</strong>
                    </div>
                    <button
                      className="dg-details-link"
                      type="button"
                      onClick={(event) => {
                        detailsButtonRef.current = event.currentTarget;
                        setDetailsRoom(room);
                      }}
                      aria-label={`Деталі: ${room.name}`}
                    >
                      Деталі <ChevronRight size={15} />
                    </button>
                  </div>
                  <div className="dg-room-actions">
                    <span className="dg-tariff-label">Неповоротний тариф</span>
                    <button
                      type="button"
                      className="dg-select-button"
                      aria-pressed={isSelected}
                      onClick={() => setSelected(isSelected ? null : room.key)}
                    >
                      {isSelected ? <><Check size={16} /> Обрано</> : "Обрати"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <aside className="dg-wishes">
          <Sparkles className="dg-wishes-spark" aria-hidden="true" size={20} strokeWidth={1.4} />
          <p><strong>Подбаємо про ваш ідеальний відпочинок.</strong><br />
            Окремі побажання узгодимо додатково, зокрема їхню вартість.</p>
        </aside>
        <p className="dg-demo-note">Демонстраційний макет · приклади не є пропозицією для бронювання</p>
      </div>

      {detailsRoom && (
        <div className="dg-dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDetailsRoom(null);
        }}>
          <div
            className="dg-room-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dg-dialog-title"
            tabIndex={-1}
            ref={dialogRef}
          >
            <button className="dg-dialog-close" type="button" onClick={() => setDetailsRoom(null)} aria-label="Закрити деталі">
              <X size={19} />
            </button>
            {detailsRoom.photo ? (
              <img className="dg-dialog-photo" src={detailsRoom.photo} alt={`Фото: ${detailsRoom.name}`} />
            ) : (
              <div className="dg-dialog-placeholder"><BedDouble size={30} strokeWidth={1.4} /></div>
            )}
            <div className="dg-dialog-content">
              <p className="dg-dialog-kicker">DOGODA · РОЗМІЩЕННЯ</p>
              <h2 id="dg-dialog-title">{detailsRoom.name}</h2>
              <div className="dg-dialog-facts">
                <span><Users size={16} /> До {detailsRoom.capacity} гостей</span>
                {detailsRoom.area && <span><Maximize2 size={16} /> {detailsRoom.area}</span>}
                <span><BedDouble size={16} /> {detailsRoom.beds}</span>
                {detailsRoom.sofa && <span><BedDouble size={16} /> {detailsRoom.sofa}</span>}
              </div>
              <p className="dg-dialog-description">{detailsRoom.description}</p>
              {detailsRoom.amenities.length > 0 && (
                <div className="dg-amenities">
                  {detailsRoom.amenities.map((amenity) => <span key={amenity}>{amenity}</span>)}
                </div>
              )}
              <div className="dg-dialog-rate">
                <div><strong>Неповоротний тариф</strong><span>Умови тарифу — без повернення</span></div>
                <div className="dg-dialog-total"><span>Вартість за весь період</span><strong>{money(detailsRoom.total)}</strong></div>
              </div>
              <button
                type="button"
                className="dg-dialog-select"
                onClick={() => {
                  setSelected(detailsRoom.key);
                  setDetailsRoom(null);
                }}
              >
                {selected === detailsRoom.key ? <><Check size={17} /> Обрано</> : "Обрати"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default CompactGrid;
