export type NotificationChimeType = "message" | "checkin";

export const NOTIFICATION_SOUND_STORAGE_KEY = "inbox_sound";
export const NOTIFICATION_SOUND_CHANGE_EVENT = "mhd-notification-sound-change";

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioContext || audioContext.state === "closed") {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContext;
  } catch {
    return null;
  }
}

export function isNotificationSoundEnabled(): boolean {
  return localStorage.getItem(NOTIFICATION_SOUND_STORAGE_KEY) !== "off";
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  localStorage.setItem(NOTIFICATION_SOUND_STORAGE_KEY, enabled ? "on" : "off");
  window.dispatchEvent(new Event(NOTIFICATION_SOUND_CHANGE_EVENT));
}

/**
 * Resume the shared context from a user gesture so later websocket/poll events
 * can play audio without being blocked by the browser autoplay policy.
 */
export function unlockNotificationSound(): void {
  const ctx = getAudioContext();
  if (ctx?.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

export function playNotificationChime(type: NotificationChimeType = "message"): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const play = () => {
      const notes = type === "checkin" ? [523, 659, 784] : [880, 1047];
      notes.forEach((frequency, index) => {
        const start = ctx.currentTime + index * 0.14;
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
        oscillator.start(start);
        oscillator.stop(start + 0.3);
      });
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  } catch {}
}