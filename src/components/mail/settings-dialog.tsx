"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { Settings as SettingsIcon } from "lucide-react";
import {
  useSettings,
  type Density,
  type InboxTabs,
} from "@/store/settings-store";

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const settings = useSettings();

  // local draft of the signature so typing doesn't thrash; committed on close
  const [sigDraft, setSigDraft] = useState(settings.signature);

  useEffect(() => {
    function onShow() {
      setSigDraft(settings.signature);
      setOpen(true);
    }
    window.addEventListener("cirkle:show-settings", onShow);
    return () => window.removeEventListener("cirkle:show-settings", onShow);
  }, [settings.signature]);

  function handleClose(v: boolean) {
    if (!v) {
      settings.setSignature(sigDraft);
    }
    setOpen(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4 text-primary" /> Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Density */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">
                Inbox density
              </h3>
              <p className="text-xs text-muted-foreground">
                Control the spacing between messages in the list.
              </p>
            </div>
            <RadioGroup
              value={settings.density}
              onValueChange={(v) => settings.setDensity(v as Density)}
              className="flex flex-col gap-2"
            >
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted/40">
                <RadioGroupItem value="comfortable" />
                <div>
                  <div className="font-medium">Default (comfortable)</div>
                  <div className="text-xs text-muted-foreground">
                    More breathing room
                  </div>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted/40">
                <RadioGroupItem value="compact" />
                <div>
                  <div className="font-medium">Compact</div>
                  <div className="text-xs text-muted-foreground">
                    Fit more messages on screen
                  </div>
                </div>
              </label>
            </RadioGroup>
          </section>

          {/* Inbox type */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">Inbox type</h3>
              <p className="text-xs text-muted-foreground">
                Show category tabs (Primary, Promotions, Social, Updates) in the
                inbox.
              </p>
            </div>
            <RadioGroup
              value={settings.inboxTabs}
              onValueChange={(v) => settings.setInboxTabs(v as InboxTabs)}
              className="flex flex-col gap-2"
            >
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted/40">
                <RadioGroupItem value="categories" />
                <div>
                  <div className="font-medium">Default with category tabs</div>
                  <div className="text-xs text-muted-foreground">
                    Auto-sort into Primary / Promotions / Social / Updates
                  </div>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted/40">
                <RadioGroupItem value="default" />
                <div>
                  <div className="font-medium">No tabs</div>
                  <div className="text-xs text-muted-foreground">
                    One unified inbox
                  </div>
                </div>
              </label>
            </RadioGroup>
          </section>

          {/* Signature */}
          <section className="space-y-2">
            <div>
              <h3 className="text-sm font-medium text-foreground">Signature</h3>
              <p className="text-xs text-muted-foreground">
                Appended to new messages you compose. Reply/forward quotes
                appear above the signature.
              </p>
            </div>
            <Textarea
              value={sigDraft}
              onChange={(e) => setSigDraft(e.target.value)}
              placeholder="e.g. — Sent from Cirkle Mail"
              className="min-h-[72px] resize-none text-sm"
            />
          </section>

          {/* Send + archive */}
          <section className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">
                Send & archive
              </h3>
              <p className="text-xs text-muted-foreground">
                Archive the original conversation when you reply.
              </p>
            </div>
            <Switch
              checked={settings.sendAndArchive}
              onCheckedChange={settings.setSendAndArchive}
              aria-label="Send and archive"
            />
          </section>
        </div>

        <DialogFooter>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => handleClose(false)}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
