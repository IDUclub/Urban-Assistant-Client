import { observer } from "mobx-react-lite";
import ChatStore from "@lib/ChatStore";
import { MdDeleteForever, MdKeyboardArrowRight } from "react-icons/md";
import { useEffect, useState } from "react";

const ChatStory = observer(() => {
  const {
    chatStoryPreview,
    activeChatId,
    isUserChatsLoading,
    isUserChatOpening,
  } = ChatStore;
  const [openGroupIds, setOpenGroupIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!chatStoryPreview.length) return;

    const activeGroup = chatStoryPreview.find((group) =>
      group.chats.some((chat) => activeChatId === chat.id)
    );
    const nextGroupId = activeGroup?.id ?? chatStoryPreview[0]?.id;

    if (!nextGroupId) return;

    setOpenGroupIds((currentGroupIds) => {
      if (currentGroupIds.has(nextGroupId)) return currentGroupIds;

      const nextGroupIds = new Set(currentGroupIds);
      nextGroupIds.add(nextGroupId);
      return nextGroupIds;
    });
  }, [activeChatId, chatStoryPreview]);

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
    <>
      {chatStoryPreview.map((group) => (
        <details
          key={group.id}
          className="group/project rounded-3xl bg-gray-50/70"
          open={openGroupIds.has(group.id)}
          onToggle={(event) => handleProjectToggle(group.id, event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-gray-700 marker:hidden [&::-webkit-details-marker]:hidden">
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
      ))}
    </>
  );
});

export default ChatStory;
