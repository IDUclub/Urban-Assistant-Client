import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import {
    MdAdd,
    MdArrowBack,
    MdClose,
    MdOutlineCancel,
    MdOutlineDescription,
    MdOutlineFolder,
    MdUploadFile,
} from "react-icons/md";
import { LuLayers3 } from "react-icons/lu";
import DataStore from "@lib/DataStore";
import DocumentsStore, { type UserDocument } from "@lib/DocumentsStore";
import ChatStore from "@lib/ChatStore";
import MapStore from "@lib/MapStore";
import CustomSelect, { type SelectOption } from "@components/ui/Select";
import CreateProjectModal from "@components/CreateProjectModal";
import CreateScenarioModal from "@components/CreateScenarioModal";
import DocumentsModal from "@components/DocumentsModal";
import UploadDocumentModal from "@components/UploadDocumentModal";

const CHAT_SERVICES = [
  "Нормативная документация",
  "Зоны ограничений",
  "Проверка объектов по ПЗЗ",
  "Генерация застройки",
  "Генерация функционального зонирования",
  "Обеспеченность",
  "Проверка ВРИ",
  "Проверка нормативных ограничений",
  "Справка по проекту",
] as const;

type PanelView = "menu" | "context";
type PanelPlacement = "top" | "bottom";

const ChatContextSelection = observer(() => {
    const [isOpen, setIsOpen] = useState(false);
    const [panelView, setPanelView] = useState<PanelView>("menu");
    const [panelPlacement, setPanelPlacement] = useState<PanelPlacement>("bottom");
    const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
    const [isCreateScenarioModalOpen, setIsCreateScenarioModalOpen] = useState(false);
    const [isDocumentsModalOpen, setIsDocumentsModalOpen] = useState(false);
    const [isUploadDocumentModalOpen, setIsUploadDocumentModalOpen] = useState(false);
    const [documentToUpdate, setDocumentToUpdate] = useState<{
        document: UserDocument;
        projectId: number;
        projectName: string;
    } | null>(null);
    const [documentNotice, setDocumentNotice] = useState<string | null>(null);
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
        if (!isOpen) return;

        const handlePointerDown = (event: MouseEvent) => {
            const eventTarget = event.target;
            if (
                eventTarget instanceof Element
                && eventTarget.closest("[data-custom-select-menu]")
            ) {
                return;
            }

            if (!containerRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
                setPanelView("menu");
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;

            if (panelView === "context") {
                setPanelView("menu");
                return;
            }

            setIsOpen(false);
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleEscape);

        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [isOpen, panelView]);

    useEffect(() => {
        if (isStreaming) {
            setIsOpen(false);
            setPanelView("menu");
        }
    }, [isStreaming]);

    useEffect(() => {
        if (!isOpen) return;

        const updatePanelPlacement = () => {
            if (isMapLayersAvailable) {
                setPanelPlacement("top");
                return;
            }

            const container = containerRef.current;
            const panel = panelRef.current;
            if (!container || !panel) return;

            const anchor = container.closest<HTMLElement>(".chat-input-shell") ?? container;
            const anchorRect = anchor.getBoundingClientRect();
            const panelHeight = panel.getBoundingClientRect().height;
            const viewportPadding = 16;
            const panelGap = 4;
            const availableAbove = anchorRect.top - viewportPadding;
            const availableBelow = window.innerHeight - anchorRect.bottom - viewportPadding;
            const requiredSpace = panelHeight + panelGap;

            setPanelPlacement(
                availableBelow < requiredSpace && availableAbove > availableBelow
                    ? "top"
                    : "bottom",
            );
        };

        const animationFrame = window.requestAnimationFrame(updatePanelPlacement);
        const resizeObserver = new ResizeObserver(updatePanelPlacement);

        if (panelRef.current) {
            resizeObserver.observe(panelRef.current);
        }

        window.addEventListener("resize", updatePanelPlacement);
        window.addEventListener("scroll", updatePanelPlacement, true);

        return () => {
            window.cancelAnimationFrame(animationFrame);
            resizeObserver.disconnect();
            window.removeEventListener("resize", updatePanelPlacement);
            window.removeEventListener("scroll", updatePanelPlacement, true);
        };
    }, [isOpen, panelView, isMapLayersAvailable]);

    useEffect(() => {
        if (selectedContext === "nonproject") return;

        const projectId = Number(selectedContext);
        if (Number.isNaN(projectId) || projectScenarios.has(projectId)) return;

        DataStore.getProjectScenarios(projectId);
    }, [selectedContext, projectScenarios]);

    const contextOptions: SelectOption[] = [
        { label: "Вне проекта", value: "nonproject" },
        ...(userProjects ?? []).map((project) => ({
            label: project.name,
            value: project.id,
        })),
    ];

    const currentProjectScenarios = selectedContext === "nonproject"
        ? []
        : (projectScenarios.get(Number(selectedContext)) ?? []);

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
            || service === "Проверка ВРИ"
            || service === "Генерация застройки"
            || service === "Генерация функционального зонирования"
        ))
        : CHAT_SERVICES.filter((service) => (
            service !== "Генерация функционального зонирования"
            || hasScenarioSelection
        ));
    const isProjectSelected = selectedProjectId !== null
        && Number.isFinite(selectedProjectId);

    useEffect(() => {
        if (selectedProjectId === null || !Number.isFinite(selectedProjectId)) return;

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

        if (!scenarioOptions.length) return;

        const hasSelectedScenario = selectedScenario !== null
            && scenarioOptions.some((option) => Number(option.value) === selectedScenario);

        if (!hasSelectedScenario) {
            ChatStore.setSelectedScenario(Number(scenarioOptions[0].value));
        }
    }, [scenarioOptions, selectedContext, selectedScenario]);

    useEffect(() => {
        if (
            selectedChatTool !== null
            && !availableServices.includes(selectedChatTool)
        ) {
            ChatStore.setSelectedChatTool(null);
        }
    }, [selectedChatTool, selectedContext, hasScenarioSelection]);

    const togglePanel = () => {
        setIsOpen((current) => {
            if (!current) {
                setPanelView("menu");
            }
            return !current;
        });
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
                    disabled={isStreaming}
                    onClick={togglePanel}
                    aria-expanded={isOpen}
                    aria-haspopup="dialog"
                    aria-label={isOpen
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
                        {isOpen
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
                            setPanelView("context");
                            setIsOpen(true);
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

                {isOpen && (
                    <div
                        ref={panelRef}
                        className={`
                            chat-context-panel chat-context-panel-enter absolute -left-px z-50 w-[calc(100%+2px)]
                            overflow-visible border-[0.5px] border-slate-300/80 bg-white/80 p-3 backdrop-blur-xl backdrop-saturate-150
                            text-sm text-slate-700 shadow-[0_24px_48px_-18px_var(--shadow-popover)]
                            customer-dark:border-white/15 customer-dark:bg-surface-raised/80 customer-dark:text-content-secondary
                            rounded-3xl
                            ${panelPlacement === "top"
                                ? "bottom-full mb-3 origin-bottom-left"
                                : "top-full mt-1 origin-top-left"}
                        `}
                        data-placement={panelPlacement}
                        role="dialog"
                        aria-label={
                            isChatVisible
                                ? "Создание проекта и сервисы"
                                : panelView === "menu"
                                    ? "Выбор проекта и сервисы"
                                    : "Выбор проекта"
                        }
                    >
                        {panelView === "menu" ? (
                            <>
                                <div className={`grid gap-2 ${isChatVisible ? "grid-cols-1" : "sm:grid-cols-2"}`}>
                                    <button
                                        type="button"
                                        className="
                                            flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3
                                            text-left font-medium text-slate-800 transition-colors hover:border-[#0788CE]/40 hover:bg-[#EAF5FF]
                                            focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40
                                            customer:hover:border-brand-primary/40 customer:hover:bg-brand-soft
                                            customer:focus-visible:ring-brand-primary/40
                                            customer-dark:border-ui-border customer-dark:text-content-primary customer-dark:hover:bg-surface-hover
                                        "
                                        onClick={() => {
                                            setIsOpen(false);
                                            setPanelView("menu");
                                            setIsCreateProjectModalOpen(true);
                                        }}
                                    >
                                        <MdOutlineFolder size={21} className="shrink-0" />
                                        <span>Создать проект</span>
                                    </button>
                                    {!isChatVisible && (
                                        <button
                                            type="button"
                                            className="
                                                flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3
                                                text-left text-slate-800 transition-colors hover:border-[#0788CE]/40 hover:bg-[#d9e88d]
                                                focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40
                                                customer:hover:border-brand-primary/40 customer:hover:bg-brand-soft
                                                customer:focus-visible:ring-brand-primary/40
                                                customer-dark:border-ui-border customer-dark:text-content-primary customer-dark:hover:bg-surface-hover
                                            "
                                            onClick={() => setPanelView("context")}
                                        >
                                            <LuLayers3 size={20} className="shrink-0" />
                                            <span className="font-medium">Выбрать проект</span>
                                        </button>
                                    )}
                                </div>
                                {isProjectSelected && (
                                  <section className="mt-3 border-t border-slate-100 pt-3 customer-dark:border-ui-border">
                                    <h3 className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 customer-dark:text-content-muted">
                                      Документы
                                    </h3>
                                    <div className="grid gap-1 sm:grid-cols-2">
                                        <button
                                          type="button"
                                          className="
                                            flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left leading-5
                                            transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40
                                            customer:focus-visible:ring-brand-primary/40
                                            hover:bg-slate-100 customer-dark:hover:bg-surface-hover
                                          "
                                          onClick={() => {
                                              setIsOpen(false);
                                              setPanelView("menu");
                                              setIsDocumentsModalOpen(true);
                                          }}
                                        >
                                          <span className="flex min-w-0 items-center gap-2.5">
                                              <MdOutlineDescription size={19} className="shrink-0" />
                                              <span className="truncate">Просмотр документов</span>
                                          </span>
                                          <span
                                              className="min-w-6 shrink-0 rounded-full bg-[#EAF5FF] px-2 py-0.5 text-center text-xs font-semibold text-[#0B5E8E] customer:bg-brand-soft customer:text-brand-contrast"
                                              aria-label={`Документов: ${documentCount ?? 0}`}
                                          >
                                              {documentCount ?? 0}
                                          </span>
                                        </button>
                                        <button
                                          type="button"
                                          className="
                                            flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left leading-5
                                            transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40
                                            customer:focus-visible:ring-brand-primary/40
                                            hover:bg-slate-100 customer-dark:hover:bg-surface-hover
                                          "
                                          onClick={() => {
                                              setIsOpen(false);
                                              setPanelView("menu");
                                              setIsUploadDocumentModalOpen(true);
                                          }}
                                        >
                                          <MdUploadFile size={19} className="shrink-0" />
                                          <span className="truncate">Загрузить документ</span>
                                        </button>
                                    </div>
                                  </section>
                                )}
                                <section className="mt-3 border-t border-slate-100 pt-3 customer-dark:border-ui-border">
                                    <h3 className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 customer-dark:text-content-muted">
                                        Сервисы
                                    </h3>
                                    <div className={`grid gap-1 ${availableServices.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"}`}>
                                        {availableServices.map((service) => {
                                            const isSelected = selectedChatTool === service;

                                            return (
                                                <button
                                                    key={service}
                                                    type="button"
                                                    className={`
                                                        flex w-full items-center rounded-2xl px-3 py-2.5 text-left leading-5
                                                        transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40
                                                        customer:focus-visible:ring-brand-primary/40
                                                        ${isSelected
                                                            ? "bg-[#EAF5FF] text-[#0B5E8E] customer:bg-brand-soft customer:text-brand-contrast"
                                                            : "hover:bg-slate-100 customer-dark:hover:bg-surface-hover"}
                                                    `}
                                                    onClick={() => {
                                                        ChatStore.setSelectedChatTool(service);
                                                        setIsOpen(false);
                                                        setPanelView("menu");
                                                    }}
                                                >
                                                    {service}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            </>
                        ) : (
                            <div>
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
                                            trailingAction={{
                                                icon: <MdAdd aria-hidden="true" size={20} />,
                                                label: "Создать сценарий для выбранного проекта",
                                                title: baseScenario
                                                    ? "Новый сценарий"
                                                    : "Базовый сценарий проекта не найден",
                                                disabled: !baseScenario || selectedProjectId === null,
                                                onClick: () => {
                                                    setIsOpen(false);
                                                    setPanelView("menu");
                                                    setIsCreateScenarioModalOpen(true);
                                                },
                                            }}
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
                    onCreated={async (project) => {
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

                        if (!Number.isFinite(projectId)) return;

                        ChatStore.setSelectedContext(projectId);
                        ChatStore.setSelectedScenario(
                            Number.isFinite(scenarioId) ? scenarioId : null,
                        );

                        if (Number.isFinite(scenarioId)) return;

                        await DataStore.getProjectScenarios(projectId);

                        const firstScenario = DataStore.projectScenarios.get(projectId)?.[0];
                        const firstScenarioId = Number(firstScenario?.id);

                        if (
                            ChatStore.selectedContext === projectId
                            && Number.isFinite(firstScenarioId)
                        ) {
                            ChatStore.setSelectedScenario(firstScenarioId);
                        }
                    }}
                />
            )}

            {isCreateScenarioModalOpen && selectedProjectId !== null && baseScenario && (
                <CreateScenarioModal
                    projectId={selectedProjectId}
                    projectName={selectedContextLabel}
                    baseScenarioId={baseScenario.id}
                    onClose={() => setIsCreateScenarioModalOpen(false)}
                    onCreated={(scenario) => {
                        ChatStore.setSelectedContext(selectedProjectId);
                        ChatStore.setSelectedScenario(scenario.id);
                    }}
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
                    onSaved={() => {
                        setDocumentNotice("Документ отправлен на обновление. Изменения появятся в списке после обработки.");
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
