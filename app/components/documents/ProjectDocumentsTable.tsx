import { MdDeleteOutline, MdRefresh } from "react-icons/md";
import type { UserDocument } from "@lib/DocumentsStore";

type ProjectDocumentsTableProps = {
    documents: UserDocument[];
    deletingDocumentName: string | null;
    isDeleting: boolean;
    onUpdate: (document: UserDocument) => void;
    onDelete: (document: UserDocument) => void;
};

const uploadedAtFormatter = new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
});

function formatUploadedAt(uploadedAt: string | null) {
    if (!uploadedAt) {
        return "—";
    }

    const date = new Date(uploadedAt);

    if (Number.isNaN(date.getTime())) {
        return uploadedAt;
    }

    return uploadedAtFormatter.format(date);
}

export default function ProjectDocumentsTable({
    documents,
    deletingDocumentName,
    isDeleting,
    onUpdate,
    onDelete,
}: ProjectDocumentsTableProps) {
    return (
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
                    {documents.map((document) => {
                        const isDocumentBeingDeleted =
                            deletingDocumentName === document.name;

                        return (
                            <tr
                                key={`${document.id}-${document.version}`}
                                className="transition-colors hover:bg-slate-50 customer-dark:hover:bg-surface-hover"
                            >
                                <td className="px-2 py-3.5 align-middle font-medium text-slate-900 sm:px-4 customer-dark:text-content-primary">
                                    <span
                                        className="block whitespace-normal wrap-anywhere"
                                        title={document.name}
                                    >
                                        {document.name}
                                    </span>
                                </td>
                                <td className="px-2 py-3.5 align-middle whitespace-normal wrap-anywhere text-slate-600 sm:px-4 customer-dark:text-content-secondary">
                                    {document.version || "—"}
                                </td>
                                <td className="px-2 py-3.5 align-middle text-slate-600 sm:px-4 customer-dark:text-content-secondary">
                                    <span
                                        className="block whitespace-normal wrap-anywhere"
                                        title={document.territoryName ?? undefined}
                                    >
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
                                            aria-label="Обновить документ"
                                            title="Обновить документ"
                                            disabled={isDeleting}
                                        >
                                            <MdRefresh size={16} aria-hidden="true" />
                                            <span className="hidden md:inline">Обновить</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl p-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50 md:px-3 customer:text-danger customer:hover:bg-danger-soft customer-dark:text-danger"
                                            onClick={() => onDelete(document)}
                                            disabled={isDeleting}
                                            aria-busy={isDocumentBeingDeleted}
                                            aria-label="Удалить документ"
                                            title="Удалить документ и все его версии"
                                        >
                                            {isDocumentBeingDeleted ? (
                                                <MdRefresh
                                                    size={16}
                                                    className="animate-spin"
                                                    aria-hidden="true"
                                                />
                                            ) : (
                                                <MdDeleteOutline
                                                    size={16}
                                                    aria-hidden="true"
                                                />
                                            )}
                                            <span className="hidden md:inline">
                                                {isDocumentBeingDeleted
                                                    ? "Удаление..."
                                                    : "Удалить"}
                                            </span>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
