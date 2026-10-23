import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { observer } from "mobx-react-lite";
import {
    MdAdd,
    MdArrowBack,
    MdClose,
    MdOutlineCancel,
    MdOutlineDescription,
    MdOutlineFolder,
    MdUploadFile,
    MdCheck,
    MdSearch,
} from "react-icons/md";
import { LuLayers3 } from "react-icons/lu";
import DataStore, { type CreatedProject } from "@lib/DataStore";
import DocumentsStore, { type UserDocument } from "@lib/DocumentsStore";
import ChatStore, { CHAT_SERVICES } from "@lib/ChatStore";
import MapStore from "@lib/MapStore";
import CustomSelect, { type SelectOption } from "@components/ui/Select";
import CreateProjectModal from "@components/CreateProjectModal";
import CreateScenarioModal from "@components/CreateScenarioModal";
import DocumentLibraryModal from "@components/documents/DocumentLibraryModal";
import DocumentsModal from "@components/documents/DocumentsModal";
import UploadDocumentModal from "@components/documents/UploadDocumentModal";

type PanelView = "menu" | "context" | null;
type PanelPlacement = "top" | "bottom";

const ChatContextSelection = observer(({ inputRef, onSearchOpenChange }: {
    inputRef: RefObject<HTMLTextAreaElement | null>;
    onSearchOpenChange: (isOpen: boolean) => void;
}) => {
    const [panelView, setPanelView] = useState<PanelView>(null);
    const [search, setSearch] = useState("");
    const [activeIndex, setActiveIndex] = useState(0);
    const [dismissedDraft, setDismissedDraft] = useState<string | null>(null);
    const draft = ChatStore.messageDraft;
    const conversationVersion = ChatStore.currentStreamRequestId;
    const slashMatch = /^\/([^\n]*)$/.exec(draft);
    const isSlashOpen = !!slashMatch && dismissedDraft !== draft && !ChatStore.isStreaming;
    const isPanelOpen = panelView !== null || isSlashOpen;
    const query = isSlashOpen ? slashMatch?.[1] ?? "" : search;
    const isContextView = panelView === "context" && !isSlashOpen;
    const panelWidthClass = isContextView ? "w-[calc(100%+2px)]" : "w-[min(100%,30rem)]";
    const [panelMaxHeight, setPanelMaxHeight] = useState<number>();
    const [panelPlacement, setPanelPlacement] = useState<PanelPlacement>("bottom");
    const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
    const [isCreateScenarioModalOpen, setIsCreateScenarioModalOpen] = useState(false);
    const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
    const [isDocumentsModalOpen, setIsDocumentsModalOpen] = useState(false);
    const [isUploadDocumentModalOpen, setIsUploadDocumentModalOpen] = useState(false);
    const [documentToUpdate, setDocumentToUpdate] = useState<{
        document: UserDocument;
        projectId: number;
        projectName: string;
    } | null>(null);
    const [documentNotice, setDocumentNotice] = useState<string | null>(null);
    const menuButtonRef = useRef<HTMLButtonElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const { userProjects, projectScenarios } = DataStore;
    const {
        selectedContext,
        selectedScenario,
        selectedChatTool,
        isStreaming,
        chatMessages,
    } = ChatStore;
    const { isMapLayersAvailable } = MapStore;
    const isChatVisible = chatMessages.length > 0;

    useEffect(() => {
        if (isStreaming) {
            setPanelView(null);
        }
    }, [isStreaming]);

    useLayoutEffect(() => {
        if (!isPanelOpen) {
            return;
        }

        const updatePanelPlacement = () => {
            const container = containerRef.current;
            const panel = panelRef.current;
            if (!container || !panel) {
                return;
            }

            const anchor = container.closest<HTMLElement>(".chat-input-shell") ?? container;
            const anchorRect = anchor.getBoundingClientRect();

            let visibleTop = 0;
            let visibleBottom = window.innerHeight;
            for (let parent = anchor.parentElement; parent; parent = parent.parentElement) {
                if (/(hidden|clip|auto|scroll)/.test(getComputedStyle(parent).overflowY)) {
                    const bounds = parent.getBoundingClientRect();
                    visibleTop = Math.max(visibleTop, bounds.top);
                    visibleBottom = Math.min(visibleBottom, bounds.bottom);
                }
            }
            const viewportPadding = 16;
            const availableAbove = Math.max(0, anchorRect.top - visibleTop - viewportPadding - 12);
            const availableBelow = Math.max(0, visibleBottom - anchorRect.bottom - viewportPadding - 4);
            const list = panel.querySelector<HTMLElement>('[role="list"]');
            const desiredHeight = list
                ? Math.min(432, list.scrollHeight + 80)
                : panel.scrollHeight;
            const placement = isMapLayersAvailable || (availableBelow < desiredHeight && availableAbove > availableBelow)
                ? "top" : "bottom";
            setPanelPlacement(placement);
            setPanelMaxHeight(placement === "top" ? availableAbove : availableBelow);
        };

        updatePanelPlacement();
        const resizeObserver = new ResizeObserver(updatePanelPlacement);

        if (panelRef.current) {
            resizeObserver.observe(panelRef.current);
        }
        const anchor = containerRef.current?.closest(".chat-input-shell");
        if (anchor) {
            resizeObserver.observe(anchor);
        }

        window.addEventListener("resize", updatePanelPlacement);
        window.addEventListener("scroll", updatePanelPlacement, true);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener("resize", updatePanelPlacement);
            window.removeEventListener("scroll", updatePanelPlacement, true);
        };
    }, [isPanelOpen, isContextView, isMapLayersAvailable, query]);

    useEffect(() => {
        if (selectedContext === "nonproject") {
            return;
        }

        const projectId = Number(selectedContext);
        if (Number.isNaN(projectId) || projectScenarios.has(projectId)) {
            return;
        }

        DataStore.getProjectScenarios(projectId);
    }, [selectedContext, projectScenarios]);

    const contextOptions: SelectOption[] = [
        { label: "Вне проекта", value: "nonproject" },
        ...(userProjects ?? []).map((project) => ({
            label: project.name,
            value: project.id,
        })),
    ];

    const loadedProjectScenarios = projectScenarios.get(Number(selectedContext));
    const currentProjectScenarios = selectedContext === "nonproject"
        ? []
        : (loadedProjectScenarios ?? []);

    const scenarioOptions: SelectOption[] = currentProjectScenarios.map((scenario) => ({
        label: scenario.name,
        value: scenario.id,
    }));
    const selectedProjectId = selectedContext === "nonproject"
        ? null
        : Number(selectedContext);
    const documentCount = selectedProjectId === null
        ? undefined
        : DocumentsStore.documentCounts.get(selectedProjectId);
    const baseScenario = currentProjectScenarios.find((scenario) => scenario.isBase);

    const selectedContextLabel = contextOptions.find(
        (option) => option.value == selectedContext,
    )?.label ?? "Вне проекта";
    const selectedScenarioLabel = scenarioOptions.find(
        (option) => Number(option.value) === selectedScenario,
    )?.label;
    const activeContextLabel = selectedContext === "nonproject"
        ? "Вне проекта"
        : selectedScenarioLabel
            ? `${selectedContextLabel} / ${selectedScenarioLabel}`
            : selectedContextLabel;
    const hasScenarioSelection = selectedContext !== "nonproject"
        && selectedScenario !== null
        && scenarioOptions.some((option) => Number(option.value) === selectedScenario);
    const availableServices = selectedContext === "nonproject"
        ? CHAT_SERVICES.filter((service) => (
            service === "Нормативная документация"
            || service === "Проверка объектов по ПЗЗ"
            || service === "Размещение сервисов"
            || service === "Проверка ВРИ"
            || service === "Генерация застройки"
            || service === "Генерация функционального зонирования"
        ))
        : CHAT_SERVICES.filter((service) => (
            (
                service !== "Генерация функционального зонирования"
                && service !== "План развития территории"
            )
            || hasScenarioSelection
        ));
    const isProjectSelected = selectedProjectId !== null
        && Number.isFinite(selectedProjectId);

    useEffect(() => {
        if (selectedProjectId === null || !Number.isFinite(selectedProjectId)) {
            return;
        }

        void DocumentsStore.getProjectDocuments(selectedProjectId, true).catch((error) => {
            console.error("Error fetching project document count:", error);
        });
    }, [selectedProjectId]);

    useEffect(() => {
        if (selectedContext === "nonproject") {
            if (selectedScenario !== null) {
                ChatStore.setSelectedScenario(null);
            }
            return;
        }

        if (!scenarioOptions.length) {
            return;
        }

        const hasSelectedScenario = selectedScenario !== null
            && scenarioOptions.some((option) => Number(option.value) === selectedScenario);

        if (!hasSelectedScenario) {
            ChatStore.setSelectedScenario(Number(scenarioOptions[0].value));
        }
    }, [scenarioOptions, selectedContext, selectedScenario]);

    useEffect(() => {
        if (selectedContext !== "nonproject" && !loadedProjectScenarios) {
            return;
        }

        if (
            selectedChatTool !== null
            && !availableServices.includes(selectedChatTool)
        ) {
            ChatStore.setSelectedChatTool(null);
        }
    }, [selectedChatTool, selectedContext, hasScenarioSelection, loadedProjectScenarios]);

    useEffect(() => {
        if (dismissedDraft !== null && dismissedDraft !== draft) {
            setDismissedDraft(null);
        }
    }, [draft, dismissedDraft]);

    useEffect(() => {
        setPanelView(null);
        setSearch("");
        setDismissedDraft(null);
        setIsCreateProjectModalOpen(false);
        setIsCreateScenarioModalOpen(false);
        setIsLibraryModalOpen(false);
        setIsDocumentsModalOpen(false);
        setIsUploadDocumentModalOpen(false);
        setDocumentToUpdate(null);
        setDocumentNotice(null);
    }, [ChatStore.activeChatId, conversationVersion]);

    const togglePanel = () => {
        setPanelView(isPanelOpen ? null : "menu");
        setSearch("");
        setDismissedDraft(draft);
    };

    const handleOpenDocuments = () => {
        setPanelView(null);

        if (selectedContext === "nonproject") {
            setIsLibraryModalOpen(true);
            return;
        }

        setIsDocumentsModalOpen(true);
    };

    const handleOpenUploadDocument = () => {
        setPanelView(null);
        setIsUploadDocumentModalOpen(true);
    };

    const actions = [
        {
            id: "project-create", group: "Проект", label: "Создать проект",
            icon: <MdOutlineFolder size={19} />,
            run: () => setIsCreateProjectModalOpen(true),
        },
        {
            id: "documents", group: "Библиотека документов", label: "Просмотр документов",
            icon: <MdOutlineDescription size={19} />,
            run: handleOpenDocuments,
        },
    ];

    if (!isChatVisible) {
        actions.unshift({
            id: "project-select", group: "Проект", label: "Выбрать проект и сценарий",
            icon: <LuLayers3 size={19} />,
            run: () => {
                setPanelView("context");
            },
        });
    }

    if (isProjectSelected) {
        actions.push({
            id: "document-upload", group: "Библиотека документов", label: "Загрузить документ",
            icon: <MdUploadFile size={19} />,
            run: handleOpenUploadDocument,
        });
    }

    actions.push(...availableServices.map((service) => ({
        id: service, group: "Модули", label: service,
        icon: <LuLayers3 size={19} />,
        run: () => ChatStore.setSelectedChatTool(service),
    })));

    const normalizedQuery = query.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
    const filteredActions = actions.filter((action) => `${action.group} ${action.label}`.toLocaleLowerCase("ru").replaceAll("ё", "е").includes(normalizedQuery));
    const executeAction = (action: typeof actions[number]) => {
        if (isStreaming) {
            return;
        }
        setPanelView(null);
        setSearch("");
        if (isSlashOpen) {
            ChatStore.setMessageDraft("");
        }
        action.run();
    };

    useEffect(() => {
        onSearchOpenChange(isSlashOpen);
        return () => onSearchOpenChange(false);
    }, [isSlashOpen, onSearchOpenChange]);

    useEffect(() => {
        setActiveIndex(0);
    }, [query, isPanelOpen, selectedContext, hasScenarioSelection, isChatVisible]);

    useEffect(() => {
        panelRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
    }, [activeIndex]);

    useEffect(() => {
        if (!isPanelOpen) {
            return;
        }

        const input = inputRef.current;
        const onKeyDown = (event: KeyboardEvent) => {
            if (!isSlashOpen || event.isComposing) {
                return;
            }

            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const direction = event.key === "ArrowDown" ? 1 : -1;
                setActiveIndex((index) => filteredActions.length
                    ? (index + direction + filteredActions.length) % filteredActions.length
                    : 0);
            } else if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                const action = filteredActions[activeIndex];
                if (action) {
                    executeAction(action);
                }
            } else if (event.key === "Escape") {
                event.preventDefault();
                setDismissedDraft(draft);
                setPanelView(null);
            }
        };

        const handlePointerDown = (event: MouseEvent) => {
            const eventTarget = event.target;
            if (
                eventTarget instanceof Element
                && eventTarget.closest("[data-custom-select-menu]")
            ) {
                return;
            }

            if (isSlashOpen && containerRef.current?.closest(".chat-input-shell")?.contains(event.target as Node)) {
                return;
            }

            if (!containerRef.current?.contains(event.target as Node)) {
                setPanelView(null);
                setDismissedDraft(draft);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented) {
                return;
            }

            if (panelView === "context") {
                setPanelView("menu");
                return;
            }

            setPanelView(null);
            setDismissedDraft(draft);
            menuButtonRef.current?.focus();
        };

        input?.addEventListener("keydown", onKeyDown);
        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleEscape);

        return () => {
            input?.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleEscape);
        };
    });

    const createScenarioAction = {
        icon: <MdAdd aria-hidden="true" size={20} />,
        label: "Создать сценарий для выбранного проекта",
        title: baseScenario
            ? "Новый сценарий"
            : "Базовый сценарий проекта не найден",
        disabled: !baseScenario || selectedProjectId === null,
        onClick: () => {
            setPanelView(null);
            setIsCreateScenarioModalOpen(true);
        },
    };

    const handleProjectCreated = async (
        project: CreatedProject,
    ) => {
        if (conversationVersion !== ChatStore.currentStreamRequestId) {
            return;
        }

        const responseProject = project.project;
        const projectName = responseProject?.name ?? project.name;
        const refreshedProject = DataStore.userProjects?.find(
            (item) => item.name === projectName,
        );
        const projectId = Number(
            responseProject?.project_id
            ?? responseProject?.id
            ?? project.project_id
            ?? project.id
            ?? refreshedProject?.id,
        );
        const responseScenario = responseProject?.base_scenario
            ?? project.base_scenario;
        const scenarioId = Number(
            responseScenario?.id
            ?? responseScenario?.scenario_id
            ?? responseProject?.base_scenario_id
            ?? responseProject?.scenario_id
            ?? project.base_scenario_id
            ?? project.scenario_id,
        );

        if (!Number.isFinite(projectId)) {
            return;
        }

        ChatStore.setSelectedContext(projectId);
        ChatStore.setSelectedScenario(
            Number.isFinite(scenarioId) ? scenarioId : null,
        );

        if (Number.isFinite(scenarioId)) {
            return;
        }

        await DataStore.getProjectScenarios(projectId);

        const firstScenario = DataStore.projectScenarios.get(projectId)?.[0];
        const firstScenarioId = Number(firstScenario?.id);

        if (
            conversationVersion === ChatStore.currentStreamRequestId
            && ChatStore.selectedContext === projectId
            && Number.isFinite(firstScenarioId)
        ) {
            ChatStore.setSelectedScenario(firstScenarioId);
        }
    };

    return (
        <>
            <div
                ref={containerRef}
                className="flex w-full max-w-5xl flex-row flex-wrap items-center justify-start gap-3"
            >
                <button
                    type="button"
                    className="
                        group inline-flex items-center rounded-full
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40
                        customer:focus-visible:ring-brand-primary/40 disabled:cursor-not-allowed
                    "
                    ref={menuButtonRef}
                    disabled={isStreaming}
                    onClick={togglePanel}
                    aria-expanded={isPanelOpen}
                    aria-haspopup="dialog"
                    aria-label={isPanelOpen
                        ? "Закрыть меню контекста и сервисов"
                        : "Открыть меню контекста и сервисов"}
                >
                    <span
                        className={
                            isStreaming
                                ? "text-slate-300 customer-dark:text-content-disabled"
                                : "text-gray-950 transition-colors group-hover:text-[#0788CE] customer:group-hover:text-brand-primary customer-dark:text-content-primary"
                        }
                    >
                        {isPanelOpen
                            ? <MdClose size="1.75rem" />
                            : <MdAdd size="1.75rem" />}
                    </span>
                </button>

                {!isChatVisible && (
                    <button
                        type="button"
                        className="
                            flex min-w-0 max-w-[min(60%,32rem)] items-center gap-2 rounded-2xl
                            bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600
                            transition-colors hover:bg-slate-200 hover:text-slate-900
                            focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40
                            disabled:cursor-not-allowed disabled:opacity-50
                            customer:focus-visible:ring-brand-primary/40
                            customer-dark:bg-surface-muted customer-dark:text-content-secondary
                            customer-dark:hover:bg-surface-hover customer-dark:hover:text-content-primary
                        "
                        onClick={() => {
                            setDismissedDraft(draft);
                            setPanelView("context");
                        }}
                        disabled={isStreaming}
                        title={activeContextLabel}
                        aria-label={`Выбрать проект. Текущий контекст: ${activeContextLabel}`}
                    >
                        <LuLayers3 size={16} className="shrink-0" />
                        <span className="truncate">{activeContextLabel}</span>
                    </button>
                )}

                {selectedChatTool && (
                    <div
                        className="
                            group flex items-center self-center gap-2 rounded-2xl bg-[#EAF5FF] px-4 py-2
                            text-sm font-medium text-[#0B5E8E]
                            customer:bg-brand-soft customer:text-brand-contrast
                        "
                    >
                        <button
                            type="button"
                            className="
                                rounded-full transition-colors group-hover:text-red-600
                                focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40
                                customer:group-hover:text-danger
                            "
                            onClick={() => ChatStore.setSelectedChatTool(null)}
                            aria-label={`Убрать сервис «${selectedChatTool}»`}
                        >
                            <MdOutlineCancel size={18} />
                        </button>
                        {selectedChatTool}
                    </div>
                )}

                {isPanelOpen && (
                    <div
                        ref={panelRef}
                        className={`
                            chat-context-panel chat-context-panel-enter absolute -left-px z-50
                            ${panelWidthClass}
                            flex min-h-0 flex-col overflow-hidden border-[0.5px] border-slate-300/80 bg-white/80 p-3 backdrop-blur-xl backdrop-saturate-150
                            text-sm text-slate-700 shadow-[0_24px_48px_-18px_var(--shadow-popover)]
                            customer-dark:border-white/15 customer-dark:bg-surface-raised/80 customer-dark:text-content-secondary
                            rounded-3xl
                            ${panelPlacement === "top"
                                ? "bottom-full mb-3 origin-bottom-left"
                                : "top-full mt-1 origin-top-left"}
                        `}
                        style={{ maxHeight: panelMaxHeight }}
                        data-placement={panelPlacement}
                        role="dialog"
                        aria-label={
                            isChatVisible
                                ? "Создание проекта и сервисы"
                                : isContextView
                                    ? "Выбор проекта"
                                    : "Выбор проекта и сервисы"
                        }
                    >
                        {!isContextView ? (
                            <>
                                {isSlashOpen ? (
                                    <div className="shrink-0 px-3 pb-2 text-xs text-slate-400 customer-dark:text-content-muted">Инструменты</div>
                                ) : (
                                    <div className="mb-2 flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 pb-3 customer-dark:border-ui-border">
                                        <MdSearch size={19} aria-hidden="true" />
                                        <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти инструмент…" aria-label="Поиск инструментов" className="min-w-0 flex-1 bg-transparent outline-none" />
                                        <span className="text-xs text-slate-400">/</span>
                                    </div>
                                )}
                                <div className="tools-menu-scroll min-h-0 max-h-88 flex-1 overflow-y-auto overscroll-contain" role="list" aria-label="Инструменты">
                                    {filteredActions.map((action, index) => {
                                        const showGroup = index === 0 || filteredActions[index - 1].group !== action.group;
                                        const isActive = isSlashOpen && index === activeIndex;
                                        const isSelected = selectedChatTool === action.id;
                                        const showDocumentCount = action.id === "documents" && isProjectSelected;
                                        const rowClass = `flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 customer-dark:hover:bg-surface-hover ${isActive ? "bg-slate-100 customer-dark:bg-surface-hover" : ""} ${isSelected ? "text-brand-primary" : ""}`;

                                        return (
                                            <div key={action.id} role="listitem">
                                                {showGroup && (
                                                    <h3 className="px-3 pb-1 pt-3 text-xs font-medium text-slate-400 customer-dark:text-content-muted">{action.group}</h3>
                                                )}
                                                <button
                                                    type="button"
                                                    data-active={isActive}
                                                    aria-pressed={action.group === "Модули" ? isSelected : undefined}
                                                    className={rowClass}
                                                    onClick={() => executeAction(action)}
                                                >
                                                    <span className="shrink-0" aria-hidden="true">{action.icon}</span>
                                                    <span className="min-w-0 flex-1">{action.label}</span>
                                                    {showDocumentCount && <span className="rounded-full bg-brand-soft px-2 text-xs text-brand-contrast">{documentCount ?? 0}</span>}
                                                    {isSelected && <MdCheck size={18} aria-label="Выбран" />}
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {!filteredActions.length && <p className="px-3 py-6 text-center text-slate-400" role="status">Инструменты не найдены</p>}
                                </div>
                                {isSlashOpen && filteredActions[activeIndex] && (
                                    <span className="sr-only" role="status">{filteredActions[activeIndex].label}</span>
                                )}
                            </>
                        ) : (
                            <div className="-m-2 min-h-0 overflow-y-auto p-2">
                                <div className="flex items-center gap-3 border-b border-slate-100 px-1 pb-3 customer-dark:border-ui-border">
                                    <button
                                        type="button"
                                        className="
                                            rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900
                                            focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40
                                            customer:focus-visible:ring-brand-primary/40
                                            customer-dark:text-content-muted customer-dark:hover:bg-surface-hover customer-dark:hover:text-content-primary
                                        "
                                        onClick={() => setPanelView("menu")}
                                        aria-label="Вернуться к меню"
                                    >
                                        <MdArrowBack size={20} />
                                    </button>
                                    <div>
                                        <h3 className="font-semibold text-slate-900 customer-dark:text-content-primary">
                                            Выбрать проект
                                        </h3>
                                        <p className="text-xs text-slate-400 customer-dark:text-content-muted">
                                            Выберите проект и сценарий для чата
                                        </p>
                                    </div>
                                </div>

                                <div className={`grid gap-2 pt-5 ${hasScenarioSelection ? "grid-cols-2" : "grid-cols-1"}`}>
                                    <CustomSelect
                                        value={selectedContext}
                                        options={contextOptions}
                                        onChange={(value) => {
                                            const nextContext = value === "nonproject"
                                                ? value
                                                : Number(value);
                                            ChatStore.setSelectedScenario(null);
                                            ChatStore.setSelectedContext(nextContext);
                                        }}
                                        block
                                        compactGlow
                                    />
                                    {hasScenarioSelection && (
                                        <CustomSelect
                                            value={selectedScenario ?? scenarioOptions[0]?.value}
                                            options={scenarioOptions}
                                            onChange={(value) => {
                                                ChatStore.setSelectedScenario(Number(value));
                                            }}
                                            placeholder="Выберите сценарий"
                                            block
                                            compactGlow
                                            trailingAction={createScenarioAction}
                                        />
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {isCreateProjectModalOpen && (
                <CreateProjectModal
                    onClose={() => setIsCreateProjectModalOpen(false)}
                    onCreated={handleProjectCreated}
                />
            )}

            {isCreateScenarioModalOpen && selectedProjectId !== null && baseScenario && (
                <CreateScenarioModal
                    projectId={selectedProjectId}
                    projectName={selectedContextLabel}
                    baseScenarioId={baseScenario.id}
                    onClose={() => setIsCreateScenarioModalOpen(false)}
                    onCreated={(scenario) => {
                        if (conversationVersion !== ChatStore.currentStreamRequestId) {
                            return;
                        }
                        ChatStore.setSelectedContext(selectedProjectId);
                        ChatStore.setSelectedScenario(scenario.id);
                    }}
                />
            )}

            {isLibraryModalOpen && selectedContext === "nonproject" && (
                <DocumentLibraryModal
                    onClose={() => setIsLibraryModalOpen(false)}
                />
            )}

            {isDocumentsModalOpen && !documentToUpdate && selectedProjectId !== null && (
                <DocumentsModal
                    projectId={selectedProjectId}
                    projectName={selectedContextLabel}
                    onClose={() => {
                        setIsDocumentsModalOpen(false);
                        setDocumentNotice(null);
                    }}
                    onUpdate={(document) => {
                        setDocumentNotice(null);
                        setDocumentToUpdate({
                            document,
                            projectId: selectedProjectId,
                            projectName: selectedContextLabel,
                        });
                    }}
                    notice={documentNotice}
                />
            )}

            {documentToUpdate && (
                <UploadDocumentModal
                    key={`${documentToUpdate.projectId}-${documentToUpdate.document.id}`}
                    projectId={documentToUpdate.projectId}
                    projectName={documentToUpdate.projectName}
                    initialDocument={documentToUpdate.document}
                    onClose={() => setDocumentToUpdate(null)}
                    onSaved={(updateKind) => {
                        setDocumentNotice(updateKind === "metadata"
                            ? "Данные документа обновлены."
                            : "Документ отправлен на обновление. Изменения появятся в списке после обработки.");
                    }}
                />
            )}

            {isUploadDocumentModalOpen && selectedProjectId !== null && (
                <UploadDocumentModal
                    key={selectedProjectId}
                    projectId={selectedProjectId}
                    projectName={selectedContextLabel}
                    onClose={() => setIsUploadDocumentModalOpen(false)}
                />
            )}
        </>
    );
});

export default ChatContextSelection;
