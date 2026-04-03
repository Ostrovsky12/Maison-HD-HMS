import { useId } from "react";

interface MaisonLogoProps {
  size?: number;
  showText?: boolean;
  textVariant?: "dark" | "light";
  className?: string;
}

export function MaisonLogo({
  size = 36,
  showText = true,
  textVariant = "dark",
  className = "",
}: MaisonLogoProps) {
  const uid = useId();
  const bgId = `mhd-bg-${uid.replace(/:/g, "")}`;
  const glowId = `mhd-glow-${uid.replace(/:/g, "")}`;
  const isLight = textVariant === "light";

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Maison HD"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <linearGradient id={bgId} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4f46e5" />
            <stop offset="60%" stopColor="#6d28d9" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background rounded square */}
        <rect width="40" height="40" rx="10" fill={`url(#${bgId})`} />

        {/* Top highlight — gives depth */}
        <rect x="1" y="1" width="38" height="19" rx="9.5" fill="rgba(255,255,255,0.09)" />

        {/* M lettermark with architectural caps */}
        {/* Main M stroke */}
        <path
          d="M8.5 30 L8.5 15.5 L20 23 L31.5 15.5 L31.5 30"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${glowId})`}
        />
        {/* Horizontal caps on peaks — column capitals */}
        <line x1="5" y1="15.5" x2="12" y2="15.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="28" y1="15.5" x2="35" y2="15.5" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      </svg>

      {showText && (
        <div className="leading-none">
          <p
            className={`font-black tracking-tight leading-none ${
              isLight ? "text-gray-900" : "text-white"
            }`}
            style={{ fontSize: size * 0.4, letterSpacing: "-0.02em" }}
          >
            MAISON{" "}
            <span style={{ color: "#a78bfa" }}>HD</span>
          </p>
          <p
            className={`font-medium tracking-widest uppercase ${
              isLight ? "text-gray-400" : "text-white/35"
            }`}
            style={{ fontSize: size * 0.225, marginTop: size * 0.06 }}
          >
            Hospitality OS
          </p>
        </div>
      )}
    </div>
  );
}

export function MaisonLogoMark({ size = 36 }: { size?: number }) {
  return <MaisonLogo size={size} showText={false} />;
}
