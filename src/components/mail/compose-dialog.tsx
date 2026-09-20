"use client";

import { useEffect, useState } from "react";
import {
  X,
  Minus,
  Maximize2,
  Paperclip,
  Send,
  ChevronDown,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMailStore } from "@/store/mail-store";
import { useInvalidateMail } from "@/hooks/use-mail";
import { toast } from "@/hooks/use-toast";
import { makeSnippet, textToHtml } from "@/lib/email-utils";
import type { Email } from "@/lib/types";

interface ComposeDialogProps {
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  replyToEmail?: Email | null;
}

type WindowState = "normal" | "minimized" | "maximized";

export function ComposeDialog({
  open: openProp,
  onOpenChange: onOpenChangeProp,
  replyToEmail,
}: ComposeDialogProps) {
  const storeOpen = useMailStore((s) => s.composeOpen);
  const storeReplyTo = useMailStore((s) => s.composeReplyTo);
  const closeStore = useMailStore((s) => s.closeCompose);
  const invalidate = useInvalidateMail();

  const open = openProp ?? storeOpen;
  const setOpen = (v: boolean) => {
    onOpenChangeProp?.(v);
    if (!v) closeStore();
  };

  // Reply target: either explicit prop (from detail page) or from store (sidebar compose with reply)
  const replyTarget = replyToEmail ?? null;
  const isReply = !!replyTarget || storeReplyTo !== null;

  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [windowState, setWindowState] = useState<WindowState>("normal");
  const [sending, setSending] = useState(false);

  // Pre-fill on open
  useEffect(() => {
    if (!open) return;
    if (replyTarget) {
      // Reply
      setTo(replyTarget.fromEmail);
      setCc(replyTarget.ccEmails || "");
      setBcc("");
      const subj = replyTarget.subject.toLowerCase().startsWith("re:")
        ? replyTarget.subject
        : "Re: " + replyTarget.subject;
      setSubject(subj);
      setBody(
        `\n\nOn ${new Date(replyTarget.date).toDateString()}, ${replyTarget.fromName} wrote:\n> ${replyTarget.snippet}`
      );
      setShowCc(!!replyTarget.ccEmails);
    } else {
      // New compose
      setTo("");
      setCc("");
      setBcc("");
      setSubject("");
      setBody("");
      setShowCc(false);
    }
    setAttachmentName("");
    setWindowState("normal");
  }, [open, replyTarget]);

  if (!open) return null;

  async function handleSend() {
    if (!to.trim()) {
      toast({ title: "Please add a recipient", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const payload: Record<string, unknown> = {
        to,
        cc,
        bcc,
        subject: subject || "(no subject)",
        body,
        attachmentName,
      };
      const isPutReply = isReply && replyTarget;
      const url = isPutReply ? `/api/emails/${replyTarget!.id}` : "/api/emails";
      const method = isPutReply ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Send failed");
      }
      const data = await res.json();
      // If this is a draft, also remove from drafts? For now, just send.
      void makeSnippet(body);
      void textToHtml(body);
      invalidate();
      toast({ title: isReply ? "Reply sent" : "Message sent", duration: 2000 });
      setOpen(false);
      return data;
    } catch (e) {
      toast({
        title: "Could not send",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }

  async function handleSaveDraft() {
    if (!to.trim() && !subject.trim() && !body.trim()) {
      setOpen(false);
      return;
    }
    try {
      const res = await fetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          cc,
          bcc,
          subject: subject || "(no subject)",
          body,
          attachmentName,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Saved as draft (sent)", duration: 1500 });
      setOpen(false);
      invalidate();
    } catch {
      toast({ title: "Could not save draft", variant: "destructive" });
    }
  }

  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col rounded-t-xl border border-border bg-background shadow-2xl transition-all",
        windowState === "minimized"
          ? "bottom-0 right-4 h-10 w-72 sm:w-96"
          : windowState === "maximized"
          ? "inset-2 sm:inset-4"
          : "bottom-0 right-4 h-[28rem] w-[min(32rem,calc(100vw-2rem))] sm:right-6"
      )}
      role="dialog"
      aria-label="Compose email"
    >
      {/* Title bar */}
      <div
        className="flex h-10 flex-shrink-0 cursor-default items-center gap-2 rounded-t-xl bg-foreground/5 px-3 text-foreground"
        onClick={() =>
          windowState === "minimized" && setWindowState("normal")
        }
      >
        <span className="flex-1 truncate text-xs font-medium">
          {isReply
            ? subject || "Reply"
            : subject || "New message"}
        </span>
        {windowState !== "minimized" && (
          <button
            onClick={() => setWindowState("minimized")}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
            aria-label="Minimize"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() =>
            setWindowState(windowState === "maximized" ? "normal" : "maximized")
          }
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
          aria-label={windowState === "maximized" ? "Restore" : "Maximize"}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setOpen(false)}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {windowState !== "minimized" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-border">
          <div className="flex flex-col divide-y divide-border">
            <div className="flex items-center px-3">
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="To"
                className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
                aria-label="Recipients"
              />
              {!showCc && (
                <button
                  onClick={() => setShowCc(true)}
                  className="ml-2 flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Cc/Bcc <ChevronDown className="h-3 w-3" />
                </button>
              )}
            </div>
            {showCc && (
              <>
                <div className="flex items-center px-3">
                  <Input
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="Cc"
                    className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
                    aria-label="Cc"
                  />
                </div>
                <div className="flex items-center px-3">
                  <Input
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    placeholder="Bcc"
                    className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
                    aria-label="Bcc"
                  />
                </div>
              </>
            )}
            <div className="flex items-center px-3">
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
                aria-label="Subject"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message…"
              className="h-full min-h-[8rem] resize-none border-0 px-3 py-2 text-sm shadow-none focus-visible:ring-0"
              aria-label="Message body"
            />
          </div>

          {attachmentName && (
            <div className="mx-3 mb-2 inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs">
              <Paperclip className="h-3.5 w-3.5 text-accent" />
              <span className="font-medium">{attachmentName}</span>
              <button
                onClick={() => setAttachmentName("")}
                className="ml-1 text-muted-foreground hover:text-foreground"
                aria-label="Remove attachment"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Toolbar */}
          <div className="flex h-12 flex-shrink-0 items-center gap-1 border-t border-border px-3">
            <Button
              onClick={handleSend}
              disabled={sending}
              className="h-8 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send"}
              <Send className="ml-1.5 h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() =>
                setAttachmentName(
                  attachmentName ? "" : "attachment-" + Date.now() + ".pdf"
                )
              }
              aria-label="Attach file"
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={handleSaveDraft}
              aria-label="Discard draft"
              title="Discard"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
