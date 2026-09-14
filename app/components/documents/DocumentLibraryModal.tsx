import {
    type ChangeEvent,
    type MouseEvent,
    type ReactNode,
    lazy,
    Suspense,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { MdClose } from "react-icons/md";
import {
    getLibraryDocuments,
    type DocumentLevel,
    type LibraryDocument,
} from "@lib/documentLibrary";
import { getDocumentsRequestErrorMessage } from "@lib/DocumentsStore";
import DataStore from "@lib/DataStore";
import type { SelectOption } from "@components/ui/Select";
import DocumentLibraryFilters from "./DocumentLibraryFilters";
import DocumentLibraryTable from "./DocumentLibraryTable";
import useDocumentModal from "./useDocumentModal";

const PAGE_SIZE = 25;
const DocumentLibraryMap = lazy(() => import("./DocumentLibraryMap"));

type TerritoryOption = {
    id: string;
    name: string;
};

type DocumentLibraryModalProps = {
    onClose: () => void;
};

function filterDocumentsByName(
    documents: LibraryDocument[],
    searchQuery: string,
) {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("ru");

    if (!normalizedQuery) {
        return documents;
    }

    return documents.filter((document) =>
        document.name.toLocaleLowerCase("ru").includes(normalizedQuery),
    );
}

export default function DocumentLibraryModal({
    onClose,
}: DocumentLibraryModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);

    const [searchQuery, setSearchQuery] = useState("");
    const [documentLevel, setDocumentLevel] = useState<DocumentLevel | "">("");
    const [selectedTerritoryId, setSelectedTerritoryId] = useState("");
    const [territories, setTerritories] = useState<TerritoryOption[]>([]);
    const [isTerritoryListLoading, setIsTerritoryListLoading] = useState(true);
    const [hasTerritoryListError, setHasTerritoryListError] = useState(false);
    const [territoryLoadAttempt, setTerritoryLoadAttempt] = useState(0);
    const [isMapVisible, setIsMapVisible] = useState(false);

    const [documents, setDocuments] = useState<LibraryDocument[]>([]);
    const [isDocumentListLoading, setIsDocumentListLoading] = useState(true);
    const [documentListError, setDocumentListError] = useState<string | null>(
        null,
    );
    const [documentLoadAttempt, setDocumentLoadAttempt] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);

    useDocumentModal({
        dialogRef,
        initialFocusRef: searchInputRef,
        trapFocus: true,
        onClose,
    });

    useEffect(() => {
        let isRequestActive = true;

        setIsTerritoryListLoading(true);
        setHasTerritoryListError(false);

        DataStore.getProjectCreationTerritories()
            .then((loadedTerritories) => {
                if (!isRequestActive) {
                    return;
                }

                setTerritories(
                    loadedTerritories.map((territory) => ({
                        id: String(territory.territory_id),
                        name: territory.name,
                    })),
                );
            })
            .catch(() => {
                if (isRequestActive) {
                    setHasTerritoryListError(true);
                }
            })
            .finally(() => {
                if (isRequestActive) {
                    setIsTerritoryListLoading(false);
                }
            });

        return () => {
            isRequestActive = false;
        };
    }, [territoryLoadAttempt]);

    useEffect(() => {
        const controller = new AbortController();

        setIsDocumentListLoading(true);
        setDocumentListError(null);
        setDocuments([]);

        getLibraryDocuments({
            documentLevel,
            territoryId: selectedTerritoryId,
            signal: controller.signal,
        })
            .then((loadedDocuments) => {
                if (controller.signal.aborted) {
                    return;
                }

                setDocuments(loadedDocuments);
                setCurrentPage(1);
            })
            .catch((error) => {
                if (controller.signal.aborted) {
                    return;
                }

                setDocumentListError(
                    getDocumentsRequestErrorMessage(
                        error,
                        "Не удалось загрузить библиотеку документов.",
                    ),
                );
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsDocumentListLoading(false);
                }
            });

        return () => controller.abort();
    }, [documentLevel, selectedTerritoryId, documentLoadAttempt]);

    const filteredDocuments = useMemo(
        () => filterDocumentsByName(documents, searchQuery),
        [documents, searchQuery],
    );
    const pageCount = Math.max(
        1,
        Math.ceil(filteredDocuments.length / PAGE_SIZE),
    );
    const activePage = Math.min(currentPage, pageCount);
    const pageStart = (activePage - 1) * PAGE_SIZE;
    const pageDocuments = filteredDocuments.slice(
        pageStart,
        pageStart + PAGE_SIZE,
    );
    const hasActiveFilters = Boolean(
        searchQuery || documentLevel || selectedTerritoryId,
    );
    const territorySelectOptions: SelectOption[] = [
        {
            value: "",
            label: "Все территории",
        },
        ...territories.map((territory) => ({
            value: territory.id,
            label: territory.name,
        })),
    ];

    useEffect(() => {
        tableScrollRef.current?.scrollTo({ top: 0 });
    }, [activePage, searchQuery, documentLevel, selectedTerritoryId]);

    const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(event.target.value);
        setCurrentPage(1);
    };

    const handleDocumentLevelChange = (
        event: ChangeEvent<HTMLSelectElement>,
    ) => {
        setDocumentLevel(event.target.value as DocumentLevel | "");
        setCurrentPage(1);
    };

    const handleTerritoryChange = (value: string | number) => {
        setSelectedTerritoryId(String(value));
        setCurrentPage(1);
    };

    const handleTerritoryMapClick = (
        territoryId: number,
        territoryName: string,
        selectedDocumentLevel: DocumentLevel | null,
    ) => {
        const territoryIdAsString = String(territoryId);

        setTerritories((currentTerritories) => {
            const territoryIsAlreadyAvailable = currentTerritories.some(
                (territory) => territory.id === territoryIdAsString,
            );

            if (territoryIsAlreadyAvailable) {
                return currentTerritories;
            }

            const updatedTerritories = [
                ...currentTerritories,
                {
                    id: territoryIdAsString,
                    name: territoryName || `Территория ${territoryId}`,
                },
            ];

            return updatedTerritories.sort((left, right) =>
                left.name.localeCompare(right.name, "ru"),
            );
        });

        setSelectedTerritoryId(territoryIdAsString);
        setDocumentLevel(selectedDocumentLevel ?? "");
        setCurrentPage(1);
    };

    const resetFilters = () => {
        setSearchQuery("");
        setDocumentLevel("");
        setSelectedTerritoryId("");
        setCurrentPage(1);
    };

    const retryDocumentLoading = () => {
        setDocumentLoadAttempt((attempt) => attempt + 1);
    };

    const retryTerritoryLoading = () => {
        setTerritoryLoadAttempt((attempt) => attempt + 1);
    };

    const toggleMap = () => {
        setIsMapVisible((currentValue) => !currentValue);
    };

    const goToPreviousPage = () => {
        setCurrentPage(activePage - 1);
    };

    const goToNextPage = () => {
        setCurrentPage(activePage + 1);
    };

    const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) {
            onClose();
        }
    };

    let libraryContent: ReactNode;

    if (isDocumentListLoading) {
        libraryContent = (
            <p role="status" className="py-16 text-center">
                Загрузка документов…
            </p>
        );
    } else if (documentListError) {
        libraryContent = (
            <div role="alert" className="py-12 text-center">
                <p className="mb-4">{documentListError}</p>
                <button
                    type="button"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-primary"
                    onClick={retryDocumentLoading}
                >
                    Повторить
                </button>
            </div>
        );
    } else if (!filteredDocuments.length) {
        libraryContent = (
            <div className="py-16 text-center">
                <h3 className="font-semibold">
                    {hasActiveFilters
                        ? "Документы не найдены"
                        : "В библиотеке пока нет документов"}
                </h3>
                {hasActiveFilters && (
                    <p className="mt-2 text-sm">
                        Измените поисковый запрос или сбросьте фильтры.
                    </p>
                )}
            </div>
        );
    } else {
        libraryContent = (
            <div
                className={isMapVisible
                    ? "grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]"
                    : "min-w-0"}
            >
                <DocumentLibraryTable
                    documents={pageDocuments}
                    currentPage={activePage}
                    pageCount={pageCount}
                    totalCount={filteredDocuments.length}
                    pageSize={PAGE_SIZE}
                    scrollContainerRef={tableScrollRef}
                    onPreviousPage={goToPreviousPage}
                    onNextPage={goToNextPage}
                />
                {isMapVisible && (
                    <Suspense
                        fallback={(
                            <div
                                id="document-library-map"
                                className="flex min-h-80 items-center justify-center rounded-2xl border border-slate-200 text-sm text-slate-500 customer-dark:border-ui-border customer-dark:text-content-muted"
                                role="status"
                            >
                                Загрузка карты…
                            </div>
                        )}
                    >
                        <DocumentLibraryMap
                            allDocuments={documents}
                            visibleDocuments={filteredDocuments}
                            selectedTerritoryId={selectedTerritoryId}
                            onSelectTerritory={handleTerritoryMapClick}
                        />
                    </Suspense>
                )}
            </div>
        );
    }

    return createPortal(
        <div
            className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]"
            onMouseDown={handleBackdropMouseDown}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="library-title"
                className="flex max-h-[calc(100dvh-2rem)] w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-xl customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-primary"
            >
                <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 customer-dark:border-ui-border">
                    <div className="flex flex-wrap items-center gap-3">
                        <h2 id="library-title" className="text-xl font-semibold">
                            Библиотека предзагруженных документов
                        </h2>
                        {!isDocumentListLoading && !documentListError && (
                            <span className="rounded-full bg-[#EAF5FF] px-2.5 py-1 text-xs font-semibold text-[#0B5E8E] customer:bg-brand-soft customer:text-brand-contrast">
                                {filteredDocuments.length}
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        className="shrink-0 rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40 customer:focus-visible:ring-brand-primary/40 customer-dark:text-content-muted customer-dark:hover:bg-surface-hover customer-dark:hover:text-content-primary"
                        onClick={onClose}
                        aria-label="Закрыть библиотеку"
                    >
                        <MdClose size={22} />
                    </button>
                </header>
                <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
                    <DocumentLibraryFilters
                        searchQuery={searchQuery}
                        documentLevel={documentLevel}
                        selectedTerritoryId={selectedTerritoryId}
                        territoryOptions={territorySelectOptions}
                        isTerritoryListLoading={isTerritoryListLoading}
                        hasTerritoryListError={hasTerritoryListError}
                        hasActiveFilters={hasActiveFilters}
                        isMapVisible={isMapVisible}
                        searchInputRef={searchInputRef}
                        onSearchChange={handleSearchChange}
                        onDocumentLevelChange={handleDocumentLevelChange}
                        onTerritoryChange={handleTerritoryChange}
                        onRetryTerritories={retryTerritoryLoading}
                        onReset={resetFilters}
                        onToggleMap={toggleMap}
                    />
                    {libraryContent}
                </div>
            </div>
        </div>,
        document.body,
    );
}
