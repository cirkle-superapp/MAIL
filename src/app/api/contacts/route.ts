import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Returns distinct senders + recipients the user has corresponded with,
// for recipient autocomplete in the compose dialog.
export async function GET() {
  const all = await db.email.findMany({
    select: { fromName: true, fromEmail: true, toEmails: true, ccEmails: true },
  });

  const map = new Map<string, string>(); // email -> name (first-seen wins)

  for (const e of all) {
    // Skip "You" as a contact suggestion for the To field
    if (e.fromEmail && e.fromEmail !== "you@cirkle.mail") {
      if (!map.has(e.fromEmail)) map.set(e.fromEmail, e.fromName);
    }
    for (const addr of (e.toEmails + "," + e.ccEmails).split(",")) {
      const a = addr.trim();
      if (a && a !== "you@cirkle.mail" && !map.has(a)) {
        map.set(a, a.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
      }
    }
  }

  const contacts = Array.from(map.entries()).map(([email, name]) => ({ email, name }));
  // Sort by name alphabetically
  contacts.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ contacts });
}
