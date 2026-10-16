import { NextResponse } from "next/server";
import { isDevAuth } from "@/lib/auth/config";
import { createSupabaseServerClient } from "@/lib/auth/supabase-server";

export async function POST(request: Request) {
  if (!isDevAuth()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
