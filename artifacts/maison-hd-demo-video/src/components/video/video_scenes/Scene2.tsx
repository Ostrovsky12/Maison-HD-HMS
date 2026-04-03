import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { TrendingUp, Users, CreditCard } from 'lucide-react';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),   // UI Base
      setTimeout(() => setPhase(2), 1500),  // Cards
      setTimeout(() => setPhase(3), 3000),  // Charts
      setTimeout(() => setPhase(4), 5000),  // Text
      setTimeout(() => setPhase(5), 13500), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-10 px-20"
      initial={{ opacity: 0, x: '10vw' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '-10vw', filter: 'blur(10px)' }}
      transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex w-full gap-16 items-center">
        
        {/* Left Side: Mockup UI */}
        <div className="flex-1 relative perspective-1000">
          {phase >= 1 && (
            <motion.div
              initial={{ rotateY: 15, rotateX: 5, opacity: 0, scale: 0.9 }}
              animate={{ rotateY: 10, rotateX: 5, opacity: 1, scale: 1 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="w-full h-[60vh] bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl p-8 flex flex-col gap-6 shadow-2xl"
            >
              
              {/* Cards row */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { title: 'Дохід', value: '₴277 200', icon: TrendingUp, color: 'text-accent-indigo' },
                  { title: 'Завантаженість', value: '87%', icon: Users, color: 'text-accent-violet' },
                  { title: 'ADR', value: '₴2 850', icon: CreditCard, color: 'text-accent-gold' }
                ].map((stat, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                    transition={{ duration: 0.8, delay: i * 0.2, ease: "easeOut" }}
                    className="bg-white/5 rounded-xl p-4 border border-white/5"
                  >
                    <div className={`mb-2 ${stat.color}`}>
                      <stat.icon size={24} />
                    </div>
                    <div className="text-white/50 text-sm">{stat.title}</div>
                    <div className="text-2xl font-bold mt-1 font-display">{stat.value}</div>
                  </motion.div>
                ))}
              </div>

              {/* Chart Mockup */}
              {phase >= 3 && (
                <div className="flex-1 flex items-end gap-2 mt-4 relative">
                  <div className="absolute inset-0 border-l border-b border-white/10" />
                  {[40, 70, 45, 90, 65, 80, 100].map((h, i) => (
                    <motion.div
                      key={i}
                      className="flex-1 bg-gradient-to-t from-accent-indigo to-accent-violet rounded-t-sm"
                      initial={{ height: '0%' }}
                      animate={{ height: `${h}%` }}
                      transition={{ duration: 1, delay: i * 0.1, type: 'spring', damping: 20 }}
                    />
                  ))}
                  
                  {/* Trend line overlay */}
                  <motion.svg
                    className="absolute inset-0 w-full h-full overflow-visible"
                    preserveAspectRatio="none"
                    viewBox="0 0 100 100"
                  >
                    <motion.path
                      d="M 5,60 L 20,30 L 35,55 L 50,10 L 65,35 L 80,20 L 95,0"
                      fill="none"
                      stroke="var(--accent-gold)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 2, delay: 0.5, ease: "easeInOut" }}
                    />
                  </motion.svg>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Right Side: Text */}
        <div className="w-1/3">
          {phase >= 4 && (
            <motion.h2
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="text-5xl font-display font-bold leading-tight"
            >
              Повна картина<br/>
              <span className="text-white/50">вашого готелю</span><br/>
              <span className="text-accent-indigo">в реальному часі</span>
            </motion.h2>
          )}
        </div>
      </div>
    </motion.div>
  );
}
