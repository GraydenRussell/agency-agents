"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/** Registers the service worker in production builds. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}

/** "Install app" button when the browser offers it; iOS gets Add-to-Home-Screen instructions. */
export function InstallButton() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    queueMicrotask(() => {
      setInstalled(standalone);
      setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone);
    });
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (installed) return <p className="text-xs text-muted-foreground">Installed as an app on this device.</p>;
  if (evt)
    return (
      <Button
        size="sm"
        onClick={async () => {
          await evt.prompt();
          if ((await evt.userChoice).outcome === "accepted") setInstalled(true);
          setEvt(null);
        }}
      >
        <Download /> Install Life OS
      </Button>
    );
  if (ios) return <p className="text-xs text-muted-foreground">On iPhone: tap Share → Add to Home Screen to install Life OS.</p>;
  return <p className="text-xs text-muted-foreground">Use your browser&apos;s “Install app” option to add Life OS to your home screen or dock.</p>;
}
