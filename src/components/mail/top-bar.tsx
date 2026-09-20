"use client";

import { useEffect, useRef } from "react";
import { Search, RefreshCw, Settings, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/mail/theme-toggle";
import { useMailStore } from "@/store/mail-store";
import { useInvalidateMail } from "@/hooks/use-mail";
import { toast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CirkleLogo } from "@/components/brand/cirkle-logo";

interface TopBarProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

export function TopBar({ onToggleSidebar, sidebarOpen }: TopBarProps) {
  const searchInput = useMailStore((s) => s.searchInput);
  const setSearchInput = useMailStore((s) => s.setSearchInput);
  const setSearchQuery = useMailStore((s) => s.setSearchQuery);
  const invalidate = useInvalidateMail();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // debounce search input -> query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput, setSearchQuery]);

  // Listen for the global "focus-search" event (triggered by the "/" shortcut)
  useEffect(() => {
    function onFocusSearch() {
      const el = document.querySelector<HTMLInputElement>(
        'input[aria-label="Search mail"]'
      );
      el?.focus();
      el?.select();
    }
    window.addEventListener("cirkle:focus-search", onFocusSearch);
    return () => window.removeEventListener("cirkle:focus-search", onFocusSearch);
  }, []);

  function handleRefresh() {
    invalidate();
    toast({ title: "Inbox refreshed", duration: 1500 });
  }

  function clearSearch() {
    setSearchInput("");
    setSearchQuery("");
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-md sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        className="flex-shrink-0"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      <div className="flex items-center gap-2 pr-2">
        <CirkleLogo
          size={32}
          withWordmark
          wordmarkText="Cirkle Mail"
          subText="your connected inbox"
          wordmarkClassName="text-foreground"
        />
      </div>

      <div className="relative flex flex-1 items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search mail"
          className="h-10 rounded-full border-border/60 bg-muted/60 pl-9 pr-9 text-sm shadow-none focus-visible:bg-background focus-visible:ring-1"
          aria-label="Search mail"
        />
        {searchInput && (
          <button
            onClick={clearSearch}
            className="absolute right-3 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-1">
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                aria-label="Refresh"
              >
                <RefreshCw className="h-[1.1rem] w-[1.1rem]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Settings"
          onClick={() => window.dispatchEvent(new Event("cirkle:show-settings"))}
        >
          <Settings className="h-[1.1rem] w-[1.1rem]" />
        </Button>
        <ThemeToggle />
        <Avatar className="ml-1 h-8 w-8 border border-border">
          <AvatarFallback className="bg-gradient-to-br from-teal to-gold text-xs font-semibold text-cream">
            Y
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
