import { useEffect } from "react";
import useResizableMap from "@/hooks/useResizableMap";
import { observer } from "mobx-react-lite";
import ChatStore from "@lib/ChatStore";
import NewUser from "@lib/AuthStore";
import DataStore from "@lib/DataStore";
import MapStore from "@lib/MapStore";
import ChatComponent from "@components/Chat";
import MapView from "@components/MapView";
import { SHOW_CONTEXT_IDS } from "@/config";

function formatContextId(id: number | null, label = "ID") {
    if (id === null || !Number.isSafeInteger(id) || id <= 0) {
        return "";
    }

    return ` (${label}: ${id})`;
}

const ChatSection = observer(() => {
    const { firstName } = NewUser;
    const { chatMessages, parsedContext, selectedContext, selectedScenario, isUserChatOpening } = ChatStore;
    const { userProjects, projectScenarios } = DataStore;
    const { isMapLayersAvailable, facadeScene } = MapStore;
    const { mapHeight, isMapExpanded, expandMap, toggleMapExpanded, resizeHandleProps } = useResizableMap();

    useEffect(() => {
        if (facadeScene?.resultId) {
            expandMap();
        }
    }, [facadeScene?.resultId, expandMap]);

    // const hasGeoJsonMessages = chatMessages.some((message) => message.message.type === "geojson");
    const selectedProject = userProjects?.find((project) => project.id === Number(selectedContext));
    const selectedScenarioItem = selectedProject?.id
        ? projectScenarios.get(selectedProject.id)?.find((scenario) => scenario.id === selectedScenario)
        : undefined;
    const visibleMapOffset = isMapLayersAvailable
        ? mapHeight
        : "4px";
    const selectedContextLabel = selectedContext === "nonproject"
        ? "Вне проекта"
        : parsedContext ?? `${selectedProject?.name ?? "Без названия"} / ${selectedScenarioItem?.name ?? "Сценарий"}`;
    const showContextIds = SHOW_CONTEXT_IDS && selectedContext !== "nonproject";
    const projectId = selectedContext === "nonproject" ? null : Number(selectedContext);
    const projectIdText = showContextIds ? formatContextId(projectId, "ID проекта") : "";
    const scenarioIdText = showContextIds ? formatContextId(selectedScenario, "ID сценария") : "";
    const contextTitle = `${selectedContextLabel}${projectIdText}${scenarioIdText}`;
    const contextLabel = showContextIds && !parsedContext ? <>
        {selectedProject?.name ?? "Без названия"}
        <span className="text-xs font-normal opacity-70">{formatContextId(projectId)}</span>
        {" / "}
        {selectedScenarioItem?.name ?? "Сценарий"}
        <span className="text-xs font-normal opacity-70">{formatContextId(selectedScenario)}</span>
    </> : <>
        {selectedContextLabel}
        <span className="text-xs font-normal opacity-70">{projectIdText}{scenarioIdText}</span>
    </>;

    return (
        <section className="relative flex h-screen w-full flex-col overflow-clip bg-white customer:bg-surface-page">
            {chatMessages.length ? (
                <div className="sticky top-0 z-10 shrink-0 border-b border-gray-200 bg-white/95 px-8 py-4 backdrop-blur customer-dark:border-ui-border customer-dark:bg-surface-panel/95">
                    <div className="mx-auto flex w-fit max-w-full items-center gap-6">
                        <span className="truncate text-sm font-medium text-gray-500 customer-dark:text-content-muted" title={contextTitle}>
                            {contextLabel}
                        </span>
                    </div>
                </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-hidden">
                <div
                    className="mx-auto flex h-full w-full max-w-7xl flex-col px-8 pb-6 pt-2"
                    style={{ paddingBottom: `calc(1.5rem + ${visibleMapOffset})` }}
                >
                    <div className="min-h-0 flex-1 overflow-hidden">
                        <div className="mx-auto flex h-full w-full max-w-5xl flex-col">
                            {isUserChatOpening ? (
                                <div className="flex h-full items-center justify-center text-sm font-medium text-gray-500 customer-dark:text-content-muted">
                                    Загрузка чата...
                                </div>
                            ) : (
                                <ChatComponent
                                    emptyState={
                                        <div className="flex flex-col items-center gap-8 py-4 text-center">
                                            <h1 className="mb-1.5 max-w-full font-cabin text-[22px] font-normal leading-tight text-[#383432] customer-dark:text-content-primary sm:text-[14px] md:text-[26px] lg:text-[32px] xl:text-[42px]">
                                                <span className="brand-text-gradient bg-clip-text text-transparent">
                                                    Привет{firstName ? `, ${firstName}` : ""}!
                                                </span>
                                                <span> Чем я могу помочь?</span>
                                            </h1>
                                        </div>
                                    }
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {isMapLayersAvailable && (
                <div
                    className="absolute inset-x-0 bottom-0 px-8 pb-6 pt-4"
                    style={{
                        height: mapHeight,
                        pointerEvents: "auto",
                    }}
                >
                    <div {...resizeHandleProps} />
                    <div className="mx-auto h-full w-full max-w-7xl">
                        <MapView
                            isExpanded={isMapExpanded}
                            onToggleExpanded={toggleMapExpanded}
                        />
                    </div>
                </div>
            )}
        </section>
    );
});

export default ChatSection;
