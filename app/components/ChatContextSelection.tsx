import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { IoCheckmark, IoChevronDown } from "react-icons/io5";
import DataStore from "@lib/DataStore";
import ChatStore from "@lib/ChatStore";

type SelectOption = {
    label: string;
    value: string | number;
};

interface CustomSelectProps {
    value?: string | number;
    options: SelectOption[];
    onChange: (value: string | number) => void;
    placeholder?: string;
}

function CustomSelect({ value, options, onChange, placeholder }: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const selectedOption = options.find((option) => option.value === value);

    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: MouseEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleEscape);

        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [isOpen]);

    return (
        <div
            ref={containerRef}
            className="
                group relative w-full min-w-0
                sm:min-w-[18rem] lg:flex-1
            "
        >
            <button
                type="button"
                className={`
                    relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-[1.75rem]
                    border border-white/50 bg-linear-to-r from-[#2797D4] to-[#6CB564]
                    px-6 py-4 text-left text-sm font-medium tracking-[0.01em] text-white
                    shadow-[0_18px_40px_-24px_rgba(7,136,206,0.7)]
                    transition duration-200 hover:-translate-y-0.5
                    focus:outline-none focus:ring-2 focus:ring-white/70
                    ${isOpen ? "ring-2 ring-white/70" : ""}
                `}
                onClick={() => setIsOpen((current) => !current)}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
            >
                <span className="pointer-events-none absolute inset-0 bg-linear-to-r from-white/12 via-transparent to-black/5" />
                <span className="relative truncate">{selectedOption?.label ?? placeholder ?? "Выберите значение"}</span>
                <span className={`relative shrink-0 text-white/85 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
                    <IoChevronDown size={18} />
                </span>
            </button>
            {isOpen && (
                <div
                    className="
                        absolute w-fit left-0 right-0 top-[calc(100%+0.75rem)] z-30 overflow-hidden rounded-3xl
                        border border-slate-200 bg-white/95 p-2 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.32)] backdrop-blur
                    "
                >
                    <ul className="max-h-72 overflow-y-auto" role="listbox">
                        {options.map((option) => {
                            const isSelected = option.value === value;

                            return (
                                <li key={`${option.value}`}>
                                    <button
                                        type="button"
                                        className={`
                                            flex w-full items-center justify-between gap-4 rounded-2xl px-4 py-3 text-left text-sm
                                            transition-colors duration-150
                                            ${isSelected
                                                ? "bg-[#EAF5FF] text-[#0B5E8E]"
                                                : "text-slate-700 hover:bg-slate-100"}
                                        `}
                                        onClick={() => {
                                            onChange(option.value);
                                            setIsOpen(false);
                                        }}
                                    >
                                        <span className="truncate">{option.label}</span>
                                        <span className={`shrink-0 ${isSelected ? "text-[#0B5E8E]" : "text-transparent"}`}>
                                            <IoCheckmark size={18} />
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}

const ChatContextSelection = observer(() => {
    const { userProjects, projectScenarios, nonProjectStages } = DataStore;
    const { selectedContext, selectedStage, selectedScenario } = ChatStore;
    const [, setSelectedContext] = useState<string | number>("nonproject");

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

    const selectedScenarioValue = selectedScenario ?? scenarioOptions[0]?.value;

    return (
        <div className="flex w-full max-w-5xl flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-6">
            <CustomSelect
                value={selectedContext}
                options={contextOptions}
                onChange={(value) => {
                    setSelectedContext(value === "nonproject" ? value : Number(value));
                    ChatStore.setSelectedContext(value);
                    ChatStore.setSelectedScenario(undefined);
                }}
            />
            {selectedContext !== "nonproject" && scenarioOptions.length > 0 && (
                <CustomSelect
                    value={selectedScenarioValue}
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
        </div>
    );
});

export default ChatContextSelection;
