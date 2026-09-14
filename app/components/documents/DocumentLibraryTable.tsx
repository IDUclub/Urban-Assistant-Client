import type { RefObject } from "react";
import {
    DOCUMENT_LEVELS,
    type LibraryDocument,
} from "@lib/documentLibrary";

type DocumentLibraryTableProps = {
    documents: LibraryDocument[];
    currentPage: number;
    pageCount: number;
    totalCount: number;
    pageSize: number;
    scrollContainerRef: RefObject<HTMLDivElement | null>;
    onPreviousPage: () => void;
    onNextPage: () => void;
};

const PAGINATION_BUTTON_CLASS_NAME =
    "rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 disabled:opacity-50 customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-primary";

const uploadedAtFormatter = new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
});

function formatUploadedAt(uploadedAt: string) {
    if (!uploadedAt) {
        return "—";
    }

    const date = new Date(uploadedAt);

    return Number.isNaN(date.getTime())
        ? uploadedAt
        : uploadedAtFormatter.format(date);
}

function getDocumentLevelLabel(
    documentLevel: LibraryDocument["documentLevel"],
) {
    if (!documentLevel) {
        return "—";
    }

    return DOCUMENT_LEVELS[documentLevel];
}

export default function DocumentLibraryTable({
    documents,
    currentPage,
    pageCount,
    totalCount,
    pageSize,
    scrollContainerRef,
    onPreviousPage,
    onNextPage,
}: DocumentLibraryTableProps) {
    const firstDocumentNumber = (currentPage - 1) * pageSize + 1;
    const lastDocumentNumber = Math.min(currentPage * pageSize, totalCount);

    return (
        <div className="min-w-0">
            <div
                ref={scrollContainerRef}
                className="document-library-scroll max-h-[50dvh] overflow-auto rounded-2xl border border-slate-200 customer-dark:border-ui-border"
            >
                <table className="w-full min-w-175 table-fixed text-left text-sm">
                    <colgroup>
                        <col className="w-[34%]" />
                        <col className="w-[14%]" />
                        <col className="w-[14%]" />
                        <col className="w-[24%]" />
                        <col className="w-[14%]" />
                    </colgroup>
                    <thead className="sticky top-0 bg-[#EAF5FF] text-xs uppercase text-[#0B5E8E] customer:bg-brand-soft customer:text-brand-contrast">
                        <tr>
                            <th scope="col" className="px-4 py-3">
                                Название
                            </th>
                            <th scope="col" className="px-4 py-3">
                                Версия
                            </th>
                            <th scope="col" className="px-4 py-3">
                                Уровень
                            </th>
                            <th scope="col" className="px-4 py-3">
                                Территория
                            </th>
                            <th scope="col" className="px-4 py-3">
                                Дата загрузки
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 customer-dark:divide-ui-border">
                        {documents.map((document) => (
                            <tr
                                key={document.id}
                                className="hover:bg-slate-50 customer-dark:hover:bg-surface-hover"
                            >
                                <td className="wrap-anywhere px-4 py-3.5 align-top font-medium">
                                    {document.name}
                                </td>
                                <td className="wrap-anywhere px-4 py-3.5 align-top text-slate-600 customer-dark:text-content-secondary">
                                    {document.version || "—"}
                                </td>
                                <td className="wrap-anywhere px-4 py-3.5 align-top text-slate-600 customer-dark:text-content-secondary">
                                    {getDocumentLevelLabel(document.documentLevel)}
                                </td>
                                <td className="wrap-anywhere px-4 py-3.5 align-top text-slate-600 customer-dark:text-content-secondary">
                                    {document.territoryName || "—"}
                                </td>
                                <td className="wrap-anywhere px-4 py-3.5 align-top text-slate-600 customer-dark:text-content-secondary">
                                    {formatUploadedAt(document.uploadedAt)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <nav
                aria-label="Страницы библиотеки"
                className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
            >
                <span>
                    {firstDocumentNumber}–{lastDocumentNumber} из {totalCount}
                </span>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        className={PAGINATION_BUTTON_CLASS_NAME}
                        disabled={currentPage === 1}
                        onClick={onPreviousPage}
                    >
                        Назад
                    </button>
                    <span>
                        {currentPage} / {pageCount}
                    </span>
                    <button
                        type="button"
                        className={PAGINATION_BUTTON_CLASS_NAME}
                        disabled={currentPage === pageCount}
                        onClick={onNextPage}
                    >
                        Далее
                    </button>
                </div>
            </nav>
        </div>
    );
}
