import { ArrowUpIcon, CornerDownRightIcon, MicIcon, MicOffIcon, ScanLineIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { closeAgent, runCommand, scanNote, toggleMute, voiceInputSupported } from "@/actions";
import { commandsFor } from "@/commands";
import { JarvisOrb, OrbStatus } from "@/components/jarvis/orb";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { greeting, SUGGESTIONS } from "@/roles";
import { PEOPLE, useWare } from "@/store";
import { useStageCounts } from "@/workflow";

const ROLE_LABEL = { owner: "Owner", sales: "Sales", warehouse: "Warehouse" } as const;

/** Jarvis: one chat for questions, "/" commands, voice and scanning delivery notes — tuned to the current role. */
export function JarvisChat({ drawer, className }: { drawer: boolean; className?: string }) {
  const role = useWare((s) => s.role);
  const transcript = useWare((s) => s.transcript);
  const orb = useWare((s) => s.orb);
  const muted = useWare((s) => s.muted);
  const micError = useWare((s) => s.micError);
  const chatDraft = useWare((s) => s.chatDraft);
  const chatFocus = useWare((s) => s.chatFocus);
  const counts = useStageCounts();
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!chatFocus) return;
    setDraft(chatDraft);
    inputRef.current?.focus();
  }, [chatFocus, chatDraft]);

  const slash = draft.startsWith("/") && !/\s/.test(draft);
  const cmds = slash ? commandsFor(role).filter((c) => `${c.id} ${c.label} ${c.keywords.join(" ")}`.toLowerCase().includes(draft.slice(1).toLowerCase())) : [];
  const pick = cmds[Math.min(active, Math.max(0, cmds.length - 1))];

  const send = (text: string) => {
    if (!text.trim()) return;
    setDraft("");
    setActive(0);
    void runCommand(text);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slash && cmds.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (a + (e.key === "ArrowDown" ? 1 : cmds.length - 1)) % cmds.length);
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && pick) {
        e.preventDefault();
        send(`/${pick.id}`);
        return;
      }
    }
    if (e.key === "Escape") {
      setDraft("");
      inputRef.current?.blur();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  };

  return (
    <aside
      aria-label="Jarvis"
      className={cn(
        "flex min-h-0 animate-slide-in flex-col overflow-hidden rounded-lg border border-border bg-panel",
        drawer && "fixed top-16 right-3 bottom-3 z-20 w-[min(360px,calc(100vw-24px))] shadow-[0_16px_40px_rgba(0,0,0,.6)]",
        className,
      )}
    >
      <div className="flex items-center gap-3 border-b border-border py-2.5 pr-2.5 pl-3">
        <JarvisOrb size={52} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[13.5px] leading-none font-semibold">Jarvis</span>
          <span className="truncate text-[11.5px] text-muted-foreground">
            {PEOPLE[role]} · {ROLE_LABEL[role]}
          </span>
        </div>
        <OrbStatus />
        <Button variant="quiet" size="icon-xs" onClick={closeAgent} aria-label="Close Jarvis" className="size-[26px]">
          <XIcon />
        </Button>
      </div>

      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-3 p-3">
              <MessageScrollerItem messageId="greeting">
                <Message align="start">
                  <MessageContent>
                    <Bubble variant="muted">
                      <BubbleContent>{greeting(role, PEOPLE[role], counts)}</BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
              {!transcript.length && (
                <MessageScrollerItem messageId="suggestions">
                  <div className="flex flex-col items-start gap-1.5">
                    {SUGGESTIONS[role].map((s) => (
                      <Button key={s} variant="outline" size="sm" className="h-auto py-1.5 text-left text-[12.5px] whitespace-normal" onClick={() => send(s)}>
                        {s}
                      </Button>
                    ))}
                  </div>
                </MessageScrollerItem>
              )}
              {transcript.map((l) => (
                <MessageScrollerItem key={l.id} messageId={String(l.id)} scrollAnchor={l.who === "user"}>
                  <Message align={l.who === "user" ? "end" : "start"}>
                    <MessageContent>
                      <Bubble variant={l.who === "user" ? "default" : "muted"} align={l.who === "user" ? "end" : "start"}>
                        <BubbleContent className={cn(l.text.startsWith("/") && "font-mono")}>{l.text}</BubbleContent>
                      </Bubble>
                      {l.traces && (
                        <div className="flex flex-col gap-0.5 px-1">
                          {l.traces.map((t) => (
                            <span key={t} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                              <CornerDownRightIcon className="size-3 flex-none" />
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              ))}
              {orb === "thinking" && (
                <MessageScrollerItem messageId="thinking">
                  <Message align="start">
                    <MessageContent>
                      <Bubble variant="muted">
                        <BubbleContent>
                          <Spinner />
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <div className="relative flex flex-col gap-2 border-t border-border p-3">
        {slash && cmds.length > 0 && (
          <Command shouldFilter={false} value={pick?.id} className="absolute inset-x-3 bottom-full mb-2 h-auto rounded-lg border border-border shadow-[0_8px_24px_rgba(0,0,0,.45)]">
            <CommandList>
              <CommandGroup heading="Commands">
                {cmds.map((c) => (
                  <CommandItem key={c.id} value={c.id} onSelect={() => send(`/${c.id}`)} onMouseEnter={() => setActive(cmds.indexOf(c))}>
                    <c.icon />
                    <span className="font-mono text-muted-foreground">/{c.id}</span>
                    <span>{c.label}</span>
                    {!!counts[c.id] && <span className="ml-auto font-mono text-xs text-brand-light">{counts[c.id]}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
        {micError && <span className="text-[11.5px] text-warn">{micError}</span>}
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*,application/pdf"
          capture="environment"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void scanNote(f);
          }}
        />
        <InputGroup>
          <InputGroupTextarea
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            placeholder={muted ? "Ask, or type / for commands" : "Listening… or type"}
            rows={1}
            className="max-h-28 min-h-9 text-[13.5px]"
          />
          <InputGroupAddon align="block-end">
            <InputGroupButton size="icon-xs" variant="ghost" aria-label="Scan delivery note" title="Scan delivery note" onClick={() => fileRef.current?.click()}>
              <ScanLineIcon />
            </InputGroupButton>
            {voiceInputSupported() && (
              <InputGroupButton
                size="icon-xs"
                variant={muted ? "ghost" : "secondary"}
                aria-label={muted ? "Talk" : "Stop voice"}
                aria-pressed={!muted}
                title={muted ? "Talk" : "Stop voice"}
                onClick={toggleMute}
                className={cn(!muted && "text-brand-light")}
              >
                {muted ? <MicIcon /> : <MicOffIcon />}
              </InputGroupButton>
            )}
            <InputGroupButton size="icon-xs" variant="default" className="ml-auto rounded-full" aria-label="Send" disabled={!draft.trim()} onClick={() => send(draft)}>
              <ArrowUpIcon />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </aside>
  );
}
