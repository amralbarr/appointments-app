"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MessageSquare, Search, ArrowRight, ArrowLeft, Clock, Bot } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { ChatConversation } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ChatLogsClient({ conversations }: { conversations: ChatConversation[] }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.customerEmail.toLowerCase().includes(q));
  }, [conversations, search]);

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Search Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search size={15} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchByEmailPlaceholder")}
            className="w-full rounded-xl border border-border bg-surface py-2 ps-9 pe-3 text-xs text-foreground placeholder:text-subtle-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <Badge variant="primary" size="sm">
          {conversations.length} {t("conversationCount", { count: conversations.length })}
        </Badge>
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-muted text-muted-foreground">
            <MessageSquare size={20} />
          </div>
          <h3 className="text-sm font-bold text-foreground">{t("noConversationsFoundTitle")}</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs">
            {search
              ? t("noConversationsFilteredDesc", { search })
              : t("noConversationsEmptyDesc")}
          </p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((c) => (
            <Link key={c.id} href={`/dashboard/chat-logs/${c.id}`} className="group block">
              <Card className="flex items-center justify-between p-4 transition-all duration-150 group-hover:border-primary/50 group-hover:shadow-xs">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                    <Bot size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground group-hover:text-primary transition-colors">
                        {c.customerEmail}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock size={12} />
                      <span>
                        {t("lastActive", {
                          date: new Date(c.updatedAt).toLocaleString(locale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }),
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <span className="hidden sm:inline">{t("inspectTranscript")}</span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-muted text-foreground transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1 group-hover:bg-primary group-hover:text-primary-foreground">
                    {locale === "ar" ? <ArrowLeft size={13} /> : <ArrowRight size={13} />}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
