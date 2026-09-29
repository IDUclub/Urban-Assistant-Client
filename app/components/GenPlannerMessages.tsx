import { useState } from "react";
import { observer } from "mobx-react-lite";
import {
    IoGridOutline,
    IoInformationCircleOutline
} from "react-icons/io5";
import ChatStore from "@lib/ChatStore";
import type {
    GenPlannerCustomSetupMessage,
    GenPlannerSavePromptMessage,
    GenPlannerAdjacencyPromptMessage,
} from "@lib/genplanner/types";
import ZoneAdjacencyMatrixModal from "@components/ZoneAdjacencyMatrixModal";
import type {
    ZoneAdjacencyMatrixState,
} from "@lib/genplanner/zoneAdjacencyMatrix";
import FileUpload from "@components/FileUpload";

function getCustomSetupStatusLabel(setup: GenPlannerCustomSetupMessage) {
    if (setup.status === "submitting" || setup.status === "running") return "Выполняется";
    if (setup.status === "error") return "Ошибка";
    if (setup.backendChatId) return "Территория загружена";
    if (setup.status === "ready") return "Файл выбран";
    return "Ожидает файл";
}

export const GenPlannerCustomSetupCard = observer(({
    setup,
}: {
    setup: GenPlannerCustomSetupMessage;
}) => {
    const isRunning = setup.status === "submitting" || setup.status === "running";

    return (
        <div className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 customer-dark:border-ui-border customer-dark:bg-surface-muted customer-dark:text-content-primary">
            <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-900 customer-dark:text-content-primary">
                    Территория для функционального зонирования
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500 customer-dark:bg-surface-raised customer-dark:text-content-muted">
                    {getCustomSetupStatusLabel(setup)}
                </span>
            </div>

            {!setup.backendChatId && (
                <FileUpload
                    label="Файл границы территории"
                    fileName={setup.territoryFileName}
                    disabled={isRunning}
                    accept=".geojson,application/geo+json"
                    onFileSelected={(file) => ChatStore.submitGenPlannerTerritoryFile(setup.id, file)}
                />
            )}

            <div className="text-xs leading-5 text-slate-500 customer-dark:text-content-muted">
                Файл границы территории в формате GeoJSON.
                {setup.status === "ready" && !setup.backendChatId &&
                    " Теперь опишите желаемый профиль зонирования в поле сообщения."}
                {setup.backendChatId && " Для следующих сообщений повторно загружать файл не нужно."}
            </div>

            {setup.errorText && (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700 customer:border-danger-border customer:bg-danger-soft customer:text-danger-content">
                    {setup.errorText}
                </div>
            )}
        </div>
    );
});

export const GenPlannerAdjacencyPromptCard = observer(({
    prompt,
}: {
    prompt: GenPlannerAdjacencyPromptMessage;
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadErrorText, setLoadErrorText] = useState<string>();
    const [initialMatrix, setInitialMatrix] =
        useState<ZoneAdjacencyMatrixState | null>(null);

    const isSubmitting = prompt.status === "submitting";
    const isSubmitted = prompt.status === "submitted";

    const handleOpenMatrix = async () => {
        if (initialMatrix) {
            setIsModalOpen(true);
            return;
        }

        setIsLoading(true);
        setLoadErrorText(undefined);

        try {
            const matrix =
                await ChatStore.loadDefaultGenPlannerAdjacencyMatrix();

            setInitialMatrix(matrix);
            setIsModalOpen(true);
        } catch (error) {
            setLoadErrorText(
                error instanceof Error
                    ? error.message
                    : "Не удалось загрузить матрицу соседства.",
            );
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = (value: Parameters<
        typeof ChatStore.submitGenPlannerAdjacencyMatrix
    >[1]) => {
        setIsModalOpen(false);

        void ChatStore.submitGenPlannerAdjacencyMatrix(
            prompt.id,
            value,
        );
    };

    return (
    <>
        {!isSubmitted && (
            <div className="flex w-full flex-col items-start gap-2">
            <button
                type="button"
                className="
                    inline-flex items-center gap-2
                    rounded-2xl bg-[#EAF5FF] px-4 py-2
                    transition-colors
                    hover:bg-[#DCEEFF]
                    customer:hover:bg-[#F3DADD]
                    customer-dark:hover:bg-brand-primary
                    focus:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-[#0788CE]/40
                    disabled:cursor-not-allowed
                    disabled:opacity-60
                    customer:bg-brand-soft
                    customer:focus-visible:ring-brand-primary/40
                "
                onClick={handleOpenMatrix}
                disabled={isLoading || isSubmitting}
            >
                <IoGridOutline
                    size={18}
                    className="text-[#0B5E8E] customer:text-brand-contrast"
                    aria-hidden="true"
                />

                <span className="text-sm font-medium text-[#0B5E8E] customer:text-brand-contrast">
                    {isLoading
                        ? "Загружаем матрицу..."
                        : isSubmitting
                            ? "Отправляем..."
                            : "Настроить соседство зон"}
                </span>
            </button>

                {(loadErrorText || prompt.errorText) && (
                    <div className="text-sm text-red-700 customer:text-danger-content">
                        {loadErrorText ?? prompt.errorText}
                    </div>
                )}
            </div>
        )}

        {isModalOpen && initialMatrix && (
            <ZoneAdjacencyMatrixModal
                initialMatrix={initialMatrix}
                isSubmitting={isSubmitting}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleSubmit}
            />
        )}
    </>
);
});

function getSavePromptTitle(status: GenPlannerSavePromptMessage["status"]) {
    switch (status) {
        case "saved":
            return "Функциональное зонирование сохранено";
        case "declined":
            return "Результат не сохранён";
        case "error":
            return "Не удалось сохранить весь результат";
        case "pending":
        case "saving":
            return "Сохранить результат в сценарии?";
    }
}

export const GenPlannerSavePromptCard = observer(({
    prompt,
}: {
    prompt: GenPlannerSavePromptMessage;
}) => {
    const isPending = prompt.status === "pending";
    const isSaving = prompt.status === "saving";

    return (
        <div className="flex w-full flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-blue-950 customer:border-brand-primary/30 customer:bg-brand-soft customer:text-brand-contrast customer-dark:border-ui-border customer-dark:bg-surface-muted customer-dark:text-content-primary">
            <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 text-blue-500 customer:text-brand-primary">
                    <IoInformationCircleOutline size={22} />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="font-semibold text-blue-900 customer:text-brand-contrast customer-dark:text-content-primary">
                        {getSavePromptTitle(prompt.status)}
                    </div>

                    {(isPending || isSaving) && (
                        <div className="mt-1 text-sm leading-6">
                            Функциональные зоны и дорожная сеть будут сохранены в выбранный сценарий.
                            Текущие функциональные зоны и дорожная сеть сценария будут заменены.
                        </div>
                    )}

                    {prompt.status === "saved" && prompt.result && (
                        <div className="mt-1 text-sm leading-6">
                            Сохранено зон: {prompt.result.zoneSavedCount}. Сохранено дорог: {prompt.result.roadSavedCount}.
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
                        onClick={() => ChatStore.saveGenPlannerResult(prompt.id)}
                        disabled={isSaving}
                    >
                        {isSaving ? "Сохраняем..." : "Да, сохранить"}
                    </button>
                    <button
                        type="button"
                        className="rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:text-blue-300 customer:border-brand-primary/40 customer:text-brand-contrast customer:hover:bg-brand-primary/10 customer-dark:border-ui-border-strong customer-dark:bg-surface-raised customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover customer-dark:disabled:text-content-disabled"
                        onClick={() => ChatStore.declineGenPlannerResult(prompt.id)}
                        disabled={isSaving}
                    >
                        Нет
                    </button>
                </div>
            )}
        </div>
    );
});
