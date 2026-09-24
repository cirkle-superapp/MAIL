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
  CalendarClock,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useMailStore, type ComposeMode } from "@/store/mail-store";
import { useSettings } from "@/store/settings-store";
import { useEmailDetail, useInvalidateMail } from "@/hooks/use-mail";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { showUndoToast } from "@/components/mail/undo-toast";
import {
  makeSnippet,
  textToHtml,
  formatFullDate,
  formatSnoozeUntil,
} from "@/lib/email-utils";
import { RichTextEditor } from "@/components/mail/rich-text-editor";
import { RecipientInput } from "@/components/mail/recipient-input";
import { CopilotButton } from "@/components/mail/copilot-button";
import { VoiceInput } from "@/components/mail/voice-input";
import { SubjectImprover } from "@/components/mail/subject-improver";
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
  const sendAndArchive = useSettings((s) => s.sendAndArchive);
  const signature = useSettings((s) => s.signature);

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
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<string>("");

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
      // New compose — append the user's signature (from settings) if set
      setTo("");
      setCc("");
      setBcc("");
      setSubject("");
      setBodyHtml(signature ? textToHtml("\n\n" + signature) : "");
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
        // (Gmail default) if it's still in the inbox and the setting is on.
        if (
          sendAndArchive &&
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

  async function handleSchedule() {
    if (!to.trim()) {
      toast({ title: "Please add a recipient", variant: "destructive" });
      return;
    }
    if (!scheduleDate) {
      toast({ title: "Pick a date and time", variant: "destructive" });
      return;
    }
    const payload = buildPayload(false);
    const iso = new Date(scheduleDate).toISOString();
    try {
      const res = await fetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, scheduledFor: iso }),
      });
      if (!res.ok) throw new Error("Failed");
      invalidate();
      setScheduleOpen(false);
      toast({
        title: "Scheduled",
        description: `Will send ${formatSnoozeUntil(iso)}`,
        duration: 2500,
      });
      closeCompose();
    } catch {
      toast({ title: "Could not schedule", variant: "destructive" });
    }
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
        "fixed z-50 flex overflow-hidden rounded-2xl shadow-premium transition-all animate-spring-in",
        windowState === "minimized"
          ? "card-premium glass-strong bottom-4 right-4 h-14 w-80 flex-row items-center gap-3 p-3 shadow-float sm:w-96"
          : windowState === "maximized"
          ? "glass-strong inset-0 flex-col rounded-none sm:inset-2"
          : "glass-strong bottom-0 right-4 h-[34rem] w-[min(34rem,calc(100vw-2rem))] flex-col sm:bottom-6 sm:right-6"
      )}
      role="dialog"
      aria-label="Compose email"
    >
      {/* Title bar */}
      <div
        className={cn(
          "flex flex-shrink-0 cursor-default items-center",
          windowState === "minimized"
            ? "w-full gap-3"
            : "glass h-12 gap-2 border-b border-border/40 px-5 animate-spring-in"
        )}
        onClick={() => windowState === "minimized" && setWindowState("normal")}
      >
        {windowState !== "minimized" && (
          <span className="h-6 w-1 rounded-full bg-gradient-gold" />
        )}
        <span
          className={cn(
            "flex-1 truncate font-display font-medium",
            windowState === "minimized" ? "text-sm" : "text-base"
          )}
        >
          {titleText}
        </span>
        {sending && (
          <span className="text-[10px] text-muted-foreground">sending…</span>
        )}
        {windowState !== "minimized" && (
          <button
            onClick={() => setWindowState("minimized")}
            className="btn-premium flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Minimize"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() =>
            setWindowState(windowState === "maximized" ? "normal" : "maximized")
          }
          className="btn-premium flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={windowState === "maximized" ? "Restore" : "Maximize"}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleDiscard}
          className="btn-premium flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {windowState !== "minimized" && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-col divide-y divide-border/40">
            <RecipientInput
              value={to}
              onChange={setTo}
              placeholder="To"
              ariaLabel="Recipients"
              showToggle={!showCc}
              onToggle={() => setShowCc(true)}
              toggleLabel="Cc/Bcc"
              className="bg-muted/20 px-5 py-3"
            />
            {showCc && (
              <>
                <RecipientInput
                  value={cc}
                  onChange={setCc}
                  placeholder="Cc"
                  ariaLabel="Cc"
                  className="bg-muted/20 px-5 py-3"
                />
                <RecipientInput
                  value={bcc}
                  onChange={setBcc}
                  placeholder="Bcc"
                  ariaLabel="Bcc"
                  className="bg-muted/20 px-5 py-3"
                />
              </>
            )}
            <div className="flex items-center gap-2 px-5 py-3">
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                className="font-display h-9 border-0 bg-transparent px-0 text-lg font-medium text-foreground shadow-none focus-visible:ring-0 placeholder:text-muted-foreground"
                aria-label="Subject"
              />
              <SubjectImprover subject={subject} onPick={setSubject} />
            </div>
          </div>

          <RichTextEditor
            key={editorKey}
            initialHtml={bodyHtml}
            onChange={setBodyHtml}
            onSendShortcut={handleSend}
            placeholder="Write your message… (Cmd/Ctrl+Enter to send)"
            className="min-h-[200px] px-5 py-4"
          />

          {attachmentName && (
            <div className="card-premium mx-5 mb-3 inline-flex w-fit items-center gap-2 rounded-lg p-3 shadow-soft transition-all duration-200 hover:-translate-y-px">
              <Paperclip className="h-3.5 w-3.5 text-gold" />
              <span className="text-sm font-medium text-foreground">
                {attachmentName}
              </span>
              <button
                onClick={() => setAttachmentName("")}
                className="btn-premium ml-1 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
                aria-label="Remove attachment"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Footer action bar */}
          <div className="glass flex h-14 flex-shrink-0 items-center justify-between gap-2 border-t border-border/40 px-5 py-3 backdrop-blur-md animate-spring-in">
            <div className="flex items-center gap-1.5">
              <Button
                onClick={handleSend}
                disabled={sending}
                className="btn-premium rounded-full bg-gradient-gold px-5 text-sm font-semibold text-charcoal shadow-glow transition-all duration-200 hover:scale-105 hover:shadow-glow disabled:opacity-70"
              >
                {sending ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    Send
                    <Send className="ml-1.5 h-3.5 w-3.5" />
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="btn-premium glass h-9 w-9 rounded-full shadow-soft"
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
              <CopilotButton
                getText={() => bodyHtml}
                setText={(html) => {
                  setBodyHtml(html);
                  setEditorKey((k) => k + 1);
                }}
              />
              <VoiceInput
                onTranscript={(text, isFinal) => {
                  if (isFinal) {
                    const el = document.querySelector(
                      '[contenteditable][role="textbox"]'
                    ) as HTMLElement | null;
                    if (el) {
                      el.focus();
                      document.execCommand("insertText", false, text);
                    }
                  }
                }}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="btn-premium glass h-9 gap-1 rounded-full text-xs text-muted-foreground shadow-soft hover:text-foreground"
                onClick={handleSaveDraft}
                aria-label="Save as draft"
                title="Save as draft"
              >
                <Save className="h-3.5 w-3.5" /> Save draft
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="btn-premium glass h-9 gap-1 rounded-full text-xs text-muted-foreground shadow-soft hover:text-foreground"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  d.setHours(9, 0, 0, 0);
                  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                    .toISOString()
                    .slice(0, 16);
                  setScheduleDate(local);
                  setScheduleOpen(true);
                }}
                aria-label="Schedule send"
                title="Schedule send"
              >
                <CalendarClock className="h-3.5 w-3.5" /> Schedule
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="btn-premium ml-1 h-9 w-9 rounded-full text-muted-foreground hover:text-destructive"
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
        </div>
      )}

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="glass-strong overflow-hidden rounded-2xl border border-border/40 p-0 shadow-premium sm:max-w-[420px]">
          <DialogHeader className="glass flex h-12 items-center gap-2 border-b border-border/40 px-5">
            <DialogTitle className="flex items-center gap-2 font-display text-base font-medium">
              <CalendarClock className="h-4 w-4 text-gold" /> Schedule send
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-datetime">Send at</Label>
              <Input
                id="schedule-datetime"
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="glass rounded-full px-4 py-2 text-sm shadow-soft"
              />
            </div>
            {scheduleDate && (
              <p className="text-xs text-muted-foreground">
                Will be sent on{" "}
                {formatSnoozeUntil(new Date(scheduleDate).toISOString())} and
                appear in your Sent folder.
              </p>
            )}
          </div>
          <DialogFooter className="flex items-center justify-end gap-2 border-t border-border/40 px-5 py-3">
            <Button
              variant="ghost"
              onClick={() => setScheduleOpen(false)}
              className="btn-premium glass rounded-full"
            >
              Cancel
            </Button>
            <Button
              className="btn-premium rounded-full bg-gradient-gold text-charcoal"
              onClick={handleSchedule}
              disabled={!scheduleDate}
            >
              Schedule send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
