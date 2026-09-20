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
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500 text-white shadow-sm">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
            <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
          </svg>
        </div>
        <span className="hidden text-lg font-semibold tracking-tight text-foreground sm:inline">
          Zmail
        </span>
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
        <Button variant="ghost" size="icon" aria-label="Settings">
          <Settings className="h-[1.1rem] w-[1.1rem]" />
        </Button>
        <ThemeToggle />
        <Avatar className="ml-1 h-8 w-8 border border-border">
          <AvatarFallback className="bg-gradient-to-br from-rose-500 to-orange-500 text-xs font-semibold text-white">
            Y
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
