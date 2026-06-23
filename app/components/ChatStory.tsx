import { observer } from "mobx-react-lite";
import ChatStore from "@lib/ChatStore";
import { MdClose, MdDeleteForever, MdKeyboardArrowRight, MdSearch } from "react-icons/md";
import { useEffect, useMemo, useState } from "react";

const ChatStory = observer(() => {
  const {
    chatStoryPreview,
    activeChatId,
    isUserChatsLoading,
    isUserChatOpening,
  } = ChatStore;
  const [openGroupIds, setOpenGroupIds] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const visibleChatStoryPreview = useMemo(() => {
    if (!normalizedSearchQuery) return chatStoryPreview;

    return chatStoryPreview.flatMap((group) => {
      const groupMatches = group.name.toLowerCase().includes(normalizedSearchQuery);
      const chats = groupMatches
        ? group.chats
        : group.chats.filter((chat) =>
          chat.name.toLowerCase().includes(normalizedSearchQuery)
        );

      return chats.length
        ? [{
          ...group,
          chats,
        }]
        : [];
    });
  }, [chatStoryPreview, normalizedSearchQuery]);

  useEffect(() => {
    if (!visibleChatStoryPreview.length) return;

    if (normalizedSearchQuery) {
      setOpenGroupIds((currentGroupIds) => {
        const nextGroupIds = new Set(currentGroupIds);
        let hasChanges = false;

        visibleChatStoryPreview.forEach((group) => {
          if (nextGroupIds.has(group.id)) return;

          nextGroupIds.add(group.id);
          hasChanges = true;
        });

        return hasChanges ? nextGroupIds : currentGroupIds;
      });
      return;
    }

    const activeGroup = visibleChatStoryPreview.find((group) =>
      group.chats.some((chat) => activeChatId === chat.id)
    );
    const nextGroupId = activeGroup?.id ?? visibleChatStoryPreview[0]?.id;

    if (!nextGroupId) return;

    setOpenGroupIds((currentGroupIds) => {
      if (currentGroupIds.has(nextGroupId)) return currentGroupIds;

      const nextGroupIds = new Set(currentGroupIds);
      nextGroupIds.add(nextGroupId);
      return nextGroupIds;
    });
  }, [activeChatId, normalizedSearchQuery, visibleChatStoryPreview]);

  const handleProjectToggle = (groupId: string, isOpen: boolean) => {
    setOpenGroupIds((currentGroupIds) => {
      if (isOpen === currentGroupIds.has(groupId)) return currentGroupIds;

      const nextGroupIds = new Set(currentGroupIds);

      if (isOpen) {
        nextGroupIds.add(groupId);
      } else {
        nextGroupIds.delete(groupId);
      }

      return nextGroupIds;
    });
  };

  if (!chatStoryPreview.length) {
    return (
      <div className="px-4 py-3 text-sm text-gray-400">
        {isUserChatsLoading ? "Загрузка истории..." : "История пока пуста"}
      </div>
    );
  }

  return (
    <div className="mt-8 pt-5 flex w-full min-w-0 min-h-0 flex-1 flex-col overflow-hidden border-t border-gray-900/30">
      <div className="px-4 text-sm font-medium uppercase tracking-[0.14em] text-gray-500">
        История чатов
      </div>
      <div className="bg-white/95 px-2 py-2 backdrop-blur">
        <label className="flex min-h-11 items-center gap-2 rounded-3xl border border-slate-200 bg-white px-3 text-sm text-slate-600 shadow-sm focus-within:border-[#0788CE]">
          <MdSearch className="shrink-0 text-slate-400" size={20} />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Поиск по истории"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          {searchQuery && (
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              onClick={() => setSearchQuery("")}
              aria-label="Очистить поиск"
            >
              <MdClose size={18} />
            </button>
          )}
        </label>
      </div>
      <div className="mt-2 flex min-w-0 flex-1 flex-col space-y-2 overflow-y-auto px-2">
        {visibleChatStoryPreview.length === 0 ? (
          <div className="px-4 py-3 text-sm text-gray-400">
            Ничего не найдено
          </div>
        ) : (
          visibleChatStoryPreview.map((group) => (
            <details
              key={group.id}
              className="group/project rounded-3xl bg-gray-50/70"
              open={openGroupIds.has(group.id)}
              onToggle={(event) =>
                handleProjectToggle(group.id, event.currentTarget.open)
              }
            >
              <summary className="sticky top-0 z-10 flex cursor-pointer list-none items-center justify-between gap-2 rounded-3xl bg-gray-50/95 px-4 py-3 text-sm font-medium text-gray-700 backdrop-blur marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 truncate">{group.name}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400">
                  {group.chats.length}
                  <MdKeyboardArrowRight
                    size={18}
                    className="transition-transform group-open/project:rotate-90"
                  />
                </span>
              </summary>
              <div className="flex min-w-0 flex-col gap-1 px-2 pb-2">
                {group.chats.map((chat) => (
                  <div
                    key={chat.id}
                    className={`
                    group
                    flex w-full min-w-0 items-center justify-between
                    gap-2 rounded-3xl px-3 py-2 text-sm transition-colors
                    ${
                      activeChatId === chat.id
                        ? "bg-[#EAF5FF] text-[#0B5E8E]"
                        : "text-gray-700 hover:bg-gray-100"
                    }
                `}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 cursor-pointer px-2 py-1 text-left"
                      onClick={() => ChatStore.openUserChat(chat.id)}
                      disabled={activeChatId === chat.id || isUserChatOpening}
                    >
                      <span className="block truncate">{chat.name}</span>
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer text-2xl text-red-700 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-800"
                      onClick={() => ChatStore.deleteChat(chat.id)}
                      aria-label="Удалить чат"
                    >
                      <MdDeleteForever />
                    </button>
                  </div>
                ))}
              </div>
            </details>
          ))
        )}
      </div>
    </div>
  );
});

export default ChatStory;
