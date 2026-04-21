import axios from "axios";
import { action, makeAutoObservable } from "mobx";
import AuthStore from "@lib/AuthStore";

type TextMessage = {
    type: "text";
    text: string;
};

type GeoJSONMessage = {
    type: "geojson";
    name: string;
    layer: any;
};

class ChatDataStore {
    selectedContext: string | number = "nonproject";
    selectedScenario?: number;
    selectedStage: string = "Общее";
    streamedResponse: string = "";
    isStreaming: boolean = false;
    chatMessages: {type: "request" | "response", message: TextMessage | GeoJSONMessage}[] = [];
    currentStatus?: string;

    abortController?: AbortController;


    setSelectedContext(value: string | number) {
        this.selectedContext = value;
    }

    setSelectedScenario(scenarioId: number) {
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
            console.log(parsed)
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
                return;
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

    sendChatMessage = async (message: string) => {
        this.abortController?.abort();
        this.abortController = new AbortController();
        this.streamedResponse = "";
        this.isStreaming = true;
        this.currentStatus = undefined;
        this.chatMessages.push({type: "request", message: { type: "text", text: message}})
        
        if (this.selectedContext === "nonproject") {
            return axios.post(
                `${import.meta.env.VITE_LLM_API}/stream/generate`,
                {
                    index_name: this.selectedStage,
                    user_request: message,
                },
                {
                    headers: {
                        "Accept": "text/event-stream",
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

    constructor() {
        makeAutoObservable(this);
    }
}

const ChatStore = new ChatDataStore();

export default ChatStore;
