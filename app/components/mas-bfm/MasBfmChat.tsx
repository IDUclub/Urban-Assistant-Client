import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { IoIosSend } from "react-icons/io";
import {
  IoAlertCircleOutline,
  IoCheckmarkCircleOutline,
  IoTimeOutline,
} from "react-icons/io5";
import { LuBot, LuLayers3, LuWrench } from "react-icons/lu";
import {
  MdAdd,
  MdArrowBack,
  MdClose,
  MdOutlineDescription,
} from "react-icons/md";
import MasBfmStore from "@lib/MasBfmStore";
import MapStore from "@lib/MapStore";
import DataStore, { type ProjectScenario } from "@lib/DataStore";
import AuthStore from "@lib/AuthStore";
import Select from "@components/ui/Select";
import DocumentLibraryModal from "@components/documents/DocumentLibraryModal";
import MasBfmArtifacts from "@components/mas-bfm/MasBfmArtifacts";
import MapView from "@components/MapView";
import type { SynapseMessage } from "@lib/synapse/client";

const NO_PROJECT_SCENARIOS: ProjectScenario[] = [];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function messageTime(message: SynapseMessage) {
  const createdAt = message.created_at;
  if (typeof createdAt !== "string") {
    return;
  }

  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return;
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function StatusMessage({ message }: { message: SynapseMessage }) {
  const data = asRecord(message.data);
  const time = messageTime(message);
  const isToolResult = message.type === "tool_result";
  const isToolCall = message.type === "tool_call";
  const isError = message.status === "error" || message.subtype === "error";
  const toolName = typeof data?.name === "string" ? data.name : "Инструмент";
  const content = asText(message.content ?? data?.content);
  const label = isToolCall
    ? `${toolName} — запущен`
    : isToolResult
      ? `${toolName} — ${isError ? "ошибка" : "успешно"}`
      : content || "Обновление статуса";
  const Icon = isToolCall
    ? LuWrench
    : isError
      ? IoAlertCircleOutline
      : isToolResult
        ? IoCheckmarkCircleOutline
        : IoTimeOutline;

  return (
    <div
      className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-xs ${
        isError
          ? "bg-red-50 text-red-700 customer-dark:bg-red-950/30 customer-dark:text-red-300"
          : "bg-slate-100 text-slate-600 customer-dark:bg-surface-muted customer-dark:text-content-secondary"
      }`}
    >
      <Icon size={16} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words">{label}</span>
      {time && <time className="shrink-0 text-content-muted">{time}</time>}
    </div>
  );
}

function MessageCard({ message }: { message: SynapseMessage }) {
  const time = messageTime(message);
  const text = asText(message.content);

  if (message.type === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-3xl bg-brand-soft px-5 py-3 text-sm leading-6 text-content-primary">
          <div className="whitespace-pre-wrap break-words">{text}</div>
          {time && (
            <time className="mt-1 block text-right text-[11px] text-content-muted">
              {time}
            </time>
          )}
        </div>
      </div>
    );
  }

  if (message.type === "assistant") {
    const data = asRecord(message.data);
    const agent =
      typeof data?.agent_id === "string"
        ? data.agent_id.split("@")[0]
        : undefined;
    return (
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-primary">
          <LuBot size={17} aria-hidden="true" />
        </div>
        <div className="min-w-0 max-w-[90%] rounded-3xl border border-ui-border bg-surface-raised px-5 py-4 text-sm leading-6 text-content-primary shadow-sm">
          {(agent || time) && (
            <div className="mb-2 flex items-center gap-2 text-xs text-content-muted">
              {agent && <span>{agent}</span>}
              {time && <time>{time}</time>}
            </div>
          )}
          <div className="whitespace-pre-wrap break-words">{text}</div>
        </div>
      </div>
    );
  }

  return <StatusMessage message={message} />;
}

function ProjectStatus({ status }: { status?: string }) {
  if (!status) {
    return null;
  }

  const normalized = status.toLowerCase();
  const isCompleted = normalized === "completed";
  const isFailed = normalized === "failed";
  const isCancelled = normalized === "cancelled";
  const isWaiting = normalized === "waiting_approval_timeout";
  const label = isCompleted
    ? "Завершено"
    : isFailed
      ? "Ошибка выполнения"
      : isCancelled
        ? "Остановлено"
        : isWaiting
          ? "Ожидает подтверждения"
          : "Выполняется";
  const Icon = isCompleted
    ? IoCheckmarkCircleOutline
    : isFailed
      ? IoAlertCircleOutline
      : IoTimeOutline;

  return (
    <div
      role="status"
      className={`flex items-center gap-1.5 text-xs font-medium ${
        isFailed
          ? "text-red-600 customer-dark:text-red-300"
          : isCompleted
            ? "text-emerald-600 customer-dark:text-emerald-300"
            : "text-content-muted"
      }`}
    >
      <Icon
        size={15}
        aria-hidden="true"
        className={
          !isCompleted && !isFailed && !isCancelled && !isWaiting
            ? "animate-pulse"
            : undefined
        }
      />
      <span>{label}</span>
    </div>
  );
}

const MasBfmChat = observer(() => {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectSelectionOpen, setProjectSelectionOpen] = useState(false);
  const [documentLibraryOpen, setDocumentLibraryOpen] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousMapLayersRef = useRef([...MapStore.mapLayers]);
  const projects = [
    { label: "Вне проекта", value: "nonproject" },
    ...(DataStore.userProjects ?? []).map((project) => ({
      label: project.name,
      value: project.id,
    })),
  ];
  const selectedProjectLabel =
    projects.find(
      (project) =>
        project.value === (MasBfmStore.selectedProjectId ?? "nonproject"),
    )?.label ?? "Вне проекта";
  const projectScenarios = MasBfmStore.selectedProjectId === null
    ? NO_PROJECT_SCENARIOS
    : (DataStore.projectScenarios.get(MasBfmStore.selectedProjectId)
      ?? NO_PROJECT_SCENARIOS);
  const scenarioOptions = useMemo(
    () => projectScenarios.map((scenario) => ({
      label: scenario.name,
      value: scenario.id,
    })),
    [projectScenarios],
  );
  const selectedScenarioLabel = scenarioOptions.find(
    (scenario) => scenario.value === MasBfmStore.selectedScenarioId,
  )?.label;
  const selectedContextLabel = selectedScenarioLabel
    ? `${selectedProjectLabel} / ${selectedScenarioLabel}`
    : selectedProjectLabel;
  const hasConversation =
    MasBfmStore.messages.length > 0 ||
    MasBfmStore.isSending ||
    !!MasBfmStore.synapseProjectId ||
    !!MasBfmStore.error;
  const canSend = !!MasBfmStore.draft.trim() && !MasBfmStore.isSending;
  const mapHeight = "50vh";
  const visibleMapOffset = MapStore.isMapLayersAvailable
    ? isMapExpanded
      ? mapHeight
      : "25vh"
    : "4px";

  useEffect(() => {
    MasBfmStore.connect();
    return () => {
      MasBfmStore.disconnect();
      MapStore.restoreMapLayers(previousMapLayersRef.current);
    };
  }, []);

  useEffect(() => {
    const projectId = MasBfmStore.selectedProjectId;
    if (projectId === null || DataStore.projectScenarios.has(projectId)) {
      return;
    }

    void DataStore.getProjectScenarios(projectId);
  }, [MasBfmStore.selectedProjectId]);

  useEffect(() => {
    if (MasBfmStore.selectedProjectId === null) {
      if (MasBfmStore.selectedScenarioId !== null) {
        MasBfmStore.selectScenario(null);
      }
      return;
    }

    const hasSelectedScenario = scenarioOptions.some(
      (scenario) => scenario.value === MasBfmStore.selectedScenarioId,
    );
    if (!hasSelectedScenario && scenarioOptions.length) {
      MasBfmStore.selectScenario(Number(scenarioOptions[0].value));
    }
  }, [
    MasBfmStore.selectedProjectId,
    MasBfmStore.selectedScenarioId,
    scenarioOptions,
  ]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [MasBfmStore.draft]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [MasBfmStore.messages.length, MasBfmStore.isSending, MasBfmStore.error]);

  useEffect(() => {
    if (!projectMenuOpen) {
      return;
    }

    const closeOutside = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-custom-select-menu]")
      )
        return;
      if (!menuRef.current?.contains(target as Node)) {
        setProjectMenuOpen(false);
        setProjectSelectionOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (projectSelectionOpen) {
        setProjectSelectionOpen(false);
        return;
      }
      setProjectMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [projectMenuOpen, projectSelectionOpen]);

  return (
    <>
      <section
        aria-label="Чат МАС БФМ"
        className="relative flex h-dvh min-w-0 flex-col overflow-hidden bg-white px-8 pt-20 transition-[padding-bottom] duration-300 ease-out customer:bg-surface-page"
        style={{ paddingBottom: `calc(1.5rem + ${visibleMapOffset})` }}
      >
        <div
          className={`mx-auto flex min-h-0 w-full flex-1 flex-col ${
            hasConversation ? "max-w-5xl" : "max-w-4xl justify-center"
          }`}
        >
          {hasConversation ? (
            <div
              className="mb-5 min-h-0 flex-1 overflow-y-auto pr-1"
              aria-live="polite"
            >
              <div className="flex flex-col gap-3 pb-2 pt-4">
                <div className="mb-2 flex flex-col items-center gap-2">
                  <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold tracking-wider text-brand-primary">
                    МАС БФМ
                  </span>
                  <ProjectStatus status={MasBfmStore.projectStatus} />
                </div>
                {MasBfmStore.messages.map((message) => (
                  <MessageCard key={message.id} message={message} />
                ))}
                <MasBfmArtifacts
                  artifacts={MasBfmStore.artifacts}
                  archiveRefs={MasBfmStore.archiveRefs}
                  projectId={MasBfmStore.synapseProjectId}
                />
                {MasBfmStore.isSending && (
                  <div className="flex items-center gap-2 px-3 py-2 text-sm text-content-muted">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-brand-primary" />
                    Отправляем запрос в Synapse…
                  </div>
                )}
                {MasBfmStore.error && (
                  <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 customer-dark:border-red-900/50 customer-dark:bg-red-950/30 customer-dark:text-red-300">
                    <IoAlertCircleOutline
                      size={19}
                      className="mt-0.5 shrink-0"
                    />
                    <span>{MasBfmStore.error}</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          ) : (
            <div className="mb-10 flex flex-col items-center gap-3 text-center">
              <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold tracking-wider text-brand-primary">
                МАС БФМ
              </span>
              <h1 className="font-cabin text-[22px] leading-tight text-[#383432] customer-dark:text-content-primary lg:text-[32px] xl:text-[42px]">
                <span className="brand-text-gradient bg-clip-text text-transparent">
                  Привет
                  {AuthStore.firstName ? `, ${AuthStore.firstName}` : ""}!
                </span>
                <span> Чем я могу помочь?</span>
              </h1>
            </div>
          )}
          <div className="chat-input-shell relative mb-1.5 flex w-full shrink-0 flex-col rounded-3xl border border-gray-300 bg-white px-6 py-4 text-gray-950 shadow-gray-300 drop-shadow-lg customer-dark:border-ui-border-strong customer-dark:bg-surface-panel customer-dark:text-content-primary">
            <textarea
              ref={textareaRef}
              rows={1}
              aria-label="Запрос МАС БФМ"
              placeholder={
                MasBfmStore.isSending
                  ? "Отправляем запрос…"
                  : "Опишите задачу для МАС БФМ"
              }
              value={MasBfmStore.draft}
              disabled={MasBfmStore.isSending}
              onChange={(event) => MasBfmStore.setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  canSend
                ) {
                  event.preventDefault();
                  void MasBfmStore.sendDraft();
                }
              }}
              className="w-full resize-none overflow-y-auto bg-transparent leading-6 placeholder:text-gray-500 focus:outline-none disabled:cursor-wait disabled:text-content-muted customer-dark:placeholder:text-content-muted"
            />
            <div className="mt-5 flex items-end justify-between gap-3">
              <div
                ref={menuRef}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <button
                  type="button"
                  aria-label={
                    projectMenuOpen ? "Закрыть выбор проекта" : "Выбрать проект"
                  }
                  aria-expanded={projectMenuOpen}
                  aria-haspopup="dialog"
                  aria-controls="mas-bfm-project-menu"
                  onClick={() => {
                    setProjectMenuOpen(!projectMenuOpen);
                    setProjectSelectionOpen(false);
                  }}
                  className="shrink-0 cursor-pointer rounded-full hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-brand-primary"
                >
                  {projectMenuOpen ? (
                    <MdClose size={28} />
                  ) : (
                    <MdAdd size={28} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProjectMenuOpen(!projectMenuOpen);
                    setProjectSelectionOpen(false);
                  }}
                  aria-label={`Выбрать проект и сценарий. Текущий контекст: ${selectedContextLabel}`}
                  aria-expanded={projectMenuOpen}
                  aria-controls="mas-bfm-project-menu"
                  className="flex min-w-0 items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-brand-primary customer-dark:bg-surface-muted customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover"
                >
                  <LuLayers3 size={16} className="shrink-0" />
                  <span className="truncate">{selectedContextLabel}</span>
                </button>
                {projectMenuOpen && (
                  <div
                    id="mas-bfm-project-menu"
                    role="dialog"
                    aria-label={
                      projectSelectionOpen
                        ? "Выбор проекта"
                        : "Выбор проекта и документы"
                    }
                    className={`chat-context-panel chat-context-panel-enter absolute -left-px z-50 w-[calc(100%+2px)] overflow-visible rounded-3xl border-[0.5px] border-slate-300/80 bg-white/80 p-3 text-sm text-slate-700 shadow-[0_24px_48px_-18px_var(--shadow-popover)] backdrop-blur-xl backdrop-saturate-150 customer-dark:border-white/15 customer-dark:bg-surface-raised/80 customer-dark:text-content-secondary ${
                      hasConversation ? "bottom-full mb-2" : "top-full mt-1"
                    }`}
                  >
                    {projectSelectionOpen ? (
                      <div>
                        <div className="mb-4 flex items-center gap-3 border-b border-ui-border px-1 pb-3">
                          <button
                            type="button"
                            onClick={() => setProjectSelectionOpen(false)}
                            aria-label="Вернуться к меню"
                            className="rounded-full p-2 text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
                          >
                            <MdArrowBack size={20} />
                          </button>
                          <div>
                            <div className="font-semibold">Выбрать проект</div>
                            <div className="text-xs text-content-muted">
                              Выберите проект и сценарий для запроса
                            </div>
                          </div>
                        </div>
                        <div
                          className={`grid gap-2 ${
                            MasBfmStore.selectedProjectId !== null
                              && scenarioOptions.length
                              ? "grid-cols-2"
                              : "grid-cols-1"
                          }`}
                        >
                          <Select
                            value={MasBfmStore.selectedProjectId ?? "nonproject"}
                            options={projects}
                            onChange={(value) => {
                              const projectId = value === "nonproject"
                                ? null
                                : Number(value);
                              MasBfmStore.selectProject(projectId);
                              if (projectId === null) {
                                setProjectMenuOpen(false);
                                setProjectSelectionOpen(false);
                              }
                            }}
                            block
                            compactGlow
                          />
                          {MasBfmStore.selectedProjectId !== null
                            && scenarioOptions.length > 0 && (
                            <Select
                              value={MasBfmStore.selectedScenarioId ?? scenarioOptions[0].value}
                              options={scenarioOptions}
                              onChange={(value) => {
                                MasBfmStore.selectScenario(Number(value));
                                setProjectMenuOpen(false);
                                setProjectSelectionOpen(false);
                              }}
                              placeholder="Выберите сценарий"
                              block
                              compactGlow
                            />
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setProjectSelectionOpen(true)}
                          className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-left font-medium text-slate-800 transition-colors hover:border-brand-primary/40 hover:bg-brand-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 customer-dark:border-ui-border customer-dark:text-content-primary customer-dark:hover:bg-surface-hover"
                        >
                          <LuLayers3 size={20} className="shrink-0" />
                          <span>Выбрать проект</span>
                        </button>
                        {MasBfmStore.selectedProjectId === null && (
                          <section className="mt-3 border-t border-ui-border pt-3">
                            <h3 className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
                              Документы
                            </h3>
                            <button
                              type="button"
                              onClick={() => {
                                setProjectMenuOpen(false);
                                setDocumentLibraryOpen(true);
                              }}
                              className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left leading-5 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 customer-dark:hover:bg-surface-hover"
                            >
                              <MdOutlineDescription
                                size={19}
                                className="shrink-0"
                              />
                              <span>Просмотр документов</span>
                            </button>
                          </section>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={!canSend}
                onClick={() => void MasBfmStore.sendDraft()}
                aria-label="Отправить запрос МАС БФМ"
                className={`shrink-0 transition-colors ${
                  canSend
                    ? "cursor-pointer text-gray-950 hover:text-brand-accent customer-dark:text-content-primary"
                    : "cursor-not-allowed text-content-muted opacity-40"
                }`}
              >
                <IoIosSend size={32} />
              </button>
            </div>
          </div>
        </div>
        {MapStore.isMapLayersAvailable && (
          <div
            className="absolute inset-x-0 bottom-0 px-8 pb-6 pt-4 transition-transform duration-300 ease-out"
            style={{
              height: mapHeight,
              transform: isMapExpanded ? "translateY(0)" : "translateY(50%)",
            }}
          >
            <div className="mx-auto h-full w-full max-w-7xl">
              <MapView
                isExpanded={isMapExpanded}
                onToggleExpanded={() => setIsMapExpanded((current) => !current)}
                fitAllLayers
              />
            </div>
          </div>
        )}
      </section>
      {documentLibraryOpen && (
        <DocumentLibraryModal onClose={() => setDocumentLibraryOpen(false)} />
      )}
    </>
  );
});

export default MasBfmChat;
