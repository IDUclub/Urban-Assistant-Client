import axios from "axios";

type GenBuilderChatRequestBase = {
    userQuery: string;
    chatId?: string;
};

export type GenBuilderScenarioChatRequest = GenBuilderChatRequestBase & {
    scenarioId: number;
    year: number;
    source: string;
    projectId?: number;
};

export type GenBuilderBlocksChatRequest = GenBuilderChatRequestBase & {
    blocksFile: File;
};

export type GenBuilderChatRequest =
    | GenBuilderScenarioChatRequest
    | GenBuilderBlocksChatRequest;

export type GenBuilderStreamEvent =
    | { type: "chat_created"; chatId?: string; title?: string }
    | { type: "clarification"; content?: string; missing?: unknown[] }
    | { type: "status"; content?: string }
    | { type: "progress"; stage?: string; content?: string }
    | { type: "result"; content: unknown; summary?: unknown }
    | { type: "token"; content: string }
    | { type: "warning"; stage?: string; detail?: string; message?: string }
    | { type: "error"; stage?: string; detail?: string }
    | { type: "done"; chatId?: string; assistantMessageId?: string }
    | { type: "unknown"; eventName?: string; data: unknown };

type RawSseEvent = {
    eventName?: string;
    data: string;
};

type StreamGenBuilderChatOptions = {
    baseUrl: string;
    accessToken: string;
    request: GenBuilderChatRequest;
    signal: AbortSignal;
    onOpen?: () => void;
    onEvent: (event: GenBuilderStreamEvent) => void;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function asString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseJsonValue(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function parseSseEventBlock(eventBlock: string): RawSseEvent | undefined {
    let eventName: string | undefined;
    const dataLines: string[] = [];

    eventBlock.split(/\r?\n/).forEach((rawLine) => {
        const line = rawLine.trimEnd();
        if (!line || line.startsWith(":")) {
            return;
        }

        if (line.startsWith("event:")) {
            eventName = line.slice(6).trim() || undefined;
            return;
        }

        if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
        }
    });

    if (!dataLines.length) {
        return;
    }

    return {
        eventName,
        data: dataLines.join("\n"),
    };
}

async function readSseStream(
    stream: ReadableStream<Uint8Array>,
    onEvent: (event: RawSseEvent) => void,
) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            break;
        }

        if (!value) {
            continue;
        }

        buffer += decoder.decode(value, { stream: true });
        const eventBlocks = buffer.split(/\r?\n\r?\n/);
        buffer = eventBlocks.pop() ?? "";

        eventBlocks.forEach((eventBlock) => {
            const event = parseSseEventBlock(eventBlock);
            if (event) {
                onEvent(event);
            }
        });
    }

    buffer += decoder.decode();
    if (!buffer.trim()) {
        return;
    }

    const event = parseSseEventBlock(buffer);
    if (event) {
        onEvent(event);
    }
}

function normalizeStreamEvent(rawEvent: RawSseEvent): GenBuilderStreamEvent {
    const eventName = rawEvent.eventName?.trim().toLowerCase();
    const data = parseJsonValue(rawEvent.data);
    const record = asRecord(data);

    switch (eventName) {
        case "chat_created":
            return {
                type: "chat_created",
                chatId: asString(record?.chat_id),
                title: asString(record?.title),
            };
        case "clarification":
            return {
                type: "clarification",
                content: asString(record?.content),
                missing: Array.isArray(record?.missing) ? record.missing : undefined,
            };
        case "status":
            return { type: "status", content: asString(record?.content) };
        case "progress":
            return {
                type: "progress",
                stage: asString(record?.stage),
                content: asString(record?.content),
            };
        case "result":
            return {
                type: "result",
                content: record?.content ?? data,
                summary: record?.summary,
            };
        case "token":
            return {
                type: "token",
                content: typeof record?.content === "string" ? record.content : "",
            };
        case "warning":
            return {
                type: "warning",
                stage: asString(record?.stage),
                detail: asString(record?.detail),
                message: asString(record?.message),
            };
        case "error":
            return {
                type: "error",
                stage: asString(record?.stage),
                detail: asString(record?.detail),
            };
        case "done":
            return {
                type: "done",
                chatId: asString(record?.chat_id),
                assistantMessageId: asString(record?.assistant_message_id),
            };
        default:
            return { type: "unknown", eventName, data };
    }
}

function createFormData(request: GenBuilderChatRequest) {
    const formData = new FormData();

    formData.set("user_query", request.userQuery);

    if ("blocksFile" in request) {
        formData.set("blocks_file", request.blocksFile, request.blocksFile.name);
    } else {
        formData.set("scenario_id", String(request.scenarioId));
        formData.set("year", String(request.year));
        formData.set("source", request.source);

        if (request.projectId !== undefined) {
            formData.set("project_id", String(request.projectId));
        }
    }

    if (request.chatId) {
        formData.set("chat_id", request.chatId);
    }

    return formData;
}

export async function streamGenBuilderChat({
    baseUrl,
    accessToken,
    request,
    signal,
    onOpen,
    onEvent,
}: StreamGenBuilderChatOptions) {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    const { data } = await axios.post(
        `${normalizedBaseUrl}/generate/chat/stream`,
        createFormData(request),
        {
            headers: {
                Accept: "text/event-stream",
                Authorization: `Bearer ${accessToken}`,
            },
            responseType: "stream",
            adapter: "fetch",
            signal,
        },
    );
    const stream = data;

    if (!stream || typeof stream.getReader !== "function") {
        throw new Error("GenBuilder stream response is not readable");
    }

    onOpen?.();

    await readSseStream(stream, (rawEvent) => {
        onEvent(normalizeStreamEvent(rawEvent));
    });
}
