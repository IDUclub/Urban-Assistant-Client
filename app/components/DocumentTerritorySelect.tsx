import {
    type CSSProperties,
    useEffect,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import {
    IoCheckmark,
    IoChevronBack,
    IoChevronDown,
} from "react-icons/io5";
import type { ProjectCreationTerritoryOption } from "@lib/DataStore";
import type { DocumentTerritoryLevel } from "@lib/DocumentsStore";

export type DocumentTerritoryScope = "" | DocumentTerritoryLevel;

interface DocumentTerritorySelectProps {
    scope: DocumentTerritoryScope;
    territoryId: number | null;
    territories: ProjectCreationTerritoryOption[];
    isLoading: boolean;
    errorText: string | null;
    disabled?: boolean;
    onScopeChange: (scope: DocumentTerritoryScope) => void;
    onTerritoryChange: (territoryId: number) => void;
}

const scopeOptions: Array<{
    label: string;
    value: DocumentTerritoryScope;
}> = [
    { label: "Не выбрано", value: "" },
    { label: "Федеральный уровень", value: "federal" },
    { label: "Региональный уровень", value: "regional" },
    { label: "Местный уровень", value: "local" },
];

function getScopeLabel(scope: DocumentTerritoryScope) {
    return scopeOptions.find((option) => option.value === scope)?.label ?? "Не выбрано";
}

function DocumentTerritorySelect({
    scope,
    territoryId,
    territories,
    isLoading,
    errorText,
    disabled = false,
    onScopeChange,
    onTerritoryChange,
}: DocumentTerritorySelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [screen, setScreen] = useState<DocumentTerritoryScope>("");
    const [searchQuery, setSearchQuery] = useState("");
    const containerRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const [menuStyle, setMenuStyle] = useState<CSSProperties>({
        position: "fixed",
        visibility: "hidden",
        maxHeight: "min(24rem, 50vh)",
    });

    const selectedTerritoryName = territories.find(
        (territory) => territory.territory_id === territoryId,
    )?.name;
    const triggerLabel = scope === "federal"
        ? "Федеральный уровень — Россия"
        : scope === "regional" || scope === "local"
            ? `${getScopeLabel(scope)}${selectedTerritoryName ? ` — ${selectedTerritoryName}` : ""}`
            : getScopeLabel(scope);
    const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase("ru");
    const filteredTerritories = normalizedSearchQuery
        ? territories.filter((territory) => (
            territory.name.toLocaleLowerCase("ru").includes(normalizedSearchQuery)
        ))
        : territories;
    const isTerritoryScreen = screen === "regional" || screen === "local";

    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                !containerRef.current?.contains(target)
                && !menuRef.current?.contains(target)
            ) {
                setIsOpen(false);
            }
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setIsOpen(false);
            triggerRef.current?.focus();
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleEscape, true);

        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleEscape, true);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !isTerritoryScreen) return;
        searchInputRef.current?.focus();
    }, [isOpen, isTerritoryScreen, screen]);

    useEffect(() => {
        if (!isOpen) return;

        const updateMenuPosition = () => {
            const triggerRect = triggerRef.current?.getBoundingClientRect();
            if (!triggerRect) return;

            const viewportPadding = 16;
            const menuGap = 12;
            const availableBelow = window.innerHeight - triggerRect.bottom - viewportPadding - menuGap;
            const availableAbove = triggerRect.top - viewportPadding - menuGap;
            const shouldOpenUpwards = availableBelow < 340 && availableAbove > availableBelow;
            const availableHeight = Math.max(
                0,
                shouldOpenUpwards ? availableAbove : availableBelow,
            );
            const menuWidth = Math.min(
                triggerRect.width,
                window.innerWidth - viewportPadding * 2,
            );
            const menuLeft = Math.min(
                Math.max(triggerRect.left, viewportPadding),
                window.innerWidth - viewportPadding - menuWidth,
            );

            setMenuStyle({
                position: "fixed",
                visibility: "visible",
                left: Math.floor(menuLeft),
                width: Math.floor(menuWidth),
                maxHeight: Math.floor(Math.min(384, availableHeight)),
                top: shouldOpenUpwards
                    ? undefined
                    : Math.floor(triggerRect.bottom + menuGap),
                bottom: shouldOpenUpwards
                    ? Math.floor(window.innerHeight - triggerRect.top + menuGap)
                    : undefined,
            });
        };

        updateMenuPosition();
        window.addEventListener("resize", updateMenuPosition);
        window.addEventListener("scroll", updateMenuPosition, true);

        return () => {
            window.removeEventListener("resize", updateMenuPosition);
            window.removeEventListener("scroll", updateMenuPosition, true);
        };
    }, [isOpen]);

    const handleScopeSelect = (nextScope: DocumentTerritoryScope) => {
        onScopeChange(nextScope);

        if (nextScope === "regional" || nextScope === "local") {
            setScreen(nextScope);
            setSearchQuery("");
            return;
        }

        setIsOpen(false);
        triggerRef.current?.focus();
    };

    return (
        <div ref={containerRef} className="relative w-full">
            <div className="absolute -inset-0.5 -z-10 rounded-3xl bg-linear-to-r from-brand-gradient-start via-brand-gradient-middle to-brand-gradient-end opacity-30 blur-[3px]" />
            <button
                ref={triggerRef}
                type="button"
                className="relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-[1.75rem] border border-gray-500/30 bg-white px-6 py-2.5 text-left text-sm font-medium tracking-[0.01em] text-black transition duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/70 disabled:cursor-not-allowed disabled:opacity-50 customer:focus:ring-brand-primary/35 customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-primary"
                onClick={() => {
                    if (isOpen) {
                        setIsOpen(false);
                        return;
                    }

                    setScreen("");
                    setSearchQuery("");
                    setMenuStyle((current) => ({
                        ...current,
                        visibility: "hidden",
                    }));
                    setIsOpen(true);
                }}
                disabled={disabled}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
            >
                <span className="relative min-w-0 truncate">{triggerLabel}</span>
                <span className={`relative shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>
                    <IoChevronDown size={18} aria-hidden="true" />
                </span>
            </button>

            {isOpen && createPortal(
                <div
                    ref={menuRef}
                    data-custom-select-menu="true"
                    style={menuStyle}
                    className="fixed z-200 flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/95 p-2 shadow-[0_24px_20px_-24px_var(--shadow-menu)] backdrop-blur customer-dark:border-ui-border customer-dark:bg-surface-raised/95"
                >
                    {!isTerritoryScreen ? (
                        <ul className="min-h-0 max-h-80 flex-1 overflow-y-auto" role="listbox">
                            {scopeOptions.map((option) => {
                                const isSelected = option.value === scope;

                                return (
                                    <li key={option.value || "none"}>
                                        <button
                                            type="button"
                                            className={`flex w-full items-center justify-between gap-4 rounded-2xl px-4 py-3 text-left text-sm transition-colors duration-150 ${isSelected
                                                ? "bg-[#EAF5FF] text-[#0B5E8E] customer:bg-brand-soft customer:text-brand-contrast"
                                                : "text-slate-700 hover:bg-slate-100 customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover"}`}
                                            onClick={() => handleScopeSelect(option.value)}
                                        >
                                            <span>{option.label}</span>
                                            <IoCheckmark
                                                size={18}
                                                className={isSelected ? "shrink-0" : "shrink-0 text-transparent"}
                                                aria-hidden="true"
                                            />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 px-1 pb-2">
                                <button
                                    type="button"
                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40 customer-dark:text-content-muted customer-dark:hover:bg-surface-hover customer-dark:hover:text-content-primary"
                                    onClick={() => {
                                        if (territoryId === null) onScopeChange("");
                                        setScreen("");
                                        setSearchQuery("");
                                    }}
                                    aria-label="Назад к уровням территории"
                                >
                                    <IoChevronBack size={20} aria-hidden="true" />
                                </button>
                                <span className="min-w-0 truncate text-sm font-semibold text-slate-800 customer-dark:text-content-primary">
                                    {getScopeLabel(screen)}
                                </span>
                            </div>

                            <div className="px-2 pb-2">
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                    onKeyDown={(event) => event.stopPropagation()}
                                    placeholder="Поиск"
                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-[#0788CE] customer:focus:border-brand-primary customer-dark:border-ui-border customer-dark:bg-surface-panel customer-dark:text-content-secondary customer-dark:placeholder:text-content-muted"
                                />
                            </div>

                            {isLoading ? (
                                <div className="px-4 py-5 text-center text-sm text-slate-500 customer-dark:text-content-muted" role="status">
                                    Загрузка территорий...
                                </div>
                            ) : errorText ? (
                                <div className="px-4 py-5 text-center text-sm text-red-700 customer-dark:text-danger-content" role="alert">
                                    {errorText}
                                </div>
                            ) : filteredTerritories.length > 0 ? (
                                <ul className="min-h-0 max-h-72 flex-1 overflow-y-auto" role="listbox">
                                    {filteredTerritories.map((territory) => {
                                        const isSelected = territory.territory_id === territoryId;

                                        return (
                                            <li key={territory.territory_id}>
                                                <button
                                                    type="button"
                                                    className={`flex w-full items-center justify-between gap-4 rounded-2xl px-4 py-3 text-left text-sm transition-colors duration-150 ${isSelected
                                                        ? "bg-[#EAF5FF] text-[#0B5E8E] customer:bg-brand-soft customer:text-brand-contrast"
                                                        : "text-slate-700 hover:bg-slate-100 customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover"}`}
                                                    onClick={() => {
                                                        onTerritoryChange(territory.territory_id);
                                                        setIsOpen(false);
                                                        triggerRef.current?.focus();
                                                    }}
                                                >
                                                    <span className="min-w-0 whitespace-normal wrap-anywhere">
                                                        {territory.name}
                                                    </span>
                                                    <IoCheckmark
                                                        size={18}
                                                        className={isSelected ? "shrink-0" : "shrink-0 text-transparent"}
                                                        aria-hidden="true"
                                                    />
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <div className="px-4 py-5 text-center text-sm text-slate-500 customer-dark:text-content-muted">
                                    Территории недоступны
                                </div>
                            )}
                        </>
                    )}
                </div>,
                document.body,
            )}
        </div>
    );
}

export default DocumentTerritorySelect;
