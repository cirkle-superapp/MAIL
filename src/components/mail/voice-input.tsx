"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";

// Minimal type declarations for the Web Speech API (not in TS by default)
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [i: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): { new (): SpeechRecognitionLike } | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { SpeechRecognition?: { new (): SpeechRecognitionLike } }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: { new (): SpeechRecognitionLike } }).webkitSpeechRecognition ??
    null
  );
}

interface VoiceInputProps {
  onTranscript: (text: string, isFinal: boolean) => void;
}

/**
 * Voice-to-Email: a microphone button that uses the browser's built-in Web
 * Speech API for voice dictation. No external service, no API key — works
 * offline-ish (the browser's own speech engine). Inserts transcribed text
 * into the compose editor in real time.
 */
export function VoiceInput({ onTranscript }: VoiceInputProps) {
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");

  // Compute support once (client-only; the component is "use client")
  const [supported] = useState(() => {
    const SR = getSpeechRecognition();
    return !!SR;
  });

  useEffect(() => {
    if (!supported) return;
    const SR = getSpeechRecognition();
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (e: SpeechRecognitionEventLike) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          const chunk = result[0].transcript.trim();
          if (chunk) {
            finalRef.current += chunk + " ";
            onTranscript(chunk + " ", true);
          }
        } else {
          interimText += result[0].transcript;
        }
      }
      setInterim(interimText);
    };

    rec.onerror = (e: { error: string }) => {
      if (e.error === "not-allowed") {
        toast({
          title: "Microphone blocked",
          description: "Allow microphone access in your browser settings.",
          variant: "destructive",
        });
        setRecording(false);
      }
    };

    rec.onend = () => {
      setRecording(false);
      setInterim("");
    };

    recognitionRef.current = rec;
    return () => {
      try { rec.abort(); } catch {}
    };
  }, [onTranscript, supported]);

  function toggle() {
    if (!recognitionRef.current) return;
    if (recording) {
      recognitionRef.current.stop();
      setRecording(false);
    } else {
      finalRef.current = "";
      setInterim("");
      try {
        recognitionRef.current.start();
        setRecording(true);
        toast({ title: "Listening…", duration: 1000 });
      } catch {
        setRecording(false);
      }
    }
  }

  if (!supported) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "btn-premium glass relative h-8 w-8 rounded-full shadow-soft",
              recording
                ? "text-rose animate-pulse-glow"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={toggle}
            aria-label={recording ? "Stop dictation" : "Voice dictation"}
            title="Voice dictation (Web Speech API)"
          >
            {recording ? (
              <Square className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            {recording && (
              <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {recording ? `Recording… ${interim.slice(0, 30)}` : "Voice dictation"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
