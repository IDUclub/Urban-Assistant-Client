import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    MdAttachFile,
    MdClose,
    MdInsertDriveFile,
    MdRefresh,
    MdUploadFile,
} from "react-icons/md";
import DocumentTerritorySelect, {
    type DocumentTerritoryScope,
} from "@components/DocumentTerritorySelect";
import DataStore, {
    type ProjectCreationTerritoryOption,
} from "@lib/DataStore";
import DocumentsStore, {
    getDocumentsRequestErrorMessage,
    type UserDocument,
} from "@lib/DocumentsStore";

const FEDERAL_TERRITORY_ID = 12639;

function getInitialTerritoryScope(document?: UserDocument): DocumentTerritoryScope {
    if (document?.territoryId == null) return "";
    if (document.territoryLevel) return document.territoryLevel;
    return document.territoryId === FEDERAL_TERRITORY_ID ? "federal" : "regional";
}

interface UploadDocumentModalProps {
    projectId: number;
    projectName: string;
    initialDocument?: UserDocument;
    onClose: () => void;
    onSaved?: (updateKind: "file" | "metadata") => void | Promise<void>;
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
    const shouldResolveInitialTerritoryRef = useRef(
        initialDocument?.territoryId != null
        && initialDocument.territoryId !== FEDERAL_TERRITORY_ID
        && initialDocument.territoryLevel == null,
    );
    const [file, setFile] = useState<File | null>(null);
    const [name, setName] = useState(initialDocument?.name ?? "");
    const [version, setVersion] = useState(initialDocument?.version ?? "");
    const [territoryScope, setTerritoryScope] = useState<DocumentTerritoryScope>(
        getInitialTerritoryScope(initialDocument),
    );
    const [regionalTerritories, setRegionalTerritories] = useState<ProjectCreationTerritoryOption[]>([]);
    const [localTerritories, setLocalTerritories] = useState<ProjectCreationTerritoryOption[]>([]);
    const [territoryId, setTerritoryId] = useState<number | null>(initialDocument?.territoryId ?? null);
    const [isTerritoriesLoading, setIsTerritoriesLoading] = useState(false);
    const [territoryErrorText, setTerritoryErrorText] = useState<string | null>(null);
    const [territoryLoadRequest, setTerritoryLoadRequest] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorText, setErrorText] = useState<string | null>(null);
    const selectableTerritories = territoryScope === "regional"
        ? regionalTerritories
        : territoryScope === "local"
            ? localTerritories
            : [];
    const territoryOptions = [...selectableTerritories];
    // Keep an existing document value selectable if the API no longer returns it.
    if (
        territoryScope !== "" && territoryScope !== "federal"
        && initialDocument?.territoryId != null
        && !selectableTerritories.some(
            (territory) => territory.territory_id === initialDocument.territoryId,
        )
    ) {
        territoryOptions.push({
            name: initialDocument.territoryName ?? `Территория ${initialDocument.territoryId}`,
            territory_id: initialDocument.territoryId,
        });
    }
    const needsSpecificTerritory = territoryScope === "regional" || territoryScope === "local";
    const hasValidTerritorySelection = !needsSpecificTerritory || territoryId !== null;
    const nextTitle = name.trim();
    const initialTitle = initialDocument?.name.trim() ?? "";
    const hasTitleChange = isEditing
        && nextTitle.length > 0
        && nextTitle !== initialTitle;
    const nextVersion = version.trim();
    const initialVersion = initialDocument?.version.trim() ?? "";
    const hasVersionChange = isEditing
        && nextVersion.length > 0
        && nextVersion !== initialVersion;
    const hasTerritoryChange = initialDocument !== undefined
        && territoryId !== initialDocument.territoryId;
    const hasMetadataChanges = hasTitleChange || hasVersionChange || hasTerritoryChange;
    const canSubmit = hasValidTerritorySelection
        && (isEditing ? file !== null || hasMetadataChanges : file !== null)
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
        if (territoryScope !== "regional") return;

        let isActive = true;

        setIsTerritoriesLoading(true);
        setTerritoryErrorText(null);

        void DataStore.getProjectCreationTerritories()
            .then((items) => {
                if (!isActive) return;

                setRegionalTerritories(items);

                if (shouldResolveInitialTerritoryRef.current) {
                    shouldResolveInitialTerritoryRef.current = false;
                    if (!items.some((territory) => (
                        territory.territory_id === initialDocument?.territoryId
                    ))) {
                        setTerritoryScope("local");
                    }
                }
            })
            .catch((error) => {
                if (!isActive) return;
                console.error("Error fetching regional document territories:", error);
                setTerritoryErrorText("Не удалось загрузить список регионов.");
            })
            .finally(() => {
                if (isActive) setIsTerritoriesLoading(false);
            });

        return () => {
            isActive = false;
        };
    }, [initialDocument, territoryLoadRequest, territoryScope]);

    useEffect(() => {
        if (territoryScope !== "local") return;

        let isActive = true;
        setIsTerritoriesLoading(true);
        setTerritoryErrorText(null);

        void DataStore.getProjectTerritoryId(projectId)
            .then((projectTerritoryId) => (
                DataStore.getTerritoriesWithoutGeometry(projectTerritoryId)
            ))
            .then((items) => {
                if (isActive) setLocalTerritories(items);
            })
            .catch((error) => {
                if (!isActive) return;
                console.error("Error fetching local document territories:", error);
                setTerritoryErrorText("Не удалось загрузить местные территории проекта.");
            })
            .finally(() => {
                if (isActive) setIsTerritoriesLoading(false);
            });

        return () => {
            isActive = false;
        };
    }, [projectId, territoryLoadRequest, territoryScope]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSubmit) return;

        setIsSubmitting(true);
        setErrorText(null);

        try {
            if (initialDocument) {
                if (file) {
                    await DocumentsStore.updateDocument({
                        file,
                        projectId,
                        version,
                        territoryId,
                        originalDocumentName: initialDocument.name,
                        title: name,
                    });
                } else {
                    await DocumentsStore.updateDocumentMetadata({
                        documentId: initialDocument.id,
                        projectId,
                        title: hasTitleChange ? nextTitle : undefined,
                        territoryId: hasTerritoryChange ? territoryId : undefined,
                        version: hasVersionChange ? nextVersion : undefined,
                        currentVersion: hasVersionChange ? initialVersion : undefined,
                    });
                }
            } else if (file) {
                await DocumentsStore.uploadDocument({
                    file,
                    projectId,
                    name,
                    version,
                    territoryId,
                });
            }
            await onSaved?.(file ? "file" : "metadata");
            onClose();
        } catch (error) {
            console.error("Error saving user document:", error);
            setErrorText(getDocumentsRequestErrorMessage(
                error,
                isEditing
                    ? file
                        ? "Не удалось обновить документ. Проверьте файл и попробуйте ещё раз."
                        : "Не удалось обновить данные документа. Проверьте значения и попробуйте ещё раз."
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
                            {isEditing ? "Обновлённый файл" : "Файл"}
                            {!isEditing && <span className="text-red-600 customer:text-danger"> *</span>}
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
                            required={!isEditing}
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
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                            <span className="mb-2 block text-sm font-medium">
                                Название
                            </span>
                            <input
                                type="text"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-[#0788CE] customer:focus:border-brand-primary customer-dark:border-ui-border customer-dark:bg-surface-panel customer-dark:placeholder:text-content-muted"
                                disabled={isSubmitting}
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
                        <DocumentTerritorySelect
                            scope={territoryScope}
                            territoryId={territoryId}
                            territories={territoryOptions}
                            isLoading={isTerritoriesLoading}
                            errorText={territoryErrorText}
                            disabled={isSubmitting}
                            onScopeChange={(nextScope) => {
                                shouldResolveInitialTerritoryRef.current = false;
                                setTerritoryScope(nextScope);
                                setTerritoryErrorText(null);
                                setTerritoryId((currentTerritoryId) => (
                                    nextScope === "federal"
                                        ? FEDERAL_TERRITORY_ID
                                        : nextScope === territoryScope
                                            ? currentTerritoryId
                                            : null
                                ));

                                if (nextScope === "regional" || nextScope === "local") {
                                    setIsTerritoriesLoading(true);
                                    setTerritoryLoadRequest((request) => request + 1);
                                }
                            }}
                            onTerritoryChange={setTerritoryId}
                        />
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
