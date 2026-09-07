import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    MdAttachFile,
    MdClose,
    MdInsertDriveFile,
    MdRefresh,
    MdUploadFile,
} from "react-icons/md";
import CustomSelect, { type SelectOption } from "@components/ui/Select";
import DataStore, {
    type ProjectCreationTerritoryOption,
} from "@lib/DataStore";
import DocumentsStore, {
    getDocumentsRequestErrorMessage,
    type UserDocument,
} from "@lib/DocumentsStore";

interface UploadDocumentModalProps {
    projectId: number;
    projectName: string;
    initialDocument?: UserDocument;
    onClose: () => void;
    onSaved?: () => void | Promise<void>;
}

function formatFileSize(size: number) {
    if (size < 1024) return `${size} Б`;
    if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} КБ`;
    return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}

function UploadDocumentModal({
    projectId,
    projectName,
    initialDocument,
    onClose,
    onSaved,
}: UploadDocumentModalProps) {
    const isEditing = initialDocument !== undefined;
    const fileInputId = useId();
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [name, setName] = useState(initialDocument?.name ?? "");
    const [version, setVersion] = useState(initialDocument?.version ?? "");
    const [territories, setTerritories] = useState<ProjectCreationTerritoryOption[]>([]);
    const [territoryId, setTerritoryId] = useState<number | null>(initialDocument?.territoryId ?? null);
    const [isTerritoriesLoading, setIsTerritoriesLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorText, setErrorText] = useState<string | null>(null);
    const territoryOptions: SelectOption[] = [
        { label: "Не выбрана", value: "" },
        ...territories.map((territory) => ({
            label: territory.name,
            value: territory.territory_id,
        })),
    ];
    // The document's territory may be outside the upload selector's territory list.
    if (initialDocument?.territoryId != null && !territories.some(
        (territory) => territory.territory_id === initialDocument.territoryId,
    )) {
        territoryOptions.push({
            label: initialDocument.territoryName ?? `Территория ${initialDocument.territoryId}`,
            value: initialDocument.territoryId,
        });
    }
    const canSubmit = file !== null
        && (!isEditing || name.trim().length > 0)
        && !isSubmitting;

    useEffect(() => {
        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
        closeButtonRef.current?.focus();

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, []);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !isSubmitting) onClose();
        };

        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [isSubmitting, onClose]);

    useEffect(() => {
        let isActive = true;

        setIsTerritoriesLoading(true);

        void DataStore.getProjectCreationTerritories()
            .then((items) => {
                if (isActive) setTerritories(items);
            })
            .catch((error) => {
                if (!isActive) return;
                console.error("Error fetching document territories:", error);
                setErrorText(isEditing
                    ? "Не удалось загрузить список территорий. Текущая территория сохранена в форме."
                    : "Не удалось загрузить список территорий. Документ можно загрузить без территории.");
            })
            .finally(() => {
                if (isActive) setIsTerritoriesLoading(false);
            });

        return () => {
            isActive = false;
        };
    }, [isEditing]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!file || !canSubmit) return;

        setIsSubmitting(true);
        setErrorText(null);

        try {
            const payload = {
                file,
                projectId,
                version,
                territoryId,
            };

            if (initialDocument) {
                await DocumentsStore.updateDocument({
                    ...payload,
                    originalDocumentName: initialDocument.name,
                    title: name,
                });
            } else {
                await DocumentsStore.uploadDocument({ ...payload, name });
            }
            await onSaved?.();
            onClose();
        } catch (error) {
            console.error("Error saving user document:", error);
            setErrorText(getDocumentsRequestErrorMessage(
                error,
                isEditing
                    ? "Не удалось обновить документ. Проверьте файл и попробуйте ещё раз."
                    : "Не удалось загрузить документ. Проверьте файл и попробуйте ещё раз.",
            ));
        } finally {
            setIsSubmitting(false);
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-100 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-[2px]"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !isSubmitting) onClose();
            }}
        >
            <div
                className="max-h-[calc(100dvh-2rem)] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-[0_30px_80px_-24px_var(--shadow-popover)] customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-primary"
                role="dialog"
                aria-modal="true"
                aria-labelledby="upload-document-title"
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h2 id="upload-document-title" className="text-xl font-semibold">
                            {isEditing ? "Обновить документ" : "Загрузить документ"}
                        </h2>
                        <p className="mt-1 truncate text-sm text-slate-500 customer-dark:text-content-muted" title={projectName}>
                            {projectName}
                        </p>
                    </div>
                    <button
                        ref={closeButtonRef}
                        type="button"
                        className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40 disabled:cursor-not-allowed disabled:opacity-50 customer:focus-visible:ring-brand-primary/40 customer-dark:text-content-muted customer-dark:hover:bg-surface-hover customer-dark:hover:text-content-primary"
                        onClick={onClose}
                        disabled={isSubmitting}
                        aria-label={isEditing ? "Закрыть окно обновления документа" : "Закрыть окно загрузки документа"}
                    >
                        <MdClose size={22} />
                    </button>
                </div>

                <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
                    <div>
                        <span className="mb-2 block text-sm font-medium">
                            {isEditing ? "Обновлённый файл" : "Файл"} <span className="text-red-600 customer:text-danger">*</span>
                        </span>
                        <input
                            id={fileInputId}
                            type="file"
                            className="sr-only"
                            onChange={(event) => {
                                setFile(event.target.files?.[0] ?? null);
                                setErrorText(null);
                            }}
                            disabled={isSubmitting}
                            required
                        />
                        <label
                            htmlFor={fileInputId}
                            className="flex min-h-24 cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 transition-colors hover:border-[#0788CE] hover:bg-[#EAF5FF] customer:hover:border-brand-primary customer:hover:bg-brand-soft customer-dark:border-ui-border-strong customer-dark:bg-surface-panel customer-dark:hover:bg-surface-hover"
                        >
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#0788CE] shadow-sm customer:text-brand-primary customer-dark:bg-surface-raised">
                                {file ? <MdInsertDriveFile size={25} /> : <MdAttachFile size={25} />}
                            </span>
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">
                                    {file?.name ?? "Выберите документ"}
                                </span>
                                <span className="mt-1 block text-xs text-slate-500 customer-dark:text-content-muted">
                                    {file ? formatFileSize(file.size) : "Нажмите, чтобы выбрать файл"}
                                </span>
                            </span>
                        </label>
                        {isEditing && (
                            <p className="mt-2 text-xs text-slate-500 customer-dark:text-content-muted">
                                Выберите файл для обновления документа. API требует файл при каждом обновлении.
                            </p>
                        )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                            <span className="mb-2 block text-sm font-medium">
                                Название
                                {isEditing && <span className="text-red-600 customer:text-danger"> *</span>}
                            </span>
                            <input
                                type="text"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-[#0788CE] customer:focus:border-brand-primary customer-dark:border-ui-border customer-dark:bg-surface-panel customer-dark:placeholder:text-content-muted"
                                disabled={isSubmitting}
                                required={isEditing}
                            />
                        </label>
                        <label className="block">
                            <span className="mb-2 block text-sm font-medium">Версия</span>
                            <input
                                type="text"
                                value={version}
                                onChange={(event) => setVersion(event.target.value)}
                                placeholder="Например, 2026"
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-[#0788CE] customer:focus:border-brand-primary customer-dark:border-ui-border customer-dark:bg-surface-panel customer-dark:placeholder:text-content-muted"
                                disabled={isSubmitting}
                            />
                        </label>
                    </div>

                    <fieldset disabled={isSubmitting}>
                        <span className="mb-2 block text-sm font-medium">Территория</span>
                        {isTerritoriesLoading ? (
                            <div className="flex min-h-11 items-center rounded-2xl border border-slate-200 px-4 text-sm text-slate-400 customer-dark:border-ui-border customer-dark:text-content-muted">
                                {territoryOptions.find((option) => option.value === territoryId)?.label ?? "Загрузка территорий..."}
                            </div>
                        ) : territoryOptions.length > 1 ? (
                            <CustomSelect
                                value={territoryId ?? ""}
                                options={territoryOptions}
                                onChange={(value) => setTerritoryId(
                                    value === "" ? null : Number(value),
                                )}
                                placeholder="Не выбрана"
                                block
                                compactGlow
                            />
                        ) : (
                            <div className="flex min-h-11 items-center rounded-2xl border border-slate-200 px-4 text-sm text-slate-400 customer-dark:border-ui-border customer-dark:text-content-muted">
                                Территории недоступны
                            </div>
                        )}
                    </fieldset>

                    {errorText && (
                        <div
                            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 customer-dark:border-danger-border customer-dark:bg-danger-soft customer-dark:text-danger-content"
                            role="alert"
                        >
                            {errorText}
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5 customer-dark:border-ui-border">
                        <button
                            type="button"
                            className="rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50 customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover"
                            onClick={onClose}
                            disabled={isSubmitting}
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            className="inline-flex items-center gap-2 rounded-2xl bg-[#0788CE] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0676B3] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 customer:bg-brand-primary customer:hover:bg-brand-hover customer:focus-visible:ring-brand-primary/40 customer-dark:ring-offset-surface-raised"
                            disabled={!canSubmit}
                        >
                            {isEditing
                                ? <MdRefresh size={19} aria-hidden="true" />
                                : <MdUploadFile size={19} aria-hidden="true" />}
                            {isSubmitting
                                ? (isEditing ? "Обновление..." : "Загрузка...")
                                : (isEditing ? "Обновить" : "Загрузить")}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body,
    );
}

export default UploadDocumentModal;
