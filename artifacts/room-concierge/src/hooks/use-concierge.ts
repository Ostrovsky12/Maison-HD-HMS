import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../lib/api";

export type ConciergeState = 
  | "idle"
  | "greeting"
  | "listening"
  | "processing"
  | "speaking"
  | "confirmed";

export function useConcierge(orgSlug: string | null, unitId: string | null) {
  const [state, setState] = useState<ConciergeState>("idle");
  const [guestName, setGuestName] = useState<string>("Гість");
  const [sessionId, setSessionId] = useState<string>("");
  const [adminReply, setAdminReply] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant", content: string }[]>([]);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  // Load terminal data
  useEffect(() => {
    if (!orgSlug || !unitId) return;
    
    api.getTerminal(orgSlug, unitId).then(res => {
      if (res.guestName) setGuestName(res.guestName);
      if (res.sessionId) setSessionId(res.sessionId);
    }).catch(console.error);
  }, [orgSlug, unitId]);

  // Poll for admin replies if we have a session
  useEffect(() => {
    if (!sessionId) return;
    
    const interval = setInterval(() => {
      api.getAdminReplies(sessionId).then(replies => {
        if (replies.length > 0) {
          // Just take the latest one
          setAdminReply(replies[replies.length - 1].admin_reply);
          // Auto clear after 10s
          setTimeout(() => setAdminReply(null), 10000);
        }
      }).catch(console.error);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [sessionId]);

  // Setup speech
  useEffect(() => {
    if (typeof window !== "undefined") {
      synthRef.current = window.speechSynthesis;
      
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = "uk-UA";
        recognition.interimResults = true;
        recognition.continuous = false;
        
        recognition.onresult = (event: any) => {
          let currentTranscript = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript);
        };
        
        recognition.onend = () => {
          // If we were listening and got transcript, process it
          if (state === "listening" && transcript.trim()) {
            handleRequest(transcript.trim());
          } else if (state === "listening") {
            setState("idle");
          }
        };
        
        recognition.onerror = (e: any) => {
          console.error("Speech recognition error", e);
          setState("idle");
        };
        
        recognitionRef.current = recognition;
      }
    }
  }, [state, transcript]);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!synthRef.current) {
      if (onEnd) onEnd();
      return;
    }
    
    // Cancel any ongoing speech
    synthRef.current.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "uk-UA";
    
    // Try to find a Ukrainian voice
    const voices = synthRef.current.getVoices();
    const ukVoice = voices.find(v => v.lang.startsWith("uk"));
    if (ukVoice) utterance.voice = ukVoice;
    
    utterance.onend = () => {
      if (onEnd) onEnd();
    };
    
    synthRef.current.speak(utterance);
  }, []);

  const handleRequest = async (text: string) => {
    if (!orgSlug || !unitId || !sessionId) return;
    
    setState("processing");
    setChatHistory(prev => [...prev, { role: "user", content: text }]);
    
    try {
      const res = await api.chat({
        orgSlug,
        unitId,
        sessionId,
        message: text,
        history: chatHistory,
        guestName
      });
      
      setChatHistory(prev => [...prev, { role: "assistant", content: res.response }]);
      
      setState("speaking");
      speak(res.response, () => {
        if (res.requestType) {
          setState("confirmed");
          setTimeout(() => setState("idle"), 5000);
        } else {
          setState("idle");
        }
      });
    } catch (error) {
      console.error("Chat error", error);
      setState("speaking");
      speak("Вибачте, сталася помилка. Спробуйте ще раз.", () => setState("idle"));
    }
  };

  const wake = useCallback(() => {
    if (state === "idle" || state === "greeting") {
      // Cancel speech if waking up
      synthRef.current?.cancel();
      
      setState("greeting");
      const greeting = `Добрий вечір, ${guestName}! Чим можу допомогти?`;
      
      speak(greeting, () => {
        setState("listening");
        setTranscript("");
        try {
          recognitionRef.current?.start();
        } catch (e) {
          console.error("Failed to start recognition", e);
        }
      });
    } else if (state === "listening") {
      // Stop listening manually
      try {
        recognitionRef.current?.stop();
      } catch (e) {}
    } else {
      // Return to idle from any state
      synthRef.current?.cancel();
      try {
        recognitionRef.current?.stop();
      } catch(e) {}
      setState("idle");
    }
  }, [state, guestName, speak]);

  return {
    state,
    guestName,
    transcript,
    adminReply,
    wake
  };
}