import { useEffect } from "react";
import { resetDemo } from "@/actions";
import { Badge } from "@/components/ui/badge";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import type { Role } from "@/domain/types";
import { closePanel, commandsFor, openCommand } from "@/commands";
import { PEOPLE, setRole, setWare, useWare } from "@/store";
import { useStageCounts } from "@/workflow";

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (/INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable);
};

/** `/` or Ctrl+K opens it; Esc closes the open panel and returns to the map. */
export function CommandPalette() {
  const open = useWare((s) => s.paletteOpen);
  const role = useWare((s) => s.role);
  const counts = useStageCounts();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing(e.target))) {
        e.preventDefault();
        setWare((s) => ({ paletteOpen: !s.paletteOpen }));
      } else if (e.key === "Escape" && !typing(e.target)) {
        const s = useWare.getState();
        if (!s.paletteOpen && (s.detail || s.stage !== "inventory")) closePanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={(o) => setWare({ paletteOpen: o })} title="Commands" description="Open a workflow panel">
      <CommandInput placeholder="Type a command…" />
      <CommandList>
        <CommandEmpty>No command.</CommandEmpty>
        <CommandGroup heading={PEOPLE[role]}>
          {commandsFor(role).map((c) => (
            <CommandItem key={c.id} value={`/${c.id} ${c.label} ${c.keywords.join(" ")}`} onSelect={() => openCommand(c.id)}>
              <c.icon />
              <span className="font-mono text-muted-foreground">/{c.id}</span>
              <span>{c.label}</span>
              {!!counts[c.id] && (
                <CommandShortcut>
                  <Badge variant="brand" className="font-mono">
                    {counts[c.id]}
                  </Badge>
                </CommandShortcut>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Act as">
          {(["owner", "sales", "warehouse"] as Role[])
            .filter((r) => r !== role)
            .map((r) => (
              <CommandItem key={r} value={`act as ${r} ${PEOPLE[r]}`} onSelect={() => (setRole(r), setWare({ paletteOpen: false }))}>
                <span>{PEOPLE[r]}</span>
                <span className="text-muted-foreground capitalize">{r}</span>
              </CommandItem>
            ))}
          {role === "owner" && (
            <CommandItem value="reset demo data" onSelect={() => (setWare({ paletteOpen: false }), void resetDemo())}>
              <span className="text-muted-foreground">Reset demo data</span>
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
