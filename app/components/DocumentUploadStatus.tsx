import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react-lite";
import {
    MdCheckCircle,
    MdClose,
    MdError,
    MdInsertDriveFile,
    MdNorth,
} from "react-icons/md";
import DocumentsStore, { type DocumentUploadJob } from "@lib/DocumentsStore";

function getStatusClasses(job: DocumentUploadJob) {
    if (job.state === "completed") {
        return "bg-emerald-100 text-emerald-700 customer-dark:bg-emerald-950/50 customer-dark:text-emerald-400";
    }
    if (job.state === "failed") {
        return "bg-red-100 text-red-700 customer-dark:bg-danger-soft customer-dark:text-danger-content";
    }
    return "bg-[#EAF5FF] text-[#0B5E8E] customer:bg-brand-soft customer:text-brand-contrast";
}

function getProgressClasses(job: DocumentUploadJob) {
    if (job.state === "completed") return "bg-emerald-500";
    if (job.state === "failed") return "bg-red-500 customer:bg-danger";
    return "bg-[#0788CE] customer:bg-brand-primary";
}

const DocumentUploadStatus = observer(() => {
    const [isOpen, setIsOpen] = useState(false);
    const [showCompletionNotification, setShowCompletionNotification] = useState(false);
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const hadActiveUploadsRef = useRef(false);
    const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const jobs = DocumentsStore.trackedUploadJobs;
    const activeCount = DocumentsStore.activeUploadCount;
    const hasFailedJobs = jobs.some((job) => job.state === "failed");
    const allJobsCompleted = jobs.length > 0
        && jobs.every((job) => job.state === "completed");

    useEffect(() => {
        if (activeCount > 0) {
            hadActiveUploadsRef.current = true;
            setShowCompletionNotification(false);
            if (notificationTimerRef.current) {
                clearTimeout(notificationTimerRef.current);
                notificationTimerRef.current = null;
            }
            return;
        }

        if (!hadActiveUploadsRef.current || !allJobsCompleted) return;

        hadActiveUploadsRef.current = false;
        setIsOpen(false);
        setShowCompletionNotification(true);
        notificationTimerRef.current = setTimeout(() => {
            setShowCompletionNotification(false);
            notificationTimerRef.current = null;
        }, 4_000);
    }, [activeCount, allJobsCompleted]);

    useEffect(() => () => {
        if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
    }, []);

    useEffect(() => {
        if (jobs.length === 0 && isOpen) setIsOpen(false);
    }, [isOpen, jobs.length]);

    useEffect(() => {
        if (!isOpen) return;

        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
        closeButtonRef.current?.focus();

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setIsOpen(false);
        };
        document.addEventListener("keydown", handleEscape);

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
            document.removeEventListener("keydown", handleEscape);
        };
    }, [isOpen]);

    if (jobs.length === 0 && !showCompletionNotification) return null;

    return (
        <>
            {(activeCount > 0 || hasFailedJobs) && (
                <button
                    type="button"
                    className="fixed bottom-6 right-6 z-90 flex h-13 w-13 items-center justify-center rounded-full bg-[#0788CE] text-white shadow-[0_16px_35px_-12px_var(--shadow-popover)] transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/50 focus-visible:ring-offset-2 customer:bg-brand-primary customer:focus-visible:ring-brand-primary/50"
                    onClick={() => setIsOpen(true)}
                    aria-label={`Статус загрузки документов. Загружается: ${activeCount}`}
                    aria-haspopup="dialog"
                    aria-expanded={isOpen}
                    title="Статус загрузки документов"
                >
                    <span className={`relative ${activeCount > 0 ? "animate-pulse motion-reduce:animate-none" : ""}`}>
                        <MdInsertDriveFile size={25} aria-hidden="true" />
                        {activeCount > 0 && (
                            <MdNorth
                                size={12}
                                className="absolute -bottom-1 -right-2 animate-bounce rounded-full bg-white text-[#0788CE] motion-reduce:animate-none customer:text-brand-primary"
                                aria-hidden="true"
                            />
                        )}
                    </span>
                    <span className="absolute -right-1 -top-1 flex min-h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-xs font-bold leading-none text-white customer:bg-danger">
                        {activeCount}
                    </span>
                </button>
            )}

            {showCompletionNotification && (
                <div
                    className="fixed bottom-6 right-6 z-90 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-700 shadow-[0_16px_35px_-12px_var(--shadow-popover)] customer-dark:border-emerald-900 customer-dark:bg-surface-raised customer-dark:text-emerald-400"
                    role="status"
                    aria-live="polite"
                >
                    <MdCheckCircle size={22} className="shrink-0 text-emerald-500" aria-hidden="true" />
                    <span>Все документы загружены</span>
                    <button
                        type="button"
                        className="-mr-1 rounded-full p-1 text-emerald-700 transition-colors hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 customer-dark:text-emerald-400 customer-dark:hover:bg-surface-hover"
                        onClick={() => setShowCompletionNotification(false)}
                        aria-label="Закрыть уведомление"
                    >
                        <MdClose size={17} />
                    </button>
                </div>
            )}

            {isOpen && createPortal(
                <div
                    className="fixed inset-0 z-100 flex items-center justify-center overflow-hidden bg-slate-950/40 p-4 backdrop-blur-[2px]"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) setIsOpen(false);
                    }}
                >
                    <div
                        className="flex max-h-[min(42rem,calc(100dvh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-[0_30px_80px_-24px_var(--shadow-popover)] customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-primary"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="document-upload-status-title"
                    >
                        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 customer-dark:border-ui-border">
                            <div>
                                <h2 id="document-upload-status-title" className="text-xl font-semibold">
                                    Загрузка документов
                                </h2>
                                <p className="mt-1 text-sm text-slate-500 customer-dark:text-content-muted">
                                    Активных загрузок: {activeCount}
                                </p>
                            </div>
                            <button
                                ref={closeButtonRef}
                                type="button"
                                className="shrink-0 rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40 customer:focus-visible:ring-brand-primary/40 customer-dark:text-content-muted customer-dark:hover:bg-surface-hover customer-dark:hover:text-content-primary"
                                onClick={() => setIsOpen(false)}
                                aria-label="Закрыть статус загрузки документов"
                            >
                                <MdClose size={22} />
                            </button>
                        </div>

                        <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
                            {jobs.map((job) => (
                                <li
                                    key={job.jobId}
                                    className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 customer-dark:border-ui-border customer-dark:bg-surface-panel"
                                >
                                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            {job.state === "completed"
                                                ? <MdCheckCircle size={22} className="shrink-0 text-emerald-500" aria-hidden="true" />
                                                : job.state === "failed"
                                                    ? <MdError size={22} className="shrink-0 text-red-500 customer:text-danger" aria-hidden="true" />
                                                    : <MdInsertDriveFile size={22} className="shrink-0 text-[#0788CE] customer:text-brand-primary" aria-hidden="true" />}
                                            <h3 className="min-w-0 wrap-anywhere font-semibold" title={job.title}>
                                                {job.title}
                                            </h3>
                                        </div>
                                        <span className={`max-w-full rounded-full px-2.5 py-1 text-xs font-semibold wrap-anywhere ${getStatusClasses(job)}`}>
                                            {job.statusMessage}
                                        </span>
                                    </div>

                                    <div className="mt-4 flex items-center gap-3">
                                        <div
                                            className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200 customer-dark:bg-surface-muted"
                                            role="progressbar"
                                            aria-label={`Загрузка документа ${job.title}`}
                                            aria-valuemin={0}
                                            aria-valuemax={100}
                                            aria-valuenow={job.progress}
                                        >
                                            <div
                                                className={`relative h-full overflow-hidden rounded-full transition-[width] duration-700 ease-out ${getProgressClasses(job)} ${job.state === "uploading" ? "animate-pulse motion-reduce:animate-none" : ""}`}
                                                style={{ width: `${job.progress}%` }}
                                            >
                                                {job.state === "uploading" && (
                                                    <span className="absolute inset-0 bg-linear-to-r from-transparent via-white/35 to-transparent" />
                                                )}
                                            </div>
                                        </div>
                                        <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-600 customer-dark:text-content-secondary">
                                            {job.progress}%
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
});

export default DocumentUploadStatus;
