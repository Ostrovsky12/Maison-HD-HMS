import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useRef, useCallback } from 'react';
import { TrendingUp, Users, CreditCard, CalendarCheck, Smartphone, Sparkles, FileText, Blocks, BrainCircuit } from 'lucide-react';

// ─── Ambient audio ────────────────────────────────────────────────────────────
function useAmbient() {
  const ctxRef = useRef<AudioContext | null>(null);

  const start = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctxRef.current = ctx;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.055, ctx.currentTime + 4);
      master.connect(ctx.destination);
      [[110, 0], [165, 0.5], [220, 1]].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, ctx.currentTime + delay);
        g.gain.linearRampToValueAtTime(freq < 200 ? 0.55 : 0.22, ctx.currentTime + delay + 5);
        f.type = 'lowpass'; f.frequency.value = 900;
        osc.connect(f); f.connect(g); g.connect(master);
        osc.start(ctx.currentTime + delay);
      });
    } catch (_) {}
  }, []);

  const stop = useCallback(() => {
    ctxRef.current?.close().catch(() => {});
  }, []);

  return { start, stop };
}

// ─── TTS narration ────────────────────────────────────────────────────────────
const SCENE_NARRATION: Record<number, string> = {
  0: "Maison HD. Новий рівень управління готелем — RevPAR це лише поверхня.",
  1: "Повна картина вашого готелю в реальному часі. Дохід, завантаженість, ADR — все в одному дашборді.",
  2: "Шахматка бронювань. Весь номерний фонд одним поглядом — без плутанини.",
  3: "Бронювання, Housekeeping, звіти, AI Hub — все в одній системі.",
  4: "Спробуйте Maison HD безкоштовно. Без кредитної картки. Міграція з будь-якої PMS.",
};

function useTTS() {
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    const pick = () => {
      const voices = window.speechSynthesis?.getVoices() ?? [];
      voiceRef.current =
        voices.find(v => v.lang.startsWith('uk')) ||
        voices.find(v => v.lang.startsWith('ru') && /male/i.test(v.name)) ||
        voices.find(v => v.lang.startsWith('ru')) ||
        voices.find(v => /google/i.test(v.name)) ||
        voices[0] || null;
    };
    pick();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = pick;
  }, []);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis || !activeRef.current) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voiceRef.current?.lang ?? 'uk-UA';
    u.rate = 0.75;
    u.pitch = 0.82;
    u.volume = 0.9;
    if (voiceRef.current) u.voice = voiceRef.current;
    window.speechSynthesis.speak(u);
  }, []);

  const enable = useCallback(() => { activeRef.current = true; }, []);
  const disable = useCallback(() => {
    activeRef.current = false;
    window.speechSynthesis?.cancel();
  }, []);

  return { speak, enable, disable };
}

// ─── Scene hook ───────────────────────────────────────────────────────────────
const SCENE_DURATIONS = { open: 11000, dashboard: 15000, chess: 14000, modules: 14000, close: 10000 };

function useScenes() {
  const [idx, setIdx] = useState(0);
  const keys = Object.keys(SCENE_DURATIONS) as (keyof typeof SCENE_DURATIONS)[];

  useEffect(() => {
    const dur = SCENE_DURATIONS[keys[idx]];
    const t = setTimeout(() => setIdx(p => (p + 1) % keys.length), dur);
    return () => clearTimeout(t);
  }, [idx]);

  return idx;
}

// ─── Scene 1 — Maison HD open ─────────────────────────────────────────────────
function Scene1() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const t = [setTimeout(() => setP(1), 400), setTimeout(() => setP(2), 2200), setTimeout(() => setP(3), 8000)];
    return () => t.forEach(clearTimeout);
  }, []);
  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: 'blur(18px)', scale: 1.15 }}
      transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}>
      <div className="flex flex-col items-center">
        {p >= 1 && (
          <motion.div initial={{ opacity: 0, y: 28, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 0 40px rgba(99,102,241,0.4)' }}>
              <span className="text-white font-bold text-2xl sm:text-4xl">M</span>
            </div>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white" style={{ fontFamily: 'system-ui, sans-serif' }}>
              Maison HD
            </h1>
          </motion.div>
        )}
        {p >= 2 && (
          <motion.div className="mt-6 sm:mt-8 overflow-hidden">
            <motion.p initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="text-base sm:text-xl lg:text-2xl font-light text-white/60 tracking-widest uppercase text-center">
              RevPAR — це лише поверхня
            </motion.p>
          </motion.div>
        )}
        {p >= 3 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="mt-4 sm:mt-6 flex items-center gap-2 text-xs sm:text-sm text-white/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Hospitality OS — управління, аналітика, AI</span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Scene 2 — Dashboard ──────────────────────────────────────────────────────
function Scene2() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const t = [
      setTimeout(() => setP(1), 400),
      setTimeout(() => setP(2), 1400),
      setTimeout(() => setP(3), 2800),
      setTimeout(() => setP(4), 4600),
    ];
    return () => t.forEach(clearTimeout);
  }, []);
  const stats = [
    { title: 'Дохід', value: '₴277 200', icon: TrendingUp, color: '#6366f1' },
    { title: 'Завантаженість', value: '87%', icon: Users, color: '#8b5cf6' },
    { title: 'ADR', value: '₴2 850', icon: CreditCard, color: '#f59e0b' },
  ];
  return (
    <motion.div className="absolute inset-0 flex items-center justify-center z-10 px-4 sm:px-10 lg:px-20"
      initial={{ opacity: 0, x: '8vw' }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '-8vw', filter: 'blur(10px)' }}
      transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}>
      <div className="flex w-full gap-6 lg:gap-16 items-center">
        <div className="flex-1 min-w-0">
          {p >= 1 && (
            <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.3, ease: 'easeOut' }}
              className="w-full bg-white/5 border border-white/10 rounded-xl lg:rounded-2xl backdrop-blur-xl p-4 sm:p-6 lg:p-8 flex flex-col gap-4 shadow-2xl" style={{ height: 'clamp(240px, 50vh, 480px)' }}>
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                {stats.map((s, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 16 }}
                    animate={p >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
                    transition={{ duration: 0.7, delay: i * 0.15 }}
                    className="bg-white/5 rounded-lg sm:rounded-xl p-2 sm:p-4 border border-white/5">
                    <div className="mb-1 sm:mb-2" style={{ color: s.color }}><s.icon size={16} className="sm:hidden" /><s.icon size={24} className="hidden sm:block" /></div>
                    <div className="text-white/50 text-[10px] sm:text-sm">{s.title}</div>
                    <div className="text-sm sm:text-xl lg:text-2xl font-bold mt-0.5 sm:mt-1">{s.value}</div>
                  </motion.div>
                ))}
              </div>
              {p >= 3 && (
                <div className="flex-1 flex items-end gap-1 sm:gap-2 relative">
                  <div className="absolute inset-0 border-l border-b border-white/10" />
                  {[40, 70, 45, 90, 65, 80, 100].map((h, i) => (
                    <motion.div key={i} className="flex-1 rounded-t-sm"
                      style={{ background: 'linear-gradient(to top,#6366f1,#8b5cf6)' }}
                      initial={{ height: '0%' }} animate={{ height: `${h}%` }}
                      transition={{ duration: 0.8, delay: i * 0.08, type: 'spring', damping: 22 }} />
                  ))}
                  <motion.svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <motion.path d="M 5,60 L 20,30 L 35,55 L 50,10 L 65,35 L 80,20 L 95,0"
                      fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                      transition={{ duration: 1.8, delay: 0.4, ease: 'easeInOut' }} />
                  </motion.svg>
                </div>
              )}
            </motion.div>
          )}
        </div>
        <div className="hidden sm:block w-1/3 shrink-0">
          {p >= 4 && (
            <motion.h2 initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9 }}
              className="text-2xl sm:text-3xl lg:text-5xl font-bold leading-tight text-white">
              Повна картина<br/>
              <span className="text-white/45">вашого готелю</span><br/>
              <span style={{ color: '#6366f1' }}>в реальному часі</span>
            </motion.h2>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Scene 3 — Chess ──────────────────────────────────────────────────────────
function Scene3() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const t = [
      setTimeout(() => setP(1), 400),
      setTimeout(() => setP(2), 1600),
      setTimeout(() => setP(3), 3000),
    ];
    return () => t.forEach(clearTimeout);
  }, []);
  const rooms = ['A-101', 'A-102', 'B-201', 'B-202', 'C-301'];
  const days = Array.from({ length: 7 }).map((_, i) => i + 1);
  const bookings = [
    { r: 0, d: 0, w: 2, bg: 'rgba(16,185,129,0.8)' },
    { r: 0, d: 3, w: 3, bg: 'rgba(139,92,246,0.8)' },
    { r: 1, d: 1, w: 4, bg: 'rgba(99,102,241,0.8)' },
    { r: 2, d: 0, w: 1, bg: 'rgba(244,63,94,0.8)' },
    { r: 2, d: 2, w: 5, bg: 'rgba(16,185,129,0.8)' },
    { r: 3, d: 4, w: 3, bg: 'rgba(245,158,11,0.8)' },
    { r: 4, d: 1, w: 2, bg: 'rgba(139,92,246,0.8)' },
  ];
  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-3 sm:px-8 lg:px-20"
      initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: '-8vh' }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}>
      {p >= 1 && (
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-4 sm:mb-8 lg:mb-12">
          <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold mb-2 sm:mb-4 text-white">Шахматка бронювань</h2>
          <p className="text-sm sm:text-base lg:text-xl text-white/55 font-light">весь номерний фонд одним поглядом</p>
        </motion.div>
      )}
      {p >= 2 && (
        <motion.div className="w-full max-w-5xl bg-white/5 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-2xl"
          initial={{ opacity: 0, rotateX: -8 }} animate={{ opacity: 1, rotateX: 0 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}>
          <div className="flex border-b border-white/10 bg-white/5">
            <div className="w-16 sm:w-24 p-2 sm:p-4 border-r border-white/10 text-white/35 text-[10px] sm:text-sm">Номери</div>
            {days.map(d => (
              <div key={d} className="flex-1 p-2 sm:p-4 text-center border-r border-white/10 text-white/50 text-[9px] sm:text-sm">
                Тра {d + 10}
              </div>
            ))}
          </div>
          <div className="relative">
            {rooms.map((room) => (
              <div key={room} className="flex border-b border-white/5 h-10 sm:h-16 relative">
                <div className="w-16 sm:w-24 flex items-center justify-center border-r border-white/10 font-bold text-[10px] sm:text-sm text-white bg-white/[0.02]">
                  {room}
                </div>
                {days.map(d => <div key={d} className="flex-1 border-r border-white/[0.02]" />)}
              </div>
            ))}
            {p >= 3 && bookings.map((b, i) => (
              <motion.div key={i}
                className="absolute rounded-md shadow-lg backdrop-blur-sm border border-white/20 flex items-center px-1.5 sm:px-3"
                style={{
                  background: b.bg,
                  top: `calc(${b.r} * (2.5rem + 1px) + 3px)`,
                  left: `calc(4rem + ${(b.d / 7) * 100}%)`,
                  width: `calc(${(b.w / 7) * 100}% - 4px)`,
                  height: 'calc(2.5rem - 6px)',
                }}
                initial={{ scaleX: 0, opacity: 0, transformOrigin: 'left' }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: i * 0.1, type: 'spring', damping: 22 }}>
                <div className="w-1.5 h-1.5 rounded-full bg-white/50 mr-1.5 shrink-0" />
                <div className="h-1.5 bg-white/30 rounded flex-1 min-w-0" />
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Scene 4 — Modules ───────────────────────────────────────────────────────
function Scene4() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const t = [setTimeout(() => setP(1), 400), setTimeout(() => setP(2), 1400)];
    return () => t.forEach(clearTimeout);
  }, []);
  const modules = [
    { title: 'Бронювання', icon: CalendarCheck, highlight: false },
    { title: 'Гостьовий портал', icon: Smartphone, highlight: false },
    { title: 'Housekeeping', icon: Sparkles, highlight: false },
    { title: 'Звіти', icon: FileText, highlight: false },
    { title: 'Інтеграції', icon: Blocks, highlight: false },
    { title: 'AI Hub', icon: BrainCircuit, highlight: true },
  ];
  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-4 sm:px-8 lg:px-20"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.08, filter: 'blur(10px)' }} transition={{ duration: 0.9 }}>
      {p >= 1 && (
        <motion.h2 className="text-xl sm:text-3xl lg:text-5xl font-bold mb-6 sm:mb-10 lg:mb-16 text-white text-center"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          Все в одній системі
        </motion.h2>
      )}
      {p >= 2 && (
        <div className="grid grid-cols-3 gap-3 sm:gap-5 lg:gap-8 w-full max-w-4xl">
          {modules.map((mod, i) => (
            <motion.div key={i} initial={{ opacity: 0, scale: 0.82, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1, type: 'spring', damping: 16 }}
              className="relative p-3 sm:p-5 lg:p-8 rounded-xl lg:rounded-2xl border flex flex-col items-center text-center gap-2 sm:gap-3 lg:gap-4 backdrop-blur-sm"
              style={mod.highlight ? {
                background: 'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.2))',
                borderColor: 'rgba(99,102,241,0.5)',
                boxShadow: '0 0 30px rgba(99,102,241,0.2)',
              } : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}>
              <div className="p-2 sm:p-3 lg:p-4 rounded-full"
                style={mod.highlight
                  ? { background: '#6366f1', color: 'white', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }
                  : { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                <mod.icon size={18} className="sm:hidden" />
                <mod.icon size={26} className="hidden sm:block lg:hidden" />
                <mod.icon size={32} className="hidden lg:block" />
              </div>
              <h3 className="text-xs sm:text-sm lg:text-xl font-medium leading-tight"
                style={{ color: mod.highlight ? 'white' : 'rgba(255,255,255,0.75)' }}>
                {mod.title}
              </h3>
              {mod.highlight && (
                <motion.div className="absolute inset-0 rounded-xl lg:rounded-2xl border border-white/20 pointer-events-none"
                  animate={{ scale: [1, 1.05, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }} />
              )}
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ─── Scene 5 — Close / CTA ───────────────────────────────────────────────────
function Scene5() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const t = [setTimeout(() => setP(1), 800), setTimeout(() => setP(2), 2200), setTimeout(() => setP(3), 4600)];
    return () => t.forEach(clearTimeout);
  }, []);
  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 1.4 }}>
      <div className="flex flex-col items-center text-center">
        {p >= 1 && (
          <motion.div initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
            className="px-6 sm:px-10 py-3 sm:py-5 rounded-full mb-6 sm:mb-8"
            style={{ background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', boxShadow: '0 0 60px rgba(139,92,246,0.4)' }}>
            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">7 днів безкоштовно</h2>
          </motion.div>
        )}
        {p >= 2 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9 }}
            className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 text-sm sm:text-lg lg:text-xl text-white/55 mb-12 sm:mb-20">
            <span>Без кредитної картки</span>
            <span className="w-1.5 h-1.5 rounded-full bg-white/25" />
            <span>Міграція з будь-якої PMS</span>
          </motion.div>
        )}
        {p >= 3 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 1.8 }}
            className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-white/10 flex items-center justify-center">
              <span className="text-white font-bold text-xl sm:text-2xl">M</span>
            </div>
            <span className="text-lg sm:text-2xl font-bold tracking-widest text-white/75">Maison HD</span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main player ───────────────────────────────────────────────────────────────
export default function DemoVideoPlayer() {
  const sceneIdx = useScenes();
  const ambient = useAmbient();
  const tts = useTTS();
  const startedRef = useRef(false);

  // Boot audio + TTS on first render (triggered by user click opening the modal)
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    ambient.start();
    tts.enable();
    return () => { ambient.stop(); tts.disable(); };
  }, []);

  // Narrate each scene as it appears
  useEffect(() => {
    const text = SCENE_NARRATION[sceneIdx];
    if (text) tts.speak(text);
  }, [sceneIdx]);

  return (
    <div className="relative w-full h-full overflow-hidden"
      style={{ backgroundColor: '#0d0f1c', color: 'white' }}>

      {/* Ambient glow */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <motion.div className="absolute w-[70vw] h-[70vw] rounded-full"
          style={{ background: 'radial-gradient(circle,rgba(99,102,241,0.18),transparent)', filter: 'blur(100px)' }}
          animate={{ x: ['-15%','10%','-10%','-15%'], y: ['-15%','-8%','8%','-15%'], scale: [1,1.18,0.92,1] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'linear' }} />
        <motion.div className="absolute w-[50vw] h-[50vw] rounded-full right-0 bottom-0"
          style={{ background: 'radial-gradient(circle,rgba(139,92,246,0.12),transparent)', filter: 'blur(80px)' }}
          animate={{ x: ['15%','-8%','15%'], y: ['15%','0%','15%'] }}
          transition={{ duration: 28, repeat: Infinity, ease: 'linear' }} />
      </div>

      {/* Floating dots */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 14 }).map((_, i) => (
          <motion.div key={i} className="absolute w-1 h-1 rounded-full bg-white/15"
            initial={{ x: `${Math.random() * 100}vw`, y: `${Math.random() * 100}vh` }}
            animate={{ y: [`${Math.random() * 100}vh`, `${Math.random() * 80 - 10}vh`], opacity: [0, 0.4, 0] }}
            transition={{ duration: 5 + Math.random() * 6, repeat: Infinity, ease: 'linear', delay: Math.random() * 5 }} />
        ))}
      </div>

      {/* Scenes */}
      <AnimatePresence mode="sync">
        {sceneIdx === 0 && <Scene1 key="open" />}
        {sceneIdx === 1 && <Scene2 key="dashboard" />}
        {sceneIdx === 2 && <Scene3 key="chess" />}
        {sceneIdx === 3 && <Scene4 key="modules" />}
        {sceneIdx === 4 && <Scene5 key="close" />}
      </AnimatePresence>

      {/* Scene dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
        {Object.keys(SCENE_DURATIONS).map((_, i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-full transition-all duration-500"
            style={{
              background: sceneIdx === i ? 'white' : 'rgba(255,255,255,0.22)',
              transform: sceneIdx === i ? 'scale(1.35)' : 'scale(1)',
            }} />
        ))}
      </div>
    </div>
  );
}
