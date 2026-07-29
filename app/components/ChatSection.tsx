import { useState } from "react";
import { observer } from "mobx-react-lite";
import ChatStore from "@lib/ChatStore";
import NewUser from "@lib/AuthStore";
import DataStore from "@lib/DataStore";
import MapStore from "@lib/MapStore";
import ChatComponent from "@components/Chat";
import ChatContextSelection from "@components/ChatContextSelection";
import MapView from "@components/MapView";

const ChatSection = observer(() => {
    const { firstName } = NewUser;
    const { chatMessages, parsedContext, selectedContext, selectedScenario, isUserChatOpening } = ChatStore;
    const { userProjects, projectScenarios } = DataStore;
    const { isMapLayersAvailable } = MapStore;
    const [isMapExpanded, setIsMapExpanded] = useState(false);

    // const hasGeoJsonMessages = chatMessages.some((message) => message.message.type === "geojson");
    const selectedProject = userProjects?.find((project) => project.id === Number(selectedContext));
    const selectedSceanrioItem = selectedProject?.id && projectScenarios.get(selectedProject.id)?.find((scenario: any) => scenario.id == selectedScenario);
    const mapHeight = "50vh";
    const collapsedMapOffset = "25vh";
    const visibleMapOffset = isMapLayersAvailable
        ? (isMapExpanded ? mapHeight : collapsedMapOffset)
        : "4px";
    const selectedContextLabel = parsedContext ?? (
        selectedContext === "nonproject"
        ? "Вне проекта"
        : `${selectedProject?.name ?? "Без названия"} / ${selectedSceanrioItem?.name ?? "Сценарий"}`
    );

    return (
        <section className="relative flex h-screen w-full flex-col overflow-hidden bg-white customer:bg-surface-page">
            {chatMessages.length ? (
                <div className="sticky top-0 z-10 shrink-0 border-b border-gray-200 bg-white/95 px-8 py-4 backdrop-blur customer-dark:border-ui-border customer-dark:bg-surface-panel/95">
                    <div className="mx-auto flex w-fit max-w-7xl items-center gap-6">
                        <span className="truncate text-sm font-medium text-gray-500 customer-dark:text-content-muted">
                            {selectedContextLabel}
                        </span>
                    </div>
                </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-hidden">
                <div
                    className="mx-auto flex h-full w-full max-w-7xl flex-col px-8 pb-6 pt-2 transition-[padding-bottom] duration-300 ease-out"
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
                    className="absolute inset-x-0 bottom-0 px-8 pb-6 pt-4 transition-transform duration-300 ease-out"
                    style={{
                        height: mapHeight,
                        transform: isMapExpanded ? "translateY(0)" : "translateY(50%)",
                        pointerEvents: "auto",
                    }}
                >
                    <div className="mx-auto h-full w-full max-w-7xl">
                        <MapView
                            isExpanded={isMapExpanded}
                            onToggleExpanded={() => setIsMapExpanded((current) => !current)}
                        />
                    </div>
                </div>
            )}
        </section>
    );
});

export default ChatSection;
