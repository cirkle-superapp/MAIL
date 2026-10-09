import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/emails/smtp-config — fetch the best SMTP config from Turso (edge).
 *
 * Turso is the edge database — SMTP routing configs are stored here for
 * ultra-fast access from Vercel edge functions. The config determines how
 * emails are delivered:
 * - If host is set → call the SMTP service at that URL (the custom mini-service)
 * - If host is empty → direct MX delivery (lookup the recipient's MX records)
 *
 * Configs are ordered by priority (lower = higher priority).
 * Returns the first ENABLED config.
 */
export async function GET() {
  try {
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_TOKEN;
    if (!tursoUrl || !tursoToken) {
      return NextResponse.json({
        error: "Turso not configured",
        fallback: { id: "direct-mx", name: "Direct MX Delivery", host: "", port: 25, apiKey: "" },
      });
    }

    const client = createClient({ url: tursoUrl, authToken: tursoToken });
    const result = await client.execute({
      sql: `SELECT * FROM "SmtpConfig" WHERE enabled = 1 ORDER BY priority ASC LIMIT 1`,
      args: [],
    });

    if (result.rows.length === 0) {
      return NextResponse.json({
        id: "direct-mx",
        name: "Direct MX Delivery",
        host: "",
        port: 25,
        apiKey: "",
        region: "global",
      });
    }

    const row = result.rows[0] as Record<string, unknown>;
    return NextResponse.json({
      id: row.id,
      name: row.name,
      host: row.host,
      port: Number(row.port),
      region: row.region,
      priority: Number(row.priority),
      apiKey: row.apiKey || "",
      source: "turso-edge",
    });
  } catch (err) {
    console.error("[api/emails/smtp-config] error:", err);
    return NextResponse.json({
      error: "Failed to fetch SMTP config",
      fallback: { id: "direct-mx", name: "Direct MX Delivery", host: "", port: 25, apiKey: "" },
    }, { status: 500 });
  }
}
