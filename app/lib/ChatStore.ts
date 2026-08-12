import axios from "axios";
import { action, makeAutoObservable, reaction, runInAction } from "mobx";
import AuthStore from "@lib/AuthStore";
import DataStore from "@lib/DataStore";
import {
    streamGenBuilderChat,
    type GenBuilderChatRequest,
    type GenBuilderStreamEvent,
} from "@lib/genbuilder/client";
import {
    saveGeneratedBuildings,
} from "@lib/genbuilder/saveGeneratedBuildings";
import {
    type FunctionalZoneSource,
    type GenBuilderSavePromptMessage,
    type GenBuilderSetupMessage,
} from "@lib/genbuilder/types";
import {
    normalizeFunctionalZoneSources,
    validateGenBuilderBlocksFile,
} from "@lib/genbuilder/utils";
import MapStore from "@lib/MapStore";

const URBAN_API_URL = import.meta.env.VITE_URBAN_API;
const GENBUILDER_API_URL = import.meta.env.VITE_GENBUILDER_API;

interface UserChat {
    chat_id: string;
    title: string;
    scenario_id: number | null;
    project_id?: number | null;
    metadata?: Record<string, any> | null;
    created_at: string;
    updated_at: string;
}

interface TextPayload {
    text: string;
}

interface StatusPayload extends TextPayload {
    status: string;
}

interface ToolCallPayload {
    execution_mode: string;
    calls: {
        step: number;
        tool_name: string;
        arguments: any;
    }[];
}

type UserChatPartBase = {
    part_seq: number;
    mcp_source: string | null;
    created_at: string;
};

type TextPart = UserChatPartBase & {
    kind: "text";
    payload: TextPayload;
};

type StatusPart = UserChatPartBase & {
    kind: "status";
    payload: StatusPayload;
};

type ToolCallPart = UserChatPartBase & {
    kind: "tool_call";
    payload: ToolCallPayload;
};

type FilePart = UserChatPartBase & {
    kind: "file";
    payload: Record<string, any>;
};

type UserChatPart = TextPart | StatusPart | ToolCallPart | FilePart;

interface UserChatMessage {
    message_id: string;
    chat_id: string;
    seq: number;
    role: "user" | "assistant";
    parts: UserChatPart[];
}

type UserChatLayer = {
    name: string;
    layer: any;
};

type ChatCreatedStorageEvent = {
    storage_event_type: "chat_created";
    chat_id?: string;
    chat_title?: string;
};

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
};

function getLayerUri(layer: unknown) {
    const parsedLayer = parseFeatureCollection(layer);

    return isGeoJsonLayerUri(parsedLayer) ? parsedLayer : undefined;
}

const PROJECT_BOUNDARY_LAYER_NAME = "Граница территории";
const HISTORY_LAYER_FALLBACK_NAME = "Слой";
const GEOJSON_TYPES = new Set([
    "FeatureCollection",
    "Feature",
    "Point",
    "MultiPoint",
    "LineString",
    "MultiLineString",
    "Polygon",
    "MultiPolygon",
    "GeometryCollection",
]);

function normalizeBoundaryLayer(geometry: unknown): any | undefined {
    const parsedGeometry = parseJsonValue(geometry);
    if (!parsedGeometry || typeof parsedGeometry !== "object") return undefined;

    const normalizedGeometry = parsedGeometry as Record<string, any>;

    if (normalizedGeometry.type === "FeatureCollection") {
        return normalizedGeometry;
    }

    if (normalizedGeometry.type === "Feature") {
        return {
            type: "FeatureCollection",
            features: [normalizedGeometry],
        };
    }

    if (
        typeof normalizedGeometry.type === "string" &&
        GEOJSON_TYPES.has(normalizedGeometry.type)
    ) {
        return {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {},
                    geometry: normalizedGeometry,
                },
            ],
        };
    }

    const nestedGeometryCandidates = [
        normalizedGeometry.geometry,
        normalizedGeometry.feature_collection,
        normalizedGeometry.featureCollection,
        normalizedGeometry.result,
        normalizedGeometry.data,
        normalizedGeometry.content,
    ];

    for (const candidate of nestedGeometryCandidates) {
        const normalizedCandidate: any | undefined = normalizeBoundaryLayer(candidate);
        if (normalizedCandidate) return normalizedCandidate;
    }

    return undefined;
}

function hasBoundaryLayerContent(layer: unknown): boolean {
    const parsedLayer = parseJsonValue(layer);
    if (!parsedLayer || typeof parsedLayer !== "object" || Array.isArray(parsedLayer)) return false;

    const record = parsedLayer as Record<string, any>;

    if (record.type === "FeatureCollection") {
        return Array.isArray(record.features) && record.features.length > 0;
    }

    if (record.type === "Feature") {
        return !!record.geometry;
    }

    if (record.type === "GeometryCollection") {
        return Array.isArray(record.geometries) && record.geometries.length > 0;
    }

    return typeof record.type === "string" && GEOJSON_TYPES.has(record.type) && "coordinates" in record;
}

async function downloadGeoJsonLayer(uri: string) {
    const response = await fetch(uri, {
        redirect: "follow",
    });

    if (!response.ok) {
        throw new Error(`GeoJSON layer request failed with ${response.status}`);
    }

    const text = await response.text();
    const parsed = parseJsonValue(text);
    const layer = normalizeBoundaryLayer(parsed);

    if (!layer) {
        throw new Error("Downloaded file is not a valid GeoJSON layer");
    }

    return layer;
}

function parseJsonValue(value: unknown): unknown {
    if (typeof value !== "string") return value;

    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function asRecord(value: unknown): Record<string, any> | undefined {
    const parsed = parseJsonValue(value);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;

    return parsed as Record<string, any>;
}

function toNumber(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }

    return undefined;
}

function toString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isGeoJsonLayerUri(value: unknown) {
    const uri = toString(value);
    if (!uri) return false;

    try {
        const parsedUrl = new URL(uri);
        return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
    } catch {
        return false;
    }
}

function getTimestamp(value: unknown) {
    const timestamp = typeof value === "string" ? Date.parse(value) : NaN;

    return Number.isFinite(timestamp) ? timestamp : 0;
}

function getUserChatProjectId(chat: UserChat) {
    const metadata = chat.metadata ?? {};

    return toNumber(
        chat.project_id ??
        metadata.project_id ??
        metadata.projectId ??
        metadata.selected_context ??
        metadata.selectedContext,
    );
}

function getLayerName(value: unknown) {
    const record = asRecord(value);
    if (!record) return undefined;

    return (
        toString(record.name) ??
        toString(record.title) ??
        toString(record.layer_name) ??
        toString(record.layerName) ??
        toString(asRecord(record.content)?.name) ??
        toString(asRecord(record.result)?.name)
    );
}

function isGeoJsonLike(value: unknown) {
    const record = asRecord(value);

    return !!record && typeof record.type === "string" && GEOJSON_TYPES.has(record.type);
}

function normalizeHistoryLayer(value: unknown) {
    const parsed = parseJsonValue(value);
    if (!isGeoJsonLike(parsed)) return undefined;

    return normalizeBoundaryLayer(parsed);
}

function extractLayerFromUnknown(
    value: unknown,
    fallbackName = HISTORY_LAYER_FALLBACK_NAME,
    depth = 0,
): UserChatLayer | undefined {
    const parsed = parseJsonValue(value);
    const layer = normalizeHistoryLayer(parsed);
    if (layer) {
        return {
            name: getLayerName(parsed) ?? fallbackName,
            layer,
        };
    }

    if (depth >= 4) return undefined;

    if (Array.isArray(parsed)) {
        for (const item of parsed) {
            const foundLayer = extractLayerFromUnknown(item, fallbackName, depth + 1);
            if (foundLayer) return foundLayer;
        }

        return undefined;
    }

    const record = asRecord(parsed);
    if (!record) return undefined;

    const nextFallbackName = getLayerName(record) ?? fallbackName;
    const candidateKeys = [
        "feature_collection",
        "featureCollection",
        "geojson",
        "layer",
        "result",
        "data",
        "content",
        "output",
        "structuredContent",
        "text",
    ];

    for (const key of candidateKeys) {
        if (!(key in record)) continue;

        const foundLayer = extractLayerFromUnknown(record[key], nextFallbackName, depth + 1);
        if (foundLayer) return foundLayer;
    }

    return undefined;
}

function extractTextFromPayload(payload: unknown) {
    const parsed = parseJsonValue(payload);
    if (typeof parsed === "string") return parsed.trim() || undefined;

    const record = asRecord(parsed);
    if (!record) return undefined;

    return (
        toString(record.text) ??
        toString(record.message) ??
        toString(record.response) ??
        toString(asRecord(record.content)?.text) ??
        toString(asRecord(record.delta)?.text) ??
        toString(asRecord(record.result)?.text)
    );
}

function isGeoJsonFilePayload(content: Record<string, any>) {
    const mimeType = toString(content.mime_type ?? content.mimeType)?.toLowerCase();
    const filename = toString(content.filename)?.toLowerCase();
    const uri = toString(content.uri ?? content.url ?? content.download_url ?? content.downloadUrl)?.toLowerCase();

    return (
        !!mimeType?.includes("geo+json") ||
        !!mimeType?.includes("geojson") ||
        !!filename?.endsWith(".geojson") ||
        !!uri?.includes(".geojson")
    );
}

function extractGeoJsonFileLayer(
    payload: unknown,
    fallbackName = "GeoJSON layer",
): UserChatLayer | undefined {
    const parsed = parseJsonValue(payload);
    const record = asRecord(parsed);
    if (!record) return undefined;

    const content = asRecord(record.content) ?? record;
    if (!isGeoJsonFilePayload(content)) return undefined;

    const uri = (
        toString(content.uri) ??
        toString(content.url) ??
        toString(content.download_url) ??
        toString(content.downloadUrl)
    );

    if (!isGeoJsonLayerUri(uri)) return undefined;

    return {
        name: (
            toString(content.filename) ??
            toString(content.name) ??
            fallbackName
        ),
        layer: uri,
    };
}

function getVriFileLayer(payload: unknown, eventName?: string): UserChatLayer | undefined {
    const chunkKind = getStreamChunkKind(payload, eventName);
    if (chunkKind !== "file") return undefined;

    return extractGeoJsonFileLayer(payload);
}

function isVriResultFile(payload: unknown, eventName?: string) {
    const chunkKind = getStreamChunkKind(payload, eventName);
    if (chunkKind !== "file") return false;

    const record = asRecord(payload);
    const content = asRecord(record?.content) ?? record;
    if (!content) return false;

    const role = toString(content.role)?.toLowerCase();
    const name = toString(content.name)?.toLowerCase();
    const filename = toString(content.filename)?.toLowerCase();
    const uri = toString(content.uri ?? content.url ?? content.download_url ?? content.downloadUrl)?.toLowerCase();
    const event = eventName?.toLowerCase();
    const resultMarkers = [name, filename, uri].filter((value): value is string => !!value);

    return (
        role === "result" ||
        event === "result" ||
        resultMarkers.some((value) =>
            value === "classified_result" ||
            value.includes("classified_result") ||
            value.includes("/files/result/") ||
            value.includes("/outputs/") && value.includes("result")
        )
    );
}

function isStatusPart(part: UserChatMessage["parts"][number]) {
    const payload = asRecord(part.payload);

    return part.kind === "status" || typeof payload?.status === "string";
}

function isLayerPartCandidate(part: UserChatMessage["parts"][number]) {
    const payload = asRecord(part.payload);
    const kind = part.kind?.toLowerCase() ?? "";

    return (
        !!part.mcp_source ||
        kind.includes("tool") ||
        kind.includes("mcp") ||
        kind.includes("geo") ||
        kind.includes("feature") ||
        kind.includes("layer") ||
        Array.isArray(payload?.tool_calls) ||
        Array.isArray(payload?.toolCalls)
    );
}

function getToolCallIndexes(part: UserChatMessage["parts"][number]) {
    const payload = asRecord(part.payload);
    const toolCalls = Array.isArray(payload?.tool_calls)
        ? payload.tool_calls
        : Array.isArray(payload?.toolCalls)
            ? payload.toolCalls
            : undefined;

    if (!toolCalls?.length) return [1];

    return toolCalls.map((_, index) => index + 1);
}

function normalizeUserChatMessages(data: unknown): UserChatMessage[] {
    if (Array.isArray(data)) return data as UserChatMessage[];

    const record = asRecord(data);
    const messages = record?.items ?? record?.messages;

    return Array.isArray(messages) ? messages as UserChatMessage[] : [];
}

type StreamContext = {
    requestId: number;
    projectBoundaryLayer?: any;
    projectBoundaryPromise?: Promise<any>;
    hasReceivedMapLayer: boolean;
    hasAddedProjectBoundary: boolean;
};

type TextMessage = {
    type: "text";
    text: string;
};

type GeoJSONMessage = {
    type: "geojson";
    name: string;
    layer: any;
};

type ErrorMessage = {
    type: "error";
    text: string;
};

type WarningMessage = {
    type: "warning";
    text: string;
};

type InfoMessage = {
    type: "info";
    text: string;
};

type PzzTaskStatus = "queued" | "running" | "finished" | "failed" | "waiting_capacity";

type PzzSetupStatus = "loading" | "ready" | "submitting" | PzzTaskStatus | "error";
type PzzSetupMode = "scenario" | "files";
type PzzFilesSetupStep =
    "upload_pzz_zones" |
    "upload_pzz_descriptions" |
    "upload_cadastral" |
    "finished";

type PzzSetupMessage = {
    type: "pzz_setup";
    id: string;
    request: string;
    mode: PzzSetupMode;
    sources: FunctionalZoneSource[];
    status: PzzSetupStatus;
    submitted?: boolean;
    selectedYear?: number;
    selectedSource?: string;
    pzzZonesFileName?: string;
    pzzDescriptionsFileName?: string;
    cadastralFileName?: string;
    filesStep?: PzzFilesSetupStep;
    errorText?: string;
    taskExternalId?: string;
    resultLoaded?: boolean;
};

type PzzSetupFiles = {
    pzzZones?: File;
    pzzDescriptions?: File;
    cadastral?: File;
};

type GenBuilderSetupFiles = {
    blocks?: File;
};

type VriSetupStatus = "ready" | "submitting" | "running" | "finished" | "error";

type VriSetupStep =
    "upload_land_plots" |
    "ask_classifier" |
    "upload_classifier" |
    "ask_pzz_check" |
    "upload_pzz_zones" |
    "ask_pzz_zone_description" |
    "upload_pzz_zone_description" |
    "finished";

type VriSetupMessage = {
    type: "vri_setup";
    id: string;
    request: string;
    status: VriSetupStatus;
    step: VriSetupStep;
    submitted?: boolean;
    landPlotsFileName?: string;
    classifierFileName?: string;
    pzzZonesFileName?: string;
    pzzZoneDescriptionFileName?: string;
    wantsClassifier?: boolean;
    wantsPzzCheck?: boolean;
    wantsPzzZoneDescription?: boolean;
    errorText?: string;
};

type VriSetupFiles = {
    landPlots?: File;
    classifier?: File;
    pzzZones?: File;
    pzzZoneDescription?: File;
};

type SseStreamEvent = {
    eventName?: string;
    data: string;
};

type VriStreamState = {
    hasReceivedResult: boolean;
    hasReceivedReport: boolean;
    hasStreamError: boolean;
    reportMessageIndex?: number;
};

type GenBuilderStreamState = {
    hasReceivedResult: boolean;
    hasReceivedClarification: boolean;
    hasStreamError: boolean;
};

type AddGeoJsonLayerOptions = {
    requestId?: number;
    showError?: boolean;
    onLayerAdded?: () => void;
};

type ChatMessage = {
    type: "request" | "response";
    message: TextMessage | GeoJSONMessage | ErrorMessage | WarningMessage | InfoMessage | PzzSetupMessage | VriSetupMessage | GenBuilderSetupMessage | GenBuilderSavePromptMessage;
};

type ChatSession = {
    messages: ChatMessage[];
    selectedContext: string | number;
    selectedScenario: number | null;
};

type ChatTool = "Обеспеченность" | "Проверка объектов по ПЗЗ" | "Проверка ВРИ" | "Зоны ограничений" | "Сгенерировать застройку";

function isPzzSetupMessage(message: ChatMessage["message"]): message is PzzSetupMessage {
    return message.type === "pzz_setup";
}

function isVriSetupMessage(message: ChatMessage["message"]): message is VriSetupMessage {
    return message.type === "vri_setup";
}

function isGenBuilderSetupMessage(message: ChatMessage["message"]): message is GenBuilderSetupMessage {
    return message.type === "genbuilder_setup";
}

function isGenBuilderSavePromptMessage(
    message: ChatMessage["message"],
): message is GenBuilderSavePromptMessage {
    return message.type === "genbuilder_save_prompt";
}

function normalizePzzTaskStatus(value: unknown): PzzTaskStatus | undefined {
    return value === "queued" ||
        value === "running" ||
        value === "finished" ||
        value === "failed" ||
        value === "waiting_capacity"
        ? value
        : undefined;
}

const VRI_FORM_FIELDS = {
    landPlots: "cadastral_feature_collection_file",
    classifier: "vri_classifier_file",
    pzzZones: "pzz_zones_feature_collection_file",
    pzzZoneDescription: "pzz_zone_vri_labels_file",
} as const;

const PZZ_FILE_FORM_FIELDS = {
    pzzZones: "pzz_zones_feature_collection_file",
    pzzDescriptions: "pzz_descriptions_file",
    cadastral: "cadastral_feature_collection_file",
} as const;

const PZZ_AUTO_CHAT_STREAM_URL =
    "https://pzzcompare.idulab.ru/tasks/auto/chat/stream";

const VRI_RESULT_EVENT_NAMES = new Set([
    "result",
    "output",
    "finished",
    "finish",
    "complete",
    "completed",
    "done",
]);

const VRI_REPORT_CHUNK_KINDS = new Set([
    "report",
    "report_chunk",
    "chunk",
    "object_zone_fit",
]);

const VRI_STATUS_CHUNK_KINDS = new Set([
    "status",
    "warning",
]);

function parseSseEventBlock(eventBlock: string): SseStreamEvent | undefined {
    let eventName: string | undefined;
    const dataLines: string[] = [];

    eventBlock.split(/\r?\n/).forEach((rawLine) => {
        const line = rawLine.trimEnd();
        if (!line || line.startsWith(":")) return;

        if (line.startsWith("event:")) {
            eventName = line.slice(6).trim() || undefined;
            return;
        }

        if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
        }
    });

    if (!dataLines.length) return undefined;

    return {
        eventName,
        data: dataLines.join("\n"),
    };
}

async function readSseStream(
    stream: ReadableStream<Uint8Array>,
    handleEvent: (event: SseStreamEvent) => void,
) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";

        events.forEach((eventBlock) => {
            const event = parseSseEventBlock(eventBlock);
            if (event) handleEvent(event);
        });
    }

    buffer += decoder.decode();

    if (!buffer.trim()) return;

    const event = parseSseEventBlock(buffer);
    if (event) handleEvent(event);
}

function getStreamChunkKind(payload: unknown, eventName?: string) {
    const record = asRecord(payload);
    const content = asRecord(record?.content);
    const data = asRecord(record?.data);
    const candidates = [
        record?.type,
        record?.chunk_type,
        record?.chunkType,
        content?.type,
        data?.type,
        eventName,
    ];

    for (const candidate of candidates) {
        const chunkKind = toString(candidate)?.toLowerCase();
        if (chunkKind && chunkKind !== "message") return chunkKind;
    }

    return undefined;
}

function getVriErrorText(payload: unknown) {
    const parsed = parseJsonValue(payload);
    if (typeof parsed === "string") return parsed.trim() || undefined;

    const record = asRecord(parsed);
    const content = asRecord(record?.content);
    if (!record) return undefined;

    return (
        toString(record.error_text) ??
        toString(record.errorText) ??
        toString(record.error) ??
        toString(record.detail) ??
        toString(record.message) ??
        toString(record.traceback) ??
        toString(content?.error_text) ??
        toString(content?.errorText) ??
        toString(content?.error) ??
        toString(content?.traceback)
    );
}

function getVriReportText(payload: unknown, eventName?: string) {
    const chunkKind = getStreamChunkKind(payload, eventName);
    if (!chunkKind || !VRI_REPORT_CHUNK_KINDS.has(chunkKind)) return undefined;

    const parsed = parseJsonValue(payload);
    if (typeof parsed === "string") return parsed;

    const record = asRecord(parsed);
    if (!record) return undefined;

    const content = asRecord(record.content);
    const data = asRecord(record.data);
    const delta = asRecord(record.delta);
    const textCandidates = [
        record.chat_message,
        record.chatMessage,
        record.text,
        record.report,
        record.message,
        record.delta,
        content?.chat_message,
        content?.chatMessage,
        content?.text,
        content?.report,
        content?.message,
        content?.delta,
        data?.chat_message,
        data?.chatMessage,
        data?.text,
        data?.report,
        data?.message,
        delta?.text,
    ];

    for (const candidate of textCandidates) {
        if (typeof candidate === "string") return candidate;

        const text = extractTextFromPayload(candidate);
        if (text) return text;
    }

    if (chunkKind === "chunk") return undefined;

    const fallbackPayload = content ?? data ?? record.report ?? record.content ?? record.data;
    const serializedReport = fallbackPayload === undefined
        ? undefined
        : JSON.stringify(fallbackPayload, null, 2);

    return serializedReport ? `\`\`\`json\n${serializedReport}\n\`\`\`` : undefined;
}

function getVriResultPayload(payload: unknown, eventName?: string) {
    const chunkKind = getStreamChunkKind(payload, eventName);
    if (
        (chunkKind && VRI_REPORT_CHUNK_KINDS.has(chunkKind)) ||
        (chunkKind && VRI_STATUS_CHUNK_KINDS.has(chunkKind)) ||
        chunkKind === "file"
    ) return undefined;

    const parsed = parseJsonValue(payload);
    const record = asRecord(parsed);
    const isResultEvent = !!eventName && VRI_RESULT_EVENT_NAMES.has(eventName.toLowerCase());

    if (extractLayerFromUnknown(parsed, "Результат проверки ВРИ")) return parsed;

    if (!record) {
        return isResultEvent ? parsed : undefined;
    }

    if (
        chunkKind === "result" ||
        chunkKind === "output" ||
        chunkKind === "feature_collection" ||
        chunkKind === "geojson"
    ) {
        return parsed;
    }

    const candidateKeys = ["result", "data", "output", "content"];

    for (const key of candidateKeys) {
        if (!(key in record)) continue;

        const candidate = record[key];
        if (extractLayerFromUnknown(candidate, "Результат проверки ВРИ")) return candidate;
        if (key === "result" && extractTextFromPayload(candidate)) return candidate;
    }

    if (isResultEvent) {
        return record.result ?? record.data ?? record.output ?? record.content ?? parsed;
    }

    return undefined;
}

function getVriStatusText(payload: unknown, eventName?: string) {
    const chunkKind = getStreamChunkKind(payload, eventName);
    if (!chunkKind || !VRI_STATUS_CHUNK_KINDS.has(chunkKind)) return undefined;

    return extractTextFromPayload(payload) ?? "Проверка ВРИ выполняется";
}

function getVriWarningText(payload: unknown, eventName?: string) {
    const chunkKind = getStreamChunkKind(payload, eventName);
    const parsed = parseJsonValue(payload);
    const record = asRecord(parsed);
    const content = asRecord(record?.content);
    const data = asRecord(record?.data);
    const isWarningStatus = [
        chunkKind,
        record?.status,
        record?.level,
        record?.severity,
        content?.status,
        content?.level,
        content?.severity,
        data?.status,
        data?.level,
        data?.severity,
    ].some((candidate) => toString(candidate)?.toLowerCase() === "warning");

    if (!isWarningStatus) return undefined;

    return (
        toString(record?.chat_message) ??
        toString(record?.chatMessage) ??
        toString(content?.chat_message) ??
        toString(content?.chatMessage) ??
        toString(content?.message) ??
        toString(data?.chat_message) ??
        toString(data?.chatMessage) ??
        toString(data?.message) ??
        toString(record?.message) ??
        toString(content?.detail) ??
        toString(data?.detail) ??
        toString(record?.detail) ??
        extractTextFromPayload(parsed) ??
        "Проверка ВРИ вернула предупреждение."
    );
}

class ChatDataStore {
    selectedContext: string | number = "nonproject";
    selectedScenario: number | null = null;
    selectedChatTool: ChatTool | null = null;
    selectedPzzZoneSource?: FunctionalZoneSource;
    parsedContext: string | null = null;

    streamedResponse: string = "";
    isStreaming: boolean = false;
    chatMessages: ChatMessage[] = [];
    currentStatus?: string;
    activeChatId?: string | number;
    currentStreamRequestId: number = 0;
    currentPzzSetupId: number = 0;
    currentVriSetupId: number = 0;
    currentGenBuilderSetupId: number = 0;
    currentGenBuilderSavePromptId: number = 0;
    currentStreamContext?: StreamContext;
    userChats: UserChat[] = [];
    isUserChatsLoading = false;
    isUserChatOpening = false;
    private pzzSetupFiles: Map<string, PzzSetupFiles> = new Map();
    private vriSetupFiles: Map<string, VriSetupFiles> = new Map();
    private genBuilderSetupFiles: Map<string, GenBuilderSetupFiles> = new Map();
    private genBuilderResults: Map<string, unknown> = new Map();

    chatMap: Map<number, ChatSession> = new Map();

    abortController?: AbortController;

    get chatStoryPreview() {
        const projectNameById = new Map(
            (DataStore.userProjects ?? []).map((project) => [project.id, project.name])
        );
        const scenarioProjectIdByScenarioId = new Map<number, number>();

        DataStore.projectScenarios.forEach((scenarios, projectId) => {
            if (!Array.isArray(scenarios)) return;

            scenarios.forEach((scenario: any) => {
                const scenarioId = toNumber(scenario?.id ?? scenario?.scenario_id);

                if (scenarioId !== undefined) {
                    scenarioProjectIdByScenarioId.set(scenarioId, projectId);
                }
            });
        });

        const groups = new Map<string, {
            id: string;
            projectId: number | null;
            name: string;
            chats: { id: string; name: string }[];
        }>();
        const sortedChats = this.userChats
            .slice()
            .sort(
                (left, right) =>
                    getTimestamp(right.updated_at ?? right.created_at) -
                    getTimestamp(left.updated_at ?? left.created_at)
            );

        sortedChats.forEach((chat, index) => {
            const projectId = getUserChatProjectId(chat) ??
                (chat.scenario_id ? scenarioProjectIdByScenarioId.get(chat.scenario_id) : undefined);
            const groupId = projectId === undefined ? "nonproject" : `project-${projectId}`;
            const groupName = projectId === undefined
                ? "Вне проекта"
                : projectNameById.get(projectId) ?? `Проект #${projectId}`;

            if (!groups.has(groupId)) {
                groups.set(groupId, {
                    id: groupId,
                    projectId: projectId ?? null,
                    name: groupName,
                    chats: [],
                });
            }

            groups.get(groupId)?.chats.push({
                id: chat.chat_id,
                name: chat.title?.trim() || `Чат ${this.userChats.length - index}`,
            });
        });

        return Array.from(groups.values());
    }

    setSelectedContext(value: string | number) {
        this.selectedContext = value;
        this.selectedPzzZoneSource = undefined;
        this.pzzSetupFiles.clear();
        this.vriSetupFiles.clear();
        this.genBuilderSetupFiles.clear();
    }

    setSelectedScenario(scenarioId: number | null) {
        this.selectedScenario = scenarioId;
        this.selectedPzzZoneSource = undefined;
        this.pzzSetupFiles.clear();
        this.vriSetupFiles.clear();
        this.genBuilderSetupFiles.clear();
    }

    private removeIncompleteToolSetup(tool: ChatTool | null) {
        const removedPzzSetupIds: string[] = [];
        const removedVriSetupIds: string[] = [];
        const removedGenBuilderSetupIds: string[] = [];

        this.chatMessages = this.chatMessages.filter((chatMessage) => {
            if (chatMessage.type !== "response") return true;

            if (
                tool === "Проверка объектов по ПЗЗ"
                && isPzzSetupMessage(chatMessage.message)
            ) {
                const setup = chatMessage.message;
                const shouldRemove = !setup.submitted
                    && (
                        setup.status === "loading"
                        || setup.status === "ready"
                        || setup.status === "error"
                    );

                if (shouldRemove) {
                    removedPzzSetupIds.push(setup.id);
                }

                return !shouldRemove;
            }

            if (
                tool === "Проверка ВРИ"
                && isVriSetupMessage(chatMessage.message)
            ) {
                const shouldRemove = !chatMessage.message.submitted
                    && (
                        chatMessage.message.status === "ready"
                        || chatMessage.message.status === "error"
                    );

                if (shouldRemove) {
                    removedVriSetupIds.push(chatMessage.message.id);
                }

                return !shouldRemove;
            }

            if (
                tool === "Сгенерировать застройку"
                && isGenBuilderSetupMessage(chatMessage.message)
            ) {
                const setup = chatMessage.message;
                const shouldRemove = !setup.backendChatId
                    && (
                        setup.status === "loading" ||
                        setup.status === "validating_file" ||
                        setup.status === "ready" ||
                        setup.status === "awaiting_parameters"
                    );

                if (shouldRemove) {
                    removedGenBuilderSetupIds.push(setup.id);
                }

                return !shouldRemove;
            }

            return true;
        });

        removedPzzSetupIds.forEach((setupId) => {
            this.pzzSetupFiles.delete(setupId);
        });
        removedVriSetupIds.forEach((setupId) => {
            this.vriSetupFiles.delete(setupId);
        });
        removedGenBuilderSetupIds.forEach((setupId) => {
            this.genBuilderSetupFiles.delete(setupId);
        });
    }

    setSelectedChatTool(tool: ChatTool | null) {
        const previousTool = this.selectedChatTool;

        if (previousTool !== tool) {
            this.removeIncompleteToolSetup(previousTool);
        }

        this.selectedChatTool = tool;
        if (tool !== "Проверка объектов по ПЗЗ") {
            this.selectedPzzZoneSource = undefined;
            this.pzzSetupFiles.clear();
        }
        if (tool !== "Проверка ВРИ") {
            this.vriSetupFiles.clear();
        }
        if (tool !== "Сгенерировать застройку") {
            this.genBuilderSetupFiles.clear();
        }

        if (
            tool === "Проверка объектов по ПЗЗ"
            && !this.hasActivePzzSetup()
        ) {
            this.startPzzCheckSetup("Проверка объектов по ПЗЗ");
        }

        if (
            tool === "Проверка ВРИ"
            && !this.hasActiveVriSetup()
        ) {
            this.startVriCheckSetup("Проверка ВРИ");
        }

        if (
            tool === "Сгенерировать застройку"
            && !this.hasActiveGenBuilderSetup()
        ) {
            this.startGenBuilderSetup();
        }
    }

    clearChat() {
        this.abortStream();
        this.currentStreamRequestId += 1;
        this.currentStreamContext = undefined;
        this.chatMessages = [];
        this.isStreaming = false;
        this.selectedContext = "nonproject";
        this.selectedScenario = null;
        this.streamedResponse = "";
        this.currentStatus = undefined;
        this.activeChatId = undefined;
        this.selectedChatTool = null;
        this.selectedPzzZoneSource = undefined;
        this.pzzSetupFiles.clear();
        this.vriSetupFiles.clear();
        this.genBuilderSetupFiles.clear();
        this.genBuilderResults.clear();
        this.parsedContext = null;

        MapStore.clearMapLayers();
    }

    abortStream() {
        this.abortController?.abort();
    }

    private resetStreamingState = action(() => {
        this.abortController = undefined;
        this.isStreaming = false;
        this.currentStatus = undefined;
    })

    private finalizeStreamingState = action(() => {
        this.resetStreamingState();
        void this.getUserChats();
    })

    private commitStreamedResponse = action(() => {
        const text = this.streamedResponse.trim();
        if (!text) return;

        this.chatMessages.push({
            type: "response",
            message: {
                type: "text",
                text,
            },
        });
        this.streamedResponse = "";
    });

    private upsertCreatedUserChat = action((event: ChatCreatedStorageEvent) => {
        if (!event.chat_id) return;

        const now = new Date().toISOString();
        const title = event.chat_title?.trim() || "Новый чат";
        const existingChatIndex = this.userChats.findIndex(
            (chat) => chat.chat_id === event.chat_id,
        );
        const userChat: UserChat = {
            chat_id: event.chat_id,
            title,
            scenario_id: this.selectedScenario,
            metadata: {
                selectedContext: this.selectedContext,
            },
            created_at: now,
            updated_at: now,
        };

        this.activeChatId = event.chat_id;

        if (existingChatIndex >= 0) {
            this.userChats[existingChatIndex] = {
                ...this.userChats[existingChatIndex],
                ...userChat,
            };
            return;
        }

        this.userChats.unshift(userChat);
    });

    private handleServiceEvent(parsed: any) {
        const event = parsed?.content?.event;

        if (
            parsed?.type === "service_event" &&
            parsed?.content?.event_type === "storage_event" &&
            event?.storage_event_type === "chat_created"
        ) {
            this.upsertCreatedUserChat(event);
            return true;
        }

        return false;
    }

    private getActiveBackendChatId() {
        return typeof this.activeChatId === "string" ? this.activeChatId : undefined;
    }

    private withActiveChatIdParams<T extends Record<string, unknown>>(params: T) {
        const chatId = this.getActiveBackendChatId();

        return chatId ? { ...params, chat_id: chatId } : params;
    }

    private appendGeoJsonLayerLoadError(layerName: string) {
        this.chatMessages.push({
            type: "response",
            message: {
                type: "error",
                text: `Не удалось загрузить GeoJSON-слой "${layerName || "Без названия"}" по ссылке.`,
            },
        });
    }

    private addGeoJsonLayerToMap(
        layer: UserChatLayer,
        options: AddGeoJsonLayerOptions = {},
    ) {
        const requestId = options.requestId ?? this.currentStreamRequestId;
        const parsedLayer = parseFeatureCollection(layer.layer);

        if (!parsedLayer) {
            if (options.showError) {
                this.appendGeoJsonLayerLoadError(layer.name);
            }
            return;
        }

        const layerUri = getLayerUri(parsedLayer);
        if (!layerUri) {
            MapStore.addLayerToMap({
                name: layer.name,
                layer: parsedLayer,
            });
            options.onLayerAdded?.();
            return;
        }

        void downloadGeoJsonLayer(layerUri)
            .then(action((downloadedLayer) => {
                if (requestId !== this.currentStreamRequestId) return;

                MapStore.addLayerToMap({
                    name: layer.name,
                    layer: downloadedLayer,
                });
                options.onLayerAdded?.();
            }))
            .catch(action((error) => {
                if (requestId !== this.currentStreamRequestId) return;

                console.error("Error downloading GeoJSON layer:", error);

                if (options.showError) {
                    this.appendGeoJsonLayerLoadError(layer.name);
                }
            }));
    }

    addGeoJsonLayerMessageToMap(name: string, layer: unknown) {
        this.addGeoJsonLayerToMap(
            { name, layer },
            { showError: true },
        );
    }

    private appendStreamChunk = action((payload: string, eventName?: string) => {
        const trimmedPayload = payload.trim();
        if (!trimmedPayload || trimmedPayload === "[DONE]") return;

        try {
            const parsed = JSON.parse(trimmedPayload);
            if (this.handleServiceEvent(parsed)) return;

            const chunkKind = getStreamChunkKind(parsed, eventName);

            if (chunkKind === "status") {
                this.currentStatus = parsed.content?.text
                return;
            };

            if (chunkKind === "file") {
                const layer = extractGeoJsonFileLayer(parsed, "Результат проверки ПЗЗ");

                if (!layer) return;

                this.chatMessages.push({
                    type: "response",
                    message: {
                        type: "geojson",
                        name: layer.name,
                        layer: layer.layer,
                    },
                });

                this.addGeoJsonLayerToMap(layer, {
                    showError: true,
                    onLayerAdded: () => {
                        this.currentStreamContext = this.markStreamContextHasMapLayer(this.currentStreamContext);
                        this.tryAddProjectBoundaryLayer(this.currentStreamContext);
                    },
                });

                return;
            }

            if (chunkKind === "feature_collection") {
                const layer = {
                    name: parsed.content?.name ?? "",
                    layer: parsed.content?.feature_collection,
                };

                this.chatMessages.push({
                    type: "response",
                    message: {
                        type: "geojson",
                        name: layer.name,
                        layer: layer.layer,
                    },
                });

                this.addGeoJsonLayerToMap(layer, {
                    showError: true,
                    onLayerAdded: () => {
                        this.currentStreamContext = this.markStreamContextHasMapLayer(this.currentStreamContext);
                        this.tryAddProjectBoundaryLayer(this.currentStreamContext);
                    },
                });

                return;
            }

            if (chunkKind === "error") {
                this.chatMessages.push({
                    type: "response",
                    message: {
                        type: "error",
                        text: parsed.content?.traceback ?? "Error"
                    }
                });
            }

            const text =
                parsed?.content?.text ??
                // parsed?.text ??
                // parsed?.delta ??
                // parsed?.message ??
                // parsed?.response ??
                "";
            const done = parsed?.content?.done ?? parsed?.done ?? false;

            if (typeof text === "string" && text) {
                this.streamedResponse += text;
            }

            if (done) {
                this.isStreaming = false;
                this.commitStreamedResponse();
            }
            return;
        } catch {
            this.streamedResponse += trimmedPayload;
            return;
        }
    });

    private getNextChatId() {
        if (!this.chatMap.size) return 0;

        return Math.max(...Array.from(this.chatMap.keys())) + 1;
    }

    private markStreamContextHasMapLayer(streamContext?: StreamContext) {
        if (!streamContext) return undefined;

        streamContext.hasReceivedMapLayer = true;
        return streamContext;
    }

    private tryAddProjectBoundaryLayer(streamContext?: StreamContext) {
        if (
            !streamContext ||
            streamContext.requestId !== this.currentStreamRequestId ||
            streamContext.hasAddedProjectBoundary ||
            !streamContext.projectBoundaryLayer ||
            !hasBoundaryLayerContent(streamContext.projectBoundaryLayer)
        ) {
            return;
        }

        MapStore.addLayerToMap({
            name: PROJECT_BOUNDARY_LAYER_NAME,
            layer: streamContext.projectBoundaryLayer,
        });
        streamContext.hasAddedProjectBoundary = true;
    }

    private createProjectBoundaryStreamContext(projectId: number) {
        const streamContext: StreamContext = {
            requestId: this.currentStreamRequestId,
            hasReceivedMapLayer: false,
            hasAddedProjectBoundary: false,
        };

        streamContext.projectBoundaryPromise = DataStore.getProjectTerritory(projectId)
            .then((geometry) => {
                streamContext.projectBoundaryLayer = normalizeBoundaryLayer(geometry);
                this.tryAddProjectBoundaryLayer(streamContext);
                return streamContext.projectBoundaryLayer;
            });

        return streamContext;
    }

    private restoreProjectBoundary(
        projectId: number,
        hasResponseLayers: boolean,
        requestId = this.currentStreamRequestId,
    ) {
        if (!hasResponseLayers) return;

        void DataStore.getProjectTerritory(projectId)
            .then((geometry) => {
                if (requestId !== this.currentStreamRequestId) return;

                const boundaryLayer = normalizeBoundaryLayer(geometry);
                if (!boundaryLayer || !hasBoundaryLayerContent(boundaryLayer)) return;

                MapStore.addLayerToMap({
                    name: PROJECT_BOUNDARY_LAYER_NAME,
                    layer: boundaryLayer,
                });
            });
    }

    private restoreMapLayersFromMessages(messages: ChatMessage[]) {
        const lastRequestIndex = messages.findLastIndex(message => message.type === "request");
        const lastResponseLayers = messages.flatMap((message, ind) =>
            ind > lastRequestIndex && message.type === "response" && message.message?.type === "geojson" ?
                {
                    name: message.message?.name,
                    layer: parseFeatureCollection(message.message.layer),
                } : []
        );

        MapStore.clearMapLayers();
        lastResponseLayers.forEach((layer) => {
            this.addGeoJsonLayerToMap(layer);
        });

        if (typeof this.selectedContext === "number") {
            this.restoreProjectBoundary(this.selectedContext, lastResponseLayers.length > 0);
        }
    }

    private getChatStory() {
        const chatStory = undefined;
        // const chatStory = localStorage.getItem("chatStory");

        if (!chatStory) return;

        try {
            const parsed = JSON.parse(chatStory);
            if (!Array.isArray(parsed)) return;

            this.chatMap = new Map(
                parsed.map(([id, session]) => {
                    if (Array.isArray(session)) {
                        return [id, {
                            messages: session,
                            selectedContext: "nonproject",
                            selectedScenario: null,
                        }];
                    }

                    return [id, session];
                })
            );
        } catch (error) {
            console.error("Failed to restore chat history:", error);
        }
    };

    addChat() {
        const chatId = this.getNextChatId();

        this.activeChatId = chatId;

        return chatId;
    }

    getChat(id: number) {
        return this.chatMap.get(id);
    };

    deleteChat(id: string) {
        // this.chatMap.delete(id);

        // if (id === this.activeChatId) this.clearChat();

        this.userChats = this.userChats.filter(chat => chat.chat_id !== id);

        if (id === this.activeChatId) {
            this.clearChat();
        }

        return axios.delete(
            `${import.meta.env.VITE_LLM_CHAT_HISTORY_API}/chat_history/${id}`,
            {
                headers: {
                    Authorization: `Bearer ${AuthStore.accessToken}`,
                },
            }
        )
        .then(action(() => {
            this.userChats = this.userChats.filter(chat => chat.chat_id !== id);
        }))
        .catch(error => {
            console.error("Error deleting chat:", error);
        });
    }

    loadChat(id: number) {
        const chat = this.getChat(id);
        if (!chat) return;

        this.abortStream();
        this.currentStreamRequestId += 1;
        this.currentStreamContext = undefined;
        this.streamedResponse = "";
        this.isStreaming = false;
        this.currentStatus = undefined;
        this.activeChatId = id;
        this.chatMessages = [...chat.messages];
        this.selectedContext = chat.selectedContext;
        this.selectedScenario = chat.selectedScenario ?? null;
        this.selectedChatTool = null;
        this.pzzSetupFiles.clear();
        this.vriSetupFiles.clear();
        this.genBuilderSetupFiles.clear();
        this.genBuilderResults.clear();

        const lastRequestIndex = chat.messages.findLastIndex(message => message.type === "request");
        const lastResponseLayers = chat.messages.flatMap((message, ind) =>
            ind > lastRequestIndex && message.type === "response" && message.message?.type === "geojson" ?
                {
                    name: message.message?.name,
                    layer: parseFeatureCollection(message.message.layer),
                } : []
        );

        MapStore.clearMapLayers();
        lastResponseLayers.forEach((layer) => {
            this.addGeoJsonLayerToMap(layer);
        });

        if (typeof chat.selectedContext === "number") {
            this.restoreProjectBoundary(chat.selectedContext, lastResponseLayers.length > 0);
        }
    };

    sendDocumentMessage(message: string, scenarionId?: number) {
        return axios.get(
            `${import.meta.env.VITE_LLM_RESTRICTIONS_API}/documents/qa/stream`,
                {
                    headers: {
                        Accept: "text/event-stream",
                        Authorization: `Bearer ${AuthStore.accessToken}`,
                    },
                    params: this.withActiveChatIdParams({
                        request: message,
                        scenario_id: scenarionId ?? undefined,
                    }),
                    responseType: "stream",
                    adapter: "fetch",
                    signal: this.abortController?.signal,
                }
            )
            .then(
                async (response) => {
                    const stream = response.data;
                    const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
                    let buffer = "";

                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        if (!value) continue;

                        buffer += value;
                        const events = buffer.split("\n\n");
                        buffer = events.pop() ?? "";

                        for (const event of events) {
                            const dataLines = event
                                .split("\n")
                                .filter((line) => line.startsWith("data:"))
                                .map((line) => line.slice(5).trimStart());

                            if (!dataLines.length) continue;
                            this.appendStreamChunk(dataLines.join("\n"));
                        }
                    }

                    if (buffer.trim()) {
                        const dataLines = buffer
                            .split("\n")
                            .filter((line) => line.startsWith("data:"))
                            .map((line) => line.slice(5).trimStart());

                        if (dataLines.length) {
                            this.appendStreamChunk(dataLines.join("\n"));
                        }
                    }

                    this.commitStreamedResponse();
                }
            )
            .catch((error) => {
                if (axios.isCancel(error) || error?.name === "AbortError" || error?.name === "CanceledError") {
                    this.commitStreamedResponse();
                    return;
                }
                console.error("Error streaming chat message:", error);
            })
            .finally(this.finalizeStreamingState);
    }

    sendRestrictionsContextMessage(message: string) {
        return axios.get(
            `${import.meta.env.VITE_LLM_RESTRICTIONS_API}/restrictions/generate_restrictions/stream`,
                {
                    headers: {
                        Accept: "text/event-stream",
                        Authorization: `Bearer ${AuthStore.accessToken}`,
                    },
                    responseType: "stream",
                    adapter: "fetch",
                    signal: this.abortController?.signal,
                    params: this.withActiveChatIdParams({
                        scenario_id: this.selectedScenario,
                        request: message,
                    })
                }
            )
            .then(
                async (response) => {
                    const stream = response.data;
                    const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
                    let buffer = "";

                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        if (!value) continue;

                        buffer += value;
                        const events = buffer.split("\n\n");
                        buffer = events.pop() ?? "";

                        for (const event of events) {
                            const dataLines = event
                                .split("\n")
                                .filter((line) => line.startsWith("data:"))
                                .map((line) => line.slice(5).trimStart());

                            if (!dataLines.length) continue;
                            this.appendStreamChunk(dataLines.join("\n"));
                        }
                    }

                    if (buffer.trim()) {
                        const dataLines = buffer
                            .split("\n")
                            .filter((line) => line.startsWith("data:"))
                            .map((line) => line.slice(5).trimStart());

                        if (dataLines.length) {
                            this.appendStreamChunk(dataLines.join("\n"));
                        }
                    }

                    this.commitStreamedResponse();
                }
            ).catch((error) => {
                if (axios.isCancel(error) || error?.name === "AbortError" || error?.name === "CanceledError") {
                    this.commitStreamedResponse();
                    return;
                }
                console.error("Error streaming chat message:", error);
            }).finally(this.finalizeStreamingState);
    }

    sendProvisionContextMessage(message: string) {
        return axios.get(
            `${import.meta.env.VITE_LLM_RESTRICTIONS_API}/provision/calculate_effects/stream`,
                {
                    headers: {
                        Accept: "text/event-stream",
                        Authorization: `Bearer ${AuthStore.accessToken}`,
                    },
                    responseType: "stream",
                    adapter: "fetch",
                    signal: this.abortController?.signal,
                    params: this.withActiveChatIdParams({
                        scenario_id: this.selectedScenario,
                        request: message,
                    })
                }
            )
            .then(
                async (response) => {
                    const stream = response.data;
                    const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
                    let buffer = "";

                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        if (!value) continue;

                        buffer += value;
                        const events = buffer.split("\n\n");
                        buffer = events.pop() ?? "";

                        for (const event of events) {
                            const dataLines = event
                                .split("\n")
                                .filter((line) => line.startsWith("data:"))
                                .map((line) => line.slice(5).trimStart());

                            if (!dataLines.length) continue;
                            this.appendStreamChunk(dataLines.join("\n"));
                        }
                    }

                    if (buffer.trim()) {
                        const dataLines = buffer
                            .split("\n")
                            .filter((line) => line.startsWith("data:"))
                            .map((line) => line.slice(5).trimStart());

                        if (dataLines.length) {
                            this.appendStreamChunk(dataLines.join("\n"));
                        }
                    }

                    this.commitStreamedResponse();
                }
            ).catch((error) => {
                if (axios.isCancel(error) || error?.name === "AbortError" || error?.name === "CanceledError") {
                    this.commitStreamedResponse();
                    return;
                }
                console.error("Error streaming chat message:", error);
            }).finally(this.finalizeStreamingState);
    }

    private getNextPzzSetupId() {
        return `pzz-setup-${this.currentPzzSetupId++}`;
    }

    private getGenBuilderSetupMessage(setupId: string) {
        const chatMessage = this.chatMessages.find(
            (message) => message.type === "response" &&
                isGenBuilderSetupMessage(message.message) &&
                message.message.id === setupId
        );

        return chatMessage && isGenBuilderSetupMessage(chatMessage.message)
            ? chatMessage.message
            : undefined;
    }

    private getActiveGenBuilderSetupMessage() {
        for (let index = this.chatMessages.length - 1; index >= 0; index -= 1) {
            const chatMessage = this.chatMessages[index];

            if (
                chatMessage.type === "response" &&
                isGenBuilderSetupMessage(chatMessage.message) &&
                chatMessage.message.status !== "finished" &&
                chatMessage.message.status !== "error"
            ) {
                return chatMessage.message;
            }
        }

        return undefined;
    }

    private hasActiveGenBuilderSetup() {
        return !!this.getActiveGenBuilderSetupMessage();
    }

    private getGenBuilderSavePromptMessage(promptId: string) {
        const chatMessage = this.chatMessages.find(
            (message) => message.type === "response" &&
                isGenBuilderSavePromptMessage(message.message) &&
                message.message.id === promptId,
        );

        return chatMessage && isGenBuilderSavePromptMessage(chatMessage.message)
            ? chatMessage.message
            : undefined;
    }

    requestGenBuilderParameters(setupId: string, year: number, source: string) {
        const setupMessage = this.getGenBuilderSetupMessage(setupId);
        const hasSelectedSource = setupMessage?.sources.some(
            (zoneSource) => zoneSource.year === year && zoneSource.source === source,
        );

        if (!setupMessage || setupMessage.status !== "ready" || !hasSelectedSource) {
            return;
        }

        setupMessage.selectedYear = year;
        setupMessage.selectedSource = source;
        setupMessage.status = "awaiting_parameters";
        setupMessage.errorText = undefined;

        this.chatMessages.push({
            type: "response",
            message: {
                type: "info",
                text: "Введите количество жителей в проекте или жилую площадь, а также, при необходимости, среднюю этажность и плотность застройки.",
            },
        });
    }

    submitGenBuilderBlocksFile = async (setupId: string, file: File) => {
        const setupMessage = this.getGenBuilderSetupMessage(setupId);
        if (
            !setupMessage ||
            setupMessage.mode !== "files" ||
            (setupMessage.status !== "ready" && setupMessage.status !== "awaiting_parameters")
        ) return;

        const files = this.genBuilderSetupFiles.get(setupId) ?? {};
        this.genBuilderSetupFiles.set(setupId, files);
        const hasExistingFile = !!files.blocks;

        setupMessage.status = "validating_file";
        setupMessage.errorText = undefined;

        const validationError = await validateGenBuilderBlocksFile(file);

        runInAction(() => {
            const currentSetupMessage = this.getGenBuilderSetupMessage(setupId);
            if (!currentSetupMessage || currentSetupMessage.mode !== "files") {
                return;
            }

            if (validationError) {
                currentSetupMessage.status = hasExistingFile ? "awaiting_parameters" : "ready";
                currentSetupMessage.errorText = validationError;
                return;
            }

            files.blocks = file;
            currentSetupMessage.blocksFileName = file.name;
            currentSetupMessage.status = "awaiting_parameters";
            currentSetupMessage.errorText = undefined;
        });
    };

    private startGenBuilderSetup() {
        const scenarioId = this.selectedScenario;
        const projectId = typeof this.selectedContext === "number"
            ? this.selectedContext
            : undefined;

        const setupId = `genbuilder-setup-${this.currentGenBuilderSetupId++}`;

        if (projectId === undefined) {
            this.genBuilderSetupFiles.set(setupId, {});
            this.chatMessages.push({
                type: "response",
                message: {
                    type: "genbuilder_setup",
                    id: setupId,
                    mode: "files",
                    sources: [],
                    status: "ready",
                },
            });
            this.chatMessages.push({
                type: "response",
                message: {
                    type: "info",
                    text: "Введите количество жителей в проекте или жилую площадь, а также, при необходимости, среднюю этажность и плотность застройки.",
                },
            });
            return;
        }

        if (scenarioId === null) {
            this.chatMessages.push({
                type: "response",
                message: {
                    type: "error",
                    text: "Для генерации застройки выберите проект и сценарий.",
                },
            });
            return;
        }

        this.chatMessages.push({
            type: "response",
            message: {
                type: "genbuilder_setup",
                id: setupId,
                mode: "scenario",
                projectId,
                scenarioId,
                sources: [],
                status: "loading",
            },
        });

        void DataStore.getScenarioZoneSources(scenarioId)
            .then(action((data) => {
                const setupMessage = this.getGenBuilderSetupMessage(setupId);
                if (!setupMessage) {
                    return;
                }

                const sources = normalizeFunctionalZoneSources(data);

                setupMessage.sources = sources;
                setupMessage.status = sources.length ? "ready" : "error";
                setupMessage.selectedYear = sources[0]?.year;
                setupMessage.selectedSource = sources[0]?.source;
                setupMessage.errorText = sources.length
                    ? undefined
                    : "Для выбранного сценария не найдены источники функциональных зон.";
            }));
    }

    private handleGenBuilderStreamEvent(
        setupMessage: GenBuilderSetupMessage,
        streamEvent: GenBuilderStreamEvent,
        streamState: GenBuilderStreamState,
        requestId: number,
    ) {
        switch (streamEvent.type) {
            case "chat_created":
                if (!streamEvent.chatId) return;

                setupMessage.backendChatId = streamEvent.chatId;
                this.upsertCreatedUserChat({
                    storage_event_type: "chat_created",
                    chat_id: streamEvent.chatId,
                    chat_title: streamEvent.title,
                });
                return;
            case "clarification":
                streamState.hasReceivedClarification = true;
                setupMessage.status = "awaiting_parameters";
                setupMessage.errorText = undefined;
                this.currentStatus = "Требуется уточнение";

                if (streamEvent.content) {
                    this.chatMessages.push({
                        type: "response",
                        message: { type: "info", text: streamEvent.content },
                    });
                }
                return;
            case "status":
            case "progress":
                setupMessage.status = "running";
                this.currentStatus = streamEvent.content ?? (
                    streamEvent.type === "progress"
                        ? "Генерация застройки выполняется"
                        : "Параметры приняты"
                );
                return;
            case "result": {
                const layer = extractLayerFromUnknown(
                    streamEvent.content,
                    "Сгенерированная застройка",
                );

                if (!layer) {
                    streamState.hasStreamError = true;
                    setupMessage.status = "error";
                    setupMessage.errorText = "GenBuilder вернул результат без корректного GeoJSON-слоя.";
                    this.chatMessages.push({
                        type: "response",
                        message: { type: "error", text: setupMessage.errorText },
                    });
                    return;
                }

                const layerName = layer.name || "Сгенерированная застройка";
                streamState.hasReceivedResult = true;
                if (setupMessage.mode === "scenario") {
                    this.genBuilderResults.set(setupMessage.id, layer.layer);
                }
                setupMessage.status = "running";
                this.currentStatus = "Застройка сгенерирована";
                this.chatMessages.push({
                    type: "response",
                    message: {
                        type: "geojson",
                        name: layerName,
                        layer: layer.layer,
                    },
                });
                this.addGeoJsonLayerToMap(
                    { name: layerName, layer: layer.layer },
                    { requestId, showError: true },
                );
                return;
            }
            case "token":
                this.streamedResponse += streamEvent.content;
                return;
            case "warning": {
                const warningText = streamEvent.message ??
                    streamEvent.detail ??
                    "GenBuilder вернул предупреждение.";

                this.chatMessages.push({
                    type: "response",
                    message: { type: "warning", text: warningText },
                });
                return;
            }
            case "error": {
                const errorText = streamEvent.detail ?? "Не удалось сгенерировать застройку.";

                streamState.hasStreamError = true;
                setupMessage.status = "error";
                setupMessage.errorText = errorText;
                this.chatMessages.push({
                    type: "response",
                    message: { type: "error", text: errorText },
                });
                return;
            }
            case "done":
                if (streamEvent.chatId) {
                    setupMessage.backendChatId = streamEvent.chatId;
                    this.activeChatId = streamEvent.chatId;
                }

                return;
            case "unknown":
                return;
        }
    }

    private finalizeGenBuilderStream(
        setupMessage: GenBuilderSetupMessage,
        streamState: GenBuilderStreamState,
    ) {
        this.commitStreamedResponse();

        if (streamState.hasStreamError) {
            setupMessage.status = "error";
            return;
        }

        if (streamState.hasReceivedClarification) {
            setupMessage.status = "awaiting_parameters";
            return;
        }

        if (streamState.hasReceivedResult) {
            setupMessage.status = "finished";

            if (setupMessage.mode === "scenario" && !setupMessage.savePromptId) {
                const promptId = `genbuilder-save-${this.currentGenBuilderSavePromptId++}`;
                setupMessage.savePromptId = promptId;
                this.chatMessages.push({
                    type: "response",
                    message: {
                        type: "genbuilder_save_prompt",
                        id: promptId,
                        setupId: setupMessage.id,
                        status: "pending",
                    },
                });
            }
            return;
        }

        streamState.hasStreamError = true;
        setupMessage.status = "error";
        setupMessage.errorText = "Поток GenBuilder завершился без результата.";
        this.chatMessages.push({
            type: "response",
            message: { type: "error", text: setupMessage.errorText },
        });
    }

    private sendGenBuilderChatRequest(message: string, setupId: string) {
        const setupMessage = this.getGenBuilderSetupMessage(setupId);
        const userQuery = message.trim();

        if (
            !setupMessage ||
            setupMessage.status !== "awaiting_parameters" ||
            !userQuery
        ) return;

        let request: GenBuilderChatRequest;
        const backendChatId = setupMessage.backendChatId ?? this.getActiveBackendChatId();

        if (setupMessage.mode === "files") {
            const blocksFile = this.genBuilderSetupFiles.get(setupMessage.id)?.blocks;

            if (this.selectedContext !== "nonproject") {
                const errorText = "Контекст чата изменился. Запустите генерацию застройки заново.";

                setupMessage.status = "error";
                setupMessage.errorText = errorText;
                this.chatMessages.push({
                    type: "response",
                    message: { type: "error", text: errorText },
                });
                return;
            }

            if (!blocksFile) {
                setupMessage.status = "ready";
                setupMessage.errorText = "Загрузите GeoJSON-файл функциональных зон.";
                return;
            }

            request = {
                userQuery,
                blocksFile,
                chatId: backendChatId,
            };
        } else {
            if (
                setupMessage.projectId === undefined ||
                setupMessage.scenarioId === undefined ||
                setupMessage.selectedYear === undefined ||
                !setupMessage.selectedSource
            ) return;

            if (
                this.selectedContext !== setupMessage.projectId ||
                this.selectedScenario !== setupMessage.scenarioId
            ) {
                const errorText = "Проект или сценарий изменился. Запустите генерацию застройки заново.";

                setupMessage.status = "error";
                setupMessage.errorText = errorText;
                this.chatMessages.push({
                    type: "response",
                    message: { type: "error", text: errorText },
                });
                return;
            }

            request = {
                userQuery,
                scenarioId: setupMessage.scenarioId,
                year: setupMessage.selectedYear,
                source: setupMessage.selectedSource,
                projectId: setupMessage.projectId,
                chatId: backendChatId,
            };
        }

        const accessToken = AuthStore.accessToken;

        if (!GENBUILDER_API_URL || !accessToken) {
            const errorText = !GENBUILDER_API_URL
                ? "Не задан адрес сервиса GenBuilder (VITE_GENBUILDER_API)."
                : "Не удалось получить токен пользователя. Авторизуйтесь заново.";

            setupMessage.status = "error";
            setupMessage.errorText = errorText;
            this.chatMessages.push({
                type: "response",
                message: { type: "error", text: errorText },
            });
            return;
        }

        this.abortController?.abort();
        this.abortController = new AbortController();
        this.currentStreamRequestId += 1;
        const requestId = this.currentStreamRequestId;
        this.currentStreamContext = undefined;
        this.streamedResponse = "";
        this.isStreaming = true;
        this.currentStatus = "Отправка параметров генерации";
        setupMessage.status = "submitting";
        setupMessage.errorText = undefined;
        this.chatMessages.push({
            type: "request",
            message: { type: "text", text: userQuery },
        });

        if (backendChatId) {
            setupMessage.backendChatId = backendChatId;
        }

        const streamState: GenBuilderStreamState = {
            hasReceivedResult: false,
            hasReceivedClarification: false,
            hasStreamError: false,
        };

        return streamGenBuilderChat({
            baseUrl: GENBUILDER_API_URL,
            accessToken,
            request,
            signal: this.abortController.signal,
            onOpen: () => {
                runInAction(() => {
                    if (this.currentStreamRequestId !== requestId) {
                        return;
                    }

                    setupMessage.status = "running";
                    this.currentStatus = "GenBuilder обрабатывает параметры";
                });
            },
            onEvent: (streamEvent) => {
                runInAction(() => {
                    if (this.currentStreamRequestId !== requestId) {
                        return;
                    }

                    this.handleGenBuilderStreamEvent(
                        setupMessage,
                        streamEvent,
                        streamState,
                        requestId,
                    );
                });
            },
        })
        .then(action(() => {
            if (this.currentStreamRequestId !== requestId) {
                return;
            }

            this.finalizeGenBuilderStream(setupMessage, streamState);
        }))
        .catch(action((error) => {
            if (axios.isCancel(error) || error?.name === "AbortError" || error?.name === "CanceledError") {
                setupMessage.status = "awaiting_parameters";
                return;
            }

            console.error("Error streaming GenBuilder generation:", error);

            const responseData = asRecord(error?.response?.data);
            const errorText = toString(responseData?.detail) ??
                "Не удалось подключиться к сервису генерации застройки.";

            setupMessage.status = "error";
            setupMessage.errorText = errorText;
            this.chatMessages.push({
                type: "response",
                message: { type: "error", text: errorText },
            });
        }))
        .finally(action(() => {
            if (this.currentStreamRequestId !== requestId) {
                return;
            }

            this.isStreaming = false;
            this.currentStatus = undefined;
            this.abortController = undefined;
            void this.getUserChats();
        }));
    }

    saveGenBuilderResult = async (promptId: string) => {
        const promptMessage = this.getGenBuilderSavePromptMessage(promptId);
        const setupMessage = promptMessage
            ? this.getGenBuilderSetupMessage(promptMessage.setupId)
            : undefined;

        if (
            !promptMessage ||
            promptMessage.status !== "pending" ||
            !setupMessage ||
            setupMessage.mode !== "scenario" ||
            setupMessage.projectId === undefined ||
            setupMessage.scenarioId === undefined
        ) return;

        if (
            this.selectedContext !== setupMessage.projectId ||
            this.selectedScenario !== setupMessage.scenarioId
        ) {
            promptMessage.status = "error";
            promptMessage.errorText = "Проект или сценарий изменился. Вернитесь к исходному сценарию, чтобы сохранить застройку.";
            return;
        }

        const accessToken = AuthStore.accessToken;
        const storedLayer = this.genBuilderResults.get(setupMessage.id);

        if (!URBAN_API_URL || !accessToken || !storedLayer) {
            promptMessage.status = "error";
            promptMessage.errorText = !storedLayer
                ? "Результат генерации недоступен для сохранения."
                : "Не удалось определить адрес Urban API или токен пользователя.";
            return;
        }

        promptMessage.status = "saving";
        promptMessage.errorText = undefined;

        try {
            const layerUri = getLayerUri(storedLayer);
            const layer = layerUri
                ? await downloadGeoJsonLayer(layerUri)
                : storedLayer;
            const territoryId = await DataStore.getProjectTerritoryId(setupMessage.projectId);
            const result = await saveGeneratedBuildings({
                baseUrl: URBAN_API_URL,
                accessToken,
                scenarioId: setupMessage.scenarioId,
                territoryId,
                layer,
            });

            runInAction(() => {
                promptMessage.result = result;

                if (result.totalCount === 0) {
                    promptMessage.status = "error";
                    promptMessage.errorText = "В результате не найдены сгенерированные здания, которые можно сохранить.";
                    return;
                }

                if (result.failedCount > 0) {
                    const firstError = result.errors[0];
                    promptMessage.status = "error";
                    promptMessage.errorText = [
                        `Сохранено ${result.savedCount} из ${result.totalCount} объектов. Не удалось сохранить: ${result.failedCount}.`,
                        firstError,
                    ].filter(Boolean).join(" ");
                    return;
                }

                promptMessage.status = "saved";
                this.genBuilderResults.delete(setupMessage.id);
            });
        } catch (error) {
            console.error("Error saving GenBuilder result:", error);

            runInAction(() => {
                promptMessage.status = "error";
                promptMessage.errorText = error instanceof Error
                    ? error.message
                    : "Не удалось сохранить застройку в сценарии.";
            });
        }
    };

    declineGenBuilderResult(promptId: string) {
        const promptMessage = this.getGenBuilderSavePromptMessage(promptId);
        if (!promptMessage || promptMessage.status !== "pending") {
            return;
        }

        promptMessage.status = "declined";
        this.genBuilderResults.delete(promptMessage.setupId);
    }

    private getPzzSetupMessage(setupId: string) {
        const chatMessage = this.chatMessages.find(
            (message) => message.type === "response" &&
                isPzzSetupMessage(message.message) &&
                message.message.id === setupId
        );

        return chatMessage && isPzzSetupMessage(chatMessage.message)
            ? chatMessage.message
            : undefined;
    }

    private hasActivePzzSetup() {
        return this.chatMessages.some((message) =>
            message.type === "response" &&
            isPzzSetupMessage(message.message) &&
            (message.message.status === "loading" ||
                message.message.status === "ready" ||
                message.message.status === "submitting" ||
                message.message.status === "queued" ||
                message.message.status === "waiting_capacity" ||
                message.message.status === "running")
        );
    }

    private startPzzCheckSetup(message: string) {
        this.isStreaming = false;
        this.currentStatus = undefined;
        this.abortController = undefined;

        if (this.hasActivePzzSetup()) {
            this.chatMessages.push({
                type: "response",
                message: {
                    type: "error",
                    text: "Завершите текущую настройку проверки ПЗЗ.",
                },
            });
            return;
        }

        const setupId = this.getNextPzzSetupId();

        if (this.selectedContext === "nonproject") {
            this.pzzSetupFiles.set(setupId, {});
            this.chatMessages.push({
                type: "response",
                message: {
                    type: "pzz_setup",
                    id: setupId,
                    request: message,
                    mode: "files",
                    sources: [],
                    status: "ready",
                    filesStep: "upload_pzz_zones",
                },
            });
            return;
        }

        const scenarioId = this.selectedScenario;
        if (!scenarioId) {
            this.chatMessages.push({
                type: "response",
                message: {
                    type: "error",
                    text: "Для проверки объектов по ПЗЗ выберите сценарий.",
                },
            });
            return;
        }

        this.chatMessages.push({
            type: "response",
            message: {
                type: "pzz_setup",
                id: setupId,
                request: message,
                mode: "scenario",
                sources: [],
                status: "loading",
            },
        });

        void DataStore.getScenarioZoneSources(scenarioId)
            .then(action((data) => {
                const setupMessage = this.getPzzSetupMessage(setupId);
                if (!setupMessage) return;

                const sources = normalizeFunctionalZoneSources(data);

                setupMessage.sources = sources;
                setupMessage.status = sources.length ? "ready" : "error";
                setupMessage.errorText = sources.length
                    ? undefined
                    : "Для выбранного сценария не найдены источники функциональных зон.";
            }));
    }

    private setPzzSetupError(
        setupId: string | undefined,
        errorText: string,
        status: PzzSetupStatus = "error",
    ) {
        this.selectedPzzZoneSource = undefined;

        if (!setupId) return;

        const setupMessage = this.getPzzSetupMessage(setupId);

        if (!setupMessage) return;

        setupMessage.status = status;
        setupMessage.errorText = errorText;
    }

    private appendPzzResult(result: unknown) {
        const layer = extractLayerFromUnknown(result, "Результат проверки ПЗЗ");

        if (layer) {
            this.appendGeoJsonLayer(layer);
            return;
        }

        const serializedResult = typeof result === "string"
            ? result
            : JSON.stringify(result, null, 2);
        const text = extractTextFromPayload(result) ??
            (serializedResult ? `\`\`\`json\n${serializedResult}\n\`\`\`` : undefined);

        this.chatMessages.push({
            type: "response",
            message: {
                type: "text",
                text: text || "Проверка объектов по ПЗЗ завершена.",
            },
        });
    }

    private sendPzzCheckRequest(
        message: string,
        zoneSource: FunctionalZoneSource,
        setupId?: string,
    ) {
        const scenarioId = this.selectedScenario;

        if (!scenarioId) {
            this.chatMessages.push({
                type: "response",
                message: {
                    type: "error",
                    text: "Для проверки объектов по ПЗЗ выберите сценарий.",
                },
            });
            return;
        }

        this.abortController?.abort();
        this.abortController = new AbortController();
        const requestId = this.currentStreamRequestId;
        this.isStreaming = true;
        this.currentStatus = "Запуск проверки объектов по ПЗЗ";

        const formData = new FormData();
        formData.set("year", String(zoneSource.year));
        formData.set("source", zoneSource.source);
        formData.set("user_query", message);

        if (typeof this.activeChatId === "string") {
            formData.set("chat_id", this.activeChatId);
        }

        this.selectedPzzZoneSource = zoneSource;

        if (setupId) {
            const setupMessage = this.getPzzSetupMessage(setupId);

            if (setupMessage) {
                setupMessage.status = "running";
                setupMessage.selectedYear = zoneSource.year;
                setupMessage.selectedSource = zoneSource.source;
                setupMessage.taskExternalId = undefined;
                setupMessage.resultLoaded = false;
                setupMessage.errorText = undefined;
            }
        }

        return axios.post(
            `${import.meta.env.VITE_PZZ_COMPARE_API}/scenarios/${scenarioId}/chat/stream`,
            formData,
            {
                headers: {
                    Accept: "text/event-stream",
                    Authorization: `Bearer ${AuthStore.accessToken}`,
                },
                responseType: "stream",
                adapter: "fetch",
                signal: this.abortController.signal,
            },
        )
        .then(async ({ data }) => {
            const stream = data as ReadableStream<Uint8Array> | undefined;
            if (!stream || typeof stream.getReader !== "function") {
                throw new Error("PZZ check stream response is not readable");
            }

            this.currentStatus = "Проверка объектов по ПЗЗ выполняется";

            await readSseStream(stream, (streamEvent) => {
                runInAction(() => {
                    if (this.currentStreamRequestId !== requestId) return;

                    this.appendStreamChunk(streamEvent.data, streamEvent.eventName);
                });
            });

            runInAction(() => {
                if (this.currentStreamRequestId !== requestId) return;

                this.commitStreamedResponse();

                const setupMessage = setupId ? this.getPzzSetupMessage(setupId) : undefined;
                if (setupMessage) {
                    setupMessage.status = "finished";
                    setupMessage.resultLoaded = true;
                    setupMessage.errorText = undefined;
                }
            });
        })
        .catch(action((error) => {
            if (axios.isCancel(error) || error?.name === "AbortError" || error?.name === "CanceledError") {
                this.commitStreamedResponse();
                return;
            }

            console.error("Error streaming PZZ check:", error);

            this.setPzzSetupError(setupId, "Не удалось выполнить потоковую проверку объектов по ПЗЗ.");

            this.chatMessages.push({
                type: "response",
                message: {
                    type: "error",
                    text: "Не удалось выполнить потоковую проверку объектов по ПЗЗ.",
                },
            });
        }))
        .finally(action(() => {
            if (this.currentStreamRequestId !== requestId) return;

            this.isStreaming = false;
            this.currentStatus = undefined;
            this.abortController = undefined;
            void this.getUserChats();
        }));
    }

    submitPzzSetup(setupId: string, year: number, source: string) {
        const setupMessage = this.getPzzSetupMessage(setupId);
        if (
            !setupMessage ||
            setupMessage.mode !== "scenario" ||
            setupMessage.status === "submitting" ||
            setupMessage.status === "queued" ||
            setupMessage.status === "waiting_capacity" ||
            setupMessage.status === "running" ||
            setupMessage.status === "finished"
        ) return;

        const zoneSource = { year, source };

        setupMessage.status = "submitting";
        setupMessage.submitted = true;
        setupMessage.selectedYear = year;
        setupMessage.selectedSource = source;
        setupMessage.errorText = undefined;
        this.selectedPzzZoneSource = zoneSource;

        return this.sendPzzCheckRequest(setupMessage.request, zoneSource, setupId);
    }

    private getPzzSetupFiles(setupId: string) {
        const files = this.pzzSetupFiles.get(setupId) ?? {};
        this.pzzSetupFiles.set(setupId, files);
        return files;
    }

    private canUpdatePzzSetupFiles(setupId: string) {
        const setupMessage = this.getPzzSetupMessage(setupId);
        if (
            !setupMessage
            || setupMessage.mode !== "files"
            || setupMessage.status !== "ready"
            || setupMessage.submitted
        ) return undefined;

        return setupMessage;
    }

    submitPzzZonesFile(setupId: string, file: File) {
        const setupMessage = this.canUpdatePzzSetupFiles(setupId);
        if (!setupMessage) return;

        const files = this.getPzzSetupFiles(setupId);
        files.pzzZones = file;
        setupMessage.pzzZonesFileName = file.name;
        setupMessage.filesStep = "upload_pzz_descriptions";
        setupMessage.errorText = undefined;
    }

    submitPzzDescriptionsFile(setupId: string, file: File) {
        const setupMessage = this.canUpdatePzzSetupFiles(setupId);
        if (!setupMessage) return;

        const files = this.getPzzSetupFiles(setupId);
        files.pzzDescriptions = file;
        setupMessage.pzzDescriptionsFileName = file.name;
        setupMessage.filesStep = "upload_cadastral";
        setupMessage.errorText = undefined;
    }

    skipPzzDescriptionsFile(setupId: string) {
        const setupMessage = this.canUpdatePzzSetupFiles(setupId);
        if (!setupMessage) return;

        const files = this.getPzzSetupFiles(setupId);
        files.pzzDescriptions = undefined;
        setupMessage.pzzDescriptionsFileName = undefined;
        setupMessage.filesStep = "upload_cadastral";
        setupMessage.errorText = undefined;
    }

    submitPzzCadastralFile(setupId: string, file: File) {
        const setupMessage = this.canUpdatePzzSetupFiles(setupId);
        if (!setupMessage) return;

        const files = this.getPzzSetupFiles(setupId);
        files.cadastral = file;
        setupMessage.cadastralFileName = file.name;
        setupMessage.filesStep = "finished";
        setupMessage.errorText = undefined;

        return this.submitPzzFilesSetup(setupId);
    }

    submitPzzFilesSetup(setupId: string) {
        const setupMessage = this.getPzzSetupMessage(setupId);
        const files = this.getPzzSetupFiles(setupId);

        if (
            !setupMessage
            || setupMessage.mode !== "files"
            || setupMessage.submitted
        ) return;

        if (!files.pzzZones || !files.cadastral) {
            setupMessage.status = "error";
            setupMessage.errorText = "Загрузите файл с ПЗЗ и файл с зданиями.";
            return;
        }

        setupMessage.submitted = true;
        setupMessage.status = "submitting";
        setupMessage.errorText = undefined;

        const formData = new FormData();
        formData.append(
            PZZ_FILE_FORM_FIELDS.pzzZones,
            files.pzzZones,
            files.pzzZones.name,
        );
        if (files.pzzDescriptions) {
            formData.append(
                PZZ_FILE_FORM_FIELDS.pzzDescriptions,
                files.pzzDescriptions,
                files.pzzDescriptions.name,
            );
        }
        formData.append(
            PZZ_FILE_FORM_FIELDS.cadastral,
            files.cadastral,
            files.cadastral.name,
        );
        formData.set("mode", "building_pzz_check");
        formData.set("user_query", setupMessage.request);

        if (typeof this.activeChatId === "string") {
            formData.set("chat_id", this.activeChatId);
        }

        this.abortController?.abort();
        this.abortController = new AbortController();
        this.currentStreamRequestId += 1;
        const requestId = this.currentStreamRequestId;
        this.currentStreamContext = undefined;
        this.streamedResponse = "";
        this.isStreaming = true;
        this.currentStatus = "Запуск проверки объектов по ПЗЗ";

        return axios.post(
            PZZ_AUTO_CHAT_STREAM_URL,
            formData,
            {
                headers: {
                    Accept: "text/event-stream",
                    Authorization: `Bearer ${AuthStore.accessToken}`,
                },
                responseType: "stream",
                adapter: "fetch",
                signal: this.abortController.signal,
            },
        )
        .then(async ({ data }) => {
            const stream = data as ReadableStream<Uint8Array> | undefined;
            if (!stream || typeof stream.getReader !== "function") {
                throw new Error("PZZ file check stream response is not readable");
            }

            setupMessage.status = "running";
            this.currentStatus = "Проверка объектов по ПЗЗ выполняется";

            await readSseStream(stream, (streamEvent) => {
                runInAction(() => {
                    if (this.currentStreamRequestId !== requestId) return;
                    this.appendStreamChunk(streamEvent.data, streamEvent.eventName);
                });
            });

            runInAction(() => {
                if (this.currentStreamRequestId !== requestId) return;

                this.commitStreamedResponse();
                setupMessage.status = "finished";
                setupMessage.resultLoaded = true;
                setupMessage.errorText = undefined;
            });
        })
        .catch(action((error) => {
            if (
                axios.isCancel(error)
                || error?.name === "AbortError"
                || error?.name === "CanceledError"
            ) {
                this.commitStreamedResponse();
                return;
            }

            console.error("Error streaming PZZ file check:", error);
            this.setPzzSetupError(
                setupId,
                "Не удалось выполнить проверку объектов по ПЗЗ.",
            );
            this.chatMessages.push({
                type: "response",
                message: {
                    type: "error",
                    text: "Не удалось выполнить проверку объектов по ПЗЗ.",
                },
            });
        }))
        .finally(action(() => {
            if (this.currentStreamRequestId !== requestId) return;

            this.isStreaming = false;
            this.currentStatus = undefined;
            this.abortController = undefined;
            void this.getUserChats();
        }));
    }

    private getNextVriSetupId() {
        return `vri-setup-${this.currentVriSetupId++}`;
    }

    private getVriSetupMessage(setupId: string) {
        const chatMessage = this.chatMessages.find(
            (message) => message.type === "response" &&
                isVriSetupMessage(message.message) &&
                message.message.id === setupId
        );

        return chatMessage && isVriSetupMessage(chatMessage.message)
            ? chatMessage.message
            : undefined;
    }

    private hasActiveVriSetup() {
        return this.chatMessages.some((message) =>
            message.type === "response" &&
            isVriSetupMessage(message.message) &&
            (message.message.status === "ready" ||
                message.message.status === "submitting" ||
                message.message.status === "running")
        );
    }

    private startVriCheckSetup(message: string) {
        this.isStreaming = false;
        this.currentStatus = undefined;
        this.abortController = undefined;

        if (this.hasActiveVriSetup()) {
            this.chatMessages.push({
                type: "response",
                message: {
                    type: "error",
                    text: "Завершите текущую настройку проверки ВРИ.",
                },
            });
            return;
        }

        const setupId = this.getNextVriSetupId();
        this.vriSetupFiles.set(setupId, {});

        this.chatMessages.push({
            type: "response",
            message: {
                type: "vri_setup",
                id: setupId,
                request: message,
                status: "ready",
                step: "upload_land_plots",
            },
        });
    }

    private getVriSetupFiles(setupId: string) {
        const files = this.vriSetupFiles.get(setupId) ?? {};
        this.vriSetupFiles.set(setupId, files);

        return files;
    }

    private setVriSetupError(setupId: string | undefined, errorText: string) {
        if (!setupId) return;

        const setupMessage = this.getVriSetupMessage(setupId);
        if (!setupMessage) return;

        setupMessage.status = "error";
        setupMessage.errorText = errorText;
    }

    submitVriLandPlots(setupId: string, file: File) {
        const setupMessage = this.getVriSetupMessage(setupId);
        if (!setupMessage || setupMessage.status !== "ready") return;

        const files = this.getVriSetupFiles(setupId);
        files.landPlots = file;
        setupMessage.landPlotsFileName = file.name;
        setupMessage.step = "ask_classifier";
        setupMessage.errorText = undefined;
    }

    answerVriClassifier(setupId: string, wantsClassifier: boolean) {
        const setupMessage = this.getVriSetupMessage(setupId);
        if (!setupMessage || setupMessage.status !== "ready") return;

        setupMessage.wantsClassifier = wantsClassifier;
        setupMessage.errorText = undefined;

        if (wantsClassifier) {
            setupMessage.step = "upload_classifier";
            return;
        }

        const files = this.getVriSetupFiles(setupId);
        files.classifier = undefined;
        setupMessage.classifierFileName = undefined;
        setupMessage.step = "ask_pzz_check";
    }

    submitVriClassifier(setupId: string, file: File) {
        const setupMessage = this.getVriSetupMessage(setupId);
        if (!setupMessage || setupMessage.status !== "ready") return;

        const files = this.getVriSetupFiles(setupId);
        files.classifier = file;
        setupMessage.classifierFileName = file.name;
        setupMessage.step = "ask_pzz_check";
        setupMessage.errorText = undefined;
    }

    answerVriPzzCheck(setupId: string, wantsPzzCheck: boolean) {
        const setupMessage = this.getVriSetupMessage(setupId);
        if (!setupMessage || setupMessage.status !== "ready") return;

        setupMessage.wantsPzzCheck = wantsPzzCheck;
        setupMessage.errorText = undefined;

        if (wantsPzzCheck) {
            setupMessage.step = "upload_pzz_zones";
            return;
        }

        return this.sendVriCheckRequest(setupId, false);
    }

    submitVriPzzZones(setupId: string, file: File) {
        const setupMessage = this.getVriSetupMessage(setupId);
        if (!setupMessage || setupMessage.status !== "ready") return;

        const files = this.getVriSetupFiles(setupId);
        files.pzzZones = file;
        setupMessage.pzzZonesFileName = file.name;
        setupMessage.step = "ask_pzz_zone_description";
        setupMessage.errorText = undefined;
    }

    answerVriPzzZoneDescription(setupId: string, wantsPzzZoneDescription: boolean) {
        const setupMessage = this.getVriSetupMessage(setupId);
        if (!setupMessage || setupMessage.status !== "ready") return;

        setupMessage.wantsPzzZoneDescription = wantsPzzZoneDescription;
        setupMessage.errorText = undefined;

        if (wantsPzzZoneDescription) {
            setupMessage.step = "upload_pzz_zone_description";
            return;
        }

        return this.sendVriCheckRequest(setupId, true);
    }

    submitVriPzzZoneDescription(setupId: string, file: File) {
        const setupMessage = this.getVriSetupMessage(setupId);
        if (!setupMessage || setupMessage.status !== "ready") return;

        const files = this.getVriSetupFiles(setupId);
        files.pzzZoneDescription = file;
        setupMessage.pzzZoneDescriptionFileName = file.name;
        setupMessage.errorText = undefined;

        return this.sendVriCheckRequest(setupId, true);
    }

    private appendGeoJsonLayer(layer: UserChatLayer) {
        this.chatMessages.push({
            type: "response",
            message: {
                type: "geojson",
                name: layer.name,
                layer: layer.layer,
            },
        });

        this.addGeoJsonLayerToMap(layer, { showError: true });
    }

    private appendVriResult(result: unknown) {
        const layer = extractLayerFromUnknown(result, "Результат проверки ВРИ");

        if (layer) {
            this.appendGeoJsonLayer(layer);
            return;
        }

        const serializedResult = typeof result === "string"
            ? result
            : JSON.stringify(result, null, 2);
        const text = extractTextFromPayload(result) ??
            (serializedResult ? `\`\`\`json\n${serializedResult}\n\`\`\`` : undefined);

        this.chatMessages.push({
            type: "response",
            message: {
                type: "text",
                text: text || "Проверка ВРИ завершена.",
            },
        });
    }

    private appendVriReport(reportText: string, streamState: VriStreamState): VriStreamState {
        if (!reportText.length) return streamState;

        const existingReportMessage = streamState.reportMessageIndex !== undefined
            ? this.chatMessages[streamState.reportMessageIndex]
            : undefined;

        if (
            existingReportMessage?.type === "response" &&
            existingReportMessage.message.type === "text"
        ) {
            existingReportMessage.message.text += reportText;

            return {
                ...streamState,
                hasReceivedReport: true,
            };
        }

        this.chatMessages.push({
            type: "response",
            message: {
                type: "text",
                text: reportText,
            },
        });

        return {
            ...streamState,
            hasReceivedReport: true,
            reportMessageIndex: this.chatMessages.length - 1,
        };
    }

    private appendVriWarning(warningText: string, streamState: VriStreamState): VriStreamState {
        if (!warningText.length) return streamState;

        this.chatMessages.push({
            type: "response",
            message: {
                type: "warning",
                text: warningText,
            },
        });

        return {
            ...streamState,
            hasReceivedReport: true,
        };
    }

    private handleVriStreamEvent(
        streamEvent: SseStreamEvent,
        setupId: string,
        streamState: VriStreamState,
    ) {
        const trimmedData = streamEvent.data.trim();
        if (!trimmedData || trimmedData === "[DONE]") return streamState;

        const eventName = streamEvent.eventName?.toLowerCase();
        const payload = parseJsonValue(trimmedData);
        const chunkKind = getStreamChunkKind(payload, eventName);
        const setupMessage = this.getVriSetupMessage(setupId);

        if (this.handleServiceEvent(payload)) return streamState;

        if (chunkKind === "error") {
            const errorText = getVriErrorText(payload) ?? "Проверка ВРИ завершилась с ошибкой.";

            if (setupMessage) {
                setupMessage.status = "error";
                setupMessage.errorText = errorText;
            }

            this.currentStatus = undefined;
            this.chatMessages.push({
                type: "response",
                message: {
                    type: "error",
                    text: errorText,
                },
            });

            return {
                ...streamState,
                hasStreamError: true,
            };
        }

        const warningText = getVriWarningText(payload, eventName);
        if (warningText) {
            this.currentStatus = warningText;

            if (setupMessage) {
                setupMessage.status = "running";
            }

            return this.appendVriWarning(warningText, streamState);
        }

        const statusText = getVriStatusText(payload, eventName);
        if (statusText) {
            this.currentStatus = statusText;

            if (setupMessage) {
                setupMessage.status = "running";
            }

            return streamState;
        }

        const isResultFile = isVriResultFile(payload, eventName);
        const fileLayer = isResultFile ? getVriFileLayer(payload, eventName) : undefined;
        if (fileLayer) {
            this.appendGeoJsonLayer(fileLayer);

            if (setupMessage) {
                setupMessage.status = "finished";
                setupMessage.step = "finished";
                setupMessage.errorText = undefined;
            }

            this.currentStatus = "Проверка ВРИ завершена";

            return {
                ...streamState,
                hasReceivedResult: true,
            };
        }

        const reportText = getVriReportText(payload, eventName);
        const nextStreamState = reportText !== undefined
            ? this.appendVriReport(reportText, streamState)
            : streamState;

        const resultPayload = getVriResultPayload(payload, eventName);
        if (resultPayload === undefined || nextStreamState.hasReceivedResult) return nextStreamState;

        if (setupMessage) {
            setupMessage.status = "finished";
            setupMessage.step = "finished";
            setupMessage.errorText = undefined;
        }

        this.currentStatus = "Проверка ВРИ завершена";
        this.appendVriResult(resultPayload);

        return {
            ...nextStreamState,
            hasReceivedResult: true,
        };
    }

    private sendVriCheckRequest(setupId: string, withPzzCheck: boolean) {
        const setupMessage = this.getVriSetupMessage(setupId);
        const files = this.getVriSetupFiles(setupId);

        if (!setupMessage) return;

        if (!files.landPlots) {
            this.setVriSetupError(setupId, "Загрузите земельные участки.");
            return;
        }

        if (withPzzCheck && !files.pzzZones) {
            this.setVriSetupError(setupId, "Загрузите зоны ПЗЗ.");
            return;
        }

        setupMessage.submitted = true;

        const formData = new FormData();
        formData.append(VRI_FORM_FIELDS.landPlots, files.landPlots, files.landPlots.name);
        formData.set("user_query", setupMessage.request);

        if (typeof this.activeChatId === "string") {
            formData.set("chat_id", this.activeChatId);
        }

        // if (typeof this.selectedContext === "number") {
        //     formData.set("project_id", String(this.selectedContext));
        // }

        // if (this.selectedScenario) {
        //     formData.set("scenario_id", String(this.selectedScenario));
        // }

        if (files.classifier) {
            formData.append(VRI_FORM_FIELDS.classifier, files.classifier, files.classifier.name);
        }

        if (withPzzCheck) {
            formData.append(VRI_FORM_FIELDS.pzzZones, files.pzzZones!, files.pzzZones!.name);

            if (files.pzzZoneDescription) {
                formData.append(
                    VRI_FORM_FIELDS.pzzZoneDescription,
                    files.pzzZoneDescription,
                    files.pzzZoneDescription.name,
                );
            }
        }

        this.abortController?.abort();
        this.abortController = new AbortController();
        this.currentStreamRequestId += 1;
        const requestId = this.currentStreamRequestId;
        this.isStreaming = true;
        this.currentStatus = "Запуск проверки ВРИ";
        setupMessage.status = "submitting";
        setupMessage.errorText = undefined;

        const endPoint = withPzzCheck ? "pzz_check" : "classify_only";
        formData.set("mode", endPoint);

        return axios.post(
            `${import.meta.env.VITE_PZZ_COMPARE_API}/tasks/auto/chat/stream`,
            formData,
            {
                headers: {
                    Accept: "text/event-stream",
                    Authorization: `Bearer ${AuthStore.accessToken}`,
                },
                responseType: "stream",
                adapter: "fetch",
                signal: this.abortController.signal,
            },
        )
        .then(async ({ data }) => {
            const stream = data as ReadableStream<Uint8Array> | undefined;
            if (!stream || typeof stream.getReader !== "function") {
                throw new Error("VRI check stream response is not readable");
            }

            setupMessage.status = "running";

            let streamState: VriStreamState = {
                hasReceivedResult: false,
                hasReceivedReport: false,
                hasStreamError: false,
            };

            await readSseStream(stream, (streamEvent) => {
                runInAction(() => {
                    if (this.currentStreamRequestId !== requestId) return;

                    streamState = this.handleVriStreamEvent(streamEvent, setupId, streamState);
                });
            });

            runInAction(() => {
                if (this.currentStreamRequestId !== requestId) return;
                if (streamState.hasStreamError) return;

                if (!streamState.hasReceivedResult && !streamState.hasReceivedReport) {
                    const errorText = "Поток проверки ВРИ завершился без результата.";

                    this.setVriSetupError(setupId, errorText);
                    this.chatMessages.push({
                        type: "response",
                        message: {
                            type: "error",
                            text: errorText,
                        },
                    });
                    return;
                }

                const currentSetupMessage = this.getVriSetupMessage(setupId);
                if (currentSetupMessage) {
                    currentSetupMessage.status = "finished";
                    currentSetupMessage.step = "finished";
                    currentSetupMessage.errorText = undefined;
                }
            });
        })
        .catch(action((error) => {
            if (this.currentStreamRequestId !== requestId) return;

            if (axios.isCancel(error) || error?.name === "AbortError" || error?.name === "CanceledError") {
                this.setVriSetupError(setupId, "Проверка ВРИ отменена.");
                return;
            }

            console.error("Error streaming VRI check:", error);

            this.setVriSetupError(setupId, "Не удалось выполнить потоковую проверку ВРИ.");
            this.chatMessages.push({
                type: "response",
                message: {
                    type: "error",
                    text: "Не удалось выполнить потоковую проверку ВРИ.",
                },
            });
        }))
        .finally(action(() => {
            if (this.currentStreamRequestId !== requestId) return;

            this.isStreaming = false;
            this.currentStatus = undefined;
            this.abortController = undefined;
            void this.getUserChats();
        }));
    }

    sendChatMessage = async (message: string) => {
        if (this.selectedChatTool === "Сгенерировать застройку") {
            const setupMessage = this.getActiveGenBuilderSetupMessage();

            if (!setupMessage) {
                this.startGenBuilderSetup();
                return;
            }

            if (setupMessage.status === "awaiting_parameters") {
                return this.sendGenBuilderChatRequest(message, setupMessage.id);
            }

            this.chatMessages.push({
                type: "response",
                message: {
                    type: "info",
                    text: setupMessage.status === "submitting" || setupMessage.status === "running"
                        ? "Дождитесь завершения текущей генерации."
                        : setupMessage.status === "validating_file"
                            ? "Дождитесь завершения проверки файла."
                            : setupMessage.mode === "files"
                                ? "Сначала загрузите GeoJSON-файл функциональных зон."
                                : "Сначала выберите год и источник и нажмите «Запустить».",
                },
            });
            return;
        }

        if (
            this.selectedChatTool === "Проверка ВРИ"
            && this.hasActiveVriSetup()
        ) {
            return;
        }

        if (
            this.selectedChatTool === "Проверка объектов по ПЗЗ"
            && this.hasActivePzzSetup()
        ) {
            return;
        }

        this.abortController?.abort();
        this.abortController = new AbortController();
        this.currentStreamRequestId += 1;
        this.currentStreamContext = undefined;
        this.streamedResponse = "";
        this.isStreaming = true;
        this.currentStatus = undefined;
        // if (this.activeChatId === undefined) {
        //     this.addChat();
        // }
        MapStore.clearMapLayers();
        if (
            typeof this.selectedContext === "number" &&
            this.selectedChatTool !== "Проверка объектов по ПЗЗ" &&
            this.selectedChatTool !== "Проверка ВРИ"
        ) {
            this.currentStreamContext = this.createProjectBoundaryStreamContext(this.selectedContext);
        }
        this.chatMessages.push({type: "request", message: { type: "text", text: message}})

        if (this.selectedChatTool === "Проверка ВРИ") {
            return this.startVriCheckSetup(message);
        } else if (this.selectedContext === "nonproject") {
            return this.sendDocumentMessage(message);
        } else if (this.selectedContext !== "nonproject" && this.selectedScenario) {
            if (this.selectedChatTool === "Обеспеченность") {
                return this.sendProvisionContextMessage(message);
            } else if (this.selectedChatTool === "Проверка объектов по ПЗЗ") {
                if (this.selectedPzzZoneSource) {
                    return this.sendPzzCheckRequest(message, this.selectedPzzZoneSource);
                }
                return this.startPzzCheckSetup(message);
            } else if (this.selectedChatTool === "Зоны ограничений") {
                return this.sendRestrictionsContextMessage(message);
            }

            return this.sendDocumentMessage(message, this.selectedScenario);
        }

        this.streamedResponse = "";
        this.isStreaming = false;
    };

    private resolveMissingUserChatProjectIds(chats: UserChat[]) {
        const scenarioIds = Array.from(new Set(
            chats.flatMap((chat) => (
                chat.scenario_id && getUserChatProjectId(chat) === undefined
                    ? [chat.scenario_id]
                    : []
            ))
        ));

        if (!scenarioIds.length) return;

        void Promise.all(
            scenarioIds.map(async (scenarioId) => ({
                scenarioId,
                projectId: await DataStore.getProjectIdByScenario(scenarioId),
            }))
        ).then(action((resolvedProjects) => {
            const projectIdByScenarioId = new Map(
                resolvedProjects.flatMap(({ scenarioId, projectId }) =>
                    projectId ? [[scenarioId, projectId] as const] : []
                )
            );

            if (!projectIdByScenarioId.size) return;

            this.userChats = this.userChats.map((chat) => {
                if (!chat.scenario_id || getUserChatProjectId(chat) !== undefined) return chat;

                const projectId = projectIdByScenarioId.get(chat.scenario_id);
                if (!projectId) return chat;

                return {
                    ...chat,
                    project_id: projectId,
                    metadata: {
                        ...(chat.metadata ?? {}),
                        project_id: projectId,
                        selectedContext: projectId,
                    },
                };
            });
        }));
    }

    getUserChats() {
        this.isUserChatsLoading = true;

        return axios.get(
            `${import.meta.env.VITE_LLM_CHAT_HISTORY_API}/chat_history/chats`,
            {
                headers: {
                    Authorization: `Bearer ${AuthStore.accessToken}`,
                },
                params: {
                    limit: 100,
                },
            },
        )
        .then(
            action(
                ({ data }) => {
                    const chats = Array.isArray(data?.items) ? data.items as UserChat[] : [];
                    const fetchedChatIds = new Set(chats.map((chat) => chat.chat_id));
                    const localOnlyChats = this.userChats.filter(
                        (chat) => !fetchedChatIds.has(chat.chat_id),
                    );

                    this.userChats = [...chats, ...localOnlyChats];
                    this.resolveMissingUserChatProjectIds(this.userChats);
                    return this.userChats;
                },
            ),
        )
        .catch(error => {
            console.error("Error fetching user chats:", error);
            return [];
        })
        .finally(
            action(() => {
                this.isUserChatsLoading = false;
            }),
        );
    }

    getUserChatMessages(chatId: string): Promise<UserChatMessage[]> {
        return axios.get(
            `${import.meta.env.VITE_LLM_CHAT_HISTORY_API}/chat_history/${chatId}`,
            {
                headers: {
                    Authorization: `Bearer ${AuthStore.accessToken}`,
                },
            },
        )
        .then(({ data }) => {
            // normalizeUserChatMessages(data)
            if (data && data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
                return data.messages;
            }
            return [];
        })
        .catch(error => {
            console.error("Error fetching user chat messages:", error);
            return [];
        });
    }

    getUserChatMessageLayer(messageId: string, partSeq: number, toolCall = 1) {
        return axios.get(
            `${import.meta.env.VITE_LLM_CHAT_HISTORY_API}/chat_history/messages/${messageId}/parts/${partSeq}/tool_calls/${toolCall}/execute`,
            {
                headers: {
                    Authorization: `Bearer ${AuthStore.accessToken}`,
                },
            },
        )
        .then(({ data }) => {
            if (data && data.result && Object.keys(data.result).length > 0) {
                return {
                    name: Object.keys(data.result)[0],
                    layer: Object.values(data.result)[0],
                };
            }
            return null;
        })
        .catch(error => {
            console.error("Error fetching user chat message layer:", error);
            return null;
        });
    }

    private applyUserChatContext(chat?: UserChat) {
        const metadata = chat?.metadata ?? {};
        const projectId = toNumber(
            metadata.project_id ??
            metadata.projectId ??
            metadata.selected_context ??
            metadata.selectedContext,
        );
        const scenarioId = toNumber(chat?.scenario_id ?? metadata.scenario_id ?? metadata.scenarioId);

        if (projectId !== undefined) {
            this.selectedContext = projectId;
            this.selectedScenario = scenarioId ?? null;

            if (this.selectedScenario) {
                void DataStore.getProjectScenarios(projectId);
            }

            return;
        }

        this.selectedContext = "nonproject";
        this.selectedScenario = null;
    }

    private async getLayerForUserChatPart(
        messageId: string,
        part: ToolCallPart,
    ) {
        const fallbackName =
            getLayerName(part.payload) ??
            toString(part.mcp_source) ??
            HISTORY_LAYER_FALLBACK_NAME;

        for (const [index, toolCall] of part.payload.calls.entries()) {
            const layerResponse = await this.getUserChatMessageLayer(
                messageId,
                part.part_seq,
                toolCall.step ?? index + 1,
            );
            const layer = extractLayerFromUnknown(layerResponse, fallbackName);

            if (layer) return layer;
        }

        return undefined;
    }

    private async createChatMessagesFromUserChatMessages(
        userMessages: UserChatMessage[],
    ) {
        const messages: ChatMessage[] = [];
        const sortedUserMessages = userMessages
            .slice()
            .sort((left, right) => left.seq - right.seq);

        for (const userMessage of sortedUserMessages) {
            const textParts: string[] = [];
            const messageType = userMessage.role === "user" ? "request" : "response";
            const flushText = () => {
                const text = textParts.join("\n\n").trim();
                textParts.length = 0;

                if (!text) return;

                messages.push({
                    type: messageType,
                    message: {
                        type: "text",
                        text,
                    },
                });
            };
            const sortedParts = (Array.isArray(userMessage.parts) ? userMessage.parts : [])
                .slice()
                .sort((left, right) => left.part_seq - right.part_seq);

            for (const part of sortedParts) {
                const directLayer = userMessage.role === "assistant"
                    ? (
                        extractLayerFromUnknown(
                            part.payload,
                            getLayerName(part.payload) ?? HISTORY_LAYER_FALLBACK_NAME,
                        ) ??
                        (part.kind === "file"
                            ? extractGeoJsonFileLayer(
                                part.payload,
                                getLayerName(part.payload) ?? HISTORY_LAYER_FALLBACK_NAME,
                            )
                            : undefined)
                    )
                    : undefined;

                if (directLayer) {
                    flushText();
                    messages.push({
                        type: "response",
                        message: {
                            type: "geojson",
                            name: directLayer.name,
                            layer: directLayer.layer,
                        },
                    });
                    continue;
                }

                const text = extractTextFromPayload(part.payload);
                if (text && !isStatusPart(part)) {
                    textParts.push(text);
                }

                if (userMessage.role !== "assistant" || part.kind !== "tool_call") {
                    continue;
                }

                const layer = await this.getLayerForUserChatPart(userMessage.message_id, part);
                if (!layer) continue;

                flushText();
                messages.push({
                    type: "response",
                    message: {
                        type: "geojson",
                        name: layer.name,
                        layer: layer.layer,
                    },
                });
            }

            flushText();
        }

        return messages;
    }

    openUserChat = async (chatId: string) => {
        this.abortStream();
        this.currentStreamRequestId += 1;
        const requestId = this.currentStreamRequestId;
        const chat = this.userChats.find((userChat) => userChat.chat_id === chatId);

        this.currentStreamContext = undefined;
        this.streamedResponse = "";
        this.isStreaming = false;
        this.currentStatus = undefined;
        this.activeChatId = chatId;
        this.isUserChatOpening = true;
        this.chatMessages = [];
        this.pzzSetupFiles.clear();
        this.vriSetupFiles.clear();
        this.genBuilderSetupFiles.clear();
        this.genBuilderResults.clear();
        this.applyUserChatContext(chat);
        MapStore.clearMapLayers();

        try {
            const userMessages = await this.getUserChatMessages(chatId);
            const chatMessages = await this.createChatMessagesFromUserChatMessages(userMessages);

            if (chat && chat.scenario_id) {
                const chatContext = await DataStore.getProjectScenarioName(chat.scenario_id);
                runInAction(() => {
                    this.parsedContext = chatContext;
                });
            }

            runInAction(() => {
                if (this.activeChatId !== chatId || this.currentStreamRequestId !== requestId) return;

                this.chatMessages = chatMessages;
                this.restoreMapLayersFromMessages(chatMessages);
            });

            if (chat && chat.scenario_id) {
                const projectId: number | null = await DataStore.getProjectIdByScenario(chat.scenario_id);
                if (projectId) {
                    runInAction(() => {
                        if (this.activeChatId !== chatId || this.currentStreamRequestId !== requestId) return;

                        this.selectedContext = projectId;
                        this.selectedScenario = chat.scenario_id;
                        void DataStore.getProjectScenarios(projectId);
                        this.currentStreamContext = this.createProjectBoundaryStreamContext(projectId);
                    });
                }
            }
        } finally {
            runInAction(() => {
                if (this.activeChatId === chatId && this.currentStreamRequestId === requestId) {
                    this.isUserChatOpening = false;
                }
            });
        }
    };

    private persistCurrentChatDisposer() {
        reaction(
            () => ({
                activeChatId: this.activeChatId,
                messages: this.chatMessages.slice(),
                selectedContext: this.selectedContext,
                selectedScenario: this.selectedScenario,
            }),
            ({ activeChatId, messages, selectedContext, selectedScenario }) => {
                if (typeof activeChatId !== "number" || !messages.length) return;

                this.chatMap.set(activeChatId, {
                    messages: [...messages],
                    selectedContext,
                    selectedScenario,
                });
            }
        )
    };

    private localStorageChateDisposer() {
        reaction(
            () => Array.from(this.chatMap.entries()),
            (chatEntries) => {
                void chatEntries;
                // localStorage.setItem("chatStory", JSON.stringify(chatEntries));
            },
        )
    };

    constructor() {
        makeAutoObservable(this, {}, { autoBind: true });

        // this.getChatStory();
        this.persistCurrentChatDisposer();
        // this.localStorageChateDisposer();
    }
}

const ChatStore = new ChatDataStore();

export default ChatStore;
