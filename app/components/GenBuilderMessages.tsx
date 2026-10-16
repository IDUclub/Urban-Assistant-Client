import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { MdCheck } from "react-icons/md";
import { IoInformationCircleOutline } from "react-icons/io5";
import ChatStore from "@lib/ChatStore";
import AuthStore from "@lib/AuthStore";
import { getFacadeStyles, getFacadeStylePreview, type FacadeStyle } from "@lib/genbuilder/client";
import type {
    GenBuilder3DPromptMessage,
    GenBuilderClarificationMessage,
    GenBuilderSavePromptMessage,
    GenBuilderSetupMessage,
} from "@lib/genbuilder/types";
import Select from "@components/ui/Select";
import FileUpload from "@components/FileUpload";
import FacadeStylePreview from "@components/FacadeStylePreview";

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
        case "awaiting_3d_choice":
            return "Ожидает выбор 3D";
        case "awaiting_facade_style":
            return "Ожидает стиль";
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
        case "awaiting_3d_choice":
        case "awaiting_facade_style":
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
                    Генерация застройки
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500 customer-dark:bg-surface-raised customer-dark:text-content-muted">
                    {statusLabel}
                </span>
            </div>
            {isFileMode ? (
                <FileUpload
                    label="Файл функциональных зон"
                    fileName={setup.blocksFileName}
                    disabled={setup.status === "validating_file" || setup.status === "awaiting_3d_choice" || setup.status === "awaiting_facade_style" || setup.status === "submitting" || setup.status === "running" || setup.status === "finished"}
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
                    Файл выбран. Введите параметры застройки в поле сообщения.
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

export const GenBuilder3DPromptCard = observer(({ prompt }: { prompt: GenBuilder3DPromptMessage }) => {
    const [styles, setStyles] = useState<FacadeStyle[]>([]);
    const [stylesLoading, setStylesLoading] = useState(false);
    const [stylesError, setStylesError] = useState<string>();
    const [retryCount, setRetryCount] = useState(0);
    const [selectedStyleId, setSelectedStyleId] = useState<string>();
    const [previewAttempt, setPreviewAttempt] = useState(0);
    const [previewUrl, setPreviewUrl] = useState<string>();
    const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const selectedStyle = styles.find((style) => style.id === selectedStyleId);

    useEffect(() => {
        if (prompt.status !== "styles") return;
        const controller = new AbortController();
        const baseUrl = import.meta.env.VITE_GENBUILDER_API;
        const token = AuthStore.accessToken;

        if (!baseUrl || !token) {
            setStylesLoading(false);
            setStylesError("Не удалось подключиться к сервису стилей фасада.");
            return;
        }

        setStylesLoading(true);
        setStylesError(undefined);
        void getFacadeStyles(baseUrl, token, controller.signal)
            .then((items) => {
                if (controller.signal.aborted) return;
                setStyles(items);
                if (!items.length) setStylesError("Стили фасада пока недоступны.");
            })
            .catch(() => {
                if (!controller.signal.aborted) setStylesError("Не удалось загрузить стили фасада.");
            })
            .finally(() => {
                if (!controller.signal.aborted) setStylesLoading(false);
            });

        return () => controller.abort();
    }, [prompt.status, retryCount]);

    useEffect(() => {
        if (prompt.status !== "styles" || !selectedStyleId) return;
        const controller = new AbortController();
        const baseUrl = import.meta.env.VITE_GENBUILDER_API;
        const token = AuthStore.accessToken;
        setPreviewStatus("loading");
        if (!baseUrl || !token) {
            setPreviewStatus("error");
            return;
        }

        void getFacadeStylePreview(baseUrl, token, selectedStyleId, controller.signal)
            .then((blob) => {
                if (controller.signal.aborted) return;
                setPreviewUrl(URL.createObjectURL(blob));
                setPreviewStatus("ready");
            })
            .catch(() => {
                if (!controller.signal.aborted) setPreviewStatus("error");
            });

        return () => controller.abort();
    }, [prompt.status, selectedStyleId, previewAttempt]);

    useEffect(() => () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
    }, [previewUrl]);

    useEffect(() => {
        if (prompt.status !== "styles") {
            setSelectedStyleId(undefined);
            setPreviewUrl(undefined);
            setPreviewStatus("idle");
        }
    }, [prompt.status]);

    const selectStyle = (styleId: string) => {
        setPreviewUrl(undefined);
        setPreviewStatus("loading");
        setSelectedStyleId(styleId);
        setPreviewAttempt((attempt) => attempt + 1);
    };

    if (prompt.status === "submitted") {
        if (!prompt.selectedStyleName) return null;

        return (
          <div className="flex w-full flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-blue-950 customer-dark:border-ui-border customer-dark:bg-surface-muted customer-dark:text-content-primary">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 text-blue-500 customer:text-brand-primary">
                <IoInformationCircleOutline size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-blue-900 customer-dark:text-content-primary">
                  {`3D-застройка: стиль «${prompt.selectedStyleName}».`}
                </div>
              </div>
            </div>
          </div>
        );
    }

    if (prompt.status === "choice") {
        return (
          <div className="flex w-full flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-blue-950 customer-dark:border-ui-border customer-dark:bg-surface-muted customer-dark:text-content-primary">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 text-blue-500 customer:text-brand-primary">
                <IoInformationCircleOutline size={22} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-blue-900 customer-dark:text-content-primary">
                  Хотите отобразить застройку в 3D?
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pl-9">
              <button type="button" className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover" onClick={() => ChatStore.chooseGenBuilder3D(prompt.setupId, true)}>Да</button>
              <button type="button" className="rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-800 hover:bg-blue-100 customer-dark:border-ui-border-strong customer-dark:bg-surface-raised customer-dark:text-content-secondary" onClick={() => ChatStore.chooseGenBuilder3D(prompt.setupId, false)}>Нет</button>
            </div>
          </div>
        );
    }

    return (
        <div className="w-full overflow-hidden rounded-[22px] border border-slate-200 bg-white text-slate-900 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)] customer-dark:border-ui-border customer-dark:bg-surface-panel customer-dark:text-content-primary">
            <div className="flex min-h-16 items-center border-b border-slate-200 px-5 py-4 customer-dark:border-ui-border">
                <div>
                    <h3 className="text-base font-semibold sm:text-lg">Стиль фасадов</h3>
                    <p className="mt-0.5 text-xs text-slate-500 customer-dark:text-content-muted">Выберите один из стилей для генерации</p>
                </div>
            </div>
            <div className="grid md:grid-cols-[minmax(0,1fr)_17.5rem]">
                <div className="relative h-90 min-w-0 bg-linear-to-b from-[#f7f9fc] to-[#e1e7ef] md:h-[min(64vh,620px)] customer-dark:from-surface-muted customer-dark:to-surface-raised">
                    {previewUrl && previewStatus === "ready" ? (
                        <FacadeStylePreview modelUrl={previewUrl} />
                    ) : (
                        <div className="flex h-full items-center justify-center px-8 text-center text-sm text-slate-500 customer-dark:text-content-muted">
                            {previewStatus === "loading" ? "Загружаем 3D-модель..."
                                : previewStatus === "error" ? "Не удалось загрузить 3D-модель. Стиль можно выбрать без просмотра."
                                    : "Выберите стиль, чтобы посмотреть 3D-модель здания."}
                        </div>
                    )}
                    {/* {previewUrl && previewStatus === "ready" && (
                        <div className="pointer-events-none absolute bottom-4 left-1/2 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-full bg-white/90 px-4 py-2 text-center text-xs text-slate-500 shadow-sm backdrop-blur-sm">
                            Перетащите, чтобы повернуть · колесо — масштаб
                        </div>
                    )} */}
                </div>
                <div className="flex h-105 min-w-0 flex-col border-t border-slate-200 bg-white md:h-[min(64vh,620px)] md:border-l md:border-t-0 customer-dark:border-ui-border customer-dark:bg-surface-panel">
                    <div className="min-h-0 flex-1 overflow-y-auto p-3" aria-label="Доступные стили фасадов">
                        {stylesLoading && <div className="p-3 text-sm text-slate-500">Загружаем стили...</div>}
                        {stylesError && (
                            <div className="flex flex-col gap-2 p-3 text-sm text-red-700">
                                {stylesError}
                                <button type="button" className="self-start font-medium underline" onClick={() => setRetryCount((count) => count + 1)}>Повторить</button>
                            </div>
                        )}
                        {!stylesLoading && styles.map((style) => {
                            const isSelected = selectedStyleId === style.id;
                            return (
                                <button
                                    key={style.id}
                                    type="button"
                                    className={`mb-2 flex min-h-17 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left shadow-sm transition-colors ${isSelected
                                        ? "border-blue-500 bg-blue-50 text-slate-900 customer-dark:border-brand-primary customer-dark:bg-brand-soft customer-dark:text-content-primary"
                                        : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover"}`}
                                    onClick={() => selectStyle(style.id)}
                                    aria-pressed={isSelected}
                                >
                                    <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 ${isSelected ? "border-blue-600" : "border-slate-300"}`} aria-hidden="true">
                                        {isSelected && <span className="size-2 rounded-full bg-blue-600" />}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium">{style.name}</span>
                                        {style.code && style.code !== style.name && (
                                            <span className="mt-0.5 block truncate text-xs text-slate-400 customer-dark:text-content-muted">{style.code}</span>
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="grid grid-cols-2 gap-2 border-t border-slate-200 bg-white p-3 customer-dark:border-ui-border customer-dark:bg-surface-panel">
                        <button
                            type="button"
                            className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 customer-dark:border-ui-border-strong customer-dark:bg-surface-raised customer-dark:text-content-secondary"
                            onClick={() => ChatStore.returnToGenBuilder3DChoice(prompt.setupId)}
                        >
                            Отмена
                        </button>
                        <button
                            type="button"
                            className="min-h-11 rounded-xl bg-brand-primary px-3 text-sm font-medium text-white shadow-sm hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!selectedStyle || previewStatus === "loading"}
                            onClick={() => selectedStyle && ChatStore.confirmGenBuilderFacadeStyle(prompt.setupId, selectedStyle.id, selectedStyle.name)}
                        >
                            Применить
                        </button>
                    </div>
                </div>
            </div>
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
                disabled={!!clarification.submitted || ChatStore.isStreaming}
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
