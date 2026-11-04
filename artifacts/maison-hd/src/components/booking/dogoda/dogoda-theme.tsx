import type { CSSProperties, ReactNode } from "react";
import type { BookingAppearanceValue } from "@/lib/booking-appearance";
import "./dogoda.css";

const FONT_BASE = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/") + "booking/dogoda/";
const FONT_CSS = `
@font-face{font-family:"DOGODA Orchidea";src:url("${FONT_BASE}OrchideaPro-Medium.otf") format("opentype");font-weight:400 700;font-style:normal;font-display:swap;}
@font-face{font-family:"DOGODA Ernie";src:url("${FONT_BASE}AdobeHandwriting-Ernie.otf") format("opentype");font-weight:400;font-style:normal;font-display:swap;unicode-range:U+0061-007A,U+0020,U+002E,U+002C,U+0027;}
`;

/** Scoped DOGODA wrapper: fonts + palette as CSS variables. Nothing leaks outside .dogoda-root. */
export function DogodaTheme({ appearance: a, children }: { appearance: BookingAppearanceValue; children: ReactNode }) {
  const style = {
    "--dg-bg": a.backgroundColor, "--dg-surface": a.surfaceColor, "--dg-text": a.textColor,
    "--dg-muted": a.mutedColor, "--dg-button": a.buttonColor,
  } as CSSProperties;
  return (
    <div className={`dogoda-root min-h-[100dvh] ${a.font === "brand" ? "dg-font-brand" : "dg-font-system"}`} style={style}>
      {a.font === "brand" && <style>{FONT_CSS}</style>}
      {children}
    </div>
  );
}
