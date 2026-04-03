import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),   // Logo reveals
      setTimeout(() => setPhase(2), 2500),  // Tagline reveals
      setTimeout(() => setPhase(3), 8500),  // Exit begins
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: 'blur(20px)', scale: 1.2 }}
      transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative z-10 flex flex-col items-center">
        {phase >= 1 && (
          <motion.div
            initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-4"
          >
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-accent-indigo to-accent-violet flex items-center justify-center shadow-[0_0_40px_rgba(99,102,241,0.4)]">
              <span className="text-white font-display text-4xl font-bold">M</span>
            </div>
            <h1 className="text-7xl font-display font-bold tracking-tight text-white">
              Maison HD
            </h1>
          </motion.div>
        )}

        {phase >= 2 && (
          <motion.div className="mt-8 overflow-hidden">
            <motion.p
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              className="text-2xl font-light text-white/70 tracking-widest uppercase"
            >
              RevPAR — це лише поверхня
            </motion.p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
