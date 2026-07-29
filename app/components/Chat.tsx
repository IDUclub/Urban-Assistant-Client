import { AiOutlinePlusCircle } from "react-icons/ai";
import { IoIosSend } from "react-icons/io";
import { FaStopCircle } from "react-icons/fa";
import { LuLayers3 } from "react-icons/lu";
import {
    MdDownload,
    MdMoreHoriz,
    MdOutlineMap,
    MdArrowForwardIos,
    MdOutlineUploadFile,
    MdCheck,
} from "react-icons/md";
import { IoAlertCircleOutline } from "react-icons/io5";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { observer } from "mobx-react-lite";
import ChatStore from "@lib/ChatStore";
import { SyncLoader } from "react-spinners";
import ChatContextSelection from "@components/ChatContextSelection";
import Select from "@components/ui/Select";


type ChatMessageItemType = "title" | "plain" | "block" | "list";

interface ChatMessageItem {
    text: string;
    type: ChatMessageItemType;
}

interface ChatComponentProps {
    messages?: ChatMessageItem[];
    onSubmit?: (request: string) => void;
    emptyState?: ReactNode;
}

function renderInlineText(text: string) {
    const parts = text.split(/(<br\s*\/?>|\*\*.*?\*\*|(?<!\*)\*[^*]+\*(?!\*))/g);

    return parts.map((part, index) => {
        const boldMatch = part.match(/^\*\*(.*?)\*\*$/);
        const italicMatch = part.match(/^\*(.*?)\*$/);
        const lineBreakMatch = part.match(/^<br\s*\/?>$/i);

        if (lineBreakMatch) {
            return <br key={`br-${index}`} />;
        }

        if (boldMatch) {
            return <strong key={`bold-${index}`}>{boldMatch[1]}</strong>;
        }

        if (italicMatch) {
            return <em key={`italic-${index}`}>{italicMatch[1]}</em>;
        }

        return <span key={`text-${index}`}>{part}</span>;
    });
}

function isMarkdownTableSeparator(line: string) {
    const trimmedLine = line.trim();
    return /^\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?$/.test(trimmedLine);
}

function parseMarkdownTableRow(line: string) {
    return line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim());
}

function parseMarkdownHeading(line: string) {
    const headingMatch = line.trim().match(/^(#{1,6})\s*(.+)$/);

    if (!headingMatch) return undefined;

    return {
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
    };
}

function getMarkdownHeadingClassName(level: number) {
    switch (level) {
        case 1:
            return "mt-2 text-2xl font-semibold leading-tight text-gray-950 customer-dark:text-content-primary";
        case 2:
            return "mt-2 text-xl font-semibold leading-tight text-gray-950 customer-dark:text-content-primary";
        case 3:
            return "mt-1 text-lg font-semibold leading-snug text-gray-950 customer-dark:text-content-primary";
        default:
            return "mt-1 text-base font-semibold leading-snug text-gray-900 customer-dark:text-content-primary";
    }
}

function renderFormattedText(text: string) {
    const lines = text.split("\n");
    const blocks: ReactNode[] = [];
    let currentParagraph: string[] = [];

    const flushParagraph = () => {
        if (!currentParagraph.length) return;

        blocks.push(
            <p key={`paragraph-${blocks.length}`} className="whitespace-pre-wrap">
                {currentParagraph.map((line, lineIndex) => (
                    <span key={`line-${lineIndex}`}>
                        {renderInlineText(line)}
                        {lineIndex < currentParagraph.length - 1 ? <br /> : null}
                    </span>
                ))}
            </p>
        );
        currentParagraph = [];
    };

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const nextLine = lines[index + 1];

        if (line.trim().startsWith("```")) {
            flushParagraph();

            const language = line.trim().slice(3).trim();
            const codeLines: string[] = [];
            index += 1;

            while (index < lines.length && !lines[index].trim().startsWith("```")) {
                codeLines.push(lines[index]);
                index += 1;
            }

            blocks.push(
                <div key={`code-${blocks.length}`} className="my-2 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm customer-dark:border-ui-border customer-dark:bg-surface-muted">
                    {language ? (
                        <div className="border-b border-slate-200 bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500 customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-muted">
                            {language}
                        </div>
                    ) : null}
                    <pre className="overflow-x-auto bg-[#f8f9fa] px-4 py-4 text-sm leading-6 text-[#1f1555] customer-dark:bg-surface-muted customer-dark:text-content-primary">
                        <code>{codeLines.join("\n")}</code>
                    </pre>
                </div>
            );
            continue;
        }

        if (/^-{3,}$/.test(line.trim())) {
            flushParagraph();
            blocks.push(
                <hr
                    key={`divider-${blocks.length}`}
                    className="my-1 border-0 border-t border-slate-200 customer-dark:border-ui-border"
                />
            );
            continue;
        }

        const heading = parseMarkdownHeading(line);

        if (heading) {
            flushParagraph();

            const HeadingTag = `h${heading.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

            blocks.push(
                <HeadingTag
                    key={`heading-${blocks.length}`}
                    className={getMarkdownHeadingClassName(heading.level)}
                >
                    {renderInlineText(heading.text)}
                </HeadingTag>
            );
            continue;
        }

        if (line.trim().includes("|") && nextLine && isMarkdownTableSeparator(nextLine)) {
            flushParagraph();

            const header = parseMarkdownTableRow(line);
            const rows: string[][] = [];
            index += 2;

            while (index < lines.length && lines[index].trim().includes("|") && lines[index].trim()) {
                rows.push(parseMarkdownTableRow(lines[index]));
                index += 1;
            }

            index -= 1;

            blocks.push(
                <div key={`table-${blocks.length}`} className="my-2 overflow-x-auto">
                    <table className="min-w-full border-collapse overflow-hidden rounded-2xl border border-gray-200 text-left text-sm customer-dark:border-ui-border">
                        <thead className="bg-gray-50 customer-dark:bg-surface-muted">
                            <tr className="bg-gray-400/10 customer-dark:bg-surface-hover/60">
                                {header.map((cell, cellIndex) => (
                                    <th key={`header-${cellIndex}`} className="border-b border-gray-200 px-4 py-3 font-semibold text-gray-900 customer-dark:border-ui-border customer-dark:text-content-primary">
                                        {renderInlineText(cell)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIndex) => (
                                <tr key={`row-${rowIndex}`} className="odd:bg-white even:bg-gray-50/50 customer-dark:odd:bg-surface-panel customer-dark:even:bg-surface-muted/50">
                                    {row.map((cell, cellIndex) => (
                                        <td key={`cell-${rowIndex}-${cellIndex}`} className="border-t border-gray-200 px-4 py-3 align-top text-gray-800 customer-dark:border-ui-border customer-dark:text-content-primary">
                                            {renderInlineText(cell)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
            continue;
        }

        if (!line.trim()) {
            flushParagraph();
            continue;
        }

        currentParagraph.push(line);
    }

    flushParagraph();

    return <div className="flex flex-col gap-3">{blocks}</div>;
}

function parseFeatureCollection(layer: unknown) {
    if (!layer) return undefined;

    if (typeof layer === "string") {
        try {
            return JSON.parse(layer);
        } catch {
            const uri = layer.trim();
            return isGeoJsonLayerUri(uri) ? uri : undefined;
        }
    }

    if (typeof layer === "object") {
        return layer;
    }

    return undefined;
}

function isGeoJsonLayerUri(value: unknown): value is string {
    if (typeof value !== "string" || !value.trim()) return false;

    try {
        const parsedUrl = new URL(value.trim());
        return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
    } catch {
        return false;
    }
}

function getGeoJsonFileName(name: string) {
    return `${(name || "layer")
        .trim()
        .replace(/[^\w.-]+/g, "_")
        .replace(/^_+|_+$/g, "") || "layer"}.geojson`;
}

function downloadGeoJson(name: string, layer: unknown) {
    if (isGeoJsonLayerUri(layer)) {
        const anchor = document.createElement("a");

        anchor.href = layer.trim();
        anchor.download = getGeoJsonFileName(name);
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
        anchor.click();
        return;
    }

    const parsedLayer = parseFeatureCollection(layer);
    if (!parsedLayer) return;

    const blob = new Blob([JSON.stringify(parsedLayer, null, 2)], {
        type: "application/geo+json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = getGeoJsonFileName(name);
    anchor.click();

    URL.revokeObjectURL(url);
}

function GeoJsonMessageActions({ name, layer }: { name: string; layer: unknown }) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLSpanElement | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: MouseEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
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

    const addLayerToMap = () => {
        ChatStore.addGeoJsonLayerMessageToMap(name, layer);
        setIsOpen(false);
    };

    const handleDownload = () => {
        downloadGeoJson(name, layer);
        setIsOpen(false);
    };

    return (
        <span ref={containerRef} className="relative inline-flex items-center">
            <button
                type="button"
                className="cursor-pointer rounded-full p-1 text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 customer:text-brand-primary customer:hover:bg-brand-soft customer:hover:text-brand-contrast"
                onClick={() => setIsOpen((current) => !current)}
                aria-label="Действия со слоем"
            >
                <MdMoreHoriz size={18} />
            </button>
            {isOpen && (
                <div className="absolute left-full top-1/2 z-20 ml-2 w-60 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 shadow-[0_18px_40px_-20px_var(--shadow-popover)] customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-secondary">
                    <button
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-100 customer-dark:hover:bg-surface-hover"
                        onClick={addLayerToMap}
                    >
                        <MdOutlineMap size={18} />
                         Добавить на карту
                    </button>
                    <button
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-100 customer-dark:hover:bg-surface-hover"
                        onClick={handleDownload}
                    >
                        <MdDownload size={18} />
                        Скачать GeoJSON
                    </button>
                </div>
            )}
        </span>
    );
};

function GeoJsonLayerRow({ name, layer }: { name: string; layer: unknown }) {
    return (
        <span className="inline-flex min-w-0 items-center gap-2 text-blue-600 customer:text-brand-primary">
            <LuLayers3 className="shrink-0" />
            <span className="min-w-0 truncate">{name}</span>
            <GeoJsonMessageActions
                name={name}
                layer={layer}
            />
        </span>
    );
}

type ChatStoreMessage = (typeof ChatStore.chatMessages)[number];

type GeoJsonResponseMessage = ChatStoreMessage & {
    type: "response";
    message: {
        type: "geojson";
        name: string;
        layer: unknown;
    };
};

type PzzSetupData = Extract<ChatStoreMessage["message"], { type: "pzz_setup" }>;
type VriSetupData = Extract<ChatStoreMessage["message"], { type: "vri_setup" }>;

function isGeoJsonResponseMessage(message: ChatStoreMessage): message is GeoJsonResponseMessage {
    return message.type === "response" && message.message.type === "geojson";
}

function GeoJsonMessageAccordion({ messages }: { messages: GeoJsonResponseMessage[] }) {
    return (
        <details className="group w-full rounded-2xl border border-blue-100 bg-blue-50/40 text-blue-700 customer:border-brand-border customer:bg-brand-soft/40 customer:text-brand-contrast">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden">
                <span className="inline-flex min-w-0 items-center gap-2 font-medium">
                    <LuLayers3 className="shrink-0" />
                    <span className="min-w-0 truncate">GeoJSON-слои ({messages.length})</span>
                </span>
                <MdArrowForwardIos className="shrink-0 text-blue-500 transition-transform group-open:rotate-90 customer:text-brand-primary" size={16} />
            </summary>
            <div className="flex flex-col gap-2 border-t border-blue-100 px-4 py-3 customer:border-brand-border">
                {messages.map((message, index) => (
                    <div
                        key={`geojson-layer-${message.message.name}-${index}`}
                        className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-white/80 px-3 py-2 customer-dark:bg-surface-raised/80"
                    >
                        <GeoJsonLayerRow
                            name={message.message.name}
                            layer={message.message.layer}
                        />
                    </div>
                ))}
            </div>
        </details>
    );
}

function getPzzSetupStatusLabel(status: PzzSetupData["status"]) {
    switch (status) {
        case "loading":
            return "Загрузка источников";
        case "ready":
            return "Готово к запуску";
        case "submitting":
            return "Запуск";
        case "queued":
            return "В очереди";
        case "waiting_capacity":
            return "Ожидает ресурсы";
        case "running":
            return "Выполняется";
        case "finished":
            return "Завершено";
        case "failed":
            return "Ошибка";
        case "error":
            return "Ошибка";
        default:
            return "Статус неизвестен";
    }
}

const PzzSetupMessageCard = observer(({ setup }: { setup: PzzSetupData }) => {
    const yearOptions = Array.from(new Set(setup.sources.map((source) => source.year)))
        .sort((left, right) => right - left);
    const [selectedYear, setSelectedYear] = useState<number | undefined>(setup.selectedYear ?? yearOptions[0]);
    const sourceOptions = setup.sources
        .filter((source) => source.year === selectedYear)
        .map((source) => source.source);
    const [selectedSource, setSelectedSource] = useState<string | undefined>(setup.selectedSource ?? sourceOptions[0]);
    const isLocked = !!setup.submitted ||
        setup.status === "submitting" ||
        setup.status === "queued" ||
        setup.status === "waiting_capacity" ||
        setup.status === "running" ||
        setup.status === "finished" ||
        setup.status === "failed";
    const isLoading = setup.mode === "scenario" && setup.status === "loading";
    const canSubmit = setup.mode === "scenario"
        && !isLocked
        && setup.status === "ready"
        && selectedYear !== undefined
        && !!selectedSource;
    const statusLabel = getPzzSetupStatusLabel(setup.status);
    const uploadedFiles = [
        setup.pzzZonesFileName ? `Файл с ПЗЗ: ${setup.pzzZonesFileName}` : undefined,
        setup.pzzDescriptionsFileName ? `Описание зон ПЗЗ: ${setup.pzzDescriptionsFileName}` : undefined,
        setup.cadastralFileName ? `Файл с зданиями: ${setup.cadastralFileName}` : undefined,
    ].filter(Boolean);
    const filesStep = setup.filesStep ?? (
        setup.cadastralFileName
            ? "finished"
            : setup.pzzDescriptionsFileName
                ? "upload_cadastral"
                : setup.pzzZonesFileName
                    ? "upload_pzz_descriptions"
                    : "upload_pzz_zones"
    );

    useEffect(() => {
        if (setup.selectedYear !== undefined) {
            setSelectedYear(setup.selectedYear);
            return;
        }

        if (selectedYear === undefined && yearOptions.length) {
            setSelectedYear(yearOptions[0]);
        }
    }, [setup.selectedYear, selectedYear, yearOptions.join("|")]);

    useEffect(() => {
        if (setup.selectedSource) {
            setSelectedSource(setup.selectedSource);
            return;
        }

        if (!sourceOptions.length) {
            setSelectedSource(undefined);
            return;
        }

        if (!selectedSource || !sourceOptions.includes(selectedSource)) {
            setSelectedSource(sourceOptions[0]);
        }
    }, [selectedSource, setup.selectedSource, sourceOptions.join("|")]);

    const handleSubmit = () => {
        if (!canSubmit) return;
        if (selectedYear === undefined || !selectedSource) return;

        ChatStore.submitPzzSetup(setup.id, selectedYear, selectedSource);
    };

    const renderFilesStep = () => {
        if (setup.status === "finished") {
            return <div className="text-sm text-slate-600 customer-dark:text-content-secondary">Проверка объектов по ПЗЗ завершена.</div>;
        }

        if (
            setup.status === "submitting"
            || setup.status === "queued"
            || setup.status === "waiting_capacity"
            || setup.status === "running"
        ) {
            return <div className="text-sm text-slate-600 customer-dark:text-content-secondary">Проверка объектов по ПЗЗ выполняется...</div>;
        }

        switch (filesStep) {
            case "upload_pzz_zones":
                return (
                    <ToolFileUpload
                        label="Загрузите файл с ПЗЗ"
                        fileName={setup.pzzZonesFileName}
                        disabled={setup.status !== "ready" || isLocked}
                        onFileSelected={(file) => ChatStore.submitPzzZonesFile(setup.id, file)}
                    />
                );
            case "upload_pzz_descriptions":
                return (
                    <div className="flex flex-col gap-3">
                        <ToolFileUpload
                            label="Загрузите описание зон ПЗЗ"
                            fileName={setup.pzzDescriptionsFileName}
                            disabled={setup.status !== "ready" || isLocked}
                            onFileSelected={(file) => ChatStore.submitPzzDescriptionsFile(setup.id, file)}
                        />
                        <button
                            type="button"
                            className="self-start rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 customer-dark:border-ui-border-strong customer-dark:bg-surface-raised customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover customer-dark:disabled:text-content-disabled"
                            onClick={() => ChatStore.skipPzzDescriptionsFile(setup.id)}
                            disabled={setup.status !== "ready" || isLocked}
                        >
                            Пропустить
                        </button>
                    </div>
                );
            case "upload_cadastral":
                return (
                    <ToolFileUpload
                        label="Загрузите файл со зданиями"
                        fileName={setup.cadastralFileName}
                        disabled={setup.status !== "ready" || isLocked}
                        onFileSelected={(file) => ChatStore.submitPzzCadastralFile(setup.id, file)}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 customer-dark:border-ui-border customer-dark:bg-surface-muted customer-dark:text-content-primary">
            <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-900 customer-dark:text-content-primary">Проверка объектов по ПЗЗ</span>
                <div className="flex min-w-0 shrink-0 items-center gap-2">
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500 customer-dark:bg-surface-raised customer-dark:text-content-muted">
                        {statusLabel}
                    </span>
                </div>
            </div>
            {setup.mode === "files" ? (
                <>
                    {uploadedFiles.length > 0 && (
                        <div className="flex flex-col gap-1 rounded-2xl bg-white px-3 py-2 text-xs text-slate-500 customer-dark:bg-surface-raised customer-dark:text-content-muted">
                            {uploadedFiles.map((fileLabel) => (
                                <div key={fileLabel} className="min-w-0 truncate">{fileLabel}</div>
                            ))}
                        </div>
                    )}
                    {renderFilesStep()}
                </>
            ) : (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                    <label className="flex min-w-0 flex-col gap-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-500 customer-dark:text-content-muted">
                        Год
                        <Select
                            value={selectedYear ?? ""}
                            options={yearOptions.map((year) => ({
                                label: String(year),
                                value: year,
                            }))}
                            onChange={(value) => setSelectedYear(Number(value))}
                            block
                            // disabled={isLoading || isLocked || !yearOptions.length}
                        />
                    </label>
                    <label className="flex min-w-0 flex-col gap-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-500 customer-dark:text-content-muted">
                        Источник
                        <Select
                            value={selectedSource ?? ""}
                            options={sourceOptions.map((source) => ({
                                label: source,
                                value: source,
                            }))}
                            onChange={(value) => setSelectedSource(String(value))}
                            block
                            // disabled={isLoading || isLocked || !sourceOptions.length}
                        />
                    </label>
                    <button
                        type="button"
                        className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-2xl bg-brand-primary px-4 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-surface-disabled"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                    >
                        <MdCheck size={18} />
                        {setup.status === "finished"
                            ? "Готово"
                            : setup.status === "failed" || setup.status === "error"
                                ? "Ошибка"
                                : isLocked
                                    ? "Запущено"
                                    : "Запустить"}
                    </button>
                </div>
            )}
            {isLoading && (
                <div className="text-xs text-slate-500 customer-dark:text-content-muted">Загрузка источников функциональных зон...</div>
            )}
            {setup.errorText && (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700 customer:border-danger-border customer:bg-danger-soft customer:text-danger-content">
                    {setup.errorText}
                </div>
            )}
        </div>
    );
});

function getVriSetupStatusLabel(status: VriSetupData["status"]) {
    switch (status) {
        case "ready":
            return "Настройка";
        case "submitting":
            return "Запуск";
        case "running":
            return "Выполняется";
        case "finished":
            return "Завершено";
        case "error":
            return "Ошибка";
        default:
            return "Статус неизвестен";
    }
}

function ToolFileUpload({
    label,
    fileName,
    disabled,
    onFileSelected,
}: {
    label: string;
    fileName?: string;
    disabled: boolean;
    onFileSelected: (file: File) => void;
}) {
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
                    className="block w-full cursor-pointer text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-xl file:border-0 file:bg-[#0788CE] file:px-3 file:py-2 file:text-sm file:font-medium file:text-white disabled:cursor-not-allowed disabled:text-slate-300 disabled:file:bg-slate-300 customer:file:bg-brand-primary customer-dark:text-content-secondary customer-dark:disabled:text-content-disabled customer-dark:disabled:file:bg-surface-disabled"
                    onChange={handleFileChange}
                    disabled={disabled}
                />
            </span>
        </label>
    );
}

function VriChoiceButtons({
    question,
    disabled,
    onYes,
    onNo,
}: {
    question: string;
    disabled: boolean;
    onYes: () => void;
    onNo: () => void;
}) {
    return (
        <div className="flex flex-col gap-3">
            <div className="text-sm font-medium text-slate-900 customer-dark:text-content-primary">{question}</div>
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    className="rounded-2xl bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-surface-disabled"
                    onClick={onYes}
                    disabled={disabled}
                >
                    Да
                </button>
                <button
                    type="button"
                    className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 customer-dark:border-ui-border-strong customer-dark:bg-surface-raised customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover customer-dark:disabled:text-content-disabled"
                    onClick={onNo}
                    disabled={disabled}
                >
                    Нет
                </button>
            </div>
        </div>
    );
}

const VriSetupMessageCard = observer(({ setup }: { setup: VriSetupData }) => {
    const isReady = setup.status === "ready";
    const isLocked = setup.status === "submitting" ||
        setup.status === "running" ||
        setup.status === "finished";
    const uploadedFiles = [
        setup.landPlotsFileName ? `Земельные участки: ${setup.landPlotsFileName}` : undefined,
        setup.classifierFileName ? `Классификатор ВРИ: ${setup.classifierFileName}` : undefined,
        setup.pzzZonesFileName ? `Зоны ПЗЗ: ${setup.pzzZonesFileName}` : undefined,
        setup.pzzZoneDescriptionFileName ? `Описание зон ПЗЗ: ${setup.pzzZoneDescriptionFileName}` : undefined,
    ].filter(Boolean);

    const renderStep = () => {
        if (setup.status === "finished") {
            return <div className="text-sm text-slate-600 customer-dark:text-content-secondary">Проверка ВРИ завершена.</div>;
        }

        if (setup.status === "submitting" || setup.status === "running") {
            return <div className="text-sm text-slate-600 customer-dark:text-content-secondary">Проверка ВРИ выполняется...</div>;
        }

        switch (setup.step) {
            case "upload_land_plots":
                return (
                    <ToolFileUpload
                        label="Загрузите земельные участки"
                        fileName={setup.landPlotsFileName}
                        disabled={!isReady || isLocked}
                        onFileSelected={(file) => ChatStore.submitVriLandPlots(setup.id, file)}
                    />
                );
            case "ask_classifier":
                return (
                    <VriChoiceButtons
                        question="Хотите загрузить классификатор ВРИ?"
                        disabled={!isReady || isLocked}
                        onYes={() => ChatStore.answerVriClassifier(setup.id, true)}
                        onNo={() => ChatStore.answerVriClassifier(setup.id, false)}
                    />
                );
            case "upload_classifier":
                return (
                    <ToolFileUpload
                        label="Загрузите классификатор ВРИ"
                        fileName={setup.classifierFileName}
                        disabled={!isReady || isLocked}
                        onFileSelected={(file) => ChatStore.submitVriClassifier(setup.id, file)}
                    />
                );
            case "ask_pzz_check":
                return (
                    <VriChoiceButtons
                        question="Хотите ли сравнить с ПЗЗ?"
                        disabled={!isReady || isLocked}
                        onYes={() => ChatStore.answerVriPzzCheck(setup.id, true)}
                        onNo={() => ChatStore.answerVriPzzCheck(setup.id, false)}
                    />
                );
            case "upload_pzz_zones":
                return (
                    <ToolFileUpload
                        label="Загрузите зоны ПЗЗ"
                        fileName={setup.pzzZonesFileName}
                        disabled={!isReady || isLocked}
                        onFileSelected={(file) => ChatStore.submitVriPzzZones(setup.id, file)}
                    />
                );
            case "ask_pzz_zone_description":
                return (
                    <VriChoiceButtons
                        question="Хотите загрузить описание зон ПЗЗ?"
                        disabled={!isReady || isLocked}
                        onYes={() => ChatStore.answerVriPzzZoneDescription(setup.id, true)}
                        onNo={() => ChatStore.answerVriPzzZoneDescription(setup.id, false)}
                    />
                );
            case "upload_pzz_zone_description":
                return (
                    <ToolFileUpload
                        label="Загрузите описание зон ПЗЗ"
                        fileName={setup.pzzZoneDescriptionFileName}
                        disabled={!isReady || isLocked}
                        onFileSelected={(file) => ChatStore.submitVriPzzZoneDescription(setup.id, file)}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 customer-dark:border-ui-border customer-dark:bg-surface-muted customer-dark:text-content-primary">
            <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-900 customer-dark:text-content-primary">Проверка ВРИ</span>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500 customer-dark:bg-surface-raised customer-dark:text-content-muted">
                    {getVriSetupStatusLabel(setup.status)}
                </span>
            </div>
            {uploadedFiles.length > 0 && (
                <div className="flex flex-col gap-1 rounded-2xl bg-white px-3 py-2 text-xs text-slate-500 customer-dark:bg-surface-raised customer-dark:text-content-muted">
                    {uploadedFiles.map((fileLabel) => (
                        <div key={fileLabel} className="min-w-0 truncate">{fileLabel}</div>
                    ))}
                </div>
            )}
            {renderStep()}
            {/* {setup.errorText && (
                <div className="rounded-2xl border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger-content">
                    {setup.errorText}
                </div>
            )} */}
        </div>
    );
});

const ChatTools = observer(() => {
    const { isStreaming } = ChatStore;
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
          {isOpen && (
            <div className="absolute left-full top-1/2 z-20 ml-2 w-auto -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 shadow-[0_18px_40px_-20px_var(--shadow-popover)] customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-secondary">
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-100 customer-dark:hover:bg-surface-hover"
                onClick={() => setIsOpen(false)}
              >
                <MdOutlineMap size={18} />
                Загрузить файл
              </button>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-100 customer-dark:hover:bg-surface-hover"
                onClick={() => setIsOpen(false)}
              >
                Сервисы
                <MdArrowForwardIos size={14} className="text-slate-400 customer-dark:text-content-muted" />
              </button>
            </div>
          )}
          <button className="group" onClick={() => setIsOpen(!isOpen)} disabled={isStreaming}>
            <span className={isStreaming ? "text-slate-300 customer-dark:text-content-disabled" : "text-gray-950 group-hover:text-[#0788CE] customer:group-hover:text-brand-primary customer-dark:text-content-primary"}>
              <AiOutlinePlusCircle size={"2rem"} />
            </span>
          </button>
        </>
    );
});

const ChatInput = observer((
    { onSubmit }: { onSubmit: ChatComponentProps["onSubmit"]}
) => {
    const { isStreaming } = ChatStore;
    const [currentInput, setCurrentInput] = useState<string>("");
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        textarea.style.height = "0px";
        const nextHeight = Math.min(textarea.scrollHeight, 24 * 3);
        textarea.style.height = `${nextHeight}px`;
    }, [currentInput]);

    return (
        <div className={`
            chat-input-shell relative w-full rounded-3xl py-4 px-6 mb-1.5
            flex flex-col items-center justify-center
            border drop-shadow-lg shadow-gray-300
            text-gray-950 customer-dark:text-content-primary
            transition-colors duration-200
            ${isStreaming
                ? "bg-slate-100 border-slate-200 shadow-none customer-dark:bg-surface-muted customer-dark:border-ui-border"
                : "bg-white border-gray-300 customer-dark:bg-surface-panel customer-dark:border-ui-border-strong"}
        `}>
                <div className="w-full">
                    <div className={`
                        w-full flex items-center gap-4
                    `}>
                        <textarea
                            ref={textareaRef}
                            rows={1}
                            className={`
                                min-w-0 flex-1 resize-none overflow-y-auto bg-transparent leading-6 focus:outline-none transition-colors duration-200
                                ${isStreaming
                                  ? "cursor-not-allowed text-slate-400 placeholder:text-slate-400 customer-dark:text-content-muted customer-dark:placeholder:text-content-muted"
                                  : "text-gray-950 placeholder:text-gray-500 customer-dark:text-content-primary customer-dark:placeholder:text-content-muted"}
                            `}
                            placeholder={isStreaming ? "Ответ генерируется..." : "Спросите Помощника"}
                            value={currentInput}
                            onChange={(e) => setCurrentInput(e.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" && currentInput) {
                                    onSubmit?.(currentInput);
                                    setCurrentInput("");
                                }
                            }}
                            disabled={isStreaming}
                        />
                    </div>
                    <div className="mt-5 flex w-full items-end justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <ChatContextSelection />
                        </div>
                        <div className="flex shrink-0 items-center">
                            <button
                                className={`group ${isStreaming ? "cursor-pointer" : ""}`}
                                onClick={() => {
                                    if (isStreaming) {
                                        ChatStore.abortStream();
                                        return;
                                    }

                                    if (currentInput) {
                                        onSubmit?.(currentInput);
                                        setCurrentInput("");
                                    }
                                }}
                            >
                                <span className={isStreaming
                                  ? "text-[#D45D5D] group-hover:text-[#BF3F3F] customer:text-danger customer:group-hover:text-danger-hover"
                                  : "text-gray-950 group-hover:text-[#A5C21B] customer:group-hover:text-brand-accent customer-dark:text-content-primary"}>
                                    {isStreaming ? <FaStopCircle size={"2rem"} /> : <IoIosSend size={"2rem"} />}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
        </div>
    );
});

const ChatComponent = observer(function ChatComponent(
    props: ChatComponentProps
) {
    const {
        onSubmit = (request: string) => {ChatStore.sendChatMessage(request)},
        emptyState,
    } = props;
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const hasMessages = ChatStore.chatMessages.length > 0;

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [ChatStore.chatMessages.length, ChatStore.streamedResponse, ChatStore.isStreaming]);

    const renderedMessages: ReactNode[] = [];

    for (let ind = 0; ind < ChatStore.chatMessages.length; ind += 1) {
        const message = ChatStore.chatMessages[ind];

        if (isGeoJsonResponseMessage(message)) {
            const geoJsonMessages: GeoJsonResponseMessage[] = [message];
            let nextIndex = ind + 1;

            while (nextIndex < ChatStore.chatMessages.length) {
                const nextMessage = ChatStore.chatMessages[nextIndex];

                if (!isGeoJsonResponseMessage(nextMessage)) break;

                geoJsonMessages.push(nextMessage);
                nextIndex += 1;
            }

            if (geoJsonMessages.length > 1) {
                renderedMessages.push(
                    <div
                        key={`chat-message-geojson-group-${ind}`}
                        className="w-full rounded-3xl py-4 pr-6 pl-1 text-gray-950 customer-dark:text-content-primary"
                    >
                        <GeoJsonMessageAccordion messages={geoJsonMessages} />
                    </div>
                );
                ind = nextIndex - 1;
                continue;
            }
        }

        renderedMessages.push(
            <div
                key={`chat-message-${message.type}-${ind}`}
                className={
                    message.type === "response"
                        ? message.message.type === "error"
                            ? "w-full rounded-3xl border border-danger-border bg-danger-soft px-5 py-4 text-danger-content"
                            : message.message.type === "warning"
                                ? "w-full rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950"
                                : "w-full rounded-3xl pr-6 pl-1 py-4 text-gray-950 customer-dark:text-content-primary"
                        : "w-fit self-end-safe rounded-3xl border border-gray-200 bg-blue-100 px-6 py-4 text-gray-950 whitespace-pre-wrap relative customer:border-brand-border customer:bg-brand-soft customer-dark:text-content-primary"
                }
            >
                {message.message.type === "text" ? renderFormattedText(message.message.text) : ""}
                {message.message.type === "error" && (
                    <div className="flex items-start gap-3">
                        <span className="mt-0.5 shrink-0 text-red-500 customer:text-danger">
                            <IoAlertCircleOutline size={22} />
                        </span>
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-red-700 customer:text-danger">
                                Ошибка
                            </div>
                            <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-red-900 customer:text-danger-content">
                                {message.message.text}
                            </div>
                        </div>
                    </div>
                )}
                {message.message.type === "warning" && (
                    <div className="flex items-start gap-3">
                        <span className="mt-0.5 shrink-0 text-amber-500">
                            <IoAlertCircleOutline size={22} />
                        </span>
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-amber-800">
                                Предупреждение
                            </div>
                            <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-amber-950">
                                {message.message.text}
                            </div>
                        </div>
                    </div>
                )}
                {message.message.type === "geojson" && (
                    <GeoJsonLayerRow
                        name={message.message.name}
                        layer={message.message.layer}
                    />
                )}
                {message.message.type === "pzz_setup" && (
                    <PzzSetupMessageCard setup={message.message} />
                )}
                {message.message.type === "vri_setup" && (
                    <VriSetupMessageCard setup={message.message} />
                )}
                {message.type === "request" && (
                    <div className="absolute -bottom-1.5 right-4 w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-blue-100"></div>
                )}
            </div>
        );
    }

    if (!hasMessages) {
        return (
            <div className="flex w-full flex-1 items-center justify-center">
                <div className="flex w-full max-w-4xl flex-col gap-4">
                    {emptyState}
                    <ChatInput onSubmit={onSubmit} />
                </div>
            </div>
        );
    }

    return (
        <div className="w-full flex flex-col min-h-0 flex-1">
            <div className="min-h-0 flex-1 overflow-y-auto pr-2">
                <div className="flex min-h-full flex-col gap-2 pb-4 justify-start">
                    {renderedMessages}
                    <div>
                        {ChatStore.isStreaming && ChatStore.currentStatus && (
                            <span>{ChatStore.currentStatus}</span>
                        )}
                        <SyncLoader size={8} color="var(--color-brand-primary)" loading={ChatStore.isStreaming} cssOverride={{ marginBlock: 12, marginLeft: "0.25rem" }} />
                    </div>
                    <div ref={messagesEndRef} />
                </div>
            </div>
            <div className="shrink-0 border-t border-gray-100 bg-white pt-4 customer-dark:border-ui-border customer-dark:bg-surface-page">
                <ChatInput onSubmit={onSubmit}/>
            </div>
        </div>
    )
});

export default ChatComponent;
