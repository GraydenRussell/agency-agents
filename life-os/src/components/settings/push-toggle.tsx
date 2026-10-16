"use client";
import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushToggle() {
  const [state, setState] = useState<"unsupported" | "off" | "on" | "denied" | "loading">("loading");
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      queueMicrotask(() => setState("unsupported"));
      return;
    }
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setState(Notification.permission === "denied" ? "denied" : sub ? "on" : "off");
    });
  }, []);

  async function enable() {
    if (!key) return toast.error("Push isn't configured on the server (VAPID keys missing).");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setState("denied");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
    if (!res.ok) return toast.error("Couldn't save the subscription");
    setState("on");
    toast.success("Push notifications enabled on this device");
  }

  async function disable() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
  }

  if (state === "unsupported") return <p className="text-xs text-muted-foreground">This browser doesn&apos;t support push. On iPhone, install Life OS to the Home Screen first (Share → Add to Home Screen).</p>;
  if (state === "denied") return <p className="text-xs text-amber-400">Notifications are blocked for this site in your browser settings.</p>;
  return (
    <Button variant={state === "on" ? "outline" : "default"} size="sm" disabled={state === "loading"} onClick={() => void (state === "on" ? disable() : enable())}>
      <BellRing /> {state === "on" ? "Disable push on this device" : "Enable push on this device"}
    </Button>
  );
}
