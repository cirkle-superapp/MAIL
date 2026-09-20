"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link as LinkIcon,
  Quote,
  Eraser,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RichTextEditorProps {
  initialHtml?: string;
  onChange?: (html: string) => void;
  onSendShortcut?: () => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

/**
 * Lightweight rich-text editor built on contentEditable + execCommand.
 * Fully uncontrolled (React never rewrites the DOM after mount) to avoid
 * caret-jump issues. The parent reads HTML via the onChange callback.
 * Cmd/Ctrl+Enter dispatches onSendShortcut.
 */
export function RichTextEditor({
  initialHtml = "",
  onChange,
  onSendShortcut,
  placeholder = "Write your message…",
  className,
  ariaLabel = "Message body",
}: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);

  const syncPlaceholder = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const isEmpty = el.textContent === "" && el.innerHTML === "";
    if (isEmpty) el.setAttribute("data-empty", "true");
    else el.removeAttribute("data-empty");
  }, []);

  const emit = useCallback(() => {
    syncPlaceholder();
    if (onChange && ref.current) onChange(ref.current.innerHTML);
  }, [onChange, syncPlaceholder]);

  // Set initial content once on mount
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== initialHtml) {
      ref.current.innerHTML = initialHtml;
    }
    syncPlaceholder();
  }, [syncPlaceholder]);

  function exec(command: string, value?: string) {
    ref.current?.focus();
    document.execCommand(command, false, value);
    emit();
  }

  function handleLink() {
    const url = window.prompt("Enter URL");
    if (url) exec("createLink", url);
  }

  function handleKeydown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onSendShortcut?.();
    }
  }

  const tools: Array<{
    cmd: string;
    label: string;
    icon: React.ReactNode;
    arg?: string;
  }> = [
    { cmd: "bold", label: "Bold", icon: <Bold className="h-3.5 w-3.5" /> },
    { cmd: "italic", label: "Italic", icon: <Italic className="h-3.5 w-3.5" /> },
    { cmd: "underline", label: "Underline", icon: <Underline className="h-3.5 w-3.5" /> },
    { cmd: "insertUnorderedList", label: "Bullet list", icon: <List className="h-3.5 w-3.5" /> },
    { cmd: "insertOrderedList", label: "Numbered list", icon: <ListOrdered className="h-3.5 w-3.5" /> },
    { cmd: "formatBlock", label: "Quote", icon: <Quote className="h-3.5 w-3.5" />, arg: "blockquote" },
  ];

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-border/60 px-2 py-1">
        <TooltipProvider delayDuration={300}>
          {tools.map((t) => (
            <Tooltip key={t.cmd + (t.arg ?? "")}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => exec(t.cmd, t.arg)}
                  aria-label={t.label}
                  type="button"
                >
                  {t.icon}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t.label}</TooltipContent>
            </Tooltip>
          ))}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleLink}
                aria-label="Insert link"
                type="button"
              >
                <LinkIcon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Insert link</TooltipContent>
          </Tooltip>
          <div className="mx-1 h-4 w-px bg-border" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec("removeFormat")}
                aria-label="Clear formatting"
                type="button"
              >
                <Eraser className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Clear formatting</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Editable surface — placeholder via global .rte-placeholder rule */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={ariaLabel}
        data-empty="true"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onKeyDown={handleKeydown}
        className="rte-surface min-h-[8rem] flex-1 cursor-text overflow-y-auto px-3 py-2 text-sm leading-relaxed text-foreground/90 outline-none [&_a]:text-accent [&_a:hover]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc"
      />
    </div>
  );
}
