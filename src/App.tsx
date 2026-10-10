import { FormEvent, SVGProps, useState } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const Icon = ({ children, ...props }: IconProps) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    {children}
  </svg>
);

const PlusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

const SparkIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m12 3 1.6 5.2L19 10l-5.4 1.8L12 17l-1.6-5.2L5 10l5.4-1.8L12 3Z" />
    <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" />
  </Icon>
);

const SendIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m4 4 17 8-17 8 3-8-3-8Z" />
    <path d="M7 12h14" />
  </Icon>
);

const MoreIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
  </Icon>
);

const DuckMark = ({ small = false }: { small?: boolean }) => (
  <div className={small ? "duck-mark duck-mark--small" : "duck-mark"} aria-hidden="true">
    <span className="duck-eye" />
    <span className="duck-brow" />
    <span className="duck-beak" />
  </div>
);

type Message = {
  id: number;
  sender: "duck" | "user";
  text: string;
};

const initialMessages: Message[] = [
  {
    id: 1,
    sender: "duck",
    text: "I read it. Your ambition is doing a lot of heavy lifting for a plan with no actual legs.",
  },
  {
    id: 2,
    sender: "user",
    text: "That’s harsh. I have ten years of experience.",
  },
  {
    id: 3,
    sender: "duck",
    text: "Great. Then stop hiding behind “maybe” and tell me what you can do that the other 400 applicants can’t.",
  },
];

export default function App() {
  const [critiqueVisible, setCritiqueVisible] = useState(true);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  const addCritique = () => {
    setCritiqueVisible(true);
    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        sender: "duck",
        text: "I left you a note. Spoiler: “I think” is not a strategy.",
      },
    ]);
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    setMessages((current) => [
      ...current,
      { id: Date.now(), sender: "user", text },
    ]);
    setDraft("");
    setIsThinking(true);

    window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          sender: "duck",
          text: "That’s a defense, not an answer. Rewrite the idea so a skeptical stranger can understand why it matters.",
        },
      ]);
      setIsThinking(false);
    }, 650);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <DuckMark small />
          <span className="brand-name">THE ANGRY RUBBER DUCK</span>
          <span className="brand-tag">BETA</span>
        </div>
        <div className="top-actions">
          <span className="saved-state">
            <span className="saved-dot" />
            SAVED
          </span>
          <button className="icon-button" aria-label="More options">
            <MoreIcon />
          </button>
          <button className="avatar" aria-label="Open profile">
            ML
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="notes-sidebar">
          <button className="new-note">
            <PlusIcon />
            NEW NOTE
          </button>

          <div className="notes-heading">
            <span>YOUR NOTES</span>
            <span>4</span>
          </div>

          <nav className="notes-list" aria-label="Your notes">
            <button className="note-item note-item--active">
              <span className="note-title">The big career move</span>
              <span className="note-date">JUST NOW</span>
            </button>
            <button className="note-item">
              <span className="note-title">Side project ideas</span>
              <span className="note-date">YESTERDAY</span>
            </button>
            <button className="note-item">
              <span className="note-title">Things I’m avoiding</span>
              <span className="note-date">12 MAY</span>
            </button>
            <button className="note-item">
              <span className="note-title">2025 goals, probably</span>
              <span className="note-date">02 MAY</span>
            </button>
          </nav>

          <div className="sidebar-footer">
            <span>4 NOTES</span>
            <span>NO EXCUSES</span>
          </div>
        </aside>

        <section className="editor-panel">
          <div className="editor-toolbar">
            <div className="format-tools" aria-label="Text formatting">
              <button aria-label="Bold">
                <strong>B</strong>
              </button>
              <button aria-label="Italic">
                <em>I</em>
              </button>
              <span className="tool-divider" />
              <button aria-label="Bulleted list">≡</button>
              <button aria-label="Quote">“</button>
            </div>
            <button className="critique-button" onClick={addCritique}>
              <SparkIcon />
              CRITIQUE THIS
            </button>
          </div>

          <article className="editor-page">
            <input
              className="document-title"
              defaultValue="The big career move"
              aria-label="Note title"
            />
            <div className="document-meta">
              <span>MAY 24, 2025</span>
              <span>312 WORDS</span>
              <span>3 MIN READ</span>
            </div>

            <div className="document-body">
              <p contentEditable suppressContentEditableWarning>
                I think I’m ready to leave my job. I’ve been saying this for
                almost two years now, which probably means I’m either very
                patient or completely terrified.
              </p>
              <p contentEditable suppressContentEditableWarning>
                The plan is to move into a product leadership role at a smaller
                company—somewhere I can actually shape what gets built instead
                of spending my days in meetings about meetings.
              </p>

              {critiqueVisible && (
                <aside className="inline-critique">
                  <div className="critique-avatar">
                    <DuckMark small />
                  </div>
                  <div>
                    <div className="critique-label">DUCK’S NOTE</div>
                    <p>
                      “The plan is to move” is not a plan. It’s a sentence
                      wearing a tiny business hat. What’s the first real action?
                    </p>
                    <button onClick={() => setCritiqueVisible(false)}>
                      RESOLVED? PROVE IT
                    </button>
                  </div>
                </aside>
              )}

              <p contentEditable suppressContentEditableWarning>
                What I bring: ten years of translating messy customer problems
                into products people will pay for. What I’m missing: proof that
                I can lead the whole thing, not just my corner of it.
              </p>
              <p contentEditable suppressContentEditableWarning>
                This week I’ll make a list of twenty companies, talk to three
                founders, and publish the case study I’ve been polishing into
                oblivion.
              </p>
            </div>
          </article>
        </section>

        <aside className="chat-panel">
          <div className="chat-header">
            <div className="chat-identity">
              <DuckMark />
              <div>
                <div className="chat-title">ARGUE WITH THE DUCK</div>
                <div className="online-status">
                  <span />
                  ONLINE &amp; UNIMPRESSED
                </div>
              </div>
            </div>
            <span className="heat-level">HEAT: 8/10</span>
          </div>

          <div className="chat-context">
            <span>DISCUSSING</span>
            <strong>“The big career move”</strong>
          </div>

          <div className="messages" aria-live="polite">
            <div className="day-marker">
              <span>TODAY</span>
            </div>
            {messages.map((message) => (
              <div
                className={`message-row message-row--${message.sender}`}
                key={message.id}
              >
                {message.sender === "duck" && (
                  <div className="message-avatar">
                    <DuckMark small />
                  </div>
                )}
                <div className={`message message--${message.sender}`}>
                  {message.text}
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="message-row message-row--duck">
                <div className="message-avatar">
                  <DuckMark small />
                </div>
                <div className="message message--duck typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          <div className="chat-footer">
            <div className="prompt-chips">
              <button onClick={() => setDraft("Give me a concrete next step.")}>
                GIVE ME A NEXT STEP
              </button>
              <button onClick={() => setDraft("You’re wrong. Here’s why: ")}>
                YOU’RE WRONG
              </button>
            </div>
            <form className="chat-form" onSubmit={sendMessage}>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Defend yourself..."
                aria-label="Message the duck"
                rows={2}
              />
              <button type="submit" aria-label="Send message">
                <SendIcon />
              </button>
            </form>
            <div className="chat-hint">PRESS ENTER TO SEND • SHIFT + ENTER FOR A LINE BREAK</div>
          </div>
        </aside>
      </main>
    </div>
  );
}
