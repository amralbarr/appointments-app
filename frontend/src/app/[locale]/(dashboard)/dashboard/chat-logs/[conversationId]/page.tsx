import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight, Bot, User, Wrench, Clock, Hash } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getMyPlatform } from "@/lib/dashboard";
import { backendJson } from "@/lib/backend";
import { SESSION_COOKIE, requireSessionToken } from "@/lib/session";
import type { ChatMessage } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function ChatLogDetailPage({
  params,
}: {
  params: Promise<{ conversationId: string; locale: string }>;
}) {
  const { conversationId, locale } = await params;
  const jar = await cookies();
  const token = requireSessionToken(jar.get(SESSION_COOKIE)?.value, locale);
  const t = await getTranslations("dashboard");
  const platform = await getMyPlatform(token);
  if (!platform) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        {t("noPlatformFound")}
      </Card>
    );
  }

  const messages = await backendJson<ChatMessage[]>(
    `platforms/${platform.id}/chat-conversations/${conversationId}/messages`,
    { accessToken: token },
  );

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back Link */}
      <div>
        <Link
          href="/dashboard/chat-logs"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          {locale === "ar" ? <ArrowRight size={13} /> : <ArrowLeft size={13} />}
          <span>{t("backToChatLogs")}</span>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {t("conversationAudit")}
            </h1>
            <Badge variant="primary" size="sm">
              {t("messagesCount", { count: messages.length })}
            </Badge>
          </div>
          <div className="mt-1 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <Hash size={12} />
            <span>{t("idLabel", { id: conversationId })}</span>
          </div>
        </div>
      </div>

      {/* Message Stream */}
      {messages.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          {t("noMessagesRecorded")}
        </Card>
      ) : (
        <div className="space-y-4">
          {messages.map((m) => {
            const isUser = m.role === "USER";
            const isTool = m.role === "TOOL";

            if (isTool) {
              return (
                <div key={m.id} className="mx-auto max-w-2xl my-2">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 shadow-2xs">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 uppercase tracking-wide">
                        <Wrench size={13} />
                        <span>{t("toolInvocation", { toolName: m.toolName ?? t("unknownTool") })}</span>
                      </div>
                      <span className="text-[10px] text-amber-700/80">
                        {new Date(m.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <pre className="overflow-x-auto rounded-xl bg-amber-100/50 p-2.5 font-mono text-xs text-amber-950">
                      {JSON.stringify(m.toolResult, null, 2)}
                    </pre>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={m.id}
                className={`flex gap-3 max-w-2xl ${isUser ? "ms-auto flex-row-reverse" : "me-auto"}`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-2xs ${
                    isUser
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface border border-border text-primary"
                  }`}
                >
                  {isUser ? <User size={15} /> : <Bot size={15} />}
                </div>

                <div className="space-y-1">
                  <div
                    className={`rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-xs ${
                      isUser
                        ? "bg-primary text-primary-foreground rounded-tr-none font-medium"
                        : "border border-border bg-surface text-foreground rounded-tl-none font-normal"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>

                  <div
                    className={`flex items-center gap-1 text-[10px] text-subtle-foreground px-1 ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    <Clock size={10} />
                    <span>
                      {new Date(m.createdAt).toLocaleTimeString(locale, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
