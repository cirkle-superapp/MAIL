import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/docs — API documentation for the Cirkle Mail Email API.
 */
export async function GET() {
  return NextResponse.json({
    name: "Cirkle (دواير) Email API",
    version: "1.0.0",
    baseUrl: "https://cirkle-mail.vercel.app",
    auth: {
      type: "api-key",
      header: "X-Cirkle-API-Key",
      description: "Set the X-Cirkle-API-Key header to your CIRKLE_API_KEY value.",
    },
    endpoints: {
      "POST /api/emails/receive": "Ingest an incoming email (from external platforms)",
      "POST /api/emails/send": "Send an outgoing email (to external recipients)",
      "GET /api/emails/list": "List emails (folder/view/limit/offset/unread/q params)",
      "GET /api/emails/:id": "Get a single email",
      "PATCH /api/emails/:id": "Update email (read/star/archive/snooze/label)",
      "DELETE /api/emails/:id": "Delete email permanently",
      "GET /api/health": "System health check",
      "GET /api/ai/briefing": "AI Daily Briefing",
      "POST /api/ai/handle": "AI email analysis (summary, draft reply)",
      "POST /api/ai/priority": "AI priority score (0-100)",
    },
    examples: {
      receive: 'curl -X POST https://cirkle-mail.vercel.app/api/emails/receive -H "X-Cirkle-API-Key: YOUR_KEY" -H "Content-Type: application/json" -d \'{"fromName":"John","fromEmail":"john@example.com","toEmails":"you@cirkle.mail","subject":"Hello","body":"Hi there!"}\'',
      send: 'curl -X POST https://cirkle-mail.vercel.app/api/emails/send -H "X-Cirkle-API-Key: YOUR_KEY" -H "Content-Type: application/json" -d \'{"toEmails":"john@example.com","subject":"Re: Hello","body":"Thanks!"}\'',
      list: 'curl https://cirkle-mail.vercel.app/api/emails/list?folder=INBOX&limit=10 -H "X-Cirkle-API-Key: YOUR_KEY"',
    },
  });
}
