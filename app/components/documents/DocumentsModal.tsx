import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react-lite";
import {
    MdClose,
    MdOutlineDescription,
    MdRefresh,
} from "react-icons/md";
import DocumentsStore, {
    getDocumentsRequestErrorMessage,
    type UserDocument,
} from "@lib/DocumentsStore";
import ProjectDocumentsTable from "./ProjectDocumentsTable";
import useDocumentModal from "./useDocumentModal";

type DocumentsModalProps = {
    projectId: number;
    projectName: string;
    onClose: () => void;
    onUpdate: (document: UserDocument) => void;
    notice?: string | null;
};

function loadProjectDocuments(projectId: number) {
    void DocumentsStore.getProjectDocuments(projectId, true).catch((error) => {
        console.error("Error fetching project documents:", error);
    });
}

const DocumentsModal = observer(({
    projectId,
    projectName,
    onClose,
    onUpdate,
    notice,
}: DocumentsModalProps) => {
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const [deletingDocumentName, setDeletingDocumentName] = useState<
        string | null
    >(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
    const isDeleting = deletingDocumentName !== null;
    const displayedNotice = deleteNotice ?? notice;
    const documents = DocumentsStore.documentsByProject.get(projectId) ?? [];
    const documentCount =
        DocumentsStore.documentCounts.get(projectId) ?? documents.length;
    const isLoading = DocumentsStore.loadingProjects.has(projectId);
    const loadError = DocumentsStore.errorsByProject.get(projectId);
    const hasLoadedDocuments = DocumentsStore.documentsByProject.has(projectId);

    useDocumentModal({
        initialFocusRef: closeButtonRef,
        preventClose: isDeleting,
        onClose,
    });

    useEffect(() => {
        loadProjectDocuments(projectId);
    }, [projectId]);

    const handleDelete = async (document: UserDocument) => {
        if (isDeleting) {
            return;
        }

        const deletionIsConfirmed = window.confirm(
            `Удалить документ «${document.name}» из проекта «${projectName}»?`,
        );

        if (!deletionIsConfirmed) {
            return;
        }

        setDeletingDocumentName(document.name);
        setDeleteError(null);
        setDeleteNotice(null);

        try {
            await DocumentsStore.deleteDocument({
                projectId,
                documentName: document.name,
            });
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

    const handleDeleteRequest = (document: UserDocument) => {
        void handleDelete(document);
    };

    let modalContent: ReactNode;

    if (isLoading && !hasLoadedDocuments) {
        modalContent = (
            <div
                className="flex min-h-64 flex-col items-center justify-center gap-3 text-slate-500 customer-dark:text-content-muted"
                role="status"
            >
                <MdRefresh
                    size={28}
                    className="animate-spin text-[#0788CE] customer:text-brand-primary"
                />
                <span className="text-sm">Загрузка документов...</span>
            </div>
        );
    } else if (loadError && !hasLoadedDocuments) {
        modalContent = (
            <div className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
                <div
                    className="max-w-lg rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 customer-dark:border-danger-border customer-dark:bg-danger-soft customer-dark:text-danger-content"
                    role="alert"
                >
                    {loadError}
                </div>
                <button
                    type="button"
                    className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40 customer:focus-visible:ring-brand-primary/40 customer-dark:border-ui-border customer-dark:hover:bg-surface-hover"
                    onClick={() => loadProjectDocuments(projectId)}
                >
                    Повторить
                </button>
            </div>
        );
    } else if (documents.length === 0) {
        modalContent = (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-400 customer-dark:bg-surface-muted customer-dark:text-content-muted">
                    <MdOutlineDescription size={30} />
                </span>
                <h3 className="mt-4 font-semibold">Документов пока нет</h3>
                <p className="mt-1 max-w-sm text-sm text-slate-500 customer-dark:text-content-muted">
                    Загрузите первый документ для выбранного проекта.
                </p>
            </div>
        );
    } else {
        modalContent = (
            <ProjectDocumentsTable
                documents={documents}
                deletingDocumentName={deletingDocumentName}
                isDeleting={isDeleting}
                onUpdate={onUpdate}
                onDelete={handleDeleteRequest}
            />
        );
    }

    return createPortal(
        <div
            className="fixed inset-0 z-100 flex items-center justify-center overflow-hidden bg-slate-950/40 p-4 backdrop-blur-[2px]"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !isDeleting) {
                    onClose();
                }
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
                            {hasLoadedDocuments && (
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
                    {(deleteError || (hasLoadedDocuments && loadError)) && (
                        <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 customer-dark:border-danger-border customer-dark:bg-danger-soft customer-dark:text-danger-content" role="alert">
                            {deleteError ?? loadError}
                        </p>
                    )}
                    {modalContent}
                </div>
            </div>
        </div>,
        document.body,
    );
});

export default DocumentsModal;
