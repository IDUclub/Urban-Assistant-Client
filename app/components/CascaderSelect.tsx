import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react-lite";
import { MdArrowForwardIos } from "react-icons/md";

export interface CascaderSelectItem {
    label: string;
    icon?: ReactNode;
    onClickAction?: () => void;
    children?: CascaderSelectItem[];
    disabled?: boolean;
}

interface CascaderSelectProps {
    items: CascaderSelectItem[];
    rootNode: ReactNode;
    disabled?: boolean;
    placement?: "bottom" | "right";
}

const CascaderSelect = observer(({
    items,
    rootNode,
    disabled = false,
    placement = "bottom",
}: CascaderSelectProps) => {
    const hiddenMenuStyle: CSSProperties = {
        left: 0,
        position: "fixed",
        top: 0,
        visibility: "hidden",
    };
    const [isOpen, setIsOpen] = useState(false);
    const [activePath, setActivePath] = useState<number[]>([]);
    const [menuStyle, setMenuStyle] = useState<CSSProperties>(hiddenMenuStyle);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            const isTriggerClick = containerRef.current?.contains(target);
            const isMenuClick = menuRef.current?.contains(target);

            if (!isTriggerClick && !isMenuClick) {
                setIsOpen(false);
                setActivePath([]);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsOpen(false);
                setActivePath([]);
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
            const triggerRect = containerRef.current?.getBoundingClientRect();
            const menuRect = menuRef.current?.getBoundingClientRect();

            if (!triggerRect || !menuRect) return;

            const viewportPadding = 8;
            const menuGap = 8;
            const maxHeight = window.innerHeight - viewportPadding * 2;
            let top = 0;
            let left = 0;

            if (placement === "right") {
                const preferredRight = triggerRect.right + menuGap;
                const fallbackLeft = triggerRect.left - menuGap - menuRect.width;
                const hasSpaceRight = preferredRight + menuRect.width <= window.innerWidth - viewportPadding;

                left = hasSpaceRight ? preferredRight : fallbackLeft;
                top = triggerRect.top + triggerRect.height / 2 - menuRect.height / 2;
            } else {
                const preferredBottom = triggerRect.bottom + menuGap;
                const fallbackTop = triggerRect.top - menuGap - menuRect.height;
                const hasSpaceBelow = preferredBottom + menuRect.height <= window.innerHeight - viewportPadding;
                const hasSpaceAbove = fallbackTop >= viewportPadding;

                left = triggerRect.left;
                top = hasSpaceBelow || !hasSpaceAbove ? preferredBottom : fallbackTop;
            }

            const clampedLeft = Math.min(
                Math.max(viewportPadding, left),
                Math.max(viewportPadding, window.innerWidth - viewportPadding - menuRect.width),
            );
            const clampedTop = Math.min(
                Math.max(viewportPadding, top),
                Math.max(viewportPadding, window.innerHeight - viewportPadding - menuRect.height),
            );

            setMenuStyle({
                left: clampedLeft,
                maxHeight,
                position: "fixed",
                top: clampedTop,
                visibility: "visible",
            });
        };

        setMenuStyle(hiddenMenuStyle);
        updateMenuPosition();
        const animationFrameId = window.requestAnimationFrame(updateMenuPosition);

        window.addEventListener("resize", updateMenuPosition);
        window.addEventListener("scroll", updateMenuPosition, true);

        return () => {
            window.cancelAnimationFrame(animationFrameId);
            window.removeEventListener("resize", updateMenuPosition);
            window.removeEventListener("scroll", updateMenuPosition, true);
        };
    }, [activePath, isOpen, items, placement]);

    useEffect(() => {
        if (disabled) {
            setIsOpen(false);
            setActivePath([]);
        }
    }, [disabled]);

    const getColumns = () => {
        const columns: CascaderSelectItem[][] = [];
        let currentItems: CascaderSelectItem[] | undefined = items;
        let depth = 0;

        while (currentItems?.length) {
            columns.push(currentItems);

            const activeIndex = activePath[depth];
            const activeItem: CascaderSelectItem | undefined = typeof activeIndex === "number"
                ? currentItems[activeIndex]
                : undefined;

            if (!activeItem?.children?.length) break;

            currentItems = activeItem.children;
            depth += 1;
        }

        return columns;
    };

    const setActiveItem = (depth: number, itemIndex: number) => {
        setActivePath((currentPath) => [
            ...currentPath.slice(0, depth),
            itemIndex,
        ]);
    };

    const handleItemClick = (item: CascaderSelectItem, depth: number, itemIndex: number) => {
        setActiveItem(depth, itemIndex);

        if (item.children?.length) return;

        item.onClickAction?.();
        setIsOpen(false);
        setActivePath([]);
    };

    const menu = (
        <div
            ref={menuRef}
            className="
                fixed z-50 flex w-max max-w-[min(80vw,48rem)] overflow-hidden rounded-2xl
                border border-slate-200 bg-white p-2 text-sm text-slate-700
                customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-secondary
                shadow-[0_18px_40px_-20px_var(--shadow-popover)]
            "
            role="menu"
            style={menuStyle}
        >
            {getColumns().map((columnItems, depth) => (
                <div
                    key={`cascader-column-${depth}`}
                    className={`
                        min-w-52 overflow-y-auto p-1
                        ${depth > 0 ? "border-l border-slate-100 customer-dark:border-ui-border" : ""}
                    `}
                >
                    {columnItems.map((item, itemIndex) => {
                        const hasChildren = !!item.children?.length;
                        const isActive = activePath[depth] === itemIndex;

                        return (
                            <button
                                key={`${depth}-${item.label}-${itemIndex}`}
                                type="button"
                                className={`
                                    flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2
                                    text-left transition-colors
                                    ${isActive
                                      ? "bg-[#EAF5FF] text-[#0B5E8E] customer:bg-brand-soft customer:text-brand-contrast"
                                      : "hover:bg-slate-100 customer-dark:hover:bg-surface-hover"}
                                    ${item.disabled ? "cursor-not-allowed opacity-50" : ""}
                                `}
                                onMouseEnter={() => setActiveItem(depth, itemIndex)}
                                onClick={() => handleItemClick(item, depth, itemIndex)}
                                role="menuitem"
                                disabled={item.disabled}
                            >
                                <span className="flex min-w-0 items-center gap-2">
                                    {item.icon && (
                                        <span className="shrink-0">
                                            {item.icon}
                                        </span>
                                    )}
                                    <span className="truncate">{item.label}</span>
                                </span>
                                {hasChildren && (
                                    <MdArrowForwardIos size={14} className="shrink-0 text-slate-400 customer-dark:text-content-muted" />
                                )}
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );

    return (
        <div ref={containerRef} className="inline-flex">
            <button
                type="button"
                className="group inline-flex items-center disabled:cursor-not-allowed"
                disabled={disabled}
                onClick={() => {
                    setMenuStyle(hiddenMenuStyle);
                    setIsOpen((current) => !current);
                }}
                aria-expanded={isOpen}
                aria-haspopup="menu"
            >
                {rootNode}
            </button>

            {isOpen && typeof document !== "undefined" && createPortal(menu, document.body)}
        </div>
    );
});

export default CascaderSelect;
