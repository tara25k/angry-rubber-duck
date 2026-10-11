import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const KEY = "angry-duck-notes";
const newDecision = () => ({
  id: crypto.randomUUID(),
  title: "",
  body: "",
  comments: [],
  chat: [],
});

// Cheap heuristic: any common markdown construct means we show the rendered preview.
const MARKDOWN_SIGNS = [
  /^#{1,6}\s+\S/m, // headings
  /^\s*([-*+]|\d+[.)])\s+\S/m, // lists
  /^\s*>\s?\S/m, // blockquotes
  /^\s*(```|~~~)/m, // code fences
  /^\s*\|.+\|\s*$/m, // tables
  /^\s*([-*_])\1{2,}\s*$/m, // horizontal rules
  /\*\*[^*\n]+\*\*|__[^_\n]+__/, // bold
  /\[[^\]\n]+\]\([^)\n]+\)/, // links
  /`[^`\n]+`/, // inline code
];
const looksLikeMarkdown = (text) => MARKDOWN_SIGNS.some((re) => re.test(text));

const DELETE_DRAG = 90; // px to slide left before releasing deletes

// A sidebar row: click selects, slide left past DELETE_DRAG and release deletes.
function DecisionItem({ d, className, onSelect, onDelete }) {
  const [dx, setDx] = useState(0);
  const drag = useRef(null);
  const wasDragged = useRef(false);

  const onPointerDown = (e) => {
    drag.current = { x: e.clientX, dx: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const delta = Math.min(0, e.clientX - drag.current.x);
    drag.current.dx = delta;
    setDx(delta);
  };
  const onPointerEnd = () => {
    if (!drag.current) return;
    const { dx: finalDx } = drag.current;
    drag.current = null;
    setDx(0);
    if (finalDx < -4) {
      // swallow the click that follows a drag
      wasDragged.current = true;
      setTimeout(() => (wasDragged.current = false), 0);
    }
    if (finalDx <= -DELETE_DRAG) onDelete();
  };

  return (
    <div className="decision-row">
      <div className="delete-hint" style={{ opacity: Math.min(1, -dx / DELETE_DRAG) }}>
        <svg
          role="img"
          aria-label="Delete"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: -dx >= DELETE_DRAG ? "scale(1.3)" : "none", transition: "transform 0.1s" }}
        >
          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
        </svg>
      </div>
      <div
        className={className}
        style={{ transform: `translateX(${dx}px)`, transition: drag.current ? "none" : "transform 0.15s" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClick={() => !wasDragged.current && onSelect()}
      >
        {d.title || "Untitled decision"}
      </div>
    </div>
  );
}

function DuckAvatar({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ flex: "none" }}>
      <rect width="40" height="40" fill="#dd1c1a" />
      <circle cx="19" cy="20" r="12" fill="#fffa70" />
      <path d="M13 13l10 4" stroke="#131515" strokeWidth="2.5" />
      <circle cx="18" cy="19" r="1.8" fill="#131515" />
      <path d="M27 20h10l-3 5h-7z" fill="#dd1c1a" />
    </svg>
  );
}

const RESOLUTIONS = { edited: "edited", addressed: "addressed", kept: "kept as is" };
const MOODS = ["SATISFIED", "GRUDGINGLY IMPRESSED", "UNIMPRESSED", "ANNOYED", "FURIOUS"]; // anger 1-5

// Open comments get onResolve + onKeep(reason); resolved ones get onReopen (or none).
function DuckComment({ c, onResolve, onKeep, onReopen }) {
  const [keeping, setKeeping] = useState(false);
  const [why, setWhy] = useState("");

  return (
    <div className={"comment" + (c.resolved ? " resolved" : "")}>
      <DuckAvatar size={20} />
      <div>
        <span className="quote">“{c.quote}”</span>
        {c.text}
        {c.resolved && c.resolution && <span className="tag">{RESOLUTIONS[c.resolution]}</span>}
        {c.reason && <span className="reason">You: {c.reason}</span>}
        {keeping ? (
          <div className="why">
            <input
              autoFocus
              placeholder="Why? (optional, one line)"
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onKeep(why.trim());
                if (e.key === "Escape") setKeeping(false);
              }}
            />
            <button onClick={() => onKeep(why.trim())}>Keep</button>
            <button onClick={() => setKeeping(false)}>Cancel</button>
          </div>
        ) : (
          <div className="acts">
            {onResolve && <button onClick={onResolve}>Resolve</button>}
            {onKeep && <button onClick={() => setKeeping(true)}>Keep as is</button>}
            {onReopen && <button onClick={onReopen}>Reopen</button>}
          </div>
        )}
      </div>
    </div>
  );
}

// The DOM Range covering the first occurrence of `quote` in `root`'s text, or null.
function rangeFor(root, quote) {
  const start = root.textContent.indexOf(quote);
  if (start < 0) return null;
  const end = start + quote.length;
  const range = new Range();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const next = pos + node.length;
    if (start >= pos && start < next) range.setStart(node, start - pos);
    if (end <= next) {
      range.setEnd(node, end - pos);
      return range;
    }
    pos = next;
  }
  return null;
}

// Plain-text editor that highlights the quote of every open comment.
// Uncontrolled: React never renders children, so the caret is left alone while typing.
function Editor({ id, value, onChange, comments }) {
  const ref = useRef(null);

  // state -> DOM, only when they differ (switching decisions, not typing)
  useLayoutEffect(() => {
    if (ref.current.textContent !== value) ref.current.textContent = value;
  }, [id, value]);

  // paint highlights without touching the DOM (CSS Custom Highlight API)
  useLayoutEffect(() => {
    if (!CSS.highlights) return;
    const ranges = comments
      .filter((c) => !c.resolved && c.quote)
      .map((c) => rangeFor(ref.current, c.quote))
      .filter(Boolean);
    CSS.highlights.set("duck", new Highlight(...ranges));
    return () => CSS.highlights.delete("duck");
  }, [value, comments]);

  return (
    <div
      ref={ref}
      className="body"
      contentEditable="plaintext-only" // real "\n" line breaks, so markdown headings and lists survive
      suppressContentEditableWarning
      data-placeholder="Context: lay out the options, pros and cons, and what is holding you back, and let the duck pick it apart."
      onInput={(e) => onChange(e.currentTarget.textContent)}
    />
  );
}

function App() {
  const [decisions, setDecisions] = useState(() => {
    const saved = JSON.parse(localStorage.getItem(KEY) || "[]");
    return saved.length ? saved : [newDecision()];
  });
  const [activeId, setActiveId] = useState(decisions[0].id);
  const [busy, setBusy] = useState(false);

  const decision = decisions.find((n) => n.id === activeId) || decisions[0];
  const open = decision.comments.filter((c) => !c.resolved);
  const resolved = decision.comments.filter((c) => c.resolved);
  const verdict = decision.chat.findLast((m) => m.role === "duck");
  const note = (decision.note || "").trim();
  const [view, setView] = useState("write");
  const isMarkdown = looksLikeMarkdown(decision.body);
  const showPreview = isMarkdown && view === "preview";

  // a new round has to be earned: edit the decision, resolve a comment, or add a note
  const last = decision.lastAsked;
  const madeChanges =
    !last ||
    last.title !== decision.title ||
    last.body !== decision.body ||
    resolved.length > last.resolved;
  const nothingNew = !madeChanges && !note;

  // the duck is happy enough that the user may call the decision made
  const canWrapUp = decision.anger <= 2 && !decision.decided;

  useEffect(() => localStorage.setItem(KEY, JSON.stringify(decisions)), [decisions]);
  useEffect(() => setView("write"), [activeId]);

  const update = (patch) =>
    setDecisions((ns) => ns.map((n) => (n.id === decision.id ? { ...n, ...patch } : n)));

  function deleteDecision(id) {
    const target = decisions.find((d) => d.id === id);
    if (
      target.body.trim() &&
      !window.confirm(`Delete "${target.title || "Untitled decision"}"? This can't be undone.`)
    )
      return;
    const rest = decisions.filter((d) => d.id !== id);
    const next = rest.length ? rest : [newDecision()];
    setDecisions(next);
    if (id === activeId) setActiveId(next[0].id);
  }

  const patchComments = (match, patch) =>
    update({ comments: decision.comments.map((c) => (match(c) ? { ...c, ...patch } : c)) });

  // editing the quoted text counts as dealing with the comment
  useEffect(() => {
    const edited = (c) => !c.resolved && c.quote && !decision.body.includes(c.quote);
    if (decision.comments.some(edited)) patchComments(edited, { resolved: true, resolution: "edited" });
  }, [decision.body, decision.comments]);

  // what the backend needs to know about this decision (see backend/templates/request.example.json)
  const requestBody = (firstDraft) => ({
    persona: "critic",
    title: decision.title,
    body: decision.body,
    note: note || undefined,
    made_changes: madeChanges,
    anger: decision.anger, // last round's level
    first_draft: firstDraft,
    history: decision.chat.filter((m) => !m.error),
    comments: decision.comments, // extra fields (id) are ignored by the backend
  });

  // POST to the backend while showing the busy state; failures land in the chat as an error bubble
  async function call(url, body, onData) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).detail || res.statusText);
      onData(await res.json());
    } catch (e) {
      update({ chat: [...decision.chat, { role: "duck", text: String(e.message), error: true }] });
    } finally {
      setBusy(false);
    }
  }

  function askDuck() {
    const firstDraft = decision.firstDraft || { title: decision.title, body: decision.body };
    update({ firstDraft });
    call("/api/duck", requestBody(firstDraft), (data) =>
      update({
        // the chat is only the duck's memory: the note (if any) and its reply
        chat: [
          ...decision.chat,
          ...(note ? [{ role: "user", text: note }] : []),
          { role: "duck", text: data.reply },
        ],
        comments: [...decision.comments, ...data.comments.map((c) => ({ ...c, id: crypto.randomUUID() }))],
        anger: data.anger,
        angerReason: data.anger_reason,
        lastAsked: { title: decision.title, body: decision.body, resolved: resolved.length },
        note: "",
      })
    );
  }

  // the user is happy: the duck summarises what changed and congratulates them
  const wrapUp = () =>
    call("/api/duck/wrap-up", requestBody(decision.firstDraft), (data) =>
      update({ decided: true, summary: data.summary })
    );

  const resolve = (c, resolution, reason, resolved = true) => () =>
    patchComments((x) => x.id === c.id, { resolved, resolution, reason });
  const reopen = (c) => resolve(c, undefined, undefined, false);

  const buttonLabel = decision.decided
    ? "DECIDED"
    : open.length
      ? `RESOLVE ${open.length} COMMENT${open.length > 1 ? "S" : ""} FIRST`
      : nothingNew && verdict
        ? "CHANGE SOMETHING FIRST"
        : verdict
          ? "ANGER THE DUCK AGAIN"
          : "ANGER THE DUCK";

  return (
    <>
      <div className="topbar">
        <DuckAvatar size={28} /> THE ANGRY RUBBER DUCK <span className="beta">BETA</span>
        <span className="saved">SAVED</span>
      </div>
      <div className="main">
        <div className="sidebar">
          <button
            className="new-decision"
            onClick={() => {
              const n = newDecision();
              setDecisions([n, ...decisions]);
              setActiveId(n.id);
            }}
          >
            + NEW DECISION
          </button>
          {decisions.map((n) => (
            <DecisionItem
              key={n.id}
              d={n}
              className={
                "decision-item" + (n.id === decision.id ? " active" : "") + (n.decided ? " done" : "")
              }
              onSelect={() => setActiveId(n.id)}
              onDelete={() => deleteDecision(n.id)}
            />
          ))}
        </div>

        <div className="editor">
          <div className="editor-bar">
            <input
              className="title"
              placeholder="What are you trying to decide?"
              value={decision.title}
              onChange={(e) => update({ title: e.target.value })}
            />
            <button
              className="anger"
              disabled={busy || decision.decided || !decision.body.trim() || open.length > 0 || nothingNew}
              onClick={askDuck}
            >
              {buttonLabel}
            </button>
          </div>
          <input
            className="note"
            placeholder="Note to the duck (optional): anything the text doesn't say?"
            value={decision.note || ""}
            onChange={(e) => update({ note: e.target.value })}
          />
          {isMarkdown && (
            <div className="view-toggle">
              <button className={showPreview ? "" : "on"} onClick={() => setView("write")}>
                WRITE
              </button>
              <button className={showPreview ? "on" : ""} onClick={() => setView("preview")}>
                PREVIEW
              </button>
            </div>
          )}
          {/* kept mounted (just hidden) so the caret and the duck's highlights survive a tab switch */}
          <div hidden={showPreview}>
            <Editor
              id={decision.id}
              value={decision.body}
              onChange={(body) => update({ body })}
              comments={decision.comments}
            />
          </div>
          {showPreview && (
            <div className="body md">
              <Markdown remarkPlugins={[remarkGfm]}>{decision.body}</Markdown>
            </div>
          )}
        </div>

        <div className="chat">
          <div className="chat-head">
            <DuckAvatar size={44} />
            <div>
              THE DUCK SAYS
              <small>
                {MOODS[(decision.anger || 3) - 1]}
                <span className="meter">
                  {MOODS.map((_, i) => (
                    <i key={i} className={i < decision.anger ? "on" : ""} />
                  ))}
                </span>
              </small>
              {decision.angerReason && <small className="mood-reason">{decision.angerReason}</small>}
            </div>
          </div>
          <div className="msgs">
            {decision.decided ? (
              <div className="msg done">
                <div className="bubble">{decision.summary}</div>
              </div>
            ) : (
              (busy || verdict) && (
                <div className={"msg" + (!busy && verdict.error ? " error" : "")}>
                  <div className="bubble">
                    {busy ? "The duck is sharpening its beak…" : verdict.text}
                  </div>
                </div>
              )
            )}
            {canWrapUp && !busy && (
              <button className="wrap-up" onClick={wrapUp}>
                I'VE DECIDED: WRAP IT UP
              </button>
            )}
            {decision.decided && (
              <button className="wrap-up" onClick={() => update({ decided: false })}>
                REOPEN
              </button>
            )}
            {open.map((c) => (
              <DuckComment
                key={c.id}
                c={c}
                onResolve={resolve(c, "addressed")}
                onKeep={(reason) => resolve(c, "kept", reason)()}
              />
            ))}
            {resolved.length > 0 && (
              <details>
                <summary>Resolved ({resolved.length})</summary>
                {resolved.map((c) => (
                  <DuckComment
                    key={c.id}
                    c={c}
                    // reopening a comment whose quote was edited away would instantly re-resolve it
                    onReopen={decision.body.includes(c.quote) ? reopen(c) : null}
                  />
                ))}
              </details>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
