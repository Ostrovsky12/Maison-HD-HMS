import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),   // Text
      setTimeout(() => setPhase(2), 2000),  // Grid base
      setTimeout(() => setPhase(3), 3500),  // Bookings pop in
      setTimeout(() => setPhase(4), 13500), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const rooms = ['A-101', 'A-102', 'B-201', 'B-202', 'C-301'];
  const days = Array.from({ length: 7 }).map((_, i) => i + 1);

  // x, y, width
  const bookings = [
    { r: 0, d: 0, w: 2, color: 'bg-emerald-500/80' },
    { r: 0, d: 3, w: 3, color: 'bg-accent-violet/80' },
    { r: 1, d: 1, w: 4, color: 'bg-accent-indigo/80' },
    { r: 2, d: 0, w: 1, color: 'bg-rose-500/80' },
    { r: 2, d: 2, w: 5, color: 'bg-emerald-500/80' },
    { r: 3, d: 4, w: 3, color: 'bg-accent-gold/80' },
    { r: 4, d: 1, w: 2, color: 'bg-accent-violet/80' },
  ];

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10 px-20"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: '-10vh' }}
      transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
    >
      
      {phase >= 1 && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl font-display font-bold mb-4">
            Шахматка бронювань
          </h2>
          <p className="text-xl text-white/60 font-light">весь номерний фонд одним поглядом</p>
        </motion.div>
      )}

      {phase >= 2 && (
        <motion.div 
          className="w-full max-w-5xl bg-white/5 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-2xl"
          initial={{ opacity: 0, rotateX: -10 }}
          animate={{ opacity: 1, rotateX: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          {/* Header */}
          <div className="flex border-b border-white/10 bg-white/5">
            <div className="w-24 p-4 border-r border-white/10 text-white/40 text-sm">Номери</div>
            {days.map(d => (
              <div key={d} className="flex-1 p-4 text-center border-r border-white/10 text-white/60 text-sm">
                Тра {d + 10}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          <div className="relative">
            {rooms.map((room, rIndex) => (
              <div key={room} className="flex border-b border-white/5 h-16 relative">
                <div className="w-24 flex items-center justify-center border-r border-white/10 font-bold text-sm bg-white/[0.02]">
                  {room}
                </div>
                {days.map(d => (
                  <div key={d} className="flex-1 border-r border-white/[0.02]" />
                ))}
              </div>
            ))}

            {/* Bookings */}
            {phase >= 3 && bookings.map((b, i) => (
              <motion.div
                key={i}
                className={`absolute h-12 rounded-md ${b.color} shadow-lg backdrop-blur-sm border border-white/20 flex items-center px-3`}
                style={{
                  top: `${b.r * 4 + 0.5}rem`,
                  left: `calc(6rem + ${(b.d / 7) * 100}%)`,
                  width: `calc(${(b.w / 7) * 100}% - 8px)`,
                }}
                initial={{ scaleX: 0, opacity: 0, transformOrigin: 'left' }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ duration: 0.6, delay: i * 0.15, type: 'spring', damping: 20 }}
              >
                <div className="w-2 h-2 rounded-full bg-white/50 mr-2" />
                <div className="h-2 bg-white/30 rounded w-1/2" />
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
      
    </motion.div>
  );
}
