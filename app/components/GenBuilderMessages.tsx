import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { MdCheck } from "react-icons/md";
import { IoInformationCircleOutline } from "react-icons/io5";
import ChatStore from "@lib/ChatStore";
import type {
    GenBuilderClarificationMessage,
    GenBuilderSavePromptMessage,
    GenBuilderSetupMessage,
} from "@lib/genbuilder/types";
import Select from "@components/ui/Select";
import FileUpload from "@components/FileUpload";

function getSetupStatusLabel(status: GenBuilderSetupMessage["status"]) {
    switch (status) {
        case "loading":
            return "Загрузка источников";
        case "validating_file":
            return "Проверка файла";
        case "ready":
            return "Готово к запуску";
        case "awaiting_parameters":
            return "Ожидает параметры";
        case "submitting":
            return "Запуск";
        case "running":
            return "Выполняется";
        case "finished":
            return "Завершено";
        case "error":
            return "Ошибка";
    }
}

function getSetupButtonLabel(status: GenBuilderSetupMessage["status"]) {
    switch (status) {
        case "awaiting_parameters":
            return "Ожидает ввод";
        case "submitting":
        case "running":
            return "Выполняется";
        case "finished":
            return "Готово";
        case "error":
            return "Ошибка";
        default:
            return "Запустить";
    }
}

function getSavePromptTitle(status: GenBuilderSavePromptMessage["status"]) {
    switch (status) {
        case "saved":
            return "Застройка сохранена";
        case "declined":
            return "Застройка не сохранена";
        case "error":
            return "Не удалось сохранить всю застройку";
        case "pending":
        case "saving":
            return "Сохранить застройку в сценарии?";
    }
}

export const GenBuilderSetupMessageCard = observer(({
    setup,
}: {
    setup: GenBuilderSetupMessage;
}) => {
    const isFileMode = setup.mode === "files";
    const yearOptions = useMemo(
        () => Array.from(new Set(setup.sources.map((source) => source.year)))
            .sort((left, right) => right - left),
        [setup.sources],
    );
    const [selectedYear, setSelectedYear] = useState<number | undefined>(
        setup.selectedYear ?? yearOptions[0],
    );
    const sourceOptions = useMemo(
        () => setup.sources
            .filter((source) => source.year === selectedYear)
            .map((source) => source.source),
        [selectedYear, setup.sources],
    );
    const [selectedSource, setSelectedSource] = useState<string | undefined>(
        setup.selectedSource ?? sourceOptions[0],
    );
    const canStart = setup.status === "ready"
        && selectedYear !== undefined
        && !!selectedSource;
    const statusLabel = isFileMode && setup.status === "ready"
        ? "Загрузите файл"
        : getSetupStatusLabel(setup.status);
    const buttonLabel = getSetupButtonLabel(setup.status);

    const handleStart = () => {
        if (!canStart || selectedYear === undefined || !selectedSource) {
            return;
        }

        ChatStore.requestGenBuilderParameters(setup.id, selectedYear, selectedSource);
    };

    useEffect(() => {
        if (setup.selectedYear !== undefined) {
            setSelectedYear(setup.selectedYear);
            return;
        }

        if (yearOptions.length) {
            setSelectedYear((currentYear) => currentYear ?? yearOptions[0]);
        }
    }, [setup.selectedYear, yearOptions]);

    useEffect(() => {
        if (!sourceOptions.length) {
            setSelectedSource(undefined);
            return;
        }

        if (!selectedSource || !sourceOptions.includes(selectedSource)) {
            setSelectedSource(sourceOptions[0]);
        }
    }, [selectedSource, sourceOptions]);

    return (
        <div className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 customer-dark:border-ui-border customer-dark:bg-surface-muted customer-dark:text-content-primary">
            <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-900 customer-dark:text-content-primary">
                    Сгенерировать застройку
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500 customer-dark:bg-surface-raised customer-dark:text-content-muted">
                    {statusLabel}
                </span>
            </div>
            {isFileMode ? (
                <FileUpload
                    label="Файл функциональных зон"
                    fileName={setup.blocksFileName}
                    disabled={setup.status === "validating_file" || setup.status === "submitting" || setup.status === "running" || setup.status === "finished"}
                    accept=".geojson,.json,application/geo+json,application/json"
                    onFileSelected={(file) => void ChatStore.submitGenBuilderBlocksFile(setup.id, file)}
                />
            ) : (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                    <label className="flex min-w-0 flex-col gap-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-500 customer-dark:text-content-muted">
                        Год
                        <Select
                            value={selectedYear ?? ""}
                            options={yearOptions.map((year) => ({
                                label: String(year),
                                value: year,
                            }))}
                            onChange={(value) => setSelectedYear(Number(value))}
                            block
                        />
                    </label>
                    <label className="flex min-w-0 flex-col gap-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-500 customer-dark:text-content-muted">
                        Источник
                        <Select
                            value={selectedSource ?? ""}
                            options={sourceOptions.map((source) => ({
                                label: source,
                                value: source,
                            }))}
                            onChange={(value) => setSelectedSource(String(value))}
                            block
                        />
                    </label>
                    <button
                        type="button"
                        className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-2xl bg-brand-primary px-4 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-surface-disabled"
                        onClick={handleStart}
                        disabled={!canStart}
                    >
                        <MdCheck size={18} />
                        {buttonLabel}
                    </button>
                </div>
            )}
            {isFileMode && setup.status === "awaiting_parameters" && (
                <div className="text-xs text-slate-500 customer-dark:text-content-muted">
                    Файл проверен. Введите параметры застройки в поле сообщения.
                </div>
            )}
            {setup.errorText && (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700 customer:border-danger-border customer:bg-danger-soft customer:text-danger-content">
                    {setup.errorText}
                </div>
            )}
        </div>
    );
});

export const GenBuilderClarificationMessageCard = observer(({
    clarification,
}: {
    clarification: GenBuilderClarificationMessage;
}) => (
    <div className="flex w-full flex-col gap-4">
        <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 text-blue-500 customer:text-brand-primary">
                <IoInformationCircleOutline size={22} />
            </span>
            <div className="min-w-0">
                <div className="text-sm font-semibold text-blue-800 customer-dark:text-content-primary">
                    Уточнение
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-blue-950 customer-dark:text-content-secondary">
                    {clarification.text}
                </div>
            </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-blue-200 pt-4 customer-dark:border-ui-border">
            <div className="text-sm font-medium text-blue-950 customer-dark:text-content-primary">
                Существующие здания
            </div>
            <FileUpload
                label="GeoJSON существующих зданий"
                fileName={clarification.existingBuildingsFileName}
                disabled={!!clarification.submitted}
                accept=".geojson,application/geo+json"
                onFileSelected={(file) => ChatStore.submitGenBuilderExistingBuildingsFile(
                    clarification.setupId,
                    file,
                )}
            />
            <button
                type="button"
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    clarification.existingBuildingsChoice === "skip"
                        ? "border-brand-primary bg-brand-primary text-white"
                        : "border-blue-300 bg-white text-blue-800 hover:bg-blue-100 customer-dark:border-ui-border-strong customer-dark:bg-surface-raised customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover"
                }`}
                onClick={() => ChatStore.skipGenBuilderExistingBuildings(clarification.setupId)}
                disabled={!!clarification.submitted}
                aria-pressed={clarification.existingBuildingsChoice === "skip"}
            >
                {clarification.existingBuildingsChoice === "skip" && <MdCheck size={18} />}
                Не загружать существующие здания
            </button>
        </div>
    </div>
));

export const GenBuilderSavePromptCard = observer(({
    prompt,
}: {
    prompt: GenBuilderSavePromptMessage;
}) => {
    const isPending = prompt.status === "pending";
    const isSaving = prompt.status === "saving";

    return (
        <div className="flex w-full flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-blue-950 customer-dark:border-ui-border customer-dark:bg-surface-muted customer-dark:text-content-primary">
            <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 text-blue-500 customer:text-brand-primary">
                    <IoInformationCircleOutline size={22} />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="font-semibold text-blue-900 customer-dark:text-content-primary">
                        {getSavePromptTitle(prompt.status)}
                    </div>

                    {prompt.status === "saved" && prompt.result && (
                        <div className="mt-1 text-sm leading-6">
                            Сохранено объектов: {prompt.result.savedCount}.
                            {prompt.result.skippedCount > 0 && (
                                <> Пропущено объектов: {prompt.result.skippedCount}.</>
                            )}
                        </div>
                    )}

                    {prompt.errorText && (
                        <div className="mt-1 text-sm leading-6 text-red-700 customer:text-danger-content">
                            {prompt.errorText}
                        </div>
                    )}
                </div>
            </div>

            {(isPending || isSaving) && (
                <div className="flex flex-wrap gap-2 pl-9">
                    <button
                        type="button"
                        className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-surface-disabled"
                        onClick={() => ChatStore.saveGenBuilderResult(prompt.id)}
                        disabled={isSaving}
                    >
                        {isSaving ? "Сохраняем..." : "Да, сохранить"}
                    </button>
                    <button
                        type="button"
                        className="rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:text-blue-300 customer-dark:border-ui-border-strong customer-dark:bg-surface-raised customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover customer-dark:disabled:text-content-disabled"
                        onClick={() => ChatStore.declineGenBuilderResult(prompt.id)}
                        disabled={isSaving}
                    >
                        Нет
                    </button>
                </div>
            )}
        </div>
    );
});
