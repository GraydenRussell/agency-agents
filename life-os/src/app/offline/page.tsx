import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="space-y-3">
        <WifiOff className="mx-auto size-10 text-brand-cyan" />
        <h1 className="font-heading text-4xl tracking-wider">You&apos;re offline</h1>
        <p className="max-w-xs text-sm text-muted-foreground">Life OS needs a connection for live data. Reconnect and it will pick up where you left off.</p>
      </div>
    </main>
  );
}
