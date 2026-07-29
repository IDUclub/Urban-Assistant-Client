import {
    type CSSProperties,
    useEffect,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react-lite";
import { IoCheckmark, IoChevronDown } from "react-icons/io5";

export type SelectOption = {
    label: string;
    value: string | number;
};

interface CustomSelectProps {
    value?: string | number;
    options: SelectOption[];
    onChange: (value: string | number) => void;
    placeholder?: string;
    block?: boolean;
    compactGlow?: boolean;
}

function CustomSelect({
    value,
    options,
    onChange,
    placeholder,
    block,
    compactGlow,
}: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
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

    useEffect(() => {
        if (!isOpen) return;

        setSearchQuery("");
        searchInputRef.current?.focus();

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
    }, [isOpen]);

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
                <div
                    className={`
                        absolute -z-10 rounded-3xl bg-linear-to-r
                        from-brand-gradient-start via-brand-gradient-middle to-brand-gradient-end
                        ${compactGlow
                            ? "-inset-0.5 opacity-30 blur-[3px]"
                            : "-inset-0.75 opacity-30 blur-sm"}
                    `}
                />
                <button
                    type="button"
                    className={`
                        relative flex ${block ? "w-full" : "w-fit max-w-70"} items-center justify-between gap-4 overflow-hidden rounded-[1.75rem]
                        bg-white border border-gray-500/30
                        px-6 py-2.5 text-left text-sm font-medium tracking-[0.01em] text-black
                        transition duration-200 hover:-translate-y-0.5
                        focus:outline-none focus:ring-2 focus:ring-white/70
                        customer:focus:ring-brand-primary/35 customer-dark:bg-surface-raised customer-dark:border-ui-border customer-dark:text-content-primary
                        ${isOpen ? "ring-2 ring-white/70 customer:ring-brand-primary/35" : ""}
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
                >
                    {/* <span className="pointer-events-none absolute inset-0 bg-linear-to-r from-white/12 via-transparent to-black/5" /> */}
                    <span className="relative truncate">{selectedOption?.label ?? placeholder ?? "Выберите значение"}</span>
                    <span className={`relative shrink-0 text-black transition-transform duration-200 customer-dark:text-content-primary ${isOpen ? "rotate-180" : ""}`}>
                        <IoChevronDown size={18} />
                    </span>
                </button>
            </div>            
            {isOpen && createPortal(
                <div
                    ref={menuRef}
                    data-custom-select-menu="true"
                    style={menuStyle}
                    className="
                        fixed z-200 flex flex-col overflow-hidden rounded-3xl
                        border border-slate-200 bg-white/95 p-2 shadow-[0_24px_20px_-24px_var(--shadow-menu)] backdrop-blur
                        customer-dark:border-ui-border customer-dark:bg-surface-raised/95
                    "
                >
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
                    <ul className="min-h-0 max-h-80 flex-1 overflow-y-auto" role="listbox">
                        {filteredOptions.map((option) => {
                            const isSelected = option.value === value;

                            return (
                                <li key={`${option.value}`}>
                                    <button
                                        type="button"
                                        className={`
                                            flex w-full items-center justify-between gap-4 rounded-2xl px-4 py-3 text-left text-sm
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
                                        <span className="truncate">{option.label}</span>
                                        <span className={`shrink-0 ${isSelected ? "text-[#0B5E8E] customer:text-brand-contrast" : "text-transparent"}`}>
                                            <IoCheckmark size={18} />
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                        {filteredOptions.length === 0 && (
                            <li className="px-4 py-3 text-sm text-slate-500 customer-dark:text-content-muted">
                                Ничего не найдено
                            </li>
                        )}
                    </ul>
                </div>,
                document.body,
            )}
        </div>
    );
}

export default CustomSelect;
