import type { ChangeEvent } from "react";
import { MdOutlineUploadFile } from "react-icons/md";

type FileUploadProps = {
    label: string;
    fileName?: string;
    disabled: boolean;
    accept?: string;
    onFileSelected: (file: File) => void;
};

export default function FileUpload({
    label,
    fileName,
    disabled,
    accept,
    onFileSelected,
}: FileUploadProps) {
    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onFileSelected(file);
        }
        event.currentTarget.value = "";
    };

    return (
        <label className="flex min-w-0 flex-col gap-2">
            <span className="text-sm font-medium text-slate-900 customer-dark:text-content-primary">{label}</span>
            <span className="flex min-w-0 flex-col items-start gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 customer-dark:border-ui-border-strong customer-dark:bg-surface-raised">
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
            </span>
        </label>
    );
}
