import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),  // CTA
      setTimeout(() => setPhase(2), 2500),  // Sub CTA
      setTimeout(() => setPhase(3), 5000),  // Logo fade in
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10 px-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.5 }}
    >
      <div className="flex flex-col items-center text-center">
        {phase >= 1 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="px-10 py-5 rounded-full bg-gradient-to-r from-accent-indigo to-accent-violet shadow-[0_0_60px_rgba(139,92,246,0.4)] mb-8"
          >
            <h2 className="text-5xl font-bold font-display tracking-tight text-white">
              14 днів безкоштовно
            </h2>
          </motion.div>
        )}

        {phase >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
            className="flex items-center gap-4 text-xl text-white/60 mb-20"
          >
            <span>Без кредитної картки</span>
            <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
            <span>Міграція з будь-якої PMS</span>
          </motion.div>
        )}

        {phase >= 3 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 2 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center">
              <span className="text-white font-display text-2xl font-bold">M</span>
            </div>
            <span className="text-2xl font-display font-bold tracking-widest text-white/80">
              Maison HD
            </span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
