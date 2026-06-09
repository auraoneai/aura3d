/* Director Console (hero) — transcript + command engine + autocomplete. */
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Icon } from "./Icon";
import { boldHtml, highlightArgs } from "../state/util";
import { VERBS, parse } from "../state/sceneTool";
import { parseCliResult, runSceneCommand } from "../state/backend";
import type { ComposerMode, CmdTurn, Turn } from "../state/types";

/** Imperative handle so the palette can run a command in the console. */
export interface ConsoleApi {
  /** Run a command; `forceCommand` runs it as a raw scene-tool command regardless of mode. */
  run?: (text: string, forceCommand?: boolean) => void;
}

const CHIPS = ["cast add Pip", "shot retime --id shot-2 --duration 30", "cam orbit", "fx add rim light"];

/** The portion of a command after its (possibly two-word) verb — the card's args line. */
function argTail(raw: string, verb: string): string {
  const t = raw.trim();
  return verb && t.toLowerCase().startsWith(verb.toLowerCase()) ? t.slice(verb.length).trim() : "";
}

function CmdCard({ turn }: { turn: CmdTurn }) {
  return (
    <div className="cmd">
      <div className="cmd-top">
        <span className="pr">aura</span>
        <span style={{ color: "var(--tx-faint)" }}>›</span>
        <span className="verb">{turn.verb}</span>
        <span className="args" dangerouslySetInnerHTML={{ __html: highlightArgs(turn.args || "") }} />
        {turn.state === "run" ? (
          <span className="cmd-st st-run">
            <span className="spin" />
            validating
          </span>
        ) : turn.state === "bad" ? (
          <span className="cmd-st st-bad">
            <Icon name="x" size={11} />
            rejected
          </span>
        ) : (
          <span className="cmd-st st-ok">
            <Icon name="check" size={11} />
            committed
          </span>
        )}
      </div>
      {turn.state !== "run" && turn.diffs && (
        <div className="cmd-body">
          {turn.diffs.map((d, i) => (
            <div className="diff" key={i}>
              <span className={"op " + d.k}>{d.op}</span>
              <span className="txt" dangerouslySetInnerHTML={{ __html: d.t }} />
            </div>
          ))}
        </div>
      )}
      {turn.state === "ok" && (
        <div className="cmd-foot">
          <Icon name="history" size={13} />
          {"ran in " + turn.dur}
          <span className="commit">
            <Icon name="check" size={12} />
            {"doc @ " + turn.hash}
          </span>
        </div>
      )}
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  if (turn.type === "you")
    return (
      <div className="turn you">
        <div className="bub">{turn.text}</div>
      </div>
    );
  if (turn.type === "dir")
    return (
      <div className="turn dir">
        <div className="lbl">
          <span className="mk">
            <Icon name="sparkles" size={10} style={{ color: "#fff" }} />
          </span>
          Aura
        </div>
        <div className="think" dangerouslySetInnerHTML={{ __html: boldHtml(turn.think) }} />
      </div>
    );
  if (turn.type === "cmd")
    return (
      <div className="turn dir">
        <CmdCard turn={turn} />
      </div>
    );
  if (turn.type === "render")
    return (
      <div className="turn dir">
        <div className="rcard">
          <div className="thumb" style={{ backgroundImage: "url(" + turn.frame + ")" }}>
            <div className="badge">{turn.label}</div>
          </div>
          <div className="rmeta">
            <Icon name="film" size={13} />
            <b>{turn.shot}</b>
            {"· " + turn.meta}
          </div>
        </div>
      </div>
    );
  return null;
}

export interface ConsoleProps {
  transcript: Turn[];
  setTranscript: React.Dispatch<React.SetStateAction<Turn[]>>;
  selShot: string | null;
  onRender: (scope: "shot" | "sequence") => void;
  /** Called after a committed Scene-Tool mutation so the app re-syncs with the real document. */
  onSceneCommit: () => void;
  api: MutableRefObject<ConsoleApi>;
}

export function Console({ transcript, setTranscript, selShot, onRender, onSceneCommit, api }: ConsoleProps) {
  const [mode, setMode] = useState<ComposerMode>("Prompt");
  const [val, setVal] = useState("");
  const [focus, setFocus] = useState(false);
  const [acIdx, setAcIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript]);

  const suggestions = (() => {
    const q = val.trim().toLowerCase();
    if (!q) return VERBS.slice(0, 6);
    return VERBS.filter((v) => v.verb.startsWith(q.split(" ")[0]) || v.verb.includes(q));
  })();

  const push = (t: Turn) => setTranscript((p) => [...p, t]);
  const update = (id: string, patch: Partial<CmdTurn>) =>
    setTranscript((p) => p.map((t) => (t.id === id && t.type === "cmd" ? { ...t, ...patch } : t)));

  // Command mode runs the raw scene-tool command against the REAL CLI (POST /api/scene);
  // Prompt mode shows the user's intent — their own coding agent drives the actual commands.
  // `render`/`render --shot` short-circuits to the real render pipeline.
  const run = (text: string, forceCommand = false) => {
    const raw = text.trim();
    if (!raw) return;
    push({ type: "you", id: "u" + Date.now(), text: raw });
    setVal("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    const p = parse(raw);

    // Render verb → the real render pipeline (also reachable from the Render button).
    if (p.verb === "render") {
      const cmdId = "c" + Date.now();
      const scope = p.flags.shot ? "shot" : "sequence";
      push({ type: "cmd", id: cmdId, verb: "render", args: p.flags.shot ? "--shot " + p.flags.shot : "--scope sequence", state: "run" });
      onRender(scope);
      update(cmdId, { state: "ok", diffs: [{ op: "~", k: "mod", t: "render queued · " + scope }], dur: "—", hash: "" });
      return;
    }

    // Prompt mode: do NOT mutate. The directing agent (the user's coding agent) reads this
    // intent and runs the concrete scene-tool commands itself. We only echo the intent.
    // (The palette forces command execution, so it bypasses this.)
    if (mode === "Prompt" && !forceCommand) {
      window.setTimeout(
        () =>
          push({
            type: "dir",
            id: "d" + Date.now(),
            think:
              "Noted. Your coding agent is the director — it will translate this into validated **Scene-Tool** commands. " +
              "Switch to **Command** mode to run a raw command here against the working document."
          }),
        300
      );
      return;
    }

    // Command mode: run the REAL CLI and render the committed / rejected card.
    const cmdId = "c" + Date.now();
    push({ type: "cmd", id: cmdId, verb: p.verb || raw.split(/\s+/)[0], args: argTail(raw, p.verb), state: "run" });
    void runSceneCommand(raw).then((res) => {
      const { diffs } = parseCliResult(raw, res);
      if (!res.ok || res.rejected) {
        update(cmdId, { state: "bad", diffs });
        return;
      }
      update(cmdId, { state: "ok", diffs, dur: res.ms ? (res.ms / 1000).toFixed(1) + "s" : "—", hash: res.hash || "—" });
      // Re-sync the panels with the now-mutated working document.
      onSceneCommit();
    });
  };

  useEffect(() => {
    api.current.run = run;
  });

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      run(val);
      setAcIdx(0);
      return;
    }
    if (focus && suggestions.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAcIdx((i) => Math.min(suggestions.length - 1, i + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAcIdx((i) => Math.max(0, i - 1));
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const s = suggestions[acIdx];
        setVal(s.verb + " ");
        inputRef.current?.focus();
      }
    }
  };

  const showAc = focus && mode === "Command" && suggestions.length > 0;

  return (
    <section className="panel col console">
      <div className="cns-h">
        <div className="cns-orb">
          <Icon name="sparkles" size={15} style={{ color: "#fff" }} />
        </div>
        <div className="meta">
          <div className="nm">Edit this scene</div>
          <div className="sub">
            <span className="d" />
            ask the AI in plain English, or type an exact command
          </div>
        </div>
      </div>

      <div className="cns-scroll" ref={scrollRef}>
        {transcript.map((t) => (
          <TurnView key={t.id} turn={t} />
        ))}
      </div>

      <div className="composer">
        <div className="chips">
          {CHIPS.map((c) => (
            <button
              key={c}
              className="chip"
              onClick={() => {
                setVal(c);
                setMode("Command");
                inputRef.current?.focus();
              }}
            >
              <span className="pr">›</span>
              {c.length > 22 ? c.slice(0, 22) + "…" : c}
            </button>
          ))}
        </div>
        <div className={"cbox" + (focus ? " focus" : "")}>
          {showAc && (
            <div className="ac">
              <div className="ac-h">Scene-Tool commands</div>
              {suggestions.map((s, i) => (
                <div
                  key={s.verb}
                  className={"ac-item" + (i === acIdx ? " on" : "")}
                  onMouseEnter={() => setAcIdx(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setVal(s.verb + " ");
                    inputRef.current?.focus();
                  }}
                >
                  <span className="verb">
                    {s.verb} <span className="fl">{s.tail}</span>
                  </span>
                  <span className="desc">{s.desc}</span>
                  {i === acIdx && <kbd>tab</kbd>}
                </div>
              ))}
            </div>
          )}
          <div className="cmode">
            <div className="seg">
              {(["Prompt", "Command"] as ComposerMode[]).map((m) => (
                <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
                  <Icon name={m === "Prompt" ? "wand" : "bolt"} size={12} />
                  {m === "Prompt" ? "Ask AI" : "Command"}
                </button>
              ))}
            </div>
            <span className="hint">{mode === "Prompt" ? "plain English · your AI agent runs it" : "exact command · runs now"}</span>
          </div>
          {mode === "Command" && (
            <div className="cmd-list">
              <div className="cmd-list-h">Top commands — click one to use it</div>
              {VERBS.map((v) => (
                <button
                  key={v.verb}
                  className="cmd-list-item"
                  onClick={() => {
                    setVal(v.verb + " ");
                    inputRef.current?.focus();
                  }}
                >
                  <span className="verb">
                    {v.verb} <span className="fl">{v.tail}</span>
                  </span>
                  <span className="desc">{v.desc}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            className={"cinput" + (mode === "Command" ? " mono" : "")}
            rows={3}
            value={val}
            placeholder={
              mode === "Prompt"
                ? "Tell your AI agent what to change — e.g. “make the second line angrier and cut to a close-up” (it writes this down; your agent does it)"
                : "Type an exact command — e.g. set space · cast add robot --name Pip · shot retime …"
            }
            onChange={(e) => {
              setVal(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(120, e.target.scrollHeight) + "px";
            }}
            onFocus={() => setFocus(true)}
            onBlur={() => window.setTimeout(() => setFocus(false), 120)}
            onKeyDown={onKey}
          />
          <div className="cbar">
            <div className="sp" />
            <button
              className="btn btn-warm"
              style={{ height: 30 }}
              onClick={() => selShot && run("render --shot " + selShot)}
              disabled={!selShot}
              title="Render current shot"
            >
              <Icon name="play2" size={14} />
              Render shot
            </button>
            <button className="send" disabled={!val.trim()} onClick={() => run(val)}>
              <Icon name="send" size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
