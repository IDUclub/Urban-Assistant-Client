import type { ChangeEvent, RefObject } from "react";
import { MdMap } from "react-icons/md";
import {
    DOCUMENT_LEVELS,
    type DocumentLevel,
} from "@lib/documentLibrary";
import CustomSelect, { type SelectOption } from "@components/ui/Select";

type DocumentLibraryFiltersProps = {
    searchQuery: string;
    documentLevel: DocumentLevel | "";
    selectedTerritoryId: string;
    territoryOptions: SelectOption[];
    isTerritoryListLoading: boolean;
    hasTerritoryListError: boolean;
    hasActiveFilters: boolean;
    isMapVisible: boolean;
    searchInputRef: RefObject<HTMLInputElement | null>;
    onSearchChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onDocumentLevelChange: (event: ChangeEvent<HTMLSelectElement>) => void;
    onTerritoryChange: (value: string | number) => void;
    onRetryTerritories: () => void;
    onReset: () => void;
    onToggleMap: () => void;
};

const FORM_CONTROL_CLASS_NAME =
    "rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 disabled:opacity-50 customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-primary";

export default function DocumentLibraryFilters({
    searchQuery,
    documentLevel,
    selectedTerritoryId,
    territoryOptions,
    isTerritoryListLoading,
    hasTerritoryListError,
    hasActiveFilters,
    isMapVisible,
    searchInputRef,
    onSearchChange,
    onDocumentLevelChange,
    onTerritoryChange,
    onRetryTerritories,
    onReset,
    onToggleMap,
}: DocumentLibraryFiltersProps) {
    return (
        <>
            <div className="grid items-end gap-3 md:grid-cols-3">
                <label className="flex min-w-0 flex-col gap-2 text-sm">
                    Поиск по названию
                    <input
                        ref={searchInputRef}
                        type="search"
                        value={searchQuery}
                        className={FORM_CONTROL_CLASS_NAME}
                        placeholder="Название документа"
                        onChange={onSearchChange}
                    />
                </label>
                <label className="flex min-w-0 flex-col gap-2 text-sm">
                    Уровень документа
                    <select
                        value={documentLevel}
                        className={FORM_CONTROL_CLASS_NAME}
                        onChange={onDocumentLevelChange}
                    >
                        <option value="">Все уровни</option>
                        {Object.entries(DOCUMENT_LEVELS).map(
                            ([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ),
                        )}
                    </select>
                </label>
                <div className="min-w-0 text-sm">
                    <p className="mb-2">Территория</p>
                    {isTerritoryListLoading ? (
                        <p role="status" className="py-2.5">
                            Загрузка территорий…
                        </p>
                    ) : (
                        <CustomSelect
                            block
                            value={selectedTerritoryId}
                            options={territoryOptions}
                            onChange={onTerritoryChange}
                        />
                    )}
                </div>
            </div>
            {hasTerritoryListError && (
                <p
                    role="alert"
                    className="mt-3 text-sm text-red-600 customer-dark:text-danger"
                >
                    Не удалось загрузить территории.{" "}
                    <button
                        type="button"
                        className="underline"
                        onClick={onRetryTerritories}
                    >
                        Повторить
                    </button>
                </p>
            )}
            <div className="flex min-h-8 justify-end gap-4 py-3 text-sm">
                {hasActiveFilters && (
                    <button
                        type="button"
                        className="text-[#0B5E8E] underline customer:text-brand-contrast"
                        onClick={onReset}
                    >
                        Сбросить фильтры
                    </button>
                )}
                <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-[#0B5E8E] underline customer:text-brand-contrast"
                    onClick={onToggleMap}
                    aria-expanded={isMapVisible}
                    aria-controls="document-library-map"
                >
                    <MdMap size={18} aria-hidden="true" />
                    {isMapVisible ? "Скрыть карту" : "Показать карту"}
                </button>
            </div>
        </>
    );
}
