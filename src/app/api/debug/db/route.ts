import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.DATABASE_URL ?? "(unset)";
  const masked = url.length > 20 ? url.slice(0, 12) + "…" + url.slice(-8) : url;
  const isRemote =
    url.startsWith("libsql://") ||
    url.startsWith("https://") ||
    url.startsWith("http://");
  return NextResponse.json({
    databaseUrlMasked: masked,
    urlScheme: url.split("://")[0] ?? "(none)",
    isRemote,
    tursoTokenSet: !!process.env.TURSO_TOKEN,
    neonDatabaseUrlSet: !!process.env.NEON_DATABASE_URL,
    inngestSignKeySet: !!process.env.INNGEST_SIGN_KEY,
    cronSecretSet: !!process.env.CRON_SECRET,
    nodeEnv: process.env.NODE_ENV,
  });
}
