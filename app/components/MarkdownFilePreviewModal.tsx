import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MdClose, MdDownload } from "react-icons/md";
import { SyncLoader } from "react-spinners";
import { downloadFile } from "@lib/ChatStore";
import MarkdownMessage from "@components/MarkdownMessage";
import useDocumentModal from "@components/documents/useDocumentModal";

type MarkdownFilePreviewModalProps = {
    title: string;
    downloadUrl: string;
    onClose: () => void;
};

function saveFile(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = fileName;
    anchor.click();

    URL.revokeObjectURL(url);
}

export default function MarkdownFilePreviewModal({
    title,
    downloadUrl,
    onClose,
}: MarkdownFilePreviewModalProps) {
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const [fileBlob, setFileBlob] = useState<Blob | null>(null);
    const [markdown, setMarkdown] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isDownloading, setIsDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadAttempt, setLoadAttempt] = useState(0);

    useDocumentModal({
        dialogRef,
        initialFocusRef: closeButtonRef,
        trapFocus: true,
        onClose,
    });

    useEffect(() => {
        let isActive = true;

        setIsLoading(true);
        setError(null);

        downloadFile(downloadUrl)
            .then(async (blob) => ({
                blob,
                text: await blob.text(),
            }))
            .then(({ blob, text }) => {
                if (!isActive) return;

                setFileBlob(blob);
                setMarkdown(text);
            })
            .catch((loadError) => {
                if (!isActive) return;

                console.error("Error loading Markdown preview:", loadError);
                setError("Не удалось загрузить предпросмотр файла.");
            })
            .finally(() => {
                if (isActive) {
                    setIsLoading(false);
                }
            });

        return () => {
            isActive = false;
        };
    }, [downloadUrl, loadAttempt]);

    const handleDownload = useCallback(async () => {
        if (isDownloading) return;

        setIsDownloading(true);

        try {
            const blob = fileBlob ?? await downloadFile(downloadUrl);
            saveFile(blob, title);
        } catch (downloadError) {
            console.error("Error downloading file:", downloadError);
            setError("Не удалось скачать файл.");
        } finally {
            setIsDownloading(false);
        }
    }, [downloadUrl, fileBlob, isDownloading, title]);

    return createPortal(
        <div
            className="fixed inset-0 z-100 flex items-center justify-center overflow-hidden bg-slate-950/40 p-4 backdrop-blur-[2px]"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="markdown-preview-title"
                className="flex h-[min(52rem,calc(100dvh-2rem))] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-[0_30px_80px_-24px_var(--shadow-popover)] customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-primary"
            >
                <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-6 py-4 customer-dark:border-ui-border">
                    <h2
                        id="markdown-preview-title"
                        className="min-w-0 truncate text-xl font-semibold"
                        title={title}
                    >
                        {title}
                    </h2>
                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 customer:bg-brand-primary customer:hover:bg-brand-contrast"
                            onClick={handleDownload}
                            disabled={isDownloading}
                        >
                            <MdDownload size={18} />
                            {isDownloading ? "Скачивание..." : "Скачать"}
                        </button>
                        <button
                            ref={closeButtonRef}
                            type="button"
                            className="cursor-pointer rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 customer:focus-visible:ring-brand-primary/40 customer-dark:text-content-muted customer-dark:hover:bg-surface-hover customer-dark:hover:text-content-primary"
                            onClick={onClose}
                            aria-label="Закрыть предпросмотр"
                        >
                            <MdClose size={22} />
                        </button>
                    </div>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8 sm:py-7">
                    {isLoading && (
                        <div className="flex h-full items-center justify-center" role="status">
                            <SyncLoader size={8} color="var(--color-brand-primary)" />
                        </div>
                    )}
                    {!isLoading && error && (
                        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                            <p className="text-sm text-red-700 customer-dark:text-danger-content" role="alert">
                                {error}
                            </p>
                            <button
                                type="button"
                                className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 customer-dark:border-ui-border customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover"
                                onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                            >
                                Повторить
                            </button>
                        </div>
                    )}
                    {!isLoading && !error && (
                        <article className="mx-auto w-full max-w-4xl">
                            {markdown
                                ? <MarkdownMessage>{markdown}</MarkdownMessage>
                                : <p className="text-sm text-slate-500 customer-dark:text-content-muted">Файл пуст.</p>}
                        </article>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}
