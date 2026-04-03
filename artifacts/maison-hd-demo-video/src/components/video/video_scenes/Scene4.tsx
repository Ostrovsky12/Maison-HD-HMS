import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { CalendarCheck, Smartphone, Sparkles, FileText, Blocks, BrainCircuit } from 'lucide-react';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),   // Title
      setTimeout(() => setPhase(2), 1500),  // Grid
      setTimeout(() => setPhase(3), 13500), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const modules = [
    { title: 'Бронювання', icon: CalendarCheck },
    { title: 'Гостьовий портал', icon: Smartphone },
    { title: 'Housekeeping', icon: Sparkles },
    { title: 'Звіти', icon: FileText },
    { title: 'Інтеграції', icon: Blocks },
    { title: 'AI Hub', icon: BrainCircuit, highlight: true },
  ];

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10 px-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 1 }}
    >
      {phase >= 1 && (
        <motion.h2 
          className="text-5xl font-display font-bold mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          Все в одній системі
        </motion.h2>
      )}

      {phase >= 2 && (
        <div className="grid grid-cols-3 gap-8 w-full max-w-4xl">
          {modules.map((mod, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.8, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.6, delay: i * 0.15, type: 'spring', damping: 15 }}
              className={`relative p-8 rounded-2xl border flex flex-col items-center text-center gap-4 ${
                mod.highlight 
                  ? 'bg-gradient-to-br from-accent-indigo/20 to-accent-violet/20 border-accent-indigo/50 shadow-[0_0_30px_rgba(99,102,241,0.2)]'
                  : 'bg-white/5 border-white/10'
              } backdrop-blur-sm`}
            >
              <div className={`p-4 rounded-full ${mod.highlight ? 'bg-accent-indigo text-white shadow-lg' : 'bg-white/10 text-white/70'}`}>
                <mod.icon size={32} />
              </div>
              <h3 className={`text-xl font-medium ${mod.highlight ? 'text-white' : 'text-white/80'}`}>
                {mod.title}
              </h3>
              
              {mod.highlight && (
                <motion.div 
                  className="absolute inset-0 rounded-2xl border border-white/20 pointer-events-none"
                  animate={{ scale: [1, 1.05, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
