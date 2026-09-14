import { readSseStream } from "./sse.ts";

type Resume = { request_id?: string; after_event: number };
type Options = {
    open: (resume: Resume) => Promise<ReadableStream<Uint8Array>>;
    onEvent: (data: string) => void;
    onRequestId: (id: string) => void;
    onRecovering: () => void;
    signal: AbortSignal;
    retryDelay?: number;
};

export async function readDocumentStream(options: Options) {
    let requestId: string | undefined;
    let lastEvent = 0;
    let terminal = false;
    for (let attempt = 0; attempt < 3; attempt++) {
        options.signal.throwIfAborted();
        try {
            const stream = await options.open({ request_id: requestId, after_event: lastEvent });
            await readSseStream(stream, ({ data }) => {
                if (terminal) return;
                const event = JSON.parse(data);
                const sequence = event.event_id;
                if (Number.isInteger(sequence) && sequence <= lastEvent) return;
                if (event.type === "pipeline_started") {
                    requestId = event.content?.request_id;
                    if (requestId) options.onRequestId(requestId);
                }
                options.onEvent(data);
                if (Number.isInteger(sequence)) lastEvent = sequence;
                terminal = event.type === "error" ||
                    (event.type === "chunk" && event.content?.done === true);
            });
            if (terminal) return;
            throw new Error("Поток завершился до получения ответа.");
        } catch (error) {
            options.signal.throwIfAborted();
            const status = (error as { response?: { status?: number } })?.response?.status;
            if (!requestId || !lastEvent || attempt === 2 || (status && status >= 400 && status < 500)) {
                throw new Error("Соединение потеряно. Не удалось восстановить ответ; запрос не завершён.", { cause: error });
            }
            options.onRecovering();
            await new Promise<void>((resolve, reject) => {
                const abort = () => { clearTimeout(timer); reject(options.signal.reason); };
                const timer = setTimeout(() => {
                    options.signal.removeEventListener("abort", abort);
                    resolve();
                }, options.retryDelay ?? 500 * (attempt + 1));
                options.signal.addEventListener("abort", abort, { once: true });
            });
        }
    }
}
