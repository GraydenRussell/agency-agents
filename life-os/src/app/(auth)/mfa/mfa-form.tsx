"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/auth/supabase-browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Stage = { kind: "loading" } | { kind: "enroll"; factorId: string; qr: string; secret: string } | { kind: "verify"; factorId: string } | { kind: "error"; message: string };

export function MfaForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.replace("/login");
        return;
      }
      const { data, error: err } = await supabase.auth.mfa.listFactors();
      if (err) return setStage({ kind: "error", message: err.message });
      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) return setStage({ kind: "verify", factorId: verified.id });
      // Clean up abandoned, unverified enrollments before starting a new one.
      for (const f of data.all.filter((f) => f.status === "unverified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const enrolled = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Life OS" });
      if (enrolled.error) return setStage({ kind: "error", message: enrolled.error.message });
      setStage({ kind: "enroll", factorId: enrolled.data.id, qr: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret });
    })();
  }, [router]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (stage.kind !== "enroll" && stage.kind !== "verify") return;
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: stage.factorId, code: code.trim() });
    setBusy(false);
    if (err) return setError(err.message);
    router.replace("/today");
    router.refresh();
  }

  if (stage.kind === "loading") {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Checking two-factor status…
        </CardContent>
      </Card>
    );
  }
  if (stage.kind === "error") {
    return (
      <Card>
        <CardContent role="alert" className="p-5 text-sm text-red-400">
          {stage.message}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-brand-cyan" />
          <p className="font-medium">{stage.kind === "enroll" ? "Set up your authenticator" : "Enter your 6-digit code"}</p>
        </div>
        {stage.kind === "enroll" && (
          <div className="space-y-2 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- Supabase returns an SVG data URL */}
            <img src={stage.qr} alt="Authenticator QR code" className="mx-auto size-44 rounded-lg bg-white p-2" />
            <p className="text-xs text-muted-foreground">
              Scan with 1Password, Authy, or Google Authenticator. Manual key: <code className="break-all">{stage.secret}</code>
            </p>
          </div>
        )}
        <form onSubmit={verify} className="space-y-3">
          <Label htmlFor="code">Code</Label>
          <Input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Verify
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
