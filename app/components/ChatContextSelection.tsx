import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { IoCheckmark, IoChevronDown } from "react-icons/io5";
import { MdOutlineCancel } from "react-icons/md";
import DataStore from "@lib/DataStore";
import ChatStore from "@lib/ChatStore";
import CustomSelect, { type SelectOption } from "@components/ui/Select";


const ChatContextSelection = observer(() => {
    const { userProjects, projectScenarios, nonProjectStages } = DataStore;
    const {
        chatMessages,
        selectedContext,
        selectedStage,
        selectedScenario,
        selectedChatTool,
        setSelectedChatTool
    } = ChatStore;
    const isContextSelectionVisible = !chatMessages.length;

    useEffect(() => {
        if (selectedContext === "nonproject") return;

        const projectId = Number(selectedContext);
        if (Number.isNaN(projectId) || projectScenarios.has(projectId)) return;

        DataStore.getProjectScenarios(projectId);
    }, [selectedContext, projectScenarios]);

    const contextOptions: SelectOption[] = [
        { label: "Вне проекта", value: "nonproject" },
        ...(userProjects ?? []).map((project: any) => ({
            label: project.name,
            value: project.id,
        })),
    ];

    const currentProjectScenarios = selectedContext === "nonproject"
        ? []
        : (projectScenarios.get(Number(selectedContext)) ?? []);

    const scenarioOptions: SelectOption[] = (currentProjectScenarios as any[]).map((scenario) => ({
        label: scenario.name,
        value: scenario.id,
    }));

    const stageOptions: SelectOption[] = (nonProjectStages ?? []).map((stage) => ({
        label: stage,
        value: stage,
    }));

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

    return (
        <div className="flex w-full max-w-5xl flex-row flex-wrap items-start justify-start gap-6 mt-2">
            {isContextSelectionVisible && (
                <>
                    <CustomSelect
                        value={selectedContext}
                        options={contextOptions}
                        onChange={(value) => {
                            const nextContext = value === "nonproject" ? value : Number(value);
                            ChatStore.setSelectedContext(nextContext);
                        // ChatStore.setSelectedScenario(null);
                    }}
                />
                    {selectedContext !== "nonproject" && scenarioOptions.length > 0 && (
                        <CustomSelect
                            value={selectedScenario ?? scenarioOptions[0]?.value}
                            options={scenarioOptions}
                            onChange={(value) => {
                                ChatStore.setSelectedScenario(Number(value));
                            }}
                            placeholder="Выберите сценарий"
                        />
                    )}
                    {selectedContext === "nonproject" && stageOptions.length > 0 && (
                        <CustomSelect
                            value={selectedStage}
                            options={stageOptions}
                            onChange={(value) => {
                                ChatStore.setSelectedStage(String(value));
                            }}
                        />
                    )}
                </>
            )}
            {selectedChatTool && (
                <div
                    className="
                        group flex items-center self-center gap-2 rounded-2xl bg-[#EAF5FF] px-4 py-2 text-sm font-medium text-[#0B5E8E]
                    "
                >
                    <button
                        className="group-hover:text-red-600"
                        onClick={() => setSelectedChatTool(null)}
                    >
                        <MdOutlineCancel size={18} />
                    </button>
                    {selectedChatTool}
                </div>
            )}
        </div>
    );
});

export default ChatContextSelection;
