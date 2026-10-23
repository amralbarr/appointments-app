"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { Bot, MessageSquare, Send, Sparkles, User, X, Shield, ArrowRight, ArrowLeft } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

interface Message {
  id: string;
  sender: "bot" | "user";
  text: string;
  timestamp: string;
}

function emailStorageKey(slug: string) {
  return `appointments_email::${slug}`;
}

// per tenant AND per customer - two different customers on the same
// device (or the same customer across two different tenants) must never
// see each other's history.
function chatHistoryStorageKey(slug: string, email: string) {
  return `appointments_chat_history::${slug}::${email.trim().toLowerCase()}`;
}

// matches the backend's own loadHistory() cap (chat.service.ts, `take:
// 20`) - keeping the visible transcript capped the same way keeps what
// the customer sees consistent with what the assistant actually still
// has context of, rather than showing a longer scrollback than the LLM
// itself remembers.
const MAX_STORED_MESSAGES = 20;

// the greeting is synthesized client-side only (never sent to or
// persisted by the backend - chat.service.ts has no concept of it), so
// it's deliberately excluded from storage and from the 20-message cap.
function loadStoredHistory(slug: string, email: string): Message[] {
  try {
    const raw = window.localStorage.getItem(chatHistoryStorageKey(slug, email));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(slug: string, email: string, messages: Message[]) {
  const real = messages.filter((m) => m.id !== "greeting").slice(-MAX_STORED_MESSAGES);
  try {
    window.localStorage.setItem(chatHistoryStorageKey(slug, email), JSON.stringify(real));
  } catch {
    // localStorage can throw (quota, private-mode Safari) - losing the
    // locally-cached transcript is never worth breaking the chat over.
  }
}

/** Formats an ISO timestamp as a human-readable relative or absolute time. */
function formatMessageTime(iso: string, locale: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  return d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

export function ChatWidget({
  platformId,
  slug,
  platformName,
}: {
  platformId: string;
  slug: string;
  platformName?: string;
}) {
  const t = useTranslations("aiChat");
  const locale = useLocale();
  const shouldReduceMotion = useReducedMotion();

  // framer-motion helpers — empty objects silence animation when prefers-reduced-motion is on
  const springEnter = shouldReduceMotion
    ? {}
    : { type: "spring" as const, stiffness: 300, damping: 25 };
  const fabSpring = shouldReduceMotion
    ? {}
    : { type: "spring" as const, stiffness: 260, damping: 20 };

  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "greeting",
      sender: "bot",
      text: t("greeting", { platformName: platformName ?? t("thisBusinessFallback") }),
      timestamp: new Date().toISOString(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedEmail = window.localStorage.getItem(emailStorageKey(slug));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEmail(storedEmail);
    if (storedEmail) {
      const history = loadStoredHistory(slug, storedEmail);
      // returning with real history already saved - skip the greeting
      // rather than repeat it ahead of a conversation that already
      // happened.
      if (history.length > 0) setMessages(history);
    }
  }, [slug]);

  useEffect(() => {
    if (isOpen) setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [isOpen, messages, isTyping]);

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    window.localStorage.setItem(emailStorageKey(slug), trimmed);
    const history = loadStoredHistory(slug, trimmed);
    if (history.length > 0) setMessages(history);
    setEmail(trimmed);
  }

  function appendMessage(msg: Message) {
    setMessages((prev) => {
      if (!email) return [...prev, msg];
      const next = [...prev, msg];
      saveHistory(slug, email, next);
      return next;
    });
  }

  async function handleSend(text: string) {
    if (!text.trim()) return;
    const now = new Date().toISOString();

    // Lazy email gate: if no email is set yet, the send is temporarily
    // queued after email capture. For now, only allow sends when email
    // is already known. The inline email prompt (emailPromptInline) will
    // guide the user in a future booking-action turn.
    if (!email) return;

    appendMessage({ id: `${crypto.randomUUID()}-user`, sender: "user", text, timestamp: now });
    setInputText("");
    setIsTyping(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformId, customerEmail: email, message: text }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const reason = data?.message ?? t("errorReply");
        appendMessage({ id: `${crypto.randomUUID()}-bot`, sender: "bot", text: reason, timestamp: new Date().toISOString() });
        return;
      }

      const botText = data?.reply ?? t("fallbackReply");
      appendMessage({ id: `${crypto.randomUUID()}-bot`, sender: "bot", text: botText, timestamp: new Date().toISOString() });
    } catch {
      appendMessage({
        id: `${crypto.randomUUID()}-bot`,
        sender: "bot",
        text: t("unreachableReply"),
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsTyping(false);
    }
  }

  // Show suggestions when the last bot message is not a booking-action result
  // (i.e. after informational turns, not just on the first message).
  const lastBotMessage = [...messages].reverse().find((m) => m.sender === "bot");
  const showSuggestions =
    !!email &&
    !!lastBotMessage &&
    !isTyping;

  return (
    <>
      {/* Floating Action Button — framer-motion mount entrance + icon-swap */}
      <motion.div
        className="fixed bottom-4 end-3 z-50 sm:bottom-6 sm:end-6"
        initial={shouldReduceMotion ? {} : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...fabSpring, delay: 0.2 }}
      >
        <button
          onClick={() => setIsOpen((v) => !v)}
          className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl ring-4 ring-primary/20 transition-all duration-150 hover:bg-primary-hover hover:scale-105 active:scale-95"
          aria-label={t(isOpen ? "closeAria" : "openAria")}
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.span
                key="close-icon"
                initial={shouldReduceMotion ? {} : { rotate: -45, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={shouldReduceMotion ? {} : { rotate: 45, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <X size={22} />
              </motion.span>
            ) : (
              <motion.span
                key="open-icon"
                initial={shouldReduceMotion ? {} : { rotate: 45, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={shouldReduceMotion ? {} : { rotate: -45, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="relative"
              >
                <MessageSquare size={22} />
                <span className="absolute -top-1 -end-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </motion.div>

      {/* Chat Window — spring mount/unmount transition */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="chat-panel"
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 50, scale: 0.95 }}
            transition={springEnter}
            className="fixed bottom-[4.75rem] end-2 z-50 flex w-[calc(100vw-1rem)] max-w-[370px] flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl sm:bottom-24 sm:end-6 sm:w-[calc(100vw-2rem)] md:w-[420px]"
            style={{ height: "min(540px, calc(100dvh - 7rem))" }}
          >
            {/* Window Header */}
            <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-primary to-indigo-600 px-5 py-4 text-primary-foreground shadow-xs">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 shadow-xs backdrop-blur-xs">
                  <Bot size={22} />
                </div>
                <div>
                  <h4 className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
                    {t("headerTitle")} <Sparkles size={13} className="text-amber-300" />
                  </h4>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/80">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{t("onlineStatus")} {platformName ? `• ${platformName}` : ""}</span>
                  </div>
                  {/* Persistent capability chip */}
                  <div className="mt-1 text-[10px] text-white/70 flex items-center gap-1 flex-wrap">
                    <Sparkles size={10} className="text-amber-300 shrink-0" />
                    <span>{t("capabilitiesChipTitle")}</span>
                    <span>{t("capability1")}</span>
                    <span>·</span>
                    <span>{t("capability3")}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                aria-label={t("closeAria")}
              >
                <X size={18} />
              </button>
            </div>

            {/* Email Identification Gate */}
            {!email ? (
              <div className="flex flex-1 flex-col justify-center p-6 bg-surface">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-subtle text-primary">
                  <Sparkles size={26} />
                </div>
                <h3 className="text-center text-base font-bold text-foreground">
                  {t("welcomeTitle")}
                </h3>
                <p className="mt-1 text-center text-xs text-muted-foreground leading-relaxed">
                  {t("welcomeDesc")}
                </p>

                <form onSubmit={handleEmailSubmit} className="mt-6 space-y-3">
                  <div>
                    <label htmlFor="chatEmail" className="block text-xs font-semibold text-foreground mb-1">
                      {t("emailLabel")}
                    </label>
                    <input
                      id="chatEmail"
                      type="email"
                      required
                      autoFocus
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground placeholder:text-subtle-foreground focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/20"
                    />
                  </div>
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow-xs transition-all hover:bg-primary-hover active:scale-98"
                  >
                    <span>{t("startConversation")}</span>
                    {locale === "ar" ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
                  </button>
                </form>

                <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-subtle-foreground">
                  <Shield size={12} />
                  <span>{t("emailRequiredDisclaimer")}</span>
                </div>
              </div>
            ) : (
              /* Active Chat Conversation */
              <>
                <div className="flex-1 space-y-4 overflow-y-auto bg-surface-muted/60 p-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex max-w-[85%] gap-2.5 ${
                        msg.sender === "user" ? "ms-auto flex-row-reverse" : "me-auto"
                      }`}
                    >
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs shadow-xs ${
                          msg.sender === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-surface border border-border text-foreground"
                        }`}
                      >
                        {msg.sender === "user" ? <User size={14} /> : <Bot size={14} className="text-primary" />}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <div
                          className={`rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-xs ${
                            msg.sender === "user"
                              ? "bg-primary text-primary-foreground rounded-tr-none font-medium"
                              : "border border-border bg-surface text-foreground rounded-tl-none font-normal"
                          }`}
                        >
                          {msg.sender === "user" ? (
                            msg.text
                          ) : (
                            <div className="prose prose-xs max-w-none text-foreground prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                              <ReactMarkdown
                                components={{
                                  p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                                  ul: ({ children }) => (
                                    <ul className="mt-1 list-inside list-disc space-y-0.5">{children}</ul>
                                  ),
                                  ol: ({ children }) => (
                                    <ol className="mt-1 list-inside list-decimal space-y-0.5">{children}</ol>
                                  ),
                                  code: ({ children }) => (
                                    <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                                      {children}
                                    </code>
                                  ),
                                }}
                              >
                                {msg.text}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>
                        {msg.timestamp && (
                          <span
                            className={`text-[10px] text-subtle-foreground ${msg.sender === "user" ? "text-end" : "text-start"}`}
                            aria-label={t("messageTimeAria", { time: formatMessageTime(msg.timestamp, locale) })}
                          >
                            {formatMessageTime(msg.timestamp, locale)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}

                  {isTyping && (
                    <div className="me-auto flex max-w-[85%] gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-surface border border-border text-primary shadow-xs">
                        <Bot size={14} />
                      </div>
                      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-none border border-border bg-surface px-4 py-3 shadow-xs">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: "0ms" }} />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: "150ms" }} />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Persistent suggestions bar — shown after informational turns */}
                {showSuggestions && (
                  <div className="flex flex-col gap-1.5 border-t border-border bg-surface p-2.5">
                    <span className="text-[10px] font-semibold text-muted-foreground px-0.5">
                      {t("suggestionsTitle")}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(t.raw("suggestions") as string[]).map((s: string) => (
                        <button
                          key={s}
                          onClick={() => handleSend(s)}
                          className="rounded-full border border-border bg-surface-muted px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary hover:bg-primary-subtle hover:text-primary"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input Footer */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend(inputText);
                  }}
                  className="flex items-center gap-2 border-t border-border bg-surface p-3"
                >
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={t("inputPlaceholder")}
                    aria-label={t("inputAriaLabel")}
                    className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-subtle-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="submit"
                    disabled={!inputText.trim()}
                    className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs transition-all hover:bg-primary-hover active:scale-95 disabled:opacity-40"
                    aria-label={t("sendAria")}
                  >
                    <Send size={14} />
                  </button>
                </form>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
