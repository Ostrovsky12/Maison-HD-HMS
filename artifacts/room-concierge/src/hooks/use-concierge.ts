import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../lib/api";

export type ConciergeState =
  | "idle"
  | "greeting"
  | "listening"
  | "processing"
  | "speaking"
  | "confirmed";

const SILENCE_TIMEOUT_MS = 4000; // stop listening after 4s of silence

export function useConcierge(orgSlug: string | null, unitId: string | null) {
  const [state, setState] = useState<ConciergeState>("idle");
  const [guestName, setGuestName] = useState<string>("Гість");
  const [sessionId, setSessionId] = useState<string>("");
  const [adminReply, setAdminReply] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");

  // Refs so callbacks always have fresh values without recreating objects
  const stateRef = useRef<ConciergeState>("idle");
  const transcriptRef = useRef("");
  const chatHistoryRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const guestNameRef = useRef("Гість");
  const orgSlugRef = useRef<string | null>(null);
  const unitIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef("");

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // Keep refs in sync
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { guestNameRef.current = guestName; }, [guestName]);
  useEffect(() => { orgSlugRef.current = orgSlug; }, [orgSlug]);
  useEffect(() => { unitIdRef.current = unitId; }, [unitId]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // Load voices once (Chrome fires voiceschanged async)
  useEffect(() => {
    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  // Load terminal data
  useEffect(() => {
    if (!orgSlug || !unitId) return;
    api.getTerminal(orgSlug, unitId).then(res => {
      if (res.guestName) {
        setGuestName(res.guestName);
        guestNameRef.current = res.guestName;
      }
      if (res.sessionId) {
        setSessionId(res.sessionId);
        sessionIdRef.current = res.sessionId;
      }
    }).catch(console.error);
  }, [orgSlug, unitId]);

  // Poll for admin replies
  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(() => {
      api.getAdminReplies(sessionId).then(replies => {
        if (replies.length > 0) {
          const reply = replies[replies.length - 1].admin_reply;
          setAdminReply(reply);
          setTimeout(() => setAdminReply(null), 12000);
        }
      }).catch(console.error);
    }, 5000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Setup SpeechRecognition ONCE
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "uk-UA";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      transcriptRef.current = "";
      setTranscript("");
    };

    recognition.onresult = (event: any) => {
      // Clear silence timer on any speech activity
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += t;
        } else {
          interim += t;
        }
      }

      const current = final || interim;
      transcriptRef.current = current;
      setTranscript(current);

      // If we got a final result, stop immediately and process
      if (final.trim()) {
        try { recognition.stop(); } catch (_) {}
      } else {
        // Restart silence timer
        silenceTimerRef.current = setTimeout(() => {
          try { recognition.stop(); } catch (_) {}
        }, SILENCE_TIMEOUT_MS);
      }
    };

    recognition.onend = () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      if (stateRef.current === "listening") {
        const text = transcriptRef.current.trim();
        if (text) {
          handleRequest(text);
        } else {
          // Nothing heard — back to idle
          setState("idle");
          stateRef.current = "idle";
        }
      }
    };

    recognition.onerror = (e: any) => {
      // "no-speech" is normal — just go idle
      if (e.error !== "no-speech") {
        console.error("Speech recognition error:", e.error);
      }
      if (stateRef.current === "listening") {
        setState("idle");
        stateRef.current = "idle";
      }
    };

    recognitionRef.current = recognition;
  }, []); // only once

  const speak = useCallback((text: string, onEnd?: () => void) => {
    window.speechSynthesis.cancel();

    // Split into shorter chunks to avoid Chrome's TTS cutoff bug
    const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [text];

    const speakChunk = (index: number) => {
      if (index >= sentences.length) {
        onEnd?.();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(sentences[index].trim());
      utterance.lang = "uk-UA";
      utterance.rate = 0.92;
      utterance.pitch = 1.05;

      // Pick best Ukrainian voice
      const voices = voicesRef.current;
      const ukVoice =
        voices.find(v => v.lang === "uk-UA") ||
        voices.find(v => v.lang.startsWith("uk")) ||
        voices.find(v => v.lang.startsWith("ru")); // fallback: Russian sounds closer than English
      if (ukVoice) utterance.voice = ukVoice;

      utterance.onend = () => speakChunk(index + 1);
      utterance.onerror = () => speakChunk(index + 1); // skip broken chunk

      window.speechSynthesis.speak(utterance);
    };

    // Chrome has a bug where speech stops after ~15s — keep it alive
    const keepAlive = setInterval(() => {
      if (!window.speechSynthesis.speaking) {
        clearInterval(keepAlive);
      } else {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000);

    speakChunk(0);
  }, []);

  const handleRequest = async (text: string) => {
    const slug = orgSlugRef.current;
    const unit = unitIdRef.current;
    const sid = sessionIdRef.current;
    if (!slug || !unit) return;

    setState("processing");
    stateRef.current = "processing";

    const history = chatHistoryRef.current;
    chatHistoryRef.current = [...history, { role: "user" as const, content: text }];

    try {
      const res = await api.chat({
        orgSlug: slug,
        unitId: unit,
        sessionId: sid,
        message: text,
        history,
        guestName: guestNameRef.current,
      });

      chatHistoryRef.current = [
        ...chatHistoryRef.current,
        { role: "assistant" as const, content: res.response },
      ];

      setState("speaking");
      stateRef.current = "speaking";

      speak(res.response, () => {
        const isActionable = res.requestType && res.requestType !== "general";
        if (isActionable) {
          setState("confirmed");
          stateRef.current = "confirmed";
          setTimeout(() => {
            setState("idle");
            stateRef.current = "idle";
          }, 5000);
        } else {
          setState("idle");
          stateRef.current = "idle";
        }
      });
    } catch (err) {
      console.error("Chat error", err);
      setState("speaking");
      stateRef.current = "speaking";
      speak("Вибачте, сталася помилка. Будь ласка, спробуйте ще раз.", () => {
        setState("idle");
        stateRef.current = "idle";
      });
    }
  };

  const wake = useCallback(() => {
    const current = stateRef.current;

    if (current === "idle") {
      window.speechSynthesis.cancel();
      setState("greeting");
      stateRef.current = "greeting";

      const hour = new Date().getHours();
      const timeGreeting =
        hour < 12 ? "Доброго ранку" :
        hour < 17 ? "Добрий день" :
        "Добрий вечір";

      const greeting = `${timeGreeting}, ${guestNameRef.current}! Чим можу допомогти?`;

      speak(greeting, () => {
        setState("listening");
        stateRef.current = "listening";
        transcriptRef.current = "";
        setTranscript("");

        // Start silence timer immediately in case mic doesn't pick up anything
        silenceTimerRef.current = setTimeout(() => {
          try { recognitionRef.current?.stop(); } catch (_) {}
        }, SILENCE_TIMEOUT_MS);

        try {
          recognitionRef.current?.start();
        } catch (e) {
          console.error("Failed to start recognition:", e);
          setState("idle");
          stateRef.current = "idle";
        }
      });
    } else if (current === "listening") {
      // Manual stop
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      try { recognitionRef.current?.stop(); } catch (_) {}
    } else {
      // Cancel everything → idle
      window.speechSynthesis.cancel();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      try { recognitionRef.current?.stop(); } catch (_) {}
      setState("idle");
      stateRef.current = "idle";
    }
  }, [speak]);

  return { state, guestName, transcript, adminReply, wake };
}
