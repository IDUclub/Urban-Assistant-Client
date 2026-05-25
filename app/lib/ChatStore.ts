import axios from "axios";
import { action, makeAutoObservable, reaction, runInAction } from "mobx";
import AuthStore from "@lib/AuthStore";
import DataStore from "@lib/DataStore";
import MapStore from "@lib/MapStore";

interface UserChat {
    chat_id: string;
    title: string;
    scenario_id: number | null;
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

type UserChatPart = TextPart | StatusPart | ToolCallPart;

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
            return undefined;
        }
    }

    if (typeof layer === "object") {
        return layer;
    }
};

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

function getTimestamp(value: unknown) {
    const timestamp = typeof value === "string" ? Date.parse(value) : NaN;

    return Number.isFinite(timestamp) ? timestamp : 0;
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

type ChatMessage = {
    type: "request" | "response";
    message: TextMessage | GeoJSONMessage | ErrorMessage;
};

type ChatSession = {
    messages: ChatMessage[];
    selectedContext: string | number;
    selectedScenario: number | null;
    selectedStage: string;
};

class ChatDataStore {
    selectedContext: string | number = "nonproject";
    selectedScenario: number | null = null;
    selectedStage: string = "Общее";
    parsedContext: string | null = null;

    streamedResponse: string = "";
    isStreaming: boolean = false;
    chatMessages: ChatMessage[] = [];
    currentStatus?: string;
    activeChatId?: string | number;
    currentStreamRequestId: number = 0;
    currentStreamContext?: StreamContext;
    userChats: UserChat[] = [];
    isUserChatsLoading = false;
    isUserChatOpening = false;

    chatMap: Map<number, ChatSession> = new Map();

    abortController?: AbortController;

    get chatStoryPreview() {
        return this.userChats
            .slice()
            .sort(
                (left, right) =>
                    getTimestamp(right.updated_at ?? right.created_at) -
                    getTimestamp(left.updated_at ?? left.created_at)
            )
            .map((chat, index) => ({
                id: chat.chat_id,
                name: chat.title?.trim() || `Чат ${this.userChats.length - index}`,
            }));
    }

    setSelectedContext(value: string | number) {
        this.selectedContext = value;
    }

    setSelectedScenario(scenarioId: number | null) {
        this.selectedScenario = scenarioId;
    }

    setSelectedStage(stage: string) {
        this.selectedStage = stage;
    }

    clearChat() {
        this.abortStream();
        this.currentStreamRequestId += 1;
        this.currentStreamContext = undefined;
        this.chatMessages = [];
        this.isStreaming = false;
        this.selectedContext = "nonproject";
        this.selectedScenario = null;
        this.selectedStage = "Общее";
        this.streamedResponse = "";
        this.currentStatus = undefined;
        this.activeChatId = undefined;

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
                selectedStage: this.selectedStage,
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

    private appendStreamChunk = action((payload: string) => {
        const trimmedPayload = payload.trim();
        if (!trimmedPayload || trimmedPayload === "[DONE]") return;

        try {
            const parsed = JSON.parse(trimmedPayload);
            if (this.handleServiceEvent(parsed)) return;

            if (parsed?.type === "status") {
                this.currentStatus = parsed.content?.text
                return;
            };

            if (parsed?.type === "feature_collection") {
                this.chatMessages.push({
                    type: "response",
                    message: {
                        type: "geojson",
                        name: parsed.content?.name,
                        layer: parsed.content?.feature_collection,
                    },
                });

                MapStore.addLayerToMap({
                    name: parsed.content?.name ?? "",
                    layer: parseFeatureCollection(
                        parsed.content?.feature_collection
                    ),
                });
                this.currentStreamContext = this.markStreamContextHasMapLayer(this.currentStreamContext);
                this.tryAddProjectBoundaryLayer(this.currentStreamContext);

                return;
            }

            if (parsed?.type === "error") {
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
        console.log("Trying to add project boundary layer with stream context", streamContext);
        console.log("Current stream context", this.currentStreamRequestId);
        if (
            !streamContext ||
            streamContext.requestId !== this.currentStreamRequestId
            // streamContext.hasAddedProjectBoundary ||
            // !streamContext.hasReceivedMapLayer ||
            // !streamContext.projectBoundaryLayer
        ) {
            return;
        }

        console.log("Adding project boundary layer with stream context", streamContext);

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

        console.log("Fetching project boundary for project", projectId);

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
                if (!boundaryLayer) return;

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
        MapStore.setMapLayers(lastResponseLayers);

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
                            selectedStage: "Общее",
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
        this.selectedStage = chat.selectedStage;

        const lastRequestIndex = chat.messages.findLastIndex(message => message.type === "request");
        const lastResponseLayers = chat.messages.flatMap((message, ind) => 
            ind > lastRequestIndex && message.type === "response" && message.message?.type === "geojson" ?
                {
                    name: message.message?.name,
                    layer: parseFeatureCollection(message.message.layer),
                } : []
        );

        MapStore.clearMapLayers();
        MapStore.setMapLayers(lastResponseLayers);

        if (typeof chat.selectedContext === "number") {
            this.restoreProjectBoundary(chat.selectedContext, lastResponseLayers.length > 0);
        }
    };

    sendChatMessage = async (message: string) => {
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
        if (typeof this.selectedContext === "number") {
            this.currentStreamContext = this.createProjectBoundaryStreamContext(this.selectedContext);
        }
        this.chatMessages.push({type: "request", message: { type: "text", text: message}})
        
        if (this.selectedContext === "nonproject") {
            return axios.get(
                `${import.meta.env.VITE_LLM_API}/stream/generate`,
                {
                    headers: {
                        "Accept": "text/event-stream",
                    },
                    params: {
                        index_name: this.selectedStage,
                        user_request: message,
                    },
                    responseType: "stream",
                    adapter: "fetch",
                    signal: this.abortController.signal,
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
        } else if (this.selectedContext !== "nonproject" && this.selectedScenario) {
            return axios.get(
                `${import.meta.env.VITE_LLM_RESTRICTIONS_API}/restrictions/generate_restrictions/stream`,
                {
                    headers: {
                        Accept: "text/event-stream",
                        Authorization: `Bearer ${AuthStore.accessToken}`,
                    },
                    responseType: "stream",
                    adapter: "fetch",
                    signal: this.abortController.signal,
                    params: {
                        model: "gpt-oss:20b",
                        scenario_id: this.selectedScenario,
                        request: message,
                    }
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

                    // if (buffer.trim()) {
                    //     const dataLines = buffer
                    //         .split("\n")
                    //         .filter((line) => line.startsWith("data:"))
                    //         .map((line) => line.slice(5).trimStart());

                    //     if (dataLines.length) {
                    //         this.appendStreamChunk(dataLines.join("\n"));
                    //     }
                    // }
                }
            ).catch((error) => {
                if (axios.isCancel(error) || error?.name === "AbortError" || error?.name === "CanceledError") {
                    this.commitStreamedResponse();
                    return;
                }
                console.error("Error streaming chat message:", error);
            }).finally(this.finalizeStreamingState);
        }

        this.streamedResponse = "";
        this.isStreaming = false;
    };

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
            this.selectedStage = "Общее";

            if (this.selectedScenario) {
                void DataStore.getProjectScenarios(projectId);
            }

            return;
        }

        this.selectedContext = "nonproject";
        this.selectedScenario = null;
        this.selectedStage =
            toString(metadata.selected_stage) ??
            toString(metadata.selectedStage) ??
            toString(metadata.index_name) ??
            toString(metadata.indexName) ??
            "Общее";
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
                    ? extractLayerFromUnknown(
                        part.payload,
                        getLayerName(part.payload) ?? HISTORY_LAYER_FALLBACK_NAME,
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
        this.applyUserChatContext(chat);
        MapStore.clearMapLayers();

        try {
            const userMessages = await this.getUserChatMessages(chatId);
            const chatMessages = await this.createChatMessagesFromUserChatMessages(userMessages);

            if (chat && chat.scenario_id) {
                const chatContext = await DataStore.getProjectScenarioName(chat.scenario_id);
                console.log("Fetched chat context:", chatContext);
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
                    this.currentStreamContext = this.createProjectBoundaryStreamContext(projectId);
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
                selectedStage: this.selectedStage,
            }),
            ({ activeChatId, messages, selectedContext, selectedScenario, selectedStage }) => {
                if (typeof activeChatId !== "number" || !messages.length) return;

                this.chatMap.set(activeChatId, {
                    messages: [...messages],
                    selectedContext,
                    selectedScenario,
                    selectedStage,
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
