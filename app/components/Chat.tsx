import { AiOutlinePlusCircle } from "react-icons/ai";
import { IoIosSend } from "react-icons/io";
import { FaStopCircle } from "react-icons/fa";
import { LuLayers3 } from "react-icons/lu";
import { MdDownload, MdMoreHoriz, MdOutlineMap } from "react-icons/md";
import { IoAlertCircleOutline } from "react-icons/io5";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import ChatStore from "@lib/ChatStore";
import MapStore from "@lib/MapStore";
import { SyncLoader } from "react-spinners";
import ChatContextSelection from "@components/ChatContextSelection";


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
}

const ChatInput = observer((
    { onSubmit }: { onSubmit: ChatComponentProps["onSubmit"]}
) => {
    const { isStreaming, chatMessages } = ChatStore;
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
                            <button className="group" disabled={isStreaming}>
                                <span className={isStreaming ? "text-slate-300" : "text-gray-950 group-hover:text-[#0788CE]"}>
                                    <AiOutlinePlusCircle size={"2rem"} />
                                </span>
                            </button>
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
                    {isContextSelectionVisible && (
                        <div className="w-full flex items-center justify-between gap-2">
                            <ChatContextSelection />
                        </div>
                    )}
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
                    {ChatStore.chatMessages.map(
                        (message, ind) => (
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
                                    <span className="inline-flex items-center gap-2 text-blue-600">
                                        <LuLayers3 />
                                        <span>{message.message.name}</span>
                                        <GeoJsonMessageActions
                                            name={message.message.name}
                                            layer={message.message.layer}
                                        />
                                    </span>
                                )}
                                {message.type === "request" && (
                                    <div className="absolute -bottom-1.5 right-4 w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent border-t-8 border-t-blue-100"></div>
                                )}
                            </div>
                        )
                    )}
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
