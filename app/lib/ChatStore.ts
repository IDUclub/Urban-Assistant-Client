import axios from "axios";
import { action, makeAutoObservable, reaction } from "mobx";
import AuthStore from "@lib/AuthStore";
import MapStore from "@lib/MapStore";

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
    selectedScenario?: number;
    selectedStage: string;
};

class ChatDataStore {
    selectedContext: string | number = "nonproject";
    selectedScenario?: number;
    selectedStage: string = "Общее";
    streamedResponse: string = "";
    isStreaming: boolean = false;
    chatMessages: ChatMessage[] = [];
    currentStatus?: string;
    activeChatId?: number;

    chatMap: Map<number, ChatSession> = new Map();

    abortController?: AbortController;

    get chatStoryPreview() {
        return Array.from(this.chatMap.entries())
            .filter(([, chat]) => chat.messages.length > 0)
            .map(([id, chat]) => {
                const firstTextMessage = chat.messages.find(
                    (message) => message.message.type === "text" && message.message.text.trim()
                );

                return {
                    id,
                    name: firstTextMessage?.message.type === "text"
                        ? firstTextMessage.message.text
                        : `Чат ${id + 1}`,
                };
            })
            .reverse();
    }

    setSelectedContext(value: string | number) {
        this.selectedContext = value;
    }

    setSelectedScenario(scenarioId?: number) {
        this.selectedScenario = scenarioId;
    }

    setSelectedStage(stage: string) {
        this.selectedStage = stage;
    }

    clearChat() {
        this.abortStream();
        this.chatMessages = [];
        this.isStreaming = false;
        this.selectedContext = "nonproject";
        this.selectedScenario = undefined;
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

    private appendStreamChunk = action((payload: string) => {
        const trimmedPayload = payload.trim();
        if (!trimmedPayload || trimmedPayload === "[DONE]") return;

        try {
            const parsed = JSON.parse(trimmedPayload);
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

    private getChatStory() {
        const chatStory = localStorage.getItem("chatStory");

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

    deleteChat(id: number) {
        this.chatMap.delete(id);

        if (id === this.activeChatId) this.clearChat();
    }

    loadChat(id: number) {
        const chat = this.getChat(id);
        if (!chat) return;

        this.abortStream();
        this.streamedResponse = "";
        this.isStreaming = false;
        this.currentStatus = undefined;
        this.activeChatId = id;
        this.chatMessages = [...chat.messages];
        this.selectedContext = chat.selectedContext;
        this.selectedScenario = chat.selectedScenario;
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
    };

    sendChatMessage = async (message: string) => {
        this.abortController?.abort();
        this.abortController = new AbortController();
        this.streamedResponse = "";
        this.isStreaming = true;
        this.currentStatus = undefined;
        if (this.activeChatId === undefined) {
            this.addChat();
        }
        MapStore.clearMapLayers();
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
            .finally(this.resetStreamingState);
        }
        
        else {
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
                        scenario_id: this.selectedScenario ?? 772,
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
            }).finally(this.resetStreamingState);
        }

        this.streamedResponse = "";
        this.isStreaming = false;
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
                if (activeChatId === undefined || !messages.length) return;

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
                localStorage.setItem("chatStory", JSON.stringify(chatEntries));
            },
        )
    };

    constructor() {
        makeAutoObservable(this);

        this.getChatStory();
        this.persistCurrentChatDisposer();
        this.localStorageChateDisposer();
    }
}

const ChatStore = new ChatDataStore();

export default ChatStore;
