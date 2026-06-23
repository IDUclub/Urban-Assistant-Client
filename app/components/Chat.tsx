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
import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import ChatStore from "@lib/ChatStore";
import MapStore from "@lib/MapStore";
import { SyncLoader } from "react-spinners";
import ChatContextSelection from "@components/ChatContextSelection";
import CascaderSelect from "@components/CascaderSelect";
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
            return "mt-2 text-2xl font-semibold leading-tight text-gray-950";
        case 2:
            return "mt-2 text-xl font-semibold leading-tight text-gray-950";
        case 3:
            return "mt-1 text-lg font-semibold leading-snug text-gray-950";
        default:
            return "mt-1 text-base font-semibold leading-snug text-gray-900";
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
                <div key={`code-${blocks.length}`} className="my-2 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
                    {language ? (
                        <div className="border-b border-slate-200 bg-white px-4 py-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                            {language}
                        </div>
                    ) : null}
                    <pre className="overflow-x-auto px-4 py-4 text-sm leading-6 text-[#1f1555] bg-[#f8f9fa]">
                        <code>{codeLines.join("\n")}</code>
                    </pre>
                </div>
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
                    <table className="min-w-full border-collapse overflow-hidden rounded-2xl border border-gray-200 text-left text-sm">
                        <thead className="bg-gray-50">
                            <tr className="bg-gray-400/10">
                                {header.map((cell, cellIndex) => (
                                    <th key={`header-${cellIndex}`} className="border-b border-gray-200 px-4 py-3 font-semibold text-gray-900">
                                        {renderInlineText(cell)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIndex) => (
                                <tr key={`row-${rowIndex}`} className="odd:bg-white even:bg-gray-50/50">
                                    {row.map((cell, cellIndex) => (
                                        <td key={`cell-${rowIndex}-${cellIndex}`} className="border-t border-gray-200 px-4 py-3 align-top text-gray-800">
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
            return undefined;
        }
    }

    if (typeof layer === "object") {
        return layer;
    }

    return undefined;
}

function downloadGeoJson(name: string, layer: unknown) {
    const parsedLayer = parseFeatureCollection(layer);
    if (!parsedLayer) return;

    const fileName = `${(name || "layer")
        .trim()
        .replace(/[^\w.-]+/g, "_")
        .replace(/^_+|_+$/g, "") || "layer"}.geojson`;
    const blob = new Blob([JSON.stringify(parsedLayer, null, 2)], {
        type: "application/geo+json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = fileName;
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
        const parsedLayer = parseFeatureCollection(layer);
        if (!parsedLayer) return;

        MapStore.addLayerToMap({
            name,
            layer: parsedLayer,
        });
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
                className="cursor-pointer rounded-full p-1 text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                onClick={() => setIsOpen((current) => !current)}
                aria-label="Действия со слоем"
            >
                <MdMoreHoriz size={18} />
            </button>
            {isOpen && (
                <div className="absolute left-full top-1/2 z-20 ml-2 w-60 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 shadow-[0_18px_40px_-20px_rgba(15,23,42,0.35)]">
                    <button
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-100"
                        onClick={addLayerToMap}
                    >
                        <MdOutlineMap size={18} />
                         Добавить на карту
                    </button>
                    <button
                        type="button"
                        className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-100"
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
        <span className="inline-flex min-w-0 items-center gap-2 text-blue-600">
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

function isGeoJsonResponseMessage(message: ChatStoreMessage): message is GeoJsonResponseMessage {
    return message.type === "response" && message.message.type === "geojson";
}

function GeoJsonMessageAccordion({ messages }: { messages: GeoJsonResponseMessage[] }) {
    return (
        <details className="group w-full rounded-2xl border border-blue-100 bg-blue-50/40 text-blue-700">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden">
                <span className="inline-flex min-w-0 items-center gap-2 font-medium">
                    <LuLayers3 className="shrink-0" />
                    <span className="min-w-0 truncate">GeoJSON-слои ({messages.length})</span>
                </span>
                <MdArrowForwardIos className="shrink-0 text-blue-500 transition-transform group-open:rotate-90" size={16} />
            </summary>
            <div className="flex flex-col gap-2 border-t border-blue-100 px-4 py-3">
                {messages.map((message, index) => (
                    <div
                        key={`geojson-layer-${message.message.name}-${index}`}
                        className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-white/80 px-3 py-2"
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
    const isLocked = setup.status === "submitting" ||
        setup.status === "queued" ||
        setup.status === "waiting_capacity" ||
        setup.status === "running" ||
        setup.status === "finished" ||
        setup.status === "failed";
    const isLoading = setup.status === "loading";
    const canSubmit = !isLocked && setup.status === "ready" && selectedYear !== undefined && !!selectedSource;
    const statusLabel = getPzzSetupStatusLabel(setup.status);

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
        if (!canSubmit || selectedYear === undefined || !selectedSource) return;

        ChatStore.submitPzzSetup(setup.id, selectedYear, selectedSource);
    };

    return (
        <div className="flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800">
            <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-900">Проверка объектов по ПЗЗ</span>
                <div className="flex min-w-0 shrink-0 items-center gap-2">
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500">
                        {statusLabel}
                    </span>
                </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                <label className="flex min-w-0 flex-col gap-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
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
                <label className="flex min-w-0 flex-col gap-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    Тип зоны
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
                    className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-2xl bg-[#0788CE] px-4 text-sm font-medium text-white transition-colors hover:bg-[#0676B3] disabled:cursor-not-allowed disabled:bg-slate-300"
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
            {isLoading && (
                <div className="text-xs text-slate-500">Загрузка источников функциональных зон...</div>
            )}
            {setup.errorText && (
                <div className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {setup.errorText}
                </div>
            )}
        </div>
    );
});

const ChatTools = observer(() => {
    const { isStreaming } = ChatStore;
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
          {isOpen && (
            <div className="absolute left-full top-1/2 z-20 ml-2 w-auto -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-2 text-sm text-slate-700 shadow-[0_18px_40px_-20px_rgba(15,23,42,0.35)]">
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-100"
                onClick={() => setIsOpen(false)}
              >
                <MdOutlineMap size={18} />
                Загрузить файл
              </button>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-100"
                onClick={() => setIsOpen(false)}
              >
                Сервисы
                <MdArrowForwardIos size={14} className="text-slate-400" />
              </button>
            </div>
          )}
          <button className="group" onClick={() => setIsOpen(!isOpen)} disabled={isStreaming}>
            <span className={isStreaming ? "text-slate-300" : "text-gray-950 group-hover:text-[#0788CE]"}>
              <AiOutlinePlusCircle size={"2rem"} />
            </span>
          </button>
        </>
    );
});

const ChatInput = observer((
    { onSubmit }: { onSubmit: ChatComponentProps["onSubmit"]}
) => {
    const { isStreaming, chatMessages, selectedContext, setSelectedChatTool } = ChatStore;
    const [currentInput, setCurrentInput] = useState<string>("");
    const isContextSelectionVisible = !chatMessages.length;
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
            w-full rounded-3xl py-4 px-6 mb-1.5
            flex flex-col items-center justify-center
            border drop-shadow-lg shadow-gray-300
            text-gray-950
            transition-colors duration-200
            ${isStreaming
                ? "bg-slate-100 border-slate-200 shadow-none"
                : "bg-white border-gray-300"}
        `}>
                <div className={`w-full ${isContextSelectionVisible ? "space-y-7.5" : ""}`}>
                    <div className={`
                        w-full flex items-center gap-4
                        ${isContextSelectionVisible ? "justify-between" : ""}
                    `}>
                        <textarea
                            ref={textareaRef}
                            rows={1}
                            className={`
                                min-w-0 flex-1 resize-none overflow-y-auto bg-transparent leading-6 focus:outline-none transition-colors duration-200
                                ${isStreaming ? "cursor-not-allowed text-slate-400 placeholder:text-slate-400" : "text-gray-950 placeholder:text-gray-500"}
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
                        <div className="flex items-center gap-3">
                            {selectedContext !== "nonproject" && ( <CascaderSelect
                                items={[
                                    {
                                        label: "Загрузить файл",
                                        icon: <MdOutlineUploadFile size={18} />,
                                        onClickAction: () => {},
                                        disabled: true,
                                    },
                                    {
                                        label: "Сервисы",
                                        icon: <MdMoreHoriz size={18} />,
                                        children: [
                                            {
                                                label: "Обеспеченность",
                                                onClickAction: () => {
                                                    setSelectedChatTool("Обеспеченность");
                                                },
                                            },
                                            {
                                                label: "Проверка объектов по ПЗЗ",
                                                onClickAction: () => {
                                                    setSelectedChatTool("Проверка объектов по ПЗЗ");
                                                },
                                            },
                                        ],
                                    },
                                ]}
                                rootNode={
                                    <span className={isStreaming ? "text-slate-300" : "text-gray-950 hover:text-[#0788CE]"}>
                                        <AiOutlinePlusCircle size={"2rem"} />
                                    </span>
                                }
                                disabled={isStreaming}
                            />)}
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
                                <span className={isStreaming ? "text-[#D45D5D] group-hover:text-[#BF3F3F]" : "text-gray-950 group-hover:text-[#A5C21B]"}>
                                    {isStreaming ? <FaStopCircle size={"2rem"} /> : <IoIosSend size={"2rem"} />}
                                </span>
                            </button>
                        </div>
                    </div>
                    <div className="w-full flex items-center justify-between gap-2">
                        <ChatContextSelection />
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
                        className="w-full rounded-3xl py-4 pr-6 pl-1 text-gray-950"
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
                            ? "w-full rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-red-900"
                            : "w-full rounded-3xl pr-6 pl-1 py-4 text-gray-950"
                        : "w-fit self-end-safe rounded-3xl border border-gray-200 bg-blue-100 px-6 py-4 text-gray-950 whitespace-pre-wrap relative"
                }
            >
                {message.message.type === "text" ? renderFormattedText(message.message.text) : ""}
                {message.message.type === "error" && (
                    <div className="flex items-start gap-3">
                        <span className="mt-0.5 shrink-0 text-red-500">
                            <IoAlertCircleOutline size={22} />
                        </span>
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-red-700">
                                Ошибка
                            </div>
                            <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-red-900">
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
                        <SyncLoader size={8} color="#0788CE" loading={ChatStore.isStreaming} cssOverride={{ marginBlock: 12, marginLeft: "0.25rem" }} />
                    </div>
                    <div ref={messagesEndRef} />
                </div>
            </div>
            <div className="shrink-0 border-t border-gray-100 bg-white pt-4">
                <ChatInput onSubmit={onSubmit}/>
            </div>
        </div>
    )
});

export default ChatComponent;
