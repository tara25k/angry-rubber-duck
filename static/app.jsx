import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

const KEY = "angry-duck-notes";
const newDecision = () => ({
  id: crypto.randomUUID(),
  title: "",
  body: "",
  comments: [],
  chat: [],
});

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
      contentEditable="true"
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

  const update = (patch) =>
    setDecisions((ns) => ns.map((n) => (n.id === decision.id ? { ...n, ...patch } : n)));

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
            <div
              key={n.id}
              className={
                "decision-item" + (n.id === decision.id ? " active" : "") + (n.decided ? " done" : "")
              }
              onClick={() => setActiveId(n.id)}
            >
              {n.title || "Untitled decision"}
            </div>
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
          <Editor
            id={decision.id}
            value={decision.body}
            onChange={(body) => update({ body })}
            comments={decision.comments}
          />
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
