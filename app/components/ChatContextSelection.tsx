import { useEffect, useState } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { observer } from "mobx-react-lite";
import { IoChevronDown } from "react-icons/io5";
import DataStore from "@lib/DataStore";
import ChatStore from "@lib/ChatStore";

const ChatContextSelection = observer(() => {
    const { userProjects, projectScenarios, nonProjectStages } = DataStore;
    const { selectedContext, selectedStage } = ChatStore;
    const [_, setSelectedContext] = useState<string | number>("nonproject");
    const selectWrapperClassName = `
        group relative w-full min-w-0 overflow-hidden rounded-[1.75rem]
        border border-white/50 bg-linear-to-r from-[#2797D4] to-[#6CB564]
        shadow-[0_18px_40px_-24px_rgba(7,136,206,0.7)]
        transition-transform duration-200
        hover:-translate-y-0.5
        sm:min-w-[18rem] lg:flex-1
    `;
    const selectClassName = `
        disable-style w-full min-w-0 cursor-pointer rounded-[1.75rem]
        bg-transparent px-6 py-4 pr-14
        text-sm font-medium tracking-[0.01em] text-white
        outline-none ring-0
    `;

    const renderSelect = (selectProps: SelectHTMLAttributes<HTMLSelectElement>, options: ReactNode) => (
        <div className={selectWrapperClassName}>
            <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-white/12 via-transparent to-black/5" />
            <select {...selectProps} className={selectClassName}>
                {options}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-5 flex items-center text-white/85 transition-transform duration-200 group-focus-within:translate-y-0.5">
                <IoChevronDown size={18} />
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-[1.75rem] ring-0 ring-white/70 transition group-focus-within:ring-2" />
        </div>
    );

    useEffect(() => {
        if (selectedContext === "nonproject") return;

        const projectId = Number(selectedContext);
        if (Number.isNaN(projectId) || projectScenarios.has(projectId)) return;

        DataStore.getProjectScenarios(projectId);
    }, [selectedContext, projectScenarios]);

    return (
        <div className="flex w-full max-w-5xl flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-6">
            {renderSelect(
                {
                    value: selectedContext,
                    onChange: (e) => {
                        const value = e.target.value;
                        setSelectedContext(value === "nonproject" ? value : Number(value));
                        ChatStore.setSelectedContext(value);
                    },
                },
                <>
                    <option value="nonproject">Вне проекта</option>
                    {
                        (userProjects ?? []).map(
                            (project: any, ind: number) => (
                                <option key={`option-${ind}`} value={project.id}>
                                    {project.name}
                                </option>
                            )
                        )
                    }
                </>
            )}
            {
                selectedContext !== "nonproject" && projectScenarios.has(Number(selectedContext)) && (
                    renderSelect(
                        {
                            onChange: (e) => {
                                const value = e.target.value;
                                ChatStore.setSelectedScenario(Number(value));
                            },
                        },
                        <>
                            {(projectScenarios.get(Number(selectedContext)) ?? []).map((scenario: any, ind: number) => (
                                <option key={`sub-option-${ind}`} value={scenario.id}>
                                    {scenario.name}
                                </option>
                            ))}
                        </>
                    )
                )
            }
            {
                selectedContext === "nonproject" && nonProjectStages && (
                    renderSelect(
                        {
                            defaultValue: "Общее",
                            onChange: (e) => {
                                const value = e.target.value;
                                ChatStore.setSelectedStage(value);
                            },
                        },
                        <>
                            {nonProjectStages.map((stage, ind) => (
                                <option key={`stage-option-${ind}`} value={stage}>
                                    {stage}
                                </option>
                            ))}
                        </>
                    )
                )
            }
        </div>
    )
});

export default ChatContextSelection;
