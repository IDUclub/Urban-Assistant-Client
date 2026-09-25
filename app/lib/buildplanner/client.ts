import { readSseStream, type RawSseEvent } from "@lib/sse";

export type BuildPlannerScenarioChatRequest = {
    scenarioId: number;
    userQuery: string;
    chatId?: string;
};

export type BuildPlannerStreamEvent =
    | { type: "chat_created"; chatId?: string; title?: string }
    | { type: "status"; payload: unknown }
    | { type: "progress"; payload: unknown }
    | { type: "file"; payload: unknown }
    | { type: "text"; payload: unknown }
    | { type: "token"; content: string }
    | { type: "result"; payload: unknown }
    | { type: "warning"; stage?: string; detail?: unknown; message?: string }
    | { type: "error"; stage?: string; detail?: unknown }
    | { type: "done"; chatId?: string; assistantMessageId?: string }
    | { type: "unknown"; eventName?: string; data: unknown };

type StreamBuildPlannerScenarioChatOptions = {
    baseUrl: string;
    accessToken: string;
    request: BuildPlannerScenarioChatRequest;
    signal: AbortSignal;
    onOpen?: () => void;
    onEvent: (event: BuildPlannerStreamEvent) => void;
};

export class BuildPlannerHttpError extends Error {
    status: number;
    data: unknown;

    constructor(status: number, data: unknown) {
        super(`BuildPlanner request failed with status ${status}`);
        this.name = "BuildPlannerHttpError";
        this.status = status;
        this.data = data;
    }
}

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

function getEventType(rawEvent: RawSseEvent, record?: Record<string, unknown>) {
    const content = asRecord(record?.content);
    const data = asRecord(record?.data);
    const candidates = [
        record?.chunk_type,
        record?.chunkType,
        content?.chunk_type,
        content?.chunkType,
        data?.chunk_type,
        data?.chunkType,
        record?.type,
        content?.type,
        data?.type,
        rawEvent.eventName,
    ];
    let genericType: string | undefined;

    for (const candidate of candidates) {
        const eventType = asString(candidate)?.toLowerCase();
        if (!eventType || eventType === "message") continue;
        if (eventType === "chunk") {
            genericType = eventType;
            continue;
        }

        return eventType;
    }

    return genericType;
}

function getTokenContent(record?: Record<string, unknown>) {
    if (typeof record?.content === "string") return record.content;

    const content = asRecord(record?.content);
    if (typeof content?.content === "string") return content.content;
    if (typeof content?.text === "string") return content.text;
    if (typeof record?.text === "string") return record.text;

    return "";
}

function normalizeStreamEvent(rawEvent: RawSseEvent): BuildPlannerStreamEvent {
    const data = parseJsonValue(rawEvent.data);
    const record = asRecord(data);
    const content = asRecord(record?.content);
    const eventType = getEventType(rawEvent, record);

    switch (eventType) {
        case "chat_created":
            return {
                type: "chat_created",
                chatId: asString(record?.chat_id ?? content?.chat_id),
                title: asString(record?.title ?? content?.title),
            };
        case "status":
            return { type: "status", payload: data };
        case "progress":
            return { type: "progress", payload: data };
        case "file":
            return { type: "file", payload: data };
        case "text":
            return { type: "text", payload: data };
        case "token":
            return { type: "token", content: getTokenContent(record) };
        case "result":
            return { type: "result", payload: data };
        case "warning":
            return {
                type: "warning",
                stage: asString(record?.stage ?? content?.stage),
                detail: record?.detail ?? content?.detail,
                message: asString(record?.message ?? content?.message),
            };
        case "error":
            return {
                type: "error",
                stage: asString(record?.stage ?? content?.stage),
                detail: record?.detail ?? content?.detail ?? record?.content,
            };
        case "done":
            return {
                type: "done",
                chatId: asString(record?.chat_id ?? content?.chat_id),
                assistantMessageId: asString(
                    record?.assistant_message_id ?? content?.assistant_message_id,
                ),
            };
        default:
            return { type: "unknown", eventName: eventType, data };
    }
}

function getBuildPlannerBaseUrl(baseUrl: string) {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    return normalizedBaseUrl.endsWith("/buildplanner")
        ? normalizedBaseUrl
        : `${normalizedBaseUrl}/buildplanner`;
}

function getScenarioChatStreamUrl(baseUrl: string, scenarioId: number) {
    return `${getBuildPlannerBaseUrl(baseUrl)}/buildplanner/scenarios/${scenarioId}/chat/stream`;
}

async function parseErrorResponse(response: Response) {
    const text = await response.text();
    return text ? parseJsonValue(text) : undefined;
}

export async function streamBuildPlannerScenarioChat({
    baseUrl,
    accessToken,
    request,
    signal,
    onOpen,
    onEvent,
}: StreamBuildPlannerScenarioChatOptions) {
    const response = await fetch(
        getScenarioChatStreamUrl(baseUrl, request.scenarioId),
        {
            method: "POST",
            headers: {
                Accept: "text/event-stream",
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                user_query: request.userQuery,
                ...(request.chatId ? { chat_id: request.chatId } : {}),
            }),
            signal,
        },
    );

    if (!response.ok) {
        throw new BuildPlannerHttpError(
            response.status,
            await parseErrorResponse(response),
        );
    }

    if (!response.body) {
        throw new Error("BuildPlanner stream response is not readable");
    }

    onOpen?.();
    await readSseStream(response.body, (rawEvent) => {
        onEvent(normalizeStreamEvent(rawEvent));
    });
}
