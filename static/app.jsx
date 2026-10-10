import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

const KEY = "angry-duck-notes";
const newDecision = () => ({
  id: crypto.randomUUID(),
  title: "Untitled decision",
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

function DuckComment({ c, onResolve, onReply }) {
  return (
    <div className={"comment" + (c.resolved ? " resolved" : "")}>
      <DuckAvatar size={20} />
      <div>
        <span className="quote">“{c.quote}”</span>
        {c.text}
        <div className="acts">
          <button onClick={onResolve}>{c.resolved ? "Reopen" : "Resolve"}</button>
          <button onClick={onReply}>Reply</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [decisions, setDecisions] = useState(() => {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!saved?.length) return [newDecision()];
    // titles saved before the note -> decision rename
    return saved.map((d) => (d.title === "Untitled note" ? { ...d, title: "Untitled decision" } : d));
  });
  const [activeId, setActiveId] = useState(decisions[0].id);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const msgsRef = useRef(null);

  const decision = decisions.find((n) => n.id === activeId) || decisions[0];

  useEffect(() => localStorage.setItem(KEY, JSON.stringify(decisions)), [decisions]);
  useEffect(() => {
    msgsRef.current?.scrollTo(0, msgsRef.current.scrollHeight);
  }, [decision.chat, busy]);

  const update = (patch) =>
    setDecisions((ns) => ns.map((n) => (n.id === decision.id ? { ...n, ...patch } : n)));

  async function askDuck(message) {
    const history = decision.chat.filter((m) => !m.error);
    const chat = message ? [...decision.chat, { role: "user", text: message }] : decision.chat;
    update({ chat });
    setBusy(true);
    try {
      const res = await fetch("/api/duck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: "critic", decision: decision.body, history, message }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || res.statusText);
      const data = await res.json();
      update({
        chat: [...chat, { role: "duck", text: data.reply }],
        comments: [
          ...decision.comments,
          ...data.comments.map((c) => ({ ...c, id: crypto.randomUUID() })),
        ],
      });
    } catch (e) {
      update({ chat: [...chat, { role: "duck", text: String(e.message), error: true }] });
    } finally {
      setBusy(false);
    }
  }

  function send(text) {
    if (!text.trim() || busy) return;
    setDraft("");
    askDuck(text.trim());
  }

  const patchComment = (id, patch) =>
    update({ comments: decision.comments.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

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
              className={"decision-item" + (n.id === decision.id ? " active" : "")}
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
              value={decision.title}
              onChange={(e) => update({ title: e.target.value })}
            />
            <button
              className="anger"
              disabled={busy || !decision.body.trim()}
              onClick={() => askDuck(null)}
            >
              ANGER THE DUCK
            </button>
          </div>
          <textarea
            className="body"
            placeholder="What are you trying to decide? Lay out the options, your reasoning and what is holding you back, and let the duck pick it apart."
            value={decision.body}
            onChange={(e) => update({ body: e.target.value })}
          />
          <div className="comments">
            {decision.comments.map((c) => (
              <DuckComment
                key={c.id}
                c={c}
                onResolve={() => patchComment(c.id, { resolved: !c.resolved })}
                onReply={() => setDraft(`Re: “${c.quote}” — `)}
              />
            ))}
          </div>
        </div>

        <div className="chat">
          <div className="chat-head">
            <DuckAvatar size={44} />
            <div>
              ARGUE WITH THE DUCK
              <small>ONLINE &amp; UNIMPRESSED</small>
            </div>
          </div>
          <div className="msgs" ref={msgsRef}>
            {decision.chat.map((m, i) => (
              <div key={i} className={"msg " + m.role + (m.error ? " error" : "")}>
                {m.role === "duck" && <DuckAvatar size={28} />}
                <div className="bubble">{m.text}</div>
              </div>
            ))}
            {busy && (
              <div className="msg">
                <DuckAvatar size={28} />
                <div className="bubble">The duck is sharpening its beak…</div>
              </div>
            )}
          </div>
          <div className="input">
            <textarea
              placeholder="Defend yourself…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
            />
            <button onClick={() => send(draft)}>➤</button>
          </div>
        </div>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
