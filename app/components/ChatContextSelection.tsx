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
    const [searchQuery, setSearchQuery] = useState("");
    const containerRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const [menuStyle, setMenuStyle] = useState<{
        maxHeight: string;
        top?: string;
        bottom?: string;
    }>({
        maxHeight: "min(24rem, 50vh)",
        top: "calc(100% + 0.75rem)",
    });
    const selectedOption = options.find((option) => option.value == value);
    const normalizedSearchQuery = searchQuery.trim().toLowerCase();
    const filteredOptions = normalizedSearchQuery
        ? options.filter((option) => option.label.toLowerCase().includes(normalizedSearchQuery))
        : options;

    useEffect(() => {
        if (!isOpen) return;

        setSearchQuery("");
        searchInputRef.current?.focus();

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

    useEffect(() => {
        if (!isOpen) return;

        const updateMenuPosition = () => {
            const triggerRect = triggerRef.current?.getBoundingClientRect();
            if (!triggerRect) return;

            const viewportPadding = 16;
            const menuGap = 12;
            const availableBelow = window.innerHeight - triggerRect.bottom - viewportPadding - menuGap;
            const availableAbove = triggerRect.top - viewportPadding - menuGap;
            const shouldOpenUpwards = availableBelow < 340 && availableAbove > availableBelow;
            const nextMaxHeight = Math.max(
                160,
                shouldOpenUpwards ? availableAbove : availableBelow,
            );

            setMenuStyle({
                maxHeight: `${Math.floor(nextMaxHeight)}px`,
                top: shouldOpenUpwards ? undefined : "calc(100% + 0.75rem)",
                bottom: shouldOpenUpwards ? "calc(100% + 0.75rem)" : undefined,
            });
        };

        updateMenuPosition();
        window.addEventListener("resize", updateMenuPosition);
        window.addEventListener("scroll", updateMenuPosition, true);

        return () => {
            window.removeEventListener("resize", updateMenuPosition);
            window.removeEventListener("scroll", updateMenuPosition, true);
        };
    }, [isOpen]);

    return (
        <div
            ref={containerRef}
            className="
                group relative w-fit max-w-full shrink-0
            "
        >
            <div
                ref={triggerRef}
                className="relative w-fit"
            >
                <div className="absolute -inset-0.75 -z-10 rounded-3xl bg-linear-to-r from-[#0788CE] via-[#17A3D0] to-[#A5C21B] opacity-30 blur-sm"></div>
                <button
                    type="button"
                    className={`
                        relative flex w-fit max-w-70 items-center justify-between gap-4 overflow-hidden rounded-[1.75rem]
                        bg-white border border-gray-500/30
                        px-6 py-2.5 text-left text-sm font-medium tracking-[0.01em] text-black
                        transition duration-200 hover:-translate-y-0.5
                        focus:outline-none focus:ring-2 focus:ring-white/70
                        ${isOpen ? "ring-2 ring-white/70" : ""}
                    `}
                    onClick={() => setIsOpen((current) => !current)}
                    aria-expanded={isOpen}
                    aria-haspopup="listbox"
                >
                    {/* <span className="pointer-events-none absolute inset-0 bg-linear-to-r from-white/12 via-transparent to-black/5" /> */}
                    <span className="relative truncate">{selectedOption?.label ?? placeholder ?? "Выберите значение"}</span>
                    <span className={`relative shrink-0 text-black transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
                        <IoChevronDown size={18} />
                    </span>
                </button>
            </div>            
            {isOpen && (
                <div
                    style={menuStyle}
                    className="
                        absolute left-0 right-0 z-30 flex w-fit max-w-[min(60vw,24rem)] min-w-full flex-col overflow-hidden rounded-3xl
                        border border-slate-200 bg-white/95 p-2 shadow-[0_24px_20px_-24px_rgba(15,23,42,0.32)] backdrop-blur
                    "
                >
                    <div className="px-2 pb-2">
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            onKeyDown={(event) => event.stopPropagation()}
                            placeholder="Поиск"
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-[#0788CE]"
                        />
                    </div>
                    <ul className="min-h-0 max-h-80 flex-1 overflow-y-auto" role="listbox">
                        {filteredOptions.map((option) => {
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
                        {filteredOptions.length === 0 && (
                            <li className="px-4 py-3 text-sm text-slate-500">
                                Ничего не найдено
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}

const ChatContextSelection = observer(() => {
    const { userProjects, projectScenarios, nonProjectStages } = DataStore;
    const { selectedContext, selectedStage, selectedScenario } = ChatStore;

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
        <div className="flex w-full max-w-5xl flex-row flex-wrap items-start justify-start gap-6">
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
        </div>
    );
});

export default ChatContextSelection;
