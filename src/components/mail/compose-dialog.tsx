"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  Minus,
  Maximize2,
  Paperclip,
  Send,
  Trash2,
  Save,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMailStore, type ComposeMode } from "@/store/mail-store";
import { useEmailDetail, useInvalidateMail } from "@/hooks/use-mail";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { showUndoToast } from "@/components/mail/undo-toast";
import { makeSnippet, textToHtml, formatFullDate } from "@/lib/email-utils";
import { RichTextEditor } from "@/components/mail/rich-text-editor";
import { RecipientInput } from "@/components/mail/recipient-input";
import type { Email } from "@/lib/types";

type WindowState = "normal" | "minimized" | "maximized";

const UNDO_WINDOW_MS = 5000;
const SELF = "you@cirkle.mail";

export function ComposeDialog() {
  const open = useMailStore((s) => s.composeOpen);
  const mode: ComposeMode = useMailStore((s) => s.composeMode);
  const composeEmailId = useMailStore((s) => s.composeEmailId);
  const closeCompose = useMailStore((s) => s.closeCompose);
  const invalidate = useInvalidateMail();

  // Fetch the source email when replying / forwarding
  const { data: sourceData } = useEmailDetail(
    mode === "new" ? null : composeEmailId
  );
  const sourceEmail: Email | null = sourceData?.email ?? null;

  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [attachmentName, setAttachmentName] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [windowState, setWindowState] = useState<WindowState>("normal");
  const [sending, setSending] = useState(false);
  const [editorKey, setEditorKey] = useState(0);

  const pendingSendRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-fill on open or when the source/mode changes
  useEffect(() => {
    if (!open) return;

    if (mode === "reply" && sourceEmail) {
      setTo(sourceEmail.fromEmail);
      setCc(sourceEmail.ccEmails || "");
      setBcc("");
      setReplySubject(sourceEmail);
      setReplyBody(sourceEmail);
      setShowCc(!!sourceEmail.ccEmails);
    } else if (mode === "reply-all" && sourceEmail) {
      // Reply-all: To = sender + original To (minus self); CC = original CC
      const recipients = [sourceEmail.fromEmail, ...splitAddrs(sourceEmail.toEmails)]
        .filter((a) => a && a.toLowerCase() !== SELF)
        .filter(dedupe);
      setTo(recipients.join(", "));
      setCc(sourceEmail.ccEmails || "");
      setBcc("");
      setReplySubject(sourceEmail);
      setReplyBody(sourceEmail);
      setShowCc(!!sourceEmail.ccEmails || recipients.length > 1);
    } else if (mode === "forward" && sourceEmail) {
      setTo("");
      setCc("");
      setBcc("");
      const subj = sourceEmail.subject.toLowerCase().startsWith("fwd:")
        ? sourceEmail.subject
        : "Fwd: " + sourceEmail.subject;
      setSubject(subj);
      setBodyHtml(
        `<p><br></p><p>---------- Forwarded message ----------</p><p>From: ${sourceEmail.fromName} &lt;${sourceEmail.fromEmail}&gt;<br>Date: ${formatFullDate(sourceEmail.date)}<br>Subject: ${sourceEmail.subject}</p><br>${sourceEmail.body}`
      );
      setShowCc(false);
      setAttachmentName(
        sourceEmail.hasAttachment ? sourceEmail.attachmentName : ""
      );
    } else if (mode === "edit-draft" && sourceEmail) {
      // Continue editing an existing draft
      setTo(sourceEmail.toEmails || "");
      setCc(sourceEmail.ccEmails || "");
      setBcc(sourceEmail.bccEmails || "");
      setSubject(sourceEmail.subject || "");
      setBodyHtml(sourceEmail.body || "");
      setShowCc(!!sourceEmail.ccEmails || !!sourceEmail.bccEmails);
      setAttachmentName(
        sourceEmail.hasAttachment ? sourceEmail.attachmentName : ""
      );
    } else {
      // New compose
      setTo("");
      setCc("");
      setBcc("");
      setSubject("");
      setBodyHtml("");
      setShowCc(false);
      setAttachmentName("");
    }
    setWindowState("normal");
    setEditorKey((k) => k + 1);
  }, [open, mode, sourceEmail?.id]);

  // Cleanup any pending send on unmount
  useEffect(() => {
    return () => {
      if (pendingSendRef.current) clearTimeout(pendingSendRef.current);
    };
  }, []);

  if (!open) return null;

  function setReplySubject(src: Email) {
    setSubject(
      src.subject.toLowerCase().startsWith("re:") ? src.subject : "Re: " + src.subject
    );
  }
  function setReplyBody(src: Email) {
    setBodyHtml(
      `<p><br></p><p>On ${formatFullDate(src.date)}, ${src.fromName} wrote:</p><blockquote style="border-left:2px solid #ccc;padding-left:8px;color:#666;margin:0">${src.body}</blockquote>`
    );
  }

  function buildPayload(isDraft = false) {
    return {
      to,
      cc,
      bcc,
      subject: subject || "(no subject)",
      body: bodyHtml,
      attachmentName,
      isDraft,
    };
  }

  function actuallySend(payload: ReturnType<typeof buildPayload>) {
    setSending(true);
    fetch("/api/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Send failed");
        }
        invalidate();
        setSending(false);
        pendingSendRef.current = null;
        // When sending a draft, delete the original draft record (the sent
        // copy is now the canonical message).
        if (mode === "edit-draft" && sourceEmail) {
          fetch(`/api/emails/${sourceEmail.id}`, { method: "DELETE" })
            .then(() => invalidate())
            .catch(() => {});
        }
        // Send + archive: when replying, archive the original conversation
        // (Gmail default) if it's still in the inbox.
        if (
          (mode === "reply" || mode === "reply-all") &&
          sourceEmail &&
          sourceEmail.folder === "INBOX"
        ) {
          const sourceId = sourceEmail.id;
          fetch(`/api/emails/${sourceId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder: "ARCHIVE" }),
          })
            .then(() => invalidate())
            .then(() => {
              showUndoToast("Reply sent · conversation archived", () =>
                fetch(`/api/emails/${sourceId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ folder: "INBOX" }),
                }).then(() => invalidate())
              );
            })
            .catch(() => {});
        }
        setTimeout(() => closeCompose(), 200);
      })
      .catch((e) => {
        setSending(false);
        pendingSendRef.current = null;
        toast({
          title: "Could not send",
          description: e instanceof Error ? e.message : undefined,
          variant: "destructive",
        });
      });
  }

  function handleSend() {
    if (!to.trim()) {
      toast({ title: "Please add a recipient", variant: "destructive" });
      return;
    }
    setSending(true);
    const payload = buildPayload(false);
    toast({ title: "Sending…", duration: 1200 });
    pendingSendRef.current = setTimeout(() => {
      actuallySend(payload);
    }, UNDO_WINDOW_MS);
    toast({
      title: "Message sent",
      description: "Undo available for 5s",
      duration: UNDO_WINDOW_MS,
      action: (
        <ToastAction altText="Undo send" onClick={handleUndo}>
          Undo
        </ToastAction>
      ),
    });
    setWindowState("minimized");
  }

  function handleUndo() {
    if (pendingSendRef.current) {
      clearTimeout(pendingSendRef.current);
      pendingSendRef.current = null;
    }
    setSending(false);
    setWindowState("normal");
    invalidate();
    toast({ title: "Send cancelled", duration: 1500 });
  }

  async function handleSaveDraft() {
    // When editing an existing draft, PATCH it in place; otherwise create a new one.
    if (mode === "edit-draft" && sourceEmail) {
      try {
        const res = await fetch(`/api/emails/${sourceEmail.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toEmails: to,
            ccEmails: cc,
            bccEmails: bcc,
            subject: subject || "(no subject)",
            body: bodyHtml,
            attachmentName,
            hasAttachment: !!attachmentName,
          }),
        });
        if (!res.ok) throw new Error("Failed");
        invalidate();
        toast({ title: "Draft updated", duration: 1500 });
        closeCompose();
      } catch {
        toast({ title: "Could not save draft", variant: "destructive" });
      }
      return;
    }
    const payload = buildPayload(true);
    try {
      const res = await fetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed");
      invalidate();
      toast({ title: "Draft saved", duration: 1500 });
      closeCompose();
    } catch {
      toast({ title: "Could not save draft", variant: "destructive" });
    }
  }

  async function handleDeleteDraft() {
    if (!sourceEmail) return;
    try {
      await fetch(`/api/emails/${sourceEmail.id}`, { method: "DELETE" });
      invalidate();
      closeCompose();
      toast({ title: "Draft discarded", duration: 1500 });
    } catch {
      toast({ title: "Could not discard draft", variant: "destructive" });
    }
  }

  function handleDiscard() {
    closeCompose();
  }

  void makeSnippet(bodyHtml);
  void textToHtml(bodyHtml);

  const titleText =
    mode === "reply"
      ? `Reply: ${subject || "(no subject)"}`
      : mode === "reply-all"
      ? `Reply all: ${subject || "(no subject)"}`
      : mode === "forward"
      ? `Forward: ${subject || "(no subject)"}`
      : mode === "edit-draft"
      ? `Draft: ${subject || "(no subject)"}`
      : subject || "New message";

  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col rounded-t-xl border border-border bg-background shadow-2xl transition-all",
        windowState === "minimized"
          ? "bottom-0 right-4 h-10 w-72 sm:w-96"
          : windowState === "maximized"
          ? "inset-2 sm:inset-4"
          : "bottom-0 right-4 h-[34rem] w-[min(34rem,calc(100vw-2rem))] sm:right-6"
      )}
      role="dialog"
      aria-label="Compose email"
    >
      {/* Title bar */}
      <div
        className="flex h-10 flex-shrink-0 cursor-default items-center gap-2 rounded-t-xl bg-muted/60 px-3 text-foreground"
        onClick={() => windowState === "minimized" && setWindowState("normal")}
      >
        <span className="flex-1 truncate text-xs font-medium">{titleText}</span>
        {sending && (
          <span className="text-[10px] text-muted-foreground">sending…</span>
        )}
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
          onClick={handleDiscard}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {windowState !== "minimized" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border">
          <div className="flex flex-col divide-y divide-border">
            <RecipientInput
              value={to}
              onChange={setTo}
              placeholder="To"
              ariaLabel="Recipients"
              showToggle={!showCc}
              onToggle={() => setShowCc(true)}
              toggleLabel="Cc/Bcc"
              className="px-3"
            />
            {showCc && (
              <>
                <RecipientInput
                  value={cc}
                  onChange={setCc}
                  placeholder="Cc"
                  ariaLabel="Cc"
                  className="px-3"
                />
                <RecipientInput
                  value={bcc}
                  onChange={setBcc}
                  placeholder="Bcc"
                  ariaLabel="Bcc"
                  className="px-3"
                />
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

          <RichTextEditor
            key={editorKey}
            initialHtml={bodyHtml}
            onChange={setBodyHtml}
            onSendShortcut={handleSend}
            placeholder="Write your message… (Cmd/Ctrl+Enter to send)"
            className="min-h-0"
          />

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
              size="sm"
              className="ml-1 h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleSaveDraft}
              aria-label="Save as draft"
              title="Save as draft"
            >
              <Save className="h-3.5 w-3.5" /> Save draft
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={
                mode === "edit-draft" && sourceEmail
                  ? handleDeleteDraft
                  : handleDiscard
              }
              aria-label={
                mode === "edit-draft" && sourceEmail
                  ? "Discard draft"
                  : "Discard"
              }
              title={
                mode === "edit-draft" && sourceEmail
                  ? "Discard draft (delete)"
                  : "Discard"
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function splitAddrs(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function dedupe(addr: string, idx: number, arr: string[]): boolean {
  const lower = addr.toLowerCase();
  return arr.findIndex((a) => a.toLowerCase() === lower) === idx;
}
