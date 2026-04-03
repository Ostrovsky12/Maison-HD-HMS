import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState, useRef, useCallback } from 'react';
import { TrendingUp, Users, CreditCard, CalendarCheck, Smartphone, Sparkles, FileText, Blocks, BrainCircuit } from 'lucide-react';

// ─── Web Audio ambient engine ─────────────────────────────────────────────────
function useAmbientAudio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const started = useRef(false);

  const start = () => {
    if (started.current) return;
    started.current = true;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctxRef.current = ctx;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 3);
      master.connect(ctx.destination);

      // Two slightly detuned pads
      [[110, 0], [165, 0.3], [220, 0.6], [330, 1.0]].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.frequency.linearRampToValueAtTime(freq * 1.001, ctx.currentTime + 20);
        g.gain.setValueAtTime(0, ctx.currentTime + delay);
        g.gain.linearRampToValueAtTime(freq < 200 ? 0.6 : 0.25, ctx.currentTime + delay + 4);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(400, ctx.currentTime);
        filter.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 8);
        osc.connect(filter); filter.connect(g); g.connect(master);
        osc.start(ctx.currentTime + delay);
      });

      // Slow fade out near end
      master.gain.setValueAtTime(0.07, ctx.currentTime + 44);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 52);
    } catch (_) {}
  };

  const stop = () => {
    ctxRef.current?.close().catch(() => {});
  };

  return { start, stop };
}

// ─── Text-to-Speech engine ────────────────────────────────────────────────────
function useTTS() {
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const activeRef = useRef(false);

  // Load voices — async in Chrome, sync in Firefox
  const loadVoice = useCallback(() => {
    if (!window.speechSynthesis) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      // Prefer Ukrainian, then Russian (Cyrillic), then any Google/deep male
      voiceRef.current =
        voices.find(v => v.lang.startsWith('uk')) ||
        voices.find(v => v.lang.startsWith('ru') && v.name.toLowerCase().includes('male')) ||
        voices.find(v => v.lang.startsWith('ru')) ||
        voices.find(v => v.name.toLowerCase().includes('google') && v.lang.startsWith('en')) ||
        voices[0] || null;
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
  }, []);

  useEffect(() => { loadVoice(); }, [loadVoice]);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (!activeRef.current) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voiceRef.current?.lang ?? 'uk-UA';
    utterance.rate = 0.72;
    utterance.pitch = 0.82;
    utterance.volume = 0.9;
    if (voiceRef.current) utterance.voice = voiceRef.current;
    window.speechSynthesis.speak(utterance);
  }, []);

  const start = useCallback(() => { activeRef.current = true; }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    window.speechSynthesis?.cancel();
  }, []);

  return { speak, start, stop };
}

// ─── Intro scene: cinematic voiceover text ────────────────────────────────────
const INTRO_BEATS = [
  { at: 400,  lines: ["Готельний бізнес змінюється."],                        style: "heading", speech: "Готельний бізнес змінюється." },
  { at: 3000, lines: ["Але більшість систем — ні."],                           style: "muted",   speech: "Але більшість систем — ні." },
  { at: 6200, lines: ["Вони рахують."],                                        style: "normal",  speech: "Вони рахують." },
  { at: 8400, lines: ["Але не думають."],                                      style: "muted",   speech: "Але не думають." },
  { at: 11200,lines: ["Вони зберігають дані."],                                style: "normal",  speech: "Вони зберігають дані." },
  { at: 13500,lines: ["Але не допомагають приймати рішення."],                 style: "muted",   speech: "Але не допомагають приймати рішення." },
  { at: 17000,lines: ["Hospitality — це більше, ніж сервіс."],                 style: "heading", speech: "Hospitality — це більше, ніж сервіс." },
  { at: 20000,lines: ["Це управління рішеннями."],                             style: "accent",  speech: "Це управління рішеннями." },
  { at: 22800,lines: ["І швидкість цих рішень", "визначає прибуток."],         style: "normal",  speech: "І швидкість цих рішень визначає прибуток." },
  { at: 26500,lines: ["Maison HD — це інша логіка."],                          style: "brand",   speech: "Maison HD — це інша логіка." },
  { at: 30000,lines: ["Система, яка аналізує,", "пропонує", "і діє разом з тобою."], style: "normal", speech: "Система, яка аналізує, пропонує і діє разом з тобою." },
  { at: 34500,lines: ["Автоматизація процесів."],                              style: "pill",    speech: "Автоматизація процесів." },
  { at: 36500,lines: ["Менше людей у операціях."],                             style: "pill",    speech: "Менше людей у операціях." },
  { at: 38500,lines: ["Більше контролю над бізнесом."],                        style: "pill",    speech: "Більше контролю над бізнесом." },
  { at: 41000,lines: ["Дані.\u2003AI.\u2003Управління."],                      style: "trinity", speech: "Дані. AI. Управління." },
  { at: 43500,lines: ["В одному середовищі."],                                 style: "muted",   speech: "В одному середовищі." },
  { at: 46500,lines: ["Це не просто система."],                                style: "normal",  speech: "Це не просто система." },
  { at: 48800,lines: ["Це новий рівень мислення", "в hospitality."],           style: "heading", speech: "Це новий рівень мислення в hospitality." },
  { at: 52500,lines: ["Maison HD."],                                            style: "final",   speech: "Maison HD." },
];

const INTRO_DURATION = 58000;

function SceneIntro({ onDone }: { onDone?: () => void }) {
  const [beatIdx, setBeatIdx] = useState(-1);
  const audio = useAmbientAudio();
  const tts = useTTS();

  // Start ambient audio + enable TTS on mount
  useEffect(() => {
    audio.start();
    tts.start();
    const timers = INTRO_BEATS.map((b, i) =>
      setTimeout(() => setBeatIdx(i), b.at)
    );
    const doneTimer = setTimeout(() => {
      audio.stop();
      tts.stop();
      onDone?.();
    }, INTRO_DURATION);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(doneTimer);
      audio.stop();
      tts.stop();
    };
  }, []);

  // Speak each beat as it appears
  useEffect(() => {
    if (beatIdx < 0) return;
    const beat = INTRO_BEATS[beatIdx];
    tts.speak(beat.speech);
  }, [beatIdx]);

  const beat = beatIdx >= 0 ? INTRO_BEATS[beatIdx] : null;

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, filter: 'blur(20px)' }}
      transition={{ duration: 1.5 }}
    >
      {/* Subtle scanline overlay */}
      <div className="absolute inset-0 pointer-events-none z-0"
        style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.03) 0px, rgba(0,0,0,0.03) 1px, transparent 1px, transparent 3px)' }} />

      <AnimatePresence mode="wait">
        {beat && (
          <motion.div
            key={beatIdx}
            className="flex flex-col items-center text-center px-16 max-w-4xl"
            initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          >
            {beat.style === 'final' ? (
              /* ── FINAL REVEAL ─────────────────────────────── */
              <div className="flex flex-col items-center gap-6">
                <motion.div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 0 80px rgba(99,102,241,0.5)' }}
                  initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                >
                  <span className="text-white font-bold text-5xl" style={{ fontFamily: 'serif' }}>M</span>
                </motion.div>
                <motion.p
                  className="text-7xl font-bold tracking-tight text-white"
                  style={{ fontFamily: 'Georgia, serif', letterSpacing: '-0.02em' }}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 1.2, delay: 0.3 }}
                >
                  {beat.lines[0]}
                </motion.p>
                <motion.div className="w-24 h-px bg-gradient-to-r from-transparent via-indigo-400 to-transparent"
                  initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                  transition={{ duration: 1.5, delay: 0.8 }} />
              </div>
            ) : beat.style === 'brand' ? (
              /* ── BRAND BEAT ───────────────────────────────── */
              <div className="relative">
                <motion.div className="absolute -inset-8 rounded-3xl"
                  style={{ background: 'radial-gradient(ellipse, rgba(99,102,241,0.15), transparent)', filter: 'blur(20px)' }}
                  animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 3, repeat: Infinity }} />
                <p className="text-5xl font-bold text-white relative" style={{ fontFamily: 'Georgia, serif' }}>
                  {beat.lines[0]}
                </p>
              </div>
            ) : beat.style === 'trinity' ? (
              /* ── DATA / AI / CONTROL ──────────────────────── */
              <p className="text-5xl font-light tracking-widest text-white/90"
                style={{ fontFamily: 'Georgia, serif', letterSpacing: '0.12em' }}>
                {beat.lines[0]}
              </p>
            ) : beat.style === 'pill' ? (
              /* ── PILL STYLE ───────────────────────────────── */
              <motion.div
                className="px-8 py-3 rounded-full border"
                style={{ borderColor: 'rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.08)' }}
              >
                <p className="text-2xl font-medium text-white/80" style={{ fontFamily: 'Georgia, serif' }}>
                  {beat.lines[0]}
                </p>
              </motion.div>
            ) : (
              /* ── DEFAULT TEXT BEATS ───────────────────────── */
              <div className="flex flex-col items-center gap-3">
                {beat.lines.map((line, li) => (
                  <motion.p
                    key={li}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.9, delay: li * 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className={
                      beat.style === 'heading' ? 'text-5xl font-bold text-white' :
                      beat.style === 'accent'  ? 'text-4xl font-semibold text-indigo-300' :
                      beat.style === 'muted'   ? 'text-3xl font-light text-white/45' :
                                                 'text-3xl font-light text-white/80'
                    }
                    style={{ fontFamily: 'Georgia, serif', lineHeight: 1.4 }}
                  >
                    {line}
                  </motion.p>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress bar */}
      <motion.div className="absolute bottom-0 left-0 h-px bg-white/15 w-full" />
      <motion.div
        className="absolute bottom-0 left-0 h-px"
        style={{ background: 'linear-gradient(90deg,#6366f1,#8b5cf6)' }}
        initial={{ width: '0%' }} animate={{ width: '100%' }}
        transition={{ duration: INTRO_DURATION / 1000, ease: 'linear' }}
      />
    </motion.div>
  );
}

// ─── Scene hooks ───────────────────────────────────────────────────────────────
function useVideoPlayer(durations: Record<string, number>) {
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const sceneKeys = Object.keys(durations);

  useEffect(() => {
    const currentDuration = durations[sceneKeys[currentSceneIndex]];
    const timeout = setTimeout(() => {
      setCurrentSceneIndex((prev) => (prev + 1) % sceneKeys.length);
    }, currentDuration);
    return () => clearTimeout(timeout);
  }, [currentSceneIndex]);

  return { currentScene: currentSceneIndex };
}

const SCENE_DURATIONS = {
  intro: INTRO_DURATION,
  open: 10000,
  dashboard: 15000,
  chess: 15000,
  modules: 15000,
  close: 10000,
};

// ─── Original scenes (unchanged) ─────────────────────────────────────────────

function Scene1() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2500),
      setTimeout(() => setPhase(3), 8500),
    ];
    return () => t.forEach(clearTimeout);
  }, []);
  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: 'blur(20px)', scale: 1.2 }}
      transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}>
      <div className="relative z-10 flex flex-col items-center">
        {phase >= 1 && (
          <motion.div initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 40px rgba(99,102,241,0.4)' }}>
              <span className="text-white font-display text-4xl font-bold">M</span>
            </div>
            <h1 className="text-7xl font-display font-bold tracking-tight text-white">Maison HD</h1>
          </motion.div>
        )}
        {phase >= 2 && (
          <motion.div className="mt-8 overflow-hidden">
            <motion.p initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              className="text-2xl font-light text-white/70 tracking-widest uppercase">
              RevPAR — це лише поверхня
            </motion.p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function Scene2() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3000),
      setTimeout(() => setPhase(4), 5000),
      setTimeout(() => setPhase(5), 13500),
    ];
    return () => t.forEach(clearTimeout);
  }, []);
  const stats = [
    { title: 'Дохід', value: '₴277 200', icon: TrendingUp, color: '#6366f1' },
    { title: 'Завантаженість', value: '87%', icon: Users, color: '#8b5cf6' },
    { title: 'ADR', value: '₴2 850', icon: CreditCard, color: '#f59e0b' },
  ];
  return (
    <motion.div className="absolute inset-0 flex items-center justify-center z-10 px-20"
      initial={{ opacity: 0, x: '10vw' }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '-10vw', filter: 'blur(10px)' }}
      transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}>
      <div className="flex w-full gap-16 items-center">
        <div className="flex-1 relative">
          {phase >= 1 && (
            <motion.div initial={{ rotateY: 15, rotateX: 5, opacity: 0, scale: 0.9 }}
              animate={{ rotateY: 10, rotateX: 5, opacity: 1, scale: 1 }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
              className="w-full h-[60vh] bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl p-8 flex flex-col gap-6 shadow-2xl">
              <div className="grid grid-cols-3 gap-4">
                {stats.map((s, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 20 }}
                    animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                    transition={{ duration: 0.8, delay: i * 0.2 }}
                    className="bg-white/5 rounded-xl p-4 border border-white/5">
                    <div className="mb-2" style={{ color: s.color }}><s.icon size={24} /></div>
                    <div className="text-white/50 text-sm">{s.title}</div>
                    <div className="text-2xl font-bold mt-1 font-display">{s.value}</div>
                  </motion.div>
                ))}
              </div>
              {phase >= 3 && (
                <div className="flex-1 flex items-end gap-2 mt-4 relative">
                  <div className="absolute inset-0 border-l border-b border-white/10" />
                  {[40, 70, 45, 90, 65, 80, 100].map((h, i) => (
                    <motion.div key={i} className="flex-1 rounded-t-sm"
                      style={{ background: 'linear-gradient(to top, #6366f1, #8b5cf6)' }}
                      initial={{ height: '0%' }} animate={{ height: `${h}%` }}
                      transition={{ duration: 1, delay: i * 0.1, type: 'spring', damping: 20 }} />
                  ))}
                  <motion.svg className="absolute inset-0 w-full h-full overflow-visible"
                    preserveAspectRatio="none" viewBox="0 0 100 100">
                    <motion.path d="M 5,60 L 20,30 L 35,55 L 50,10 L 65,35 L 80,20 L 95,0"
                      fill="none" stroke="#f59e0b" strokeWidth="3"
                      strokeLinecap="round" strokeLinejoin="round"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                      transition={{ duration: 2, delay: 0.5, ease: 'easeInOut' }} />
                  </motion.svg>
                </div>
              )}
            </motion.div>
          )}
        </div>
        <div className="w-1/3">
          {phase >= 4 && (
            <motion.h2 initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1 }}
              className="text-5xl font-display font-bold leading-tight text-white">
              Повна картина<br/>
              <span className="text-white/50">вашого готелю</span><br/>
              <span style={{ color: '#6366f1' }}>в реальному часі</span>
            </motion.h2>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function Scene3() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 3500),
      setTimeout(() => setPhase(4), 13500),
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
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-20"
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: '-10vh' }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}>
      {phase >= 1 && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <h2 className="text-4xl font-display font-bold mb-4 text-white">Шахматка бронювань</h2>
          <p className="text-xl text-white/60 font-light">весь номерний фонд одним поглядом</p>
        </motion.div>
      )}
      {phase >= 2 && (
        <motion.div className="w-full max-w-5xl bg-white/5 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-2xl"
          initial={{ opacity: 0, rotateX: -10 }} animate={{ opacity: 1, rotateX: 0 }}
          transition={{ duration: 1, ease: 'easeOut' }}>
          <div className="flex border-b border-white/10 bg-white/5">
            <div className="w-24 p-4 border-r border-white/10 text-white/40 text-sm">Номери</div>
            {days.map(d => (
              <div key={d} className="flex-1 p-4 text-center border-r border-white/10 text-white/60 text-sm">
                Тра {d + 10}
              </div>
            ))}
          </div>
          <div className="relative">
            {rooms.map((room, rIndex) => (
              <div key={room} className="flex border-b border-white/5 h-16 relative">
                <div className="w-24 flex items-center justify-center border-r border-white/10 font-bold text-sm text-white bg-white/[0.02]">
                  {room}
                </div>
                {days.map(d => <div key={d} className="flex-1 border-r border-white/[0.02]" />)}
              </div>
            ))}
            {phase >= 3 && bookings.map((b, i) => (
              <motion.div key={i}
                className="absolute h-12 rounded-md shadow-lg backdrop-blur-sm border border-white/20 flex items-center px-3"
                style={{ background: b.bg, top: `${b.r * 4 + 0.5}rem`, left: `calc(6rem + ${(b.d / 7) * 100}%)`, width: `calc(${(b.w / 7) * 100}% - 8px)` }}
                initial={{ scaleX: 0, opacity: 0, transformOrigin: 'left' }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ duration: 0.6, delay: i * 0.15, type: 'spring', damping: 20 }}>
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

function Scene4() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 13500),
    ];
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
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-20"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }} transition={{ duration: 1 }}>
      {phase >= 1 && (
        <motion.h2 className="text-5xl font-display font-bold mb-16 text-white"
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          Все в одній системі
        </motion.h2>
      )}
      {phase >= 2 && (
        <div className="grid grid-cols-3 gap-8 w-full max-w-4xl">
          {modules.map((mod, i) => (
            <motion.div key={i} initial={{ opacity: 0, scale: 0.8, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.6, delay: i * 0.15, type: 'spring', damping: 15 }}
              className="relative p-8 rounded-2xl border flex flex-col items-center text-center gap-4 backdrop-blur-sm"
              style={mod.highlight ? {
                background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))',
                borderColor: 'rgba(99,102,241,0.5)',
                boxShadow: '0 0 30px rgba(99,102,241,0.2)',
              } : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}>
              <div className="p-4 rounded-full"
                style={mod.highlight ? { background: '#6366f1', color: 'white', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' } : { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                <mod.icon size={32} />
              </div>
              <h3 className="text-xl font-medium" style={{ color: mod.highlight ? 'white' : 'rgba(255,255,255,0.8)' }}>
                {mod.title}
              </h3>
              {mod.highlight && (
                <motion.div className="absolute inset-0 rounded-2xl border border-white/20 pointer-events-none"
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

function Scene5() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 2500),
      setTimeout(() => setPhase(3), 5000),
    ];
    return () => t.forEach(clearTimeout);
  }, []);
  return (
    <motion.div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-20"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      exit={{ opacity: 0 }} transition={{ duration: 1.5 }}>
      <div className="flex flex-col items-center text-center">
        {phase >= 1 && (
          <motion.div initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="px-10 py-5 rounded-full mb-8"
            style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', boxShadow: '0 0 60px rgba(139,92,246,0.4)' }}>
            <h2 className="text-5xl font-bold font-display tracking-tight text-white">7 днів безкоштовно</h2>
          </motion.div>
        )}
        {phase >= 2 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
            className="flex items-center gap-4 text-xl text-white/60 mb-20">
            <span>Без кредитної картки</span>
            <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
            <span>Міграція з будь-якої PMS</span>
          </motion.div>
        )}
        {phase >= 3 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 2 }}
            className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center">
              <span className="text-white font-display text-2xl font-bold">M</span>
            </div>
            <span className="text-2xl font-display font-bold tracking-widest text-white/80">Maison HD</span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main player ───────────────────────────────────────────────────────────────
export default function DemoVideoPlayer() {
  const { currentScene } = useVideoPlayer(SCENE_DURATIONS);
  const sceneKeys = Object.keys(SCENE_DURATIONS);

  return (
    <div className="relative w-full h-full overflow-hidden"
      style={{ backgroundColor: '#0d0f1c', fontFamily: 'Inter, sans-serif', color: 'white' }}>

      {/* Background glow */}
      <div className="absolute inset-0 z-0">
        <motion.div className="absolute w-[80vw] h-[80vw] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.2), transparent)', filter: 'blur(120px)' }}
          animate={{ x: ['-20%', '10%', '-10%', '-20%'], y: ['-20%', '-10%', '10%', '-20%'], scale: [1, 1.2, 0.9, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }} />
        <motion.div className="absolute w-[60vw] h-[60vw] rounded-full pointer-events-none right-0 bottom-0"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.15), transparent)', filter: 'blur(100px)' }}
          animate={{ x: ['20%', '-10%', '20%'], y: ['20%', '0%', '20%'], scale: [1, 1.1, 1] }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }} />
      </div>

      {/* Particles */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div key={i} className="absolute w-1 h-1 rounded-full bg-white/20"
            initial={{ x: `${Math.random() * 100}vw`, y: `${Math.random() * 100}vh` }}
            animate={{ y: [`${Math.random() * 100}vh`, `${Math.random() * 100 - 20}vh`], opacity: [0, 0.5, 0] }}
            transition={{ duration: 5 + Math.random() * 5, repeat: Infinity, ease: 'linear', delay: Math.random() * 5 }} />
        ))}
      </div>

      {/* Scenes */}
      <AnimatePresence mode="sync">
        {currentScene === 0 && <SceneIntro key="intro" />}
        {currentScene === 1 && <Scene1 key="open" />}
        {currentScene === 2 && <Scene2 key="dashboard" />}
        {currentScene === 3 && <Scene3 key="chess" />}
        {currentScene === 4 && <Scene4 key="modules" />}
        {currentScene === 5 && <Scene5 key="close" />}
      </AnimatePresence>

      {/* Scene dots — skip intro dot */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-20">
        {sceneKeys.map((_, i) => i > 0 && (
          <div key={i} className="w-1.5 h-1.5 rounded-full transition-all duration-500"
            style={{
              background: currentScene === i ? 'white' : 'rgba(255,255,255,0.25)',
              transform: currentScene === i ? 'scale(1.3)' : 'scale(1)',
            }} />
        ))}
      </div>
    </div>
  );
}
