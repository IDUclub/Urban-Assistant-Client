import { observer } from "mobx-react-lite";
import ChatStore from "@lib/ChatStore";
import DataStore from "@lib/DataStore";
import {
  MdAdd,
  MdCheck,
  MdClose,
  MdDeleteForever,
  MdKeyboardArrowDown,
  MdKeyboardArrowRight,
  MdSearch,
} from "react-icons/md";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ChatHistoryFilter = "all" | "nonproject" | "projects";

const CHAT_HISTORY_FILTER_OPTIONS: {
  label: string;
  value: ChatHistoryFilter;
}[] = [
  { label: "Все", value: "all" },
  { label: "Вне проекта", value: "nonproject" },
  { label: "Проекты", value: "projects" },
];

type FilterMenuPosition = {
  left: number;
  top: number;
  width: number;
};

function getFilterMenuPosition(trigger: HTMLButtonElement): FilterMenuPosition {
  const triggerRect = trigger.getBoundingClientRect();
  const viewportPadding = 12;
  const menuGap = 8;
  const menuHeight = 152;
  const menuWidth = Math.max(triggerRect.width, 160);
  const availableBelow = window.innerHeight - triggerRect.bottom - viewportPadding;
  const availableAbove = triggerRect.top - viewportPadding;
  const shouldOpenUpwards =
    availableBelow < menuHeight + menuGap && availableAbove > availableBelow;
  const top = shouldOpenUpwards
    ? Math.max(viewportPadding, triggerRect.top - menuHeight - menuGap)
    : Math.min(
      triggerRect.bottom + menuGap,
      window.innerHeight - menuHeight - viewportPadding
    );

  return {
    left: Math.max(
      viewportPadding,
      Math.min(
        triggerRect.left,
        window.innerWidth - menuWidth - viewportPadding
      )
    ),
    top,
    width: menuWidth,
  };
}

function ChatHistoryFilterSelect({
  value,
  onChange,
}: {
  value: ChatHistoryFilter;
  onChange: (value: ChatHistoryFilter) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<FilterMenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedOption =
    CHAT_HISTORY_FILTER_OPTIONS.find((option) => option.value === value) ??
    CHAT_HISTORY_FILTER_OPTIONS[0];

  useEffect(() => {
    if (!isOpen) return;

    const updateMenuPosition = () => {
      if (triggerRef.current) {
        setMenuPosition(getFilterMenuPosition(triggerRef.current));
      }
    };
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    updateMenuPosition();
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="flex h-11 w-fit shrink-0 cursor-pointer items-center justify-end gap-1 whitespace-nowrap rounded-3xl bg-transparent px-2 py-2 text-sm text-slate-700 outline-none transition-colors hover:text-brand-primary customer-dark:text-content-secondary customer-dark:hover:text-brand-contrast"
        onClick={() => {
          if (!isOpen && triggerRef.current) {
            setMenuPosition(getFilterMenuPosition(triggerRef.current));
          }

          setIsOpen((current) => !current);
        }}
        aria-label="Фильтр истории чатов"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls="chat-history-filter-menu"
      >
        <span className="text-right">{selectedOption.label}</span>
        <MdKeyboardArrowDown
          aria-hidden="true"
          size={18}
          className={`shrink-0 text-slate-400 transition-transform customer-dark:text-content-muted ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isOpen && menuPosition && createPortal(
        <div
          ref={menuRef}
          id="chat-history-filter-menu"
          role="listbox"
          aria-label="Фильтр истории чатов"
          style={{
            left: menuPosition.left,
            top: menuPosition.top,
            width: menuPosition.width,
          }}
          className="fixed z-100 overflow-visible rounded-3xl border border-slate-200 bg-white/95 p-2 shadow-[0_24px_40px_-20px_var(--shadow-menu)] backdrop-blur customer-dark:border-ui-border customer-dark:bg-surface-raised/95"
        >
          {CHAT_HISTORY_FILTER_OPTIONS.map((option) => {
            const isSelected = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`flex w-full cursor-pointer items-center justify-between gap-3 whitespace-nowrap rounded-2xl px-4 py-3 text-left text-sm transition-colors ${
                  isSelected
                    ? "bg-[#EAF5FF] text-[#0B5E8E] customer:bg-brand-soft customer:text-brand-contrast"
                    : "text-slate-700 hover:bg-slate-100 customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover"
                }`}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <span>{option.label}</span>
                <MdCheck
                  aria-hidden="true"
                  size={18}
                  className={isSelected ? "shrink-0" : "shrink-0 opacity-0"}
                />
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

const ChatStory = observer(() => {
  const {
    chatStoryPreview,
    activeChatId,
    isUserChatsLoading,
    isUserChatOpening,
  } = ChatStore;
  const [openGroupIds, setOpenGroupIds] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [historyFilter, setHistoryFilter] = useState<ChatHistoryFilter>("all");
  const [startingChatGroupId, setStartingChatGroupId] = useState<string | null>(null);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const visibleChatStoryPreview = useMemo(() => {
    const filteredGroups = historyFilter === "all"
      ? chatStoryPreview
      : chatStoryPreview.filter((group) =>
        historyFilter === "nonproject"
          ? group.projectId === null
          : group.projectId !== null
      );

    if (!normalizedSearchQuery) return filteredGroups;

    return filteredGroups.flatMap((group) => {
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
  }, [chatStoryPreview, historyFilter, normalizedSearchQuery]);

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

  const handleStartGroupChat = async (group: {
    id: string;
    projectId: number | null;
  }) => {
    ChatStore.clearChat();

    if (group.projectId === null) return;

    const projectId = group.projectId;
    setStartingChatGroupId(group.id);
    ChatStore.setSelectedContext(projectId);

    try {
      const scenarios = await DataStore.getProjectScenarios(projectId);
      const baseScenario = scenarios.find((scenario) => scenario.isBase)
        ?? scenarios[0];

      if (
        baseScenario
        && ChatStore.selectedContext === projectId
        && ChatStore.activeChatId === undefined
      ) {
        ChatStore.setSelectedScenario(baseScenario.id);
      }
    } finally {
      setStartingChatGroupId((currentGroupId) =>
        currentGroupId === group.id ? null : currentGroupId
      );
    }
  };

  const renderChatItem = (
    chat: { id: string; name: string },
    isStandalone = false,
  ) => (
    <div
      key={chat.id}
      className={`
        group flex w-full min-w-0 items-center justify-between
        gap-2 rounded-3xl px-3 py-2 text-sm transition-colors
        ${
          activeChatId === chat.id
            ? "bg-[#EAF5FF] text-[#0B5E8E] customer:bg-brand-soft customer:text-brand-contrast"
            : isStandalone
              ? "bg-gray-50/70 text-gray-700 hover:bg-gray-100 customer-dark:bg-surface-muted/70 customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover"
              : "text-gray-700 hover:bg-gray-100 customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover"
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
        className="cursor-pointer text-2xl text-red-700 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-800 customer:text-danger customer:hover:text-danger-hover"
        onClick={() => ChatStore.deleteChat(chat.id)}
        aria-label="Удалить чат"
      >
        <MdDeleteForever />
      </button>
    </div>
  );

  return (
    <div className="mt-5 flex w-full min-w-0 min-h-0 flex-1 flex-col overflow-hidden">
      <div className="px-2 pb-4">
        <button
          type="button"
          className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-3xl bg-linear-to-r from-brand-gradient-start via-brand-gradient-middle to-brand-gradient-end px-4 text-sm font-medium text-white shadow-[0_10px_24px_-14px_var(--brand-shadow-strong)] transition-[filter,box-shadow] duration-200 hover:brightness-105 hover:shadow-[0_14px_28px_-14px_var(--brand-shadow-medium)] focus:outline-none focus:ring-2 focus:ring-brand-primary/25"
          onClick={() => ChatStore.clearChat()}
        >
          <MdAdd aria-hidden="true" size={20} />
          <span>Новый чат</span>
        </button>
      </div>
      <div className="border-t border-(--sidebar-divider-color) px-4 py-4 text-sm font-medium uppercase tracking-[0.14em] text-(--history-heading-color)">
        История чатов
      </div>
      {!chatStoryPreview.length ? (
        <div className="px-4 py-3 text-sm text-gray-400 customer-dark:text-content-muted">
          {isUserChatsLoading ? "Загрузка истории..." : "История пока пуста"}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 bg-white/95 px-2 py-2 backdrop-blur customer-dark:bg-surface-panel/95 xl:flex-nowrap 2xl:flex-wrap">
            <ChatHistoryFilterSelect
              value={historyFilter}
              onChange={setHistoryFilter}
            />
            <label className="flex min-h-11 min-w-[min(12rem,100%)] flex-1 items-center gap-2 rounded-3xl border border-slate-200 bg-white px-3 text-sm text-slate-600 shadow-sm focus-within:border-[#0788CE] customer:focus-within:border-brand-primary customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-secondary xl:min-w-0 2xl:min-w-[min(12rem,100%)]">
              <MdSearch className="shrink-0 text-slate-400 customer-dark:text-content-muted" size={20} />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Поиск по истории"
                className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 customer-dark:text-content-primary customer-dark:placeholder:text-content-muted"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 customer-dark:text-content-muted customer-dark:hover:bg-surface-hover customer-dark:hover:text-content-secondary"
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
              <div className="px-4 py-3 text-sm text-gray-400 customer-dark:text-content-muted">
                Ничего не найдено
              </div>
            ) : (
              visibleChatStoryPreview.map((group) => (
                <details
                  key={group.id}
                  className="group/project rounded-3xl bg-gray-50/70 customer-dark:bg-surface-muted/70"
                  open={openGroupIds.has(group.id)}
                  onToggle={(event) =>
                    handleProjectToggle(group.id, event.currentTarget.open)
                  }
                >
                  <summary className="sticky top-0 z-10 flex cursor-pointer list-none items-center justify-between gap-2 rounded-3xl bg-gray-50/95 px-4 py-3 text-sm font-medium text-gray-700 backdrop-blur marker:hidden customer-dark:bg-surface-muted/95 customer-dark:text-content-secondary [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 truncate">{group.name}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400 customer-dark:text-content-muted">
                      <button
                        type="button"
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-brand-primary transition-colors hover:bg-brand-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30 disabled:cursor-wait disabled:opacity-50"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleStartGroupChat(group);
                        }}
                        disabled={startingChatGroupId === group.id}
                        aria-label={group.projectId === null
                          ? "Новый чат вне проекта"
                          : `Новый чат в проекте «${group.name}»`}
                        title={group.projectId === null
                          ? "Новый чат вне проекта"
                          : "Новый чат в базовом сценарии проекта"}
                      >
                        <MdAdd aria-hidden="true" size={18} />
                      </button>
                      {group.chats.length}
                      <MdKeyboardArrowRight
                        size={18}
                        className="transition-transform group-open/project:rotate-90"
                      />
                    </span>
                  </summary>
                  <div className="flex min-w-0 flex-col gap-1 px-2 pb-2">
                    {group.chats.map((chat) =>
                      renderChatItem(chat, group.projectId === null)
                    )}
                  </div>
                </details>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
});

export default ChatStory;
