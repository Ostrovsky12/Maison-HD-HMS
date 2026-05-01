import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useConcierge } from "@/hooks/use-concierge";
import { useLocation } from "wouter";

export default function Terminal() {
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const savedOrg = localStorage.getItem("concierge_org_slug");
    const savedUnit = localStorage.getItem("concierge_unit_id");
    
    if (!savedOrg || !savedUnit) {
      setLocation("/setup");
      return;
    }
    
    setOrgSlug(savedOrg);
    setUnitId(savedUnit);
  }, [setLocation]);

  const { state, guestName, transcript, adminReply, wake } = useConcierge(orgSlug, unitId);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeString = time.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });

  if (!orgSlug || !unitId) return null;

  return (
    <div 
      className="fixed inset-0 bg-[#0A0D14] text-[#E8E1D5] overflow-hidden cursor-pointer"
      onClick={wake}
    >
      {/* Background ambient gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1a2133] via-[#0A0D14] to-[#0A0D14] opacity-50" />
      
      {/* Noise overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />

      <div className="relative h-full flex flex-col items-center justify-center p-8 z-10">
        
        {/* Admin Reply Notification */}
        <AnimatePresence>
          {adminReply && (
            <motion.div 
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              className="absolute top-12 max-w-md w-full bg-[#1A1F2E] border border-[#CFA162]/20 rounded-2xl p-6 shadow-2xl backdrop-blur-xl"
            >
              <p className="text-sm text-[#CFA162] font-medium mb-2 uppercase tracking-widest">Повідомлення від адміністратора</p>
              <p className="text-lg text-white font-serif">{adminReply}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top left logo */}
        <div className="absolute top-12 left-12 opacity-50">
          <div className="w-12 h-12 border border-[#E8E1D5] rounded-full flex items-center justify-center">
            <div className="w-6 h-6 border border-[#E8E1D5] rounded-sm transform rotate-45" />
          </div>
        </div>

        {/* Main Content Area */}
        <AnimatePresence mode="wait">
          {state === "idle" && (
            <motion.div 
              key="idle"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
              className="flex flex-col items-center"
            >
              <h1 className="text-[12rem] font-mono tracking-tighter font-light leading-none opacity-90">{timeString}</h1>
              <p className="mt-8 text-xl font-serif italic opacity-50 tracking-wide text-[#CFA162]">Touch or speak to wake</p>
            </motion.div>
          )}

          {state === "greeting" && (
            <motion.div 
              key="greeting"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center max-w-4xl"
            >
              <h2 className="text-6xl font-serif leading-tight text-[#E8E1D5]">
                Добрий вечір, {guestName}!<br/>
                <span className="text-[#CFA162]">Чим можу допомогти?</span>
              </h2>
            </motion.div>
          )}

          {(state === "listening" || state === "processing" || state === "speaking") && (
            <motion.div 
              key="active"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center w-full"
            >
              {/* Orb */}
              <div className="relative w-64 h-64 flex items-center justify-center mb-16">
                <motion.div 
                  animate={
                    state === "listening" ? { scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] } :
                    state === "processing" ? { rotate: 360, scale: [1, 0.9, 1] } :
                    { scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }
                  }
                  transition={{ 
                    duration: state === "processing" ? 3 : 1.5, 
                    repeat: Infinity, 
                    ease: "easeInOut" 
                  }}
                  className="absolute inset-0 bg-[#CFA162] rounded-full blur-3xl opacity-30 mix-blend-screen"
                />
                <div className="w-32 h-32 rounded-full border border-[#CFA162]/40 bg-[#0A0D14]/50 backdrop-blur-md z-10 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#CFA162] to-[#E8E1D5] opacity-80" />
                </div>
              </div>

              {/* Text */}
              <div className="h-32 flex items-center justify-center text-center px-12">
                {state === "listening" && (
                  <p className="text-3xl font-serif opacity-80 text-[#CFA162]">
                    {transcript || "Слухаю..."}
                  </p>
                )}
                {state === "processing" && (
                  <p className="text-2xl font-serif opacity-60 tracking-widest uppercase">
                    Аналізую...
                  </p>
                )}
                {state === "speaking" && (
                  <p className="text-3xl font-serif opacity-90 text-[#E8E1D5]">
                    Ліна
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {state === "confirmed" && (
            <motion.div 
              key="confirmed"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="flex flex-col items-center justify-center"
            >
              <div className="w-24 h-24 mb-8 rounded-full bg-[#1A2133] border border-[#CFA162]/30 flex items-center justify-center">
                <svg className="w-10 h-10 text-[#CFA162]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-4xl font-serif text-[#E8E1D5]">Ваше замовлення передано</h3>
              <p className="text-xl text-[#CFA162] mt-4 font-serif italic">адміністратору</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}