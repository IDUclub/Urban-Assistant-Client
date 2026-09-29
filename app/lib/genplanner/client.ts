import { readSseStream, type RawSseEvent } from "@lib/sse";
import type {
    DefaultZoneAdjacencyMatrixResponse,
    ZonePair,
} from "@lib/genplanner/zoneAdjacencyMatrix";

export type GenPlannerScenarioChatRequest = {
    scenarioId: number;
    userQuery: string;
    chatId?: string;
    test?: boolean;
    neighbourPairs?: [number, number][];
    forbiddenPairs?: [number, number][];
};

export type GenPlannerCustomChatRequest = {
    userQuery: string;
    territoryFile?: File;
    chatId?: string;
};

export type GenPlannerStreamEvent =
    | { type: "chat_created"; chatId?: string; title?: string }
    | { type: "warning"; stage?: string; detail?: unknown; message?: string }
    | { type: "token"; content: string }
    | { type: "result"; zones?: unknown; roads?: unknown; territory?: unknown }
    | { type: "error"; stage?: string; detail?: unknown }
    | { type: "done"; chatId?: string; assistantMessageId?: string }
    | { type: "unknown"; eventName?: string; data: unknown };

type StreamGenPlannerScenarioChatOptions = {
    baseUrl: string;
    accessToken: string;
    request: GenPlannerScenarioChatRequest;
    signal: AbortSignal;
    onOpen?: () => void;
    onEvent: (event: GenPlannerStreamEvent) => void;
};

type StreamGenPlannerCustomChatOptions = Omit<StreamGenPlannerScenarioChatOptions, "request"> & {
    request: GenPlannerCustomChatRequest;
};

export class GenPlannerHttpError extends Error {
    status: number;
    data: unknown;

    constructor(status: number, data: unknown) {
        super(`GenPlanner request failed with status ${status}`);
        this.name = "GenPlannerHttpError";
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

function normalizeStreamEvent(rawEvent: RawSseEvent): GenPlannerStreamEvent {
    const data = parseJsonValue(rawEvent.data);
    const record = asRecord(data);
    const eventName = (
        rawEvent.eventName?.trim().toLowerCase() ??
        asString(record?.type)?.toLowerCase()
    );

    switch (eventName) {
        case "chat_created":
            return {
                type: "chat_created",
                chatId: asString(record?.chat_id),
                title: asString(record?.title),
            };
        case "warning":
            return {
                type: "warning",
                stage: asString(record?.stage),
                detail: record?.detail,
                message: asString(record?.message),
            };
        case "token":
            return {
                type: "token",
                content: typeof record?.content === "string" ? record.content : "",
            };
        case "result": {
            const content = asRecord(record?.content);

            return {
                type: "result",
                zones: record?.zones ?? content?.zones,
                roads: record?.roads ?? content?.roads,
                territory: record?.territory ?? content?.territory,
            };
        }
        case "error":
            return {
                type: "error",
                stage: asString(record?.stage),
                detail: record?.detail,
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

function getScenarioChatStreamUrl(baseUrl: string, scenarioId: number) {
    return `${getGenPlannerBaseUrl(baseUrl)}/scenarios/${scenarioId}/chat/stream`;
}

function getGenPlannerBaseUrl(baseUrl: string) {
    const baseUrlWithoutTrailingSlash = baseUrl.replace(/\/+$/, "");
    return baseUrlWithoutTrailingSlash.endsWith("/genplanner")
        ? baseUrlWithoutTrailingSlash
        : `${baseUrlWithoutTrailingSlash}/genplanner`;
}

async function parseErrorResponse(response: Response) {
    const text = await response.text();
    return text ? parseJsonValue(text) : undefined;
}

function isZonePair(value: unknown): value is ZonePair {
    return Array.isArray(value) &&
        value.length === 2 &&
        value.every(
            (zoneId) =>
                typeof zoneId === "number" &&
                Number.isFinite(zoneId),
        );
}

export async function getDefaultZoneAdjacencyMatrix({
    baseUrl,
    accessToken,
    signal,
}: {
    baseUrl: string;
    accessToken: string;
    signal?: AbortSignal;
}): Promise<DefaultZoneAdjacencyMatrixResponse> {
    const response = await fetch(
        `${getGenPlannerBaseUrl(baseUrl)}/default_matrix`,
        {
            method: "GET",
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            signal,
        },
    );

    if (!response.ok) {
        throw new GenPlannerHttpError(
            response.status,
            await parseErrorResponse(response),
        );
    }

    const data: unknown = await response.json();
    const record = asRecord(data);
    const forbiddenPairs = record?.forbidden_pairs;

    if (
        !Array.isArray(forbiddenPairs) ||
        !forbiddenPairs.every(isZonePair)
    ) {
        throw new Error(
            "GenPlanner returned an invalid default adjacency matrix",
        );
    }

    return {
        forbidden_pairs: forbiddenPairs,
    };
}

export async function streamGenPlannerScenarioChat({
    baseUrl,
    accessToken,
    request,
    signal,
    onOpen,
    onEvent,
}: StreamGenPlannerScenarioChatOptions) {
    const response = await fetch(getScenarioChatStreamUrl(baseUrl, request.scenarioId), {
        method: "POST",
        headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            user_query: request.userQuery,
            chat_id: request.chatId ?? null,
            test: request.test ?? false,
            neighbour_pairs: request.neighbourPairs,
            forbidden_pairs: request.forbiddenPairs,
        }),
        signal,
    });

    if (!response.ok) {
        throw new GenPlannerHttpError(
            response.status,
            await parseErrorResponse(response),
        );
    }

    if (!response.body) {
        throw new Error("GenPlanner stream response is not readable");
    }

    onOpen?.();
    await readSseStream(response.body, (rawEvent) => {
        onEvent(normalizeStreamEvent(rawEvent));
    });
}

export async function streamGenPlannerCustomChat({
    baseUrl,
    accessToken,
    request,
    signal,
    onOpen,
    onEvent,
}: StreamGenPlannerCustomChatOptions) {
    const formData = new FormData();
    formData.append("user_query", request.userQuery);
    if (request.chatId) {
        formData.append("chat_id", request.chatId);
    }

    if (request.territoryFile) {
        formData.append("territory_file", request.territoryFile);
    }

    const response = await fetch(`${getGenPlannerBaseUrl(baseUrl)}/custom/chat/stream`, {
        method: "POST",
        headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
        signal,
    });

    if (!response.ok) {
        throw new GenPlannerHttpError(
            response.status,
            await parseErrorResponse(response),
        );
    }

    if (!response.body) {
        throw new Error("GenPlanner custom stream response is not readable");
    }

    onOpen?.();
    await readSseStream(response.body, (rawEvent) => {
        onEvent(normalizeStreamEvent(rawEvent));
    });
}
