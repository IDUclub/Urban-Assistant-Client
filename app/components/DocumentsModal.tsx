import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react-lite";
import {
    MdClose,
    MdDeleteOutline,
    MdOutlineDescription,
    MdRefresh,
} from "react-icons/md";
import DocumentsStore, {
    getDocumentsRequestErrorMessage,
    type UserDocument,
} from "@lib/DocumentsStore";

interface DocumentsModalProps {
    projectId: number;
    projectName: string;
    onClose: () => void;
    onUpdate: (document: UserDocument) => void;
    notice?: string | null;
}

const uploadedAtFormatter = new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
});

function formatUploadedAt(uploadedAt: string | null) {
    if (!uploadedAt) return "—";

    const date = new Date(uploadedAt);
    return Number.isNaN(date.getTime())
        ? uploadedAt
        : uploadedAtFormatter.format(date);
}

const DocumentsModal = observer(({
    projectId,
    projectName,
    onClose,
    onUpdate,
    notice,
}: DocumentsModalProps) => {
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const [deletingDocumentName, setDeletingDocumentName] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
    const isDeleting = deletingDocumentName !== null;
    const displayedNotice = deleteNotice ?? notice;
    const documents = DocumentsStore.documentsByProject.get(projectId) ?? [];
    const documentCount = DocumentsStore.documentCounts.get(projectId) ?? documents.length;
    const isLoading = DocumentsStore.loadingProjects.has(projectId);
    const errorText = DocumentsStore.errorsByProject.get(projectId);
    const hasLoaded = DocumentsStore.documentsByProject.has(projectId);

    useEffect(() => {
        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
        closeButtonRef.current?.focus();

        void DocumentsStore.getProjectDocuments(projectId, true).catch((error) => {
            console.error("Error fetching project documents:", error);
        });

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, [projectId]);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !isDeleting) onClose();
        };

        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [isDeleting, onClose]);

    const handleDelete = async (document: UserDocument) => {
        if (isDeleting) return;
        if (!window.confirm(
            `Удалить документ «${document.name}» из проекта «${projectName}»?`,
        )) return;

        setDeletingDocumentName(document.name);
        setDeleteError(null);
        setDeleteNotice(null);

        try {
            await DocumentsStore.deleteDocument({ projectId, documentName: document.name });
            setDeleteNotice(`Документ «${document.name}» удалён.`);
        } catch (error) {
            console.error("Error deleting user document:", error);
            setDeleteError(getDocumentsRequestErrorMessage(
                error,
                "Не удалось удалить документ. Попробуйте ещё раз.",
            ));
        } finally {
            setDeletingDocumentName(null);
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-100 flex items-center justify-center overflow-hidden bg-slate-950/40 p-4 backdrop-blur-[2px]"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !isDeleting) onClose();
            }}
        >
            <div
                className="flex max-h-[min(48rem,calc(100dvh-2rem))] min-w-0 w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-[0_30px_80px_-24px_var(--shadow-popover)] customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-primary"
                role="dialog"
                aria-modal="true"
                aria-labelledby="documents-title"
            >
                <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 customer-dark:border-ui-border">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                            <h2 id="documents-title" className="text-xl font-semibold">
                                Документы проекта
                            </h2>
                            {hasLoaded && (
                                <span className="rounded-full bg-[#EAF5FF] px-2.5 py-1 text-xs font-semibold text-[#0B5E8E] customer:bg-brand-soft customer:text-brand-contrast">
                                    {documentCount}
                                </span>
                            )}
                        </div>
                        <p className="mt-1 truncate text-sm text-slate-500 customer-dark:text-content-muted" title={projectName}>
                            {projectName}
                        </p>
                    </div>
                    <button
                        ref={closeButtonRef}
                        type="button"
                        className="shrink-0 rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40 disabled:cursor-not-allowed disabled:opacity-50 customer:focus-visible:ring-brand-primary/40 customer-dark:text-content-muted customer-dark:hover:bg-surface-hover customer-dark:hover:text-content-primary"
                        onClick={onClose}
                        disabled={isDeleting}
                        aria-label="Закрыть список документов"
                    >
                        <MdClose size={22} />
                    </button>
                </div>

                <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-6">
                    {displayedNotice && (
                        <p className="mb-4 rounded-2xl bg-[#EAF5FF] px-4 py-3 text-sm text-[#0B5E8E] customer:bg-brand-soft customer:text-brand-contrast" role="status">
                            {displayedNotice}
                        </p>
                    )}
                    {(deleteError || (hasLoaded && errorText)) && (
                        <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 customer-dark:border-danger-border customer-dark:bg-danger-soft customer-dark:text-danger-content" role="alert">
                            {deleteError ?? errorText}
                        </p>
                    )}
                    {isLoading && !hasLoaded ? (
                        <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-slate-500 customer-dark:text-content-muted" role="status">
                            <MdRefresh size={28} className="animate-spin text-[#0788CE] customer:text-brand-primary" />
                            <span className="text-sm">Загрузка документов...</span>
                        </div>
                    ) : errorText && !hasLoaded ? (
                        <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
                            <div className="max-w-lg rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 customer-dark:border-danger-border customer-dark:bg-danger-soft customer-dark:text-danger-content" role="alert">
                                {errorText}
                            </div>
                            <button
                                type="button"
                                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40 customer:focus-visible:ring-brand-primary/40 customer-dark:border-ui-border customer-dark:hover:bg-surface-hover"
                                onClick={() => {
                                    void DocumentsStore.getProjectDocuments(projectId, true).catch((error) => {
                                        console.error("Error retrying project documents:", error);
                                    });
                                }}
                            >
                                Повторить
                            </button>
                        </div>
                    ) : documents.length === 0 ? (
                        <div className="flex min-h-64 flex-col items-center justify-center text-center">
                            <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-400 customer-dark:bg-surface-muted customer-dark:text-content-muted">
                                <MdOutlineDescription size={30} />
                            </span>
                            <h3 className="mt-4 font-semibold">Документов пока нет</h3>
                            <p className="mt-1 max-w-sm text-sm text-slate-500 customer-dark:text-content-muted">
                                Загрузите первый документ для выбранного проекта.
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-2xl border border-slate-200 customer-dark:border-ui-border">
                            <table className="w-full table-fixed border-collapse text-center text-sm">
                                <colgroup>
                                    <col className="w-[30%]" />
                                    <col className="w-[12%]" />
                                    <col className="w-[24%]" />
                                    <col className="w-[14%]" />
                                    <col className="w-[20%]" />
                                </colgroup>
                                <thead className="bg-[#EAF5FF] text-xs font-semibold uppercase tracking-wide wrap-anywhere text-[#0B5E8E] customer:bg-brand-soft customer:text-brand-contrast customer-dark:bg-brand-soft customer-dark:text-brand-contrast">
                                    <tr>
                                        <th scope="col" className="px-2 py-3 sm:px-4">Название</th>
                                        <th scope="col" className="px-2 py-3 sm:px-4">Версия</th>
                                        <th scope="col" className="px-2 py-3 sm:px-4">Территория</th>
                                        <th scope="col" className="px-2 py-3 sm:px-4">Дата загрузки</th>
                                        <th scope="col" className="px-2 py-3 sm:px-4">Действия</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 customer-dark:divide-ui-border">
                                    {documents.map((document) => (
                                        <tr key={`${document.id}-${document.version}`} className="transition-colors hover:bg-slate-50 customer-dark:hover:bg-surface-hover">
                                            <td className="px-2 py-3.5 align-middle font-medium text-slate-900 sm:px-4 customer-dark:text-content-primary">
                                                <span className="block whitespace-normal wrap-anywhere" title={document.name}>
                                                    {document.name}
                                                </span>
                                            </td>
                                            <td className="px-2 py-3.5 align-middle whitespace-normal wrap-anywhere text-slate-600 sm:px-4 customer-dark:text-content-secondary">
                                                {document.version || "—"}
                                            </td>
                                            <td className="px-2 py-3.5 align-middle text-slate-600 sm:px-4 customer-dark:text-content-secondary">
                                                <span className="block whitespace-normal wrap-anywhere" title={document.territoryName ?? undefined}>
                                                    {document.territoryName ?? "—"}
                                                </span>
                                            </td>
                                            <td className="px-2 py-3.5 align-middle whitespace-normal wrap-anywhere text-slate-600 sm:px-4 customer-dark:text-content-secondary">
                                                {formatUploadedAt(document.uploadedAt)}
                                            </td>
                                            <td className="px-2 py-3.5 align-middle sm:px-4">
                                                <div className="flex flex-wrap justify-center gap-1 sm:gap-2">
                                                    <button
                                                        type="button"
                                                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl p-2 text-xs font-medium text-[#0788CE] transition-colors hover:bg-[#EAF5FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40 disabled:cursor-not-allowed disabled:opacity-50 md:px-3 customer:text-brand-primary customer:hover:bg-brand-soft customer:focus-visible:ring-brand-primary/40"
                                                        onClick={() => onUpdate(document)}
                                                        // disabled={isDeleting}
                                                        aria-label="Обновить документ"
                                                        title="Обновить документ"
                                                        disabled={true}
                                                    >
                                                        <MdRefresh size={16} aria-hidden="true" />
                                                        <span className="hidden md:inline">Обновить</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl p-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50 md:px-3 customer:text-danger customer:hover:bg-danger-soft customer-dark:text-danger"
                                                        onClick={() => { void handleDelete(document); }}
                                                        disabled={isDeleting}
                                                        aria-busy={deletingDocumentName === document.name}
                                                        aria-label="Удалить документ"
                                                        title="Удалить документ и все его версии"
                                                    >
                                                        {deletingDocumentName === document.name
                                                            ? <MdRefresh size={16} className="animate-spin" aria-hidden="true" />
                                                            : <MdDeleteOutline size={16} aria-hidden="true" />}
                                                        <span className="hidden md:inline">
                                                            {deletingDocumentName === document.name ? "Удаление..." : "Удалить"}
                                                        </span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
});

export default DocumentsModal;
