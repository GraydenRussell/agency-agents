import Link from "next/link";
import { isDevAuth } from "@/lib/auth/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  if (isDevAuth()) {
    return (
      <Card>
        <CardContent className="space-y-3 p-5 text-center">
          <p className="text-sm text-muted-foreground">
            Running with <code>AUTH_MODE=dev</code>: login is disabled locally. This mode is refused on Vercel.
          </p>
          <Button asChild className="w-full">
            <Link href="/today">Open Life OS</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  return <LoginForm notAllowed={error === "not_allowed"} />;
}
