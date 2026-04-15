import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { Phone, PhoneOff, PhoneCall, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Constants ─────────────────────────────────────────────────────────────────
const WS_BASE = window.location.origin
  .replace(/^https/, "wss")
  .replace(/^http/, "ws")
  .replace("/maison-hd", "");

const STUN = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function tok() { return localStorage.getItem("hms_token") || ""; }

// ── Ringtone via Web Audio API ─────────────────────────────────────────────────
function useRingtone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) {
      stopRef.current?.();
      stopRef.current = null;
      return;
    }

    const audioCtx = new AudioContext();
    ctxRef.current = audioCtx;
    let cancelled = false;

    // Standard double-ring pattern: ring(0.4s) + gap(0.2s) + ring(0.4s) + pause(1.5s)
    const playPattern = () => {
      if (cancelled) return;

      const ringBurst = (startTime: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = 480;
        osc.type = "sine";
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.4, startTime + 0.02);
        gain.gain.setValueAtTime(0.4, startTime + duration - 0.02);
        gain.gain.linearRampToValueAtTime(0, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = audioCtx.currentTime;
      ringBurst(now, 0.4);
      ringBurst(now + 0.6, 0.4);

      // Schedule next pattern after total cycle (0.4 + 0.2 + 0.4 + 1.5 = 2.5s)
      const id = setTimeout(playPattern, 2500);
      stopRef.current = () => { cancelled = true; clearTimeout(id); audioCtx.close(); };
    };

    playPattern();

    return () => { stopRef.current?.(); stopRef.current = null; };
  }, [active]);
}

function getUserIdFromToken(): string | null {
  try {
    const t = tok();
    if (!t) return null;
    const payload = JSON.parse(atob(t.split(".")[1]));
    return String(payload.sub || payload.userId || payload.id || "");
  } catch { return null; }
}

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Context types ─────────────────────────────────────────────────────────────
interface TelephonyCtx {
  online: string[];
  callState: "idle" | "calling" | "ringing" | "active";
  callPeer: string | null;
  callTimer: number;
  callPeerFn: (targetId: string) => Promise<void>;
  answerCall: () => Promise<void>;
  hangup: () => void;
  onBinotelEvent: (handler: (evt: any) => void) => () => void;
}

const TelephonyContext = createContext<TelephonyCtx | null>(null);

export function useTelephony() {
  const ctx = useContext(TelephonyContext);
  if (!ctx) throw new Error("useTelephony must be used inside TelephonyProvider");
  return ctx;
}

// ── Incoming call banner ──────────────────────────────────────────────────────
function IncomingCallBanner({
  callPeer,
  callState,
  callTimer,
  answerCall,
  hangup,
}: {
  callPeer: string | null;
  callState: string;
  callTimer: number;
  answerCall: () => Promise<void>;
  hangup: () => void;
}) {
  if (callState !== "ringing" && callState !== "active") return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] animate-in slide-in-from-top-2 duration-300">
      <div className={`rounded-xl shadow-2xl border p-4 w-72 ${
        callState === "ringing"
          ? "bg-white border-green-200"
          : "bg-blue-600 border-blue-500 text-white"
      }`}>
        {callState === "ringing" && (
          <>
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <PhoneCall size={18} className="text-green-600 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Внутрішній виклик</p>
                <p className="text-sm font-semibold truncate text-gray-900">{callPeer}</p>
              </div>
              <button
                onClick={hangup}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                className="flex-1 h-9"
                onClick={hangup}
              >
                <PhoneOff size={14} className="mr-1" />
                Відхилити
              </Button>
              <Button
                size="sm"
                className="flex-1 h-9 bg-green-600 hover:bg-green-700"
                onClick={answerCall}
              >
                <Phone size={14} className="mr-1" />
                Прийняти
              </Button>
            </div>
          </>
        )}

        {callState === "active" && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                <Phone size={14} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-blue-200 uppercase tracking-wide">Розмова</p>
                <p className="text-sm font-bold font-mono">{fmtDuration(callTimer)}</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="bg-red-500 hover:bg-red-600 text-white border-0 h-8"
              onClick={hangup}
            >
              <PhoneOff size={13} className="mr-1" />
              Завершити
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function TelephonyProvider({ children }: { children: ReactNode }) {
  const ws = useRef<WebSocket | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const binotelHandlers = useRef<Set<(evt: any) => void>>(new Set());

  const [userId, setUserId] = useState<string | null>(null);
  const [online, setOnline] = useState<string[]>([]);
  const [callState, setCallState] = useState<"idle" | "calling" | "ringing" | "active">("idle");
  const [callPeer, setCallPeer] = useState<string | null>(null);
  const [callTimer, setCallTimer] = useState(0);

  // Watch for token changes (login/logout)
  useEffect(() => {
    const checkToken = () => setUserId(getUserIdFromToken());
    checkToken();
    const interval = setInterval(checkToken, 3000);
    return () => clearInterval(interval);
  }, []);

  const startTimer = useCallback(() => {
    setCallTimer(0);
    timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCallTimer(0);
  }, []);

  const cleanup = useCallback(() => {
    pc.current?.close();
    pc.current = null;
    localStream.current?.getTracks().forEach(t => t.stop());
    localStream.current = null;
    setCallState("idle");
    setCallPeer(null);
    stopTimer();
  }, [stopTimer]);

  const send = useCallback((msg: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    }
  }, []);

  const callPeerRef = useRef<string | null>(null);
  useEffect(() => { callPeerRef.current = callPeer; }, [callPeer]);

  const createPC = useCallback(() => {
    const p = new RTCPeerConnection(STUN);
    p.onicecandidate = (e) => {
      if (e.candidate && callPeerRef.current) {
        send({ type: "ice-candidate", to: callPeerRef.current, candidate: e.candidate });
      }
    };
    p.ontrack = (e) => {
      if (remoteAudio.current) {
        remoteAudio.current.srcObject = e.streams[0];
        remoteAudio.current.play().catch(() => {});
      }
    };
    p.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(p.connectionState)) cleanup();
    };
    return p;
  }, [send, cleanup]);

  // WebSocket connection — reconnects when userId changes
  useEffect(() => {
    if (!userId) return;
    remoteAudio.current = new Audio();

    const connect = () => {
      const socket = new WebSocket(`${WS_BASE}/ws/telephony`);
      ws.current = socket;

      socket.onopen = () => send({ type: "register", userId });

      socket.onmessage = async (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "registered") {
          setOnline(msg.peers || []);
        } else if (msg.type === "peer-online") {
          setOnline(p => [...new Set([...p, msg.userId])]);
        } else if (msg.type === "peer-offline") {
          setOnline(p => p.filter(x => x !== msg.userId));
        } else if (msg.type === "binotel-incoming" || msg.type === "binotel-completed") {
          binotelHandlers.current.forEach(h => h(msg));
        } else if (msg.type === "call") {
          setCallPeer(msg.from);
          setCallState("ringing");
        } else if (msg.type === "hangup") {
          cleanup();
        } else if (msg.type === "offer") {
          pc.current = createPC();
          await pc.current.setRemoteDescription(new RTCSessionDescription(msg.offer));
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          localStream.current = stream;
          stream.getTracks().forEach(t => pc.current!.addTrack(t, stream));
          const answer = await pc.current.createAnswer();
          await pc.current.setLocalDescription(answer);
          send({ type: "answer", to: msg.from, answer });
          setCallPeer(msg.from);
          setCallState("active");
          startTimer();
        } else if (msg.type === "answer") {
          await pc.current?.setRemoteDescription(new RTCSessionDescription(msg.answer));
          setCallState("active");
          startTimer();
        } else if (msg.type === "ice-candidate") {
          if (msg.candidate) pc.current?.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
        }
      };

      socket.onclose = () => {
        setOnline([]);
        // Auto-reconnect after 5s if still logged in
        if (getUserIdFromToken()) {
          setTimeout(connect, 5000);
        }
      };
    };

    connect();
    return () => {
      ws.current?.close();
      cleanup();
    };
  }, [userId]);

  const callPeerFn = useCallback(async (targetId: string) => {
    if (callState !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream.current = stream;
      pc.current = createPC();
      stream.getTracks().forEach(t => pc.current!.addTrack(t, stream));
      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      setCallPeer(targetId);
      setCallState("calling");
      send({ type: "call", to: targetId });
      send({ type: "offer", to: targetId, offer });
    } catch {
      alert("Не вдалося отримати доступ до мікрофону");
    }
  }, [callState, createPC, send]);

  const answerCall = useCallback(async () => {
    if (!callPeer) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream.current = stream;
      setCallState("active");
      startTimer();
    } catch {
      alert("Не вдалося отримати доступ до мікрофону");
    }
  }, [callPeer, startTimer]);

  const hangup = useCallback(() => {
    if (callPeerRef.current) send({ type: "hangup", to: callPeerRef.current });
    cleanup();
  }, [send, cleanup]);

  const onBinotelEvent = useCallback((handler: (evt: any) => void) => {
    binotelHandlers.current.add(handler);
    return () => { binotelHandlers.current.delete(handler); };
  }, []);

  // Play ringtone when someone is calling us
  useRingtone(callState === "ringing");

  const ctx: TelephonyCtx = { online, callState, callPeer, callTimer, callPeerFn, answerCall, hangup, onBinotelEvent };

  return (
    <TelephonyContext.Provider value={ctx}>
      {children}
      <IncomingCallBanner
        callPeer={callPeer}
        callState={callState}
        callTimer={callTimer}
        answerCall={answerCall}
        hangup={hangup}
      />
    </TelephonyContext.Provider>
  );
}
