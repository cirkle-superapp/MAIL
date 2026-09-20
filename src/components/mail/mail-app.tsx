"use client";

import { useEffect, useState } from "react";
import { TopBar } from "@/components/mail/top-bar";
import { Sidebar } from "@/components/mail/sidebar";
import { EmailList } from "@/components/mail/email-list";
import { EmailDetail } from "@/components/mail/email-detail";
import { ComposeDialog } from "@/components/mail/compose-dialog";
import { useMailStore } from "@/store/mail-store";
import { cn } from "@/lib/utils";

export function MailApp() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const selectedEmailId = useMailStore((s) => s.selectedEmailId);
  const setSelectedEmailId = useMailStore((s) => s.setSelectedEmailId);
  const composeOpen = useMailStore((s) => s.composeOpen);

  // Auto-collapsing sidebar on small screens
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      if (window.innerWidth < 768) {
        setSidebarCollapsed(true);
      }
    };
    handler();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // On mobile, an open email shows the detail pane; on desktop both are visible.
  const showDetail = !!selectedEmailId;

  function backToList() {
    setSelectedEmailId(null);
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <TopBar
        onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        sidebarOpen={!sidebarCollapsed}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar collapsed={sidebarCollapsed} />

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

      <ComposeDialog open={composeOpen} />
    </div>
  );
}
