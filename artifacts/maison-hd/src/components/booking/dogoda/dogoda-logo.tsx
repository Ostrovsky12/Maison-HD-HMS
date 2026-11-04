/** Choose an original supplied variant; never recolor or distort the artwork. */
export function dogodaLogoVariant(background: string): "rolling-hills" | "latte" {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map(offset => {
      const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const bg = luminance(/^#[0-9a-fA-F]{6}$/.test(background) ? background : "#FFF4E5");
  const contrast = (foreground: string) => {
    const fg = luminance(foreground);
    return (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05);
  };
  return contrast("#2A2D05") >= contrast("#FFDDB2") ? "rolling-hills" : "latte";
}

export function DogodaLogo({ background, customSrc, className = "" }: {
  background: string; customSrc?: string; className?: string;
}) {
  const variant = dogodaLogoVariant(background);
  const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  const supplied = `${base}booking/dogoda/logo-${variant}.${variant === "latte" ? "png" : "svg"}`;
  return (
    <img src={customSrc || supplied} alt="DOGODA — догоди собі"
      width={772} height={382} className={`object-contain ${className}`}
      data-testid="dogoda-logo" data-logo-variant={customSrc ? "custom" : variant} />
  );
}
