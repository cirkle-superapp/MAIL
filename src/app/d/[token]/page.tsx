"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Mail, Shield, Clock } from "lucide-react";

/**
 * /d/[token] — Cirkle Delivery Link page.
 *
 * When an email can't be delivered via SMTP (port 25 blocked on serverless),
 * Cirkle generates a secure HTTPS delivery link. The recipient opens this
 * page in any browser — no account needed, no SMTP, fully HTTPS.
 *
 * This is how Cirkle Mail delivers emails WITHOUT port 25 —
 * the email IS the API.
 */

interface DeliveryData {
  subject: string;
  fromName: string;
  fromEmail: string;
  toEmails: string;
  body: string;
  date: string;
  viewed: boolean;
  expiresAt: string | null;
}

export default function DeliveryPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<DeliveryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/emails/deliver?token=${token}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Failed to load email");
        }
        const d = await res.json();
        setData(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    if (token) load();
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading email…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="card-premium max-w-md p-8 text-center">
          <Mail className="mx-auto h-12 w-12 text-muted-foreground" />
          <h1 className="mt-4 font-display text-lg font-medium text-foreground">Email not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <p className="mt-1 text-xs text-muted-foreground">The link may have expired or is invalid.</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
            <Mail className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <p className="font-display text-sm font-semibold text-foreground">Cirkle Mail</p>
            <p className="text-[10px] text-muted-foreground">Secure email delivery</p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
            <Shield className="h-3 w-3" />
            <span>Encrypted</span>
            {data.expiresAt && (
              <>
                <Clock className="ml-2 h-3 w-3" />
                <span>Expires {new Date(data.expiresAt).toLocaleDateString()}</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Email content */}
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="card-premium overflow-hidden rounded-2xl">
          {/* Subject */}
          <div className="border-b border-border/40 p-5">
            <h1 className="font-display text-xl font-medium text-foreground">
              {data.subject || "(no subject)"}
            </h1>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 text-xs font-semibold text-primary">
                {data.fromName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{data.fromName}</p>
                <p className="text-xs text-muted-foreground">{data.fromEmail}</p>
              </div>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(data.date).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Body */}
          <div
            className="p-5 text-sm leading-relaxed text-foreground/90 prose prose-sm dark:prose-invert max-w-none [&_*]:text-foreground/90 [&_a]:text-accent [&_a:hover]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{
              __html: data.body && data.body !== "null" && data.body.trim()
                ? data.body
                : "<p style='color: hsl(var(--muted-foreground)); font-style: italic;'>This email has no content.</p>"
            }}
          />
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-muted-foreground">
            Delivered via Cirkle Mail — the serverless email API.
            No SMTP, no port 25, fully HTTPS.
          </p>
          <a
            href="https://cirkle-mail.vercel.app"
            className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
          >
            Visit Cirkle Mail →
          </a>
        </div>
      </main>
    </div>
  );
}
