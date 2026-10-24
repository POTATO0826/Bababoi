import { ArrowUpIcon, CheckIcon, CircleSlashIcon, CornerDownRightIcon, MessageSquarePlusIcon, MicIcon, MicOffIcon, ScanLineIcon, SquareIcon, TriangleAlertIcon, WrenchIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { closeAgent, newAgentConversation, refreshLocalAgent, runCommand, scanNote, stopLocalAgent, toggleMute, voiceInputSupported } from "@/actions";
import { Badge } from "@/components/ui/badge";
import { localDemo } from "@/identity";
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
import { useWare, type AgentToolCall, type AgentTurn, type LocalAgentState } from "@/store";
import { useStageCounts } from "@/workflow";

const ROLE_LABEL = { owner: "Owner", sales: "Sales", warehouse: "Warehouse" } as const;

/** Jarvis: one chat for questions, "/" commands, voice and scanning delivery notes — tuned to the current role. */
export function JarvisChat({ drawer, className }: { drawer: boolean; className?: string }) {
  const role = useWare((s) => s.role);
  const staffName = useWare((s) => s.staff?.name ?? "Staff");
  const transcript = useWare((s) => s.transcript);
  const orb = useWare((s) => s.orb);
  const muted = useWare((s) => s.muted);
  const micError = useWare((s) => s.micError);
  const chatDraft = useWare((s) => s.chatDraft);
  const chatFocus = useWare((s) => s.chatFocus);
  const counts = useStageCounts();
  const localAgent = useWare((s) => s.localAgent);
  const streaming = transcript.some((l) => l.agent?.state === "streaming");
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
            {staffName} · {ROLE_LABEL[role]}
          </span>
        </div>
        <OrbStatus />
        {localDemo && (
          <Button variant="quiet" size="icon-xs" onClick={newAgentConversation} aria-label="New conversation" title="New conversation" className="size-[26px]">
            <MessageSquarePlusIcon />
          </Button>
        )}
        <Button variant="quiet" size="icon-xs" onClick={closeAgent} aria-label="Close Jarvis" className="size-[26px]">
          <XIcon />
        </Button>
      </div>

      {localDemo && <AgentStatusBar state={localAgent} />}

      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="gap-3 p-3">
              <MessageScrollerItem messageId="greeting">
                <Message align="start">
                  <MessageContent>
                    <Bubble variant="muted">
                      <BubbleContent>{greeting(role, staffName, counts)}</BubbleContent>
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
                      {l.agent ? (
                        <AgentReply text={l.text} turn={l.agent} />
                      ) : (
                        <Bubble variant={l.who === "user" ? "default" : "muted"} align={l.who === "user" ? "end" : "start"}>
                          <BubbleContent className={cn(l.text.startsWith("/") && "font-mono")}>{l.text}</BubbleContent>
                        </Bubble>
                      )}
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
              {orb === "thinking" && !streaming && (
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
            {streaming ? (
              <InputGroupButton size="icon-xs" variant="secondary" className="ml-auto rounded-full" aria-label="Stop the answer" title="Stop the answer" onClick={stopLocalAgent}>
                <SquareIcon />
              </InputGroupButton>
            ) : (
              <InputGroupButton size="icon-xs" variant="default" className="ml-auto rounded-full" aria-label="Send" disabled={!draft.trim()} onClick={() => send(draft)}>
                <ArrowUpIcon />
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
      </div>
    </aside>
  );
}

/** Local demo: which Pi provider/model answers, or why none does. Checked without calling the provider. */
function AgentStatusBar({ state }: { state: LocalAgentState | null }) {
  useEffect(() => {
    if (!state) void refreshLocalAgent();
  }, [state]);
  if (!state) return <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[11.5px] text-muted-foreground"><Spinner className="size-3" />Checking the local agent…</div>;
  if (state.ready) {
    return (
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[11.5px] text-muted-foreground" title={state.modelName}>
        <Badge variant="ok">Pi agent</Badge>
        <span className="truncate font-mono">{state.provider}/{state.model}</span>
        {state.subscription && <span className="text-faint">subscription</span>}
        {state.readsPhotos === false && <span className="text-warn">no photo input</span>}
      </div>
    );
  }
  return (
    <div role="status" className="flex flex-col gap-1 border-b border-border px-3 py-2 text-[11.5px]">
      <span className="flex items-center gap-2"><Badge variant="warn">Agent not connected</Badge><Button variant="quiet" size="xs" onClick={() => void refreshLocalAgent()}>Check again</Button></span>
      <span className="text-muted-foreground">{state.reason}</span>
    </div>
  );
}

const json = (v: unknown, max = 4000) => {
  let t: string;
  try { t = JSON.stringify(v, null, 2) ?? "null"; } catch { t = String(v); }
  return t.length > max ? `${t.slice(0, max)}\n… (${t.length - max} more characters)` : t;
};
const argsSummary = (v: unknown) => {
  if (!v || typeof v !== "object") return "";
  const entries = Object.entries(v as Record<string, unknown>);
  return entries.length ? entries.map(([k, x]) => `${k}=${typeof x === "string" ? x : JSON.stringify(x)}`).join(" ") : "";
};

function ToolCallView({ call }: { call: AgentToolCall }) {
  return (
    <details className="group rounded-md border border-border bg-background/40 text-[11.5px]">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1">
        <WrenchIcon className="size-3 flex-none text-muted-foreground" />
        <span className="font-mono">{call.name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-faint">{argsSummary(call.args)}</span>
        {call.state === "running" ? <Spinner className="size-3" /> : call.state === "error" ? <TriangleAlertIcon className="size-3 text-dispatch" /> : <CheckIcon className="size-3 text-ok-light" />}
        {call.ms != null && <span className="font-mono text-faint">{call.ms} ms</span>}
      </summary>
      <div className="flex flex-col gap-1 border-t border-border px-2 py-1.5">
        <span className="text-muted-foreground">Arguments</span>
        <pre className="max-h-24 overflow-auto font-mono text-[10.5px] whitespace-pre-wrap">{json(call.args ?? {})}</pre>
        <span className="text-muted-foreground">{call.state === "running" ? "Running…" : call.state === "error" ? "Error" : "Result"}</span>
        {call.state !== "running" && <pre className="max-h-56 overflow-auto font-mono text-[10.5px] whitespace-pre-wrap">{json(call.result)}</pre>}
      </div>
    </details>
  );
}

/** A streamed answer from the local Pi agent with every tool call it made. */
function AgentReply({ text, turn }: { text: string; turn: AgentTurn }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {turn.tools.length > 0 && <div className="flex flex-col gap-1">{turn.tools.map((t) => <ToolCallView key={t.id} call={t} />)}</div>}
      {(text || turn.state === "streaming") && (
        <Bubble variant="muted">
          <BubbleContent className="whitespace-pre-wrap">{text || <Spinner />}{text && turn.state === "streaming" && <span className="ml-0.5 animate-pulse">▍</span>}</BubbleContent>
        </Bubble>
      )}
      {turn.state === "error" && (
        <div role="alert" className="flex gap-1.5 rounded-md border border-dispatch/40 px-2 py-1.5 text-[12px] text-dispatch">
          <TriangleAlertIcon className="mt-0.5 size-3.5 flex-none" />
          <span>{turn.setup ? "Agent not connected. " : "The agent could not answer. "}{turn.error}</span>
        </div>
      )}
      {turn.state === "cancelled" && <span className="flex items-center gap-1.5 px-1 text-[11.5px] text-muted-foreground"><CircleSlashIcon className="size-3" />Stopped</span>}
      {turn.model && <span className="px-1 font-mono text-[10.5px] text-faint">Pi · {turn.model}{turn.subscription ? " · subscription" : ""}</span>}
    </div>
  );
}
