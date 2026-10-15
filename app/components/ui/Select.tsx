import {
    type CSSProperties,
    type ReactNode,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react-lite";
import { IoCheckmark, IoChevronDown } from "react-icons/io5";

export type SelectOption = {
    label: string;
    value: string | number;
    previewColors?: readonly string[];
};

interface CustomSelectProps {
    value?: string | number;
    options: SelectOption[];
    onChange: (value: string | number) => void;
    placeholder?: string;
    block?: boolean;
    compactGlow?: boolean;
    compact?: boolean;
    searchable?: boolean;
    fitMenuToOptions?: boolean;
    ariaLabel?: string;
    trailingAction?: {
        icon: ReactNode;
        label: string;
        title?: string;
        disabled?: boolean;
        onClick: () => void;
    };
}

function CustomSelect({
    value,
    options,
    onChange,
    placeholder,
    block,
    compactGlow,
    compact = false,
    searchable = true,
    fitMenuToOptions = false,
    ariaLabel,
    trailingAction,
}: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const trailingActionTooltipId = useId();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLDivElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const [menuStyle, setMenuStyle] = useState<CSSProperties>({
        position: "fixed",
        visibility: "hidden",
        maxHeight: "min(24rem, 50vh)",
    });
    const selectedOption = options.find((option) => option.value == value);
    const normalizedSearchQuery = searchQuery.trim().toLowerCase();
    const filteredOptions = normalizedSearchQuery
        ? options.filter((option) => option.label.toLowerCase().includes(normalizedSearchQuery))
        : options;
    const widestOption = options.reduce(
        (widest, option) => option.label.length > widest.label.length ? option : widest,
        options[0] ?? { label: "", value: "" },
    );

    useEffect(() => {
        if (!isOpen) return;

        setSearchQuery("");
        if (searchable) searchInputRef.current?.focus();

        const handlePointerDown = (event: MouseEvent) => {
            const eventTarget = event.target as Node;

            if (
                !containerRef.current?.contains(eventTarget)
                && !menuRef.current?.contains(eventTarget)
            ) {
                setIsOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleEscape);

        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [isOpen, searchable]);

    useEffect(() => {
        if (!isOpen) return;

        const updateMenuPosition = () => {
            const triggerRect = triggerRef.current?.getBoundingClientRect();
            if (!triggerRect) return;

            const viewportPadding = 16;
            const menuGap = compact ? 6 : 12;
            const availableBelow = window.innerHeight - triggerRect.bottom - viewportPadding - menuGap;
            const availableAbove = triggerRect.top - viewportPadding - menuGap;
            const shouldOpenUpwards = availableBelow < 340 && availableAbove > availableBelow;
            const availableHeight = Math.max(
                0,
                shouldOpenUpwards ? availableAbove : availableBelow,
            );
            const maximumMenuWidth = window.innerWidth - viewportPadding * 2;
            const context = document.createElement("canvas").getContext("2d");
            const triggerButton = triggerRef.current?.querySelector("button");
            if (context && triggerButton) {
                context.font = `500 13px ${window.getComputedStyle(triggerButton).fontFamily}`;
            }
            const optionTextWidth = context?.measureText(widestOption.label).width
                ?? widestOption.label.length * 7;
            const optionExtrasWidth = widestOption.previewColors?.length ? 76 : 44;
            const fittedMenuWidth = Math.ceil(optionTextWidth + optionExtrasWidth);
            const menuWidth = Math.min(
                fitMenuToOptions
                    ? Math.max(triggerRect.width, fittedMenuWidth)
                    : triggerRect.width,
                maximumMenuWidth,
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
    }, [
        compact,
        fitMenuToOptions,
        isOpen,
        widestOption.label,
        widestOption.previewColors?.length,
    ]);

    return (
        <div
            ref={containerRef}
            className={`
                group relative max-w-full shrink-0
                ${block ? "w-full" : "w-fit"}
            `}
        >
            <div
                ref={triggerRef}
                className={`
                    relative w-fit
                    ${block ? "w-full" : "w-fit"}
                `}
            >
                {!compact && (
                    <div
                        className={`
                            absolute -z-10 rounded-3xl bg-linear-to-r
                            from-brand-gradient-start via-brand-gradient-middle to-brand-gradient-end
                            ${compactGlow
                                ? "-inset-0.5 opacity-30 blur-[3px]"
                                : "-inset-0.75 opacity-30 blur-sm"}
                        `}
                    />
                )}
                <button
                    type="button"
                    className={`
                        relative flex ${block ? "w-full" : "w-fit max-w-70"} items-center justify-between overflow-hidden border bg-white text-left text-black
                        customer-dark:bg-surface-raised customer-dark:border-ui-border customer-dark:text-content-primary
                        ${compact
                            ? "h-7 gap-1.5 rounded-lg border-gray-200 px-2 !text-[13px] leading-none font-medium transition-colors hover:border-[#0788CE] focus:outline-none focus:ring-2 focus:ring-[#0788CE]/20 customer:hover:border-brand-primary customer:focus:ring-brand-primary/20"
                            : `gap-4 rounded-[1.75rem] border-gray-500/30 pl-6 ${trailingAction ? "pr-14" : "pr-6"} py-2.5 text-sm font-medium tracking-[0.01em] transition duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/70 customer:focus:ring-brand-primary/35`}
                        ${isOpen
                            ? compact
                                ? "border-[#0788CE] ring-2 ring-[#0788CE]/20 customer:border-brand-primary customer:ring-brand-primary/20"
                                : "ring-2 ring-white/70 customer:ring-brand-primary/35"
                            : ""}
                    `}
                    onClick={() => {
                        setMenuStyle((current) => ({
                            ...current,
                            visibility: "hidden",
                        }));
                        setIsOpen((current) => !current);
                    }}
                    aria-expanded={isOpen}
                    aria-haspopup="listbox"
                    aria-label={ariaLabel}
                >
                    <span className="relative flex min-w-0 items-center gap-2 truncate">
                        {!!selectedOption?.previewColors?.length && (
                            <span
                                className={`${compact ? "h-2 w-8" : "h-2.5 w-10"} shrink-0 rounded-full border border-black/10`}
                                style={{ background: `linear-gradient(to right, ${selectedOption.previewColors.join(", ")})` }}
                            />
                        )}
                        <span className="truncate">{selectedOption?.label ?? placeholder ?? "Выберите значение"}</span>
                    </span>
                    <span className={`relative shrink-0 text-black transition-transform duration-200 customer-dark:text-content-primary ${isOpen ? "rotate-180" : ""}`}>
                        <IoChevronDown size={compact ? 12 : 18} />
                    </span>
                </button>
                {trailingAction && (
                    <>
                        <button
                            type="button"
                            className="peer absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[#0788CE] transition-colors hover:bg-[#EAF5FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40 disabled:cursor-not-allowed disabled:opacity-40 customer:text-brand-primary customer:hover:bg-brand-soft customer:focus-visible:ring-brand-primary/40"
                            onClick={(event) => {
                                event.stopPropagation();
                                setIsOpen(false);
                                trailingAction.onClick();
                            }}
                            disabled={trailingAction.disabled}
                            aria-label={trailingAction.label}
                            aria-describedby={trailingActionTooltipId}
                        >
                            {trailingAction.icon}
                        </button>
                        <span
                            id={trailingActionTooltipId}
                            role="tooltip"
                            className="pointer-events-none invisible absolute right-0 top-full z-20 mt-2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg peer-hover:visible peer-hover:opacity-100 peer-focus-visible:visible peer-focus-visible:opacity-100 customer-dark:bg-slate-100 customer-dark:text-slate-900"
                        >
                            {trailingAction.title ?? trailingAction.label}
                        </span>
                    </>
                )}
            </div>            
            {isOpen && createPortal(
                <div
                    ref={menuRef}
                    data-custom-select-menu="true"
                    style={menuStyle}
                    className={`
                        fixed z-200 flex flex-col overflow-hidden
                        ${compact ? "rounded-xl" : "rounded-3xl"}
                        border border-slate-200 bg-white/95 shadow-[0_24px_20px_-24px_var(--shadow-menu)] backdrop-blur
                        customer-dark:border-ui-border customer-dark:bg-surface-raised/95
                    `}
                >
                    <div className={compact ? "p-1" : "p-2"}>
                        {searchable && (
                            <div className={compact ? "px-0.5 pb-1" : "px-2 pb-2"}>
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                    onKeyDown={(event) => event.stopPropagation()}
                                    placeholder="Поиск"
                                    className={compact
                                        ? "h-7 w-full rounded-md border border-slate-200 bg-white px-2 !text-[13px] leading-none text-slate-700 outline-none transition-colors focus:border-[#0788CE] customer:focus:border-brand-primary customer-dark:border-ui-border customer-dark:bg-surface-panel customer-dark:text-content-secondary customer-dark:placeholder:text-content-muted"
                                        : "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-[#0788CE] customer:focus:border-brand-primary customer-dark:border-ui-border customer-dark:bg-surface-panel customer-dark:text-content-secondary customer-dark:placeholder:text-content-muted"}
                                />
                            </div>
                        )}
                        <ul className="min-h-0 max-h-80 flex-1 overflow-y-auto" role="listbox">
                            {filteredOptions.map((option) => {
                                const isSelected = option.value === value;

                                return (
                                    <li key={`${option.value}`}>
                                        <button
                                            type="button"
                                            className={`
                                                flex w-full items-center justify-between text-left
                                                ${compact ? "min-h-6 gap-1.5 rounded-md px-2 py-0.5 !text-[13px] leading-4" : "gap-4 rounded-2xl px-4 py-3 text-sm"}
                                                transition-colors duration-150
                                                ${isSelected
                                                    ? "bg-[#EAF5FF] text-[#0B5E8E] customer:bg-brand-soft customer:text-brand-contrast"
                                                    : "text-slate-700 hover:bg-slate-100 customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover"}
                                            `}
                                            onClick={() => {
                                                onChange(option.value);
                                                setIsOpen(false);
                                            }}
                                        >
                                            <span className="flex min-w-0 items-center gap-2">
                                                {!!option.previewColors?.length && (
                                                    <span
                                                        className={`${compact ? "h-2 w-8" : "h-2.5 w-10"} shrink-0 rounded-full border border-black/10`}
                                                        style={{ background: `linear-gradient(to right, ${option.previewColors.join(", ")})` }}
                                                    />
                                                )}
                                                <span className={fitMenuToOptions ? "whitespace-nowrap" : "truncate"}>{option.label}</span>
                                            </span>
                                            <span className={`shrink-0 ${isSelected ? "text-[#0B5E8E] customer:text-brand-contrast" : "text-transparent"}`}>
                                                <IoCheckmark size={compact ? 12 : 18} />
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                            {filteredOptions.length === 0 && (
                                <li className={`${compact ? "px-2 py-1 text-[13px] leading-4" : "px-4 py-3 text-sm"} text-slate-500 customer-dark:text-content-muted`}>
                                    Ничего не найдено
                                </li>
                            )}
                        </ul>
                    </div>
                </div>,
                document.body,
            )}
        </div>
    );
}

export default CustomSelect;
