import type { ChangeEvent, ReactNode } from "react";
import { MdOutlineUploadFile } from "react-icons/md";

type FileUploadProps = {
    label: string;
    fileName?: string;
    disabled: boolean;
    accept?: string;
    onFileSelected: (file: File) => void;
    trailingAction?: {
        icon: ReactNode;
        label: string;
        title?: string;
        disabled?: boolean;
        onClick: () => void;
    };
};

export default function FileUpload({
    label,
    fileName,
    disabled,
    accept,
    onFileSelected,
    trailingAction,
}: FileUploadProps) {
    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onFileSelected(file);
        }
        event.currentTarget.value = "";
    };

    return (
        <div className="flex min-w-0 flex-col gap-2">
            <span className="text-sm font-medium text-slate-900 customer-dark:text-content-primary">{label}</span>
            <div className="relative min-w-0 rounded-2xl border border-dashed border-slate-300 bg-white customer-dark:border-ui-border-strong customer-dark:bg-surface-raised">
                <label className={`flex min-w-0 flex-col items-start gap-3 px-4 py-4 ${trailingAction ? "pr-16" : ""}`}>
                    <span className="flex min-w-0 items-center gap-2 text-sm text-slate-600 customer-dark:text-content-secondary">
                        <MdOutlineUploadFile className="shrink-0" size={20} />
                        <span className="min-w-0 truncate">
                            {fileName ?? "Выберите файл"}
                        </span>
                    </span>
                    <span
                        className={`inline-flex rounded-xl px-3 py-2 text-sm font-medium text-white ${
                            disabled
                                ? "cursor-not-allowed bg-slate-300 customer-dark:bg-surface-disabled"
                                : "cursor-pointer bg-[#0788CE] customer:bg-brand-primary"
                        }`}
                    >
                        {fileName ? "Выбрать другой файл" : "Выбрать файл"}
                    </span>
                    <input
                        type="file"
                        accept={accept}
                        className="sr-only"
                        onChange={handleFileChange}
                        disabled={disabled}
                    />
                </label>
                {trailingAction && (
                    <button
                        type="button"
                        className="absolute top-1/2 right-4 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl border border-slate-200 text-[#0788CE] transition-colors hover:border-[#0788CE] hover:bg-[#EAF5FF] disabled:cursor-not-allowed disabled:opacity-45 customer:text-brand-primary customer:hover:border-brand-primary customer:hover:bg-brand-soft customer-dark:border-ui-border"
                        onClick={trailingAction.onClick}
                        disabled={trailingAction.disabled}
                        aria-label={trailingAction.label}
                        title={trailingAction.title ?? trailingAction.label}
                    >
                        {trailingAction.icon}
                    </button>
                )}
            </div>
        </div>
    );
}
