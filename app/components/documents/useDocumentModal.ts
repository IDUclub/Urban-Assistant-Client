import { useEffect, type RefObject } from "react";

type UseDocumentModalOptions = {
    dialogRef?: RefObject<HTMLElement | null>;
    initialFocusRef?: RefObject<HTMLElement | null>;
    isOpen?: boolean;
    preventClose?: boolean;
    trapFocus?: boolean;
    onClose: () => void;
};

const FOCUSABLE_ELEMENT_SELECTOR = [
    "button:not(:disabled)",
    "input:not(:disabled)",
    "select:not(:disabled)",
    "[tabindex='0']",
].join(", ");

export default function useDocumentModal({
    dialogRef,
    initialFocusRef,
    isOpen = true,
    preventClose = false,
    trapFocus = false,
    onClose,
}: UseDocumentModalOptions) {
    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const previouslyFocusedElement = document.activeElement;
        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
        initialFocusRef?.current?.focus();

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;

            if (
                previouslyFocusedElement instanceof HTMLElement
                && previouslyFocusedElement.isConnected
            ) {
                previouslyFocusedElement.focus();
            }
        };
    }, [initialFocusRef, isOpen]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            const selectMenuIsOpen = document.querySelector(
                "[data-custom-select-menu]",
            );

            if (event.key === "Escape") {
                if (!selectMenuIsOpen && !preventClose) {
                    onClose();
                }

                return;
            }

            if (event.key !== "Tab" || !trapFocus) {
                return;
            }

            const focusableElements =
                dialogRef?.current?.querySelectorAll<HTMLElement>(
                    FOCUSABLE_ELEMENT_SELECTOR,
                );

            if (!focusableElements?.length) {
                return;
            }

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (event.shiftKey && document.activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();

                return;
            }

            if (!event.shiftKey && document.activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [dialogRef, isOpen, onClose, preventClose, trapFocus]);
}
