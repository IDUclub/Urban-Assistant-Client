import { useState } from "react";
import { observer } from "mobx-react-lite";
import ChatStore from "@lib/ChatStore";
import NewUser from "@lib/AuthStore";
import DataStore from "@lib/DataStore";
import ChatComponent from "@components/Chat";
import ChatContextSelection from "@components/ChatContextSelection";
import MapView from "@components/MapView";

const ChatSection = observer(() => {
    const { firstName } = NewUser;
    const { chatMessages, selectedContext, selectedStage } = ChatStore;
    const { userProjects } = DataStore;
    const [isMapExpanded, setIsMapExpanded] = useState(false);

    const hasGeoJsonMessages = chatMessages.some((message) => message.message.type === "geojson");
    const selectedProject = userProjects?.find((project) => project.id === Number(selectedContext));
    const mapHeight = "50vh";
    const collapsedMapOffset = "25vh";
    const visibleMapOffset = hasGeoJsonMessages
        ? (isMapExpanded ? mapHeight : collapsedMapOffset)
        : "4px";
    const selectedContextLabel = selectedContext === "nonproject"
        ? `Вне проекта / ${selectedStage}`
        : `Проект / ${selectedProject?.name ?? "Без названия"}`;

    return (
        <section className="relative flex h-screen w-full flex-col overflow-hidden bg-white">
            {chatMessages.length ? (
                <div className="sticky top-0 z-10 shrink-0 border-b border-gray-200 bg-white/95 px-8 py-4 backdrop-blur">
                    <div className="mx-auto flex w-fit max-w-7xl items-center gap-6">
                        <span className="truncate text-sm font-medium text-gray-500">
                            {selectedContextLabel}
                        </span>
                    </div>
                </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-hidden">
                <div
                    className="mx-auto flex h-full w-full max-w-7xl flex-col px-8 pb-6 pt-6 transition-[padding-bottom] duration-300 ease-out"
                    style={{ paddingBottom: `calc(1.5rem + ${visibleMapOffset})` }}
                >
                    <div className="min-h-0 flex-1 overflow-hidden">
                        <div className="mx-auto flex h-full w-full max-w-5xl flex-col">
                            <ChatComponent
                                emptyState={
                                    <div className="flex flex-col items-center gap-8 py-4 text-center">
                                        <h1 className="font-cabin text-[32px] font-normal text-[#383432] lg:text-[48px] mb-1.5">
                                            <span className="bg-linear-to-r from-[#0788CE] via-[#17A3D0] to-[#A5C21B] bg-clip-text text-transparent">
                                                Привет{firstName ? `, ${firstName}` : ""}!
                                            </span>
                                            <span> Чем я могу помочь?</span>
                                        </h1>
                                        <ChatContextSelection />
                                    </div>
                                }
                            />
                        </div>
                    </div>
                </div>
            </div>
            {hasGeoJsonMessages && (
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
