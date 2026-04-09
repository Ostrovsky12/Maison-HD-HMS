import { useEffect, useRef } from "react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";
const tok = () => localStorage.getItem("hms_token") || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(enabled: boolean) {
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (subscribedRef.current) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "denied") return;

    async function subscribe() {
      try {
        const vapidRes = await fetch(`${API}/push/vapid-key`);
        if (!vapidRes.ok) return;
        const { publicKey } = await vapidRes.json();
        if (!publicKey) return;

        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();

        if (!sub) {
          if (Notification.permission === "default") {
            const perm = await Notification.requestPermission();
            if (perm !== "granted") return;
          }
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }

        await fetch(`${API}/push/subscribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tok()}`,
          },
          body: JSON.stringify(sub.toJSON()),
        });

        subscribedRef.current = true;
      } catch (e) {
        console.warn("Push subscription failed:", e);
      }
    }

    subscribe();
  }, [enabled]);
}
