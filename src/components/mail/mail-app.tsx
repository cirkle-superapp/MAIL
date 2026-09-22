"use client";

import { useEffect, useState } from "react";
import { TopBar } from "@/components/mail/top-bar";
import { Sidebar } from "@/components/mail/sidebar";
import { EmailList } from "@/components/mail/email-list";
import { EmailDetail } from "@/components/mail/email-detail";
import { ComposeDialog } from "@/components/mail/compose-dialog";
import { ShortcutsHelpDialog } from "@/components/mail/shortcuts-help";
import { SettingsDialog } from "@/components/mail/settings-dialog";
import { CommandBar } from "@/components/mail/command-bar";
import { TriageMode } from "@/components/mail/triage-mode";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useMailStore } from "@/store/mail-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useInvalidateMail } from "@/hooks/use-mail";
import { cn } from "@/lib/utils";

export function MailApp() {
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const selectedEmailId = useMailStore((s) => s.selectedEmailId);
  const setSelectedEmailId = useMailStore((s) => s.setSelectedEmailId);
  const invalidate = useInvalidateMail();

  // Deliver due scheduled emails on mount + every 30s (no background cron
  // available, so we simulate delivery when the app is open).
  useEffect(() => {
    let mounted = true;
    async function deliver() {
      try {
        const res = await fetch("/api/emails", { method: "PUT" });
        if (res.ok) {
          const data = await res.json();
          if (mounted && data?.delivered > 0) invalidate();
        }
      } catch {
        // ignore
      }
    }
    deliver();
    const t = setInterval(deliver, 30000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, [invalidate]);

  // Keyboard shortcuts ("/" dispatches a focus-search event the TopBar listens for)
  useKeyboardShortcuts(() =>
    window.dispatchEvent(new Event("cirkle:focus-search"))
  );

  const showDetail = !!selectedEmailId;

  function handleToggleSidebar() {
    if (isMobile) {
      setMobileSidebarOpen((v) => !v);
    } else {
      setSidebarCollapsed((v) => !v);
    }
  }

  function backToList() {
    setSelectedEmailId(null);
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <TopBar
        onToggleSidebar={handleToggleSidebar}
        sidebarOpen={isMobile ? mobileSidebarOpen : !sidebarCollapsed}
      />

      <div className="flex min-h-0 flex-1">
        {/* Desktop push sidebar */}
        {!isMobile && <Sidebar collapsed={sidebarCollapsed} />}

        {/* Mobile sidebar drawer */}
        {isMobile && (
          <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
            <SheetContent
              side="left"
              className="w-72 p-0 sm:w-72"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="h-full" onClick={() => setMobileSidebarOpen(false)}>
                <Sidebar collapsed={false} />
              </div>
            </SheetContent>
          </Sheet>
        )}

        {/* Middle + Right panes */}
        <div className="flex min-w-0 flex-1">
          {/* Email list — hidden on mobile when detail is open */}
          <section
            className={cn(
              "min-w-0 flex-1 border-r border-border",
              showDetail ? "hidden md:block md:flex-1" : "block"
            )}
          >
            <EmailList onOpenEmail={() => {}} />
          </section>

          {/* Email detail — full screen on mobile, flex on desktop */}
          <section
            className={cn(
              "min-w-0 flex-1",
              showDetail ? "block" : "hidden md:block md:flex-1"
            )}
          >
            <EmailDetail onBack={backToList} />
          </section>
        </div>
      </div>

      <ComposeDialog />
      <ShortcutsHelpDialog />
      <SettingsDialog />
      <CommandBar />
      <TriageMode />
    </div>
  );
}
