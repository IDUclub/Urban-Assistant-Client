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
            <span className="flex min-w-0 flex-col gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 customer-dark:border-ui-border-strong customer-dark:bg-surface-raised">
                <span className="flex min-w-0 items-center gap-2 text-sm text-slate-600 customer-dark:text-content-secondary">
                    <MdOutlineUploadFile className="shrink-0" size={20} />
                    <span className="min-w-0 truncate">
                        {fileName ?? "Выберите файл"}
                    </span>
                </span>
                <input
                    type="file"
                    accept={accept}
                    className="block w-full cursor-pointer text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-[#0788CE] file:px-3 file:py-2 file:text-sm file:font-medium file:text-white disabled:cursor-not-allowed disabled:text-slate-300 disabled:file:bg-slate-300 customer:file:bg-brand-primary customer-dark:text-content-secondary customer-dark:disabled:text-content-disabled customer-dark:disabled:file:bg-surface-disabled"
                    onChange={handleFileChange}
                    disabled={disabled}
                />
            </span>
        </label>
    );
}
