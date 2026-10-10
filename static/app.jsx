import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

const KEY = "angry-duck-notes";
const newNote = () => ({
  id: crypto.randomUUID(),
  title: "Untitled note",
  body: "",
  persona: "critic",
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
  const [notes, setNotes] = useState(() => {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    return saved?.length ? saved : [newNote()];
  });
  const [activeId, setActiveId] = useState(notes[0].id);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const msgsRef = useRef(null);

  const note = notes.find((n) => n.id === activeId) || notes[0];

  useEffect(() => localStorage.setItem(KEY, JSON.stringify(notes)), [notes]);
  useEffect(() => {
    msgsRef.current?.scrollTo(0, msgsRef.current.scrollHeight);
  }, [note.chat, busy]);

  const update = (patch) =>
    setNotes((ns) => ns.map((n) => (n.id === note.id ? { ...n, ...patch } : n)));

  async function askDuck(message) {
    const history = note.chat.filter((m) => !m.error);
    const chat = message ? [...note.chat, { role: "user", text: message }] : note.chat;
    update({ chat });
    setBusy(true);
    try {
      const res = await fetch("/api/duck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: note.persona, note: note.body, history, message }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || res.statusText);
      const data = await res.json();
      update({
        chat: [...chat, { role: "duck", text: data.reply }],
        comments: [
          ...note.comments,
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
    update({ comments: note.comments.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  return (
    <>
      <div className="topbar">
        <DuckAvatar size={28} /> THE ANGRY RUBBER DUCK <span className="beta">BETA</span>
        <span className="saved">SAVED</span>
      </div>
      <div className="main">
        <div className="sidebar">
          <button
            className="new-note"
            onClick={() => {
              const n = newNote();
              setNotes([n, ...notes]);
              setActiveId(n.id);
            }}
          >
            + NEW NOTE
          </button>
          {notes.map((n) => (
            <div
              key={n.id}
              className={"note-item" + (n.id === note.id ? " active" : "")}
              onClick={() => setActiveId(n.id)}
            >
              {n.title || "Untitled note"}
            </div>
          ))}
        </div>

        <div className="editor">
          <div className="editor-bar">
            <input
              className="title"
              value={note.title}
              onChange={(e) => update({ title: e.target.value })}
            />
            <div className="persona">
              <button
                className={note.persona === "critic" ? "on" : ""}
                onClick={() => update({ persona: "critic" })}
              >
                CRITIC
              </button>
              <button
                className={note.persona === "editor" ? "on" : ""}
                onClick={() => update({ persona: "editor" })}
              >
                IDIOT EDITOR
              </button>
            </div>
            <button
              className="anger"
              disabled={busy || !note.body.trim()}
              onClick={() => askDuck(null)}
            >
              ANGER THE DUCK
            </button>
          </div>
          <textarea
            className="body"
            placeholder="Write your note. Pros and cons, a CV, chapter one..."
            value={note.body}
            onChange={(e) => update({ body: e.target.value })}
          />
          <div className="comments">
            {note.comments.map((c) => (
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
            {note.chat.map((m, i) => (
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
          <div className="chips">
            <button onClick={() => send("Give me a next step.")}>Give me a next step</button>
            <button onClick={() => send("You're wrong.")}>You're wrong</button>
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
