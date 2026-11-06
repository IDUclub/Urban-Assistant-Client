import { readSseStream, type RawSseEvent } from "@lib/sse";
import type {
    ProjectFileRole,
    ProjectFilesUpload,
    ProjectFromFilesRequest,
    ProjectFromFilesStreamEvent,
} from "@lib/projectFromFiles/types";

const GMART_BASE_URL = (import.meta.env.VITE_GMART_API ?? "")
    .trim()
    .replace(/\/+$/, "");

function getGmartUrl(path: string) {
    if (!GMART_BASE_URL) {
        throw new Error("Не задан адрес сервиса gMART (VITE_GMART_API).");
    }
    return `${GMART_BASE_URL}${path}`;
}

export class GmartRequestError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "GmartRequestError";
        this.status = status;
    }
}

function getAuthorizationHeaders(accessToken?: string): Record<string, string> {
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

async function readErrorMessage(response: Response) {
    const fallback = `Сервис вернул ошибку ${response.status}.`;

    try {
        const payload = await response.json() as {
            message?: unknown;
            detail?: unknown;
        };

        if (typeof payload.message === "string" && payload.message.trim()) {
            return payload.message.trim();
        }
        if (typeof payload.detail === "string" && payload.detail.trim()) {
            return payload.detail.trim();
        }
        if (Array.isArray(payload.detail)) {
            const validationMessages = payload.detail.flatMap((item) => {
                if (!item || typeof item !== "object" || !("msg" in item)) return [];
                return typeof item.msg === "string" ? [item.msg] : [];
            });
            if (validationMessages.length) return validationMessages.join("\n");
        }
    } catch {
        return fallback;
    }

    return fallback;
}

async function ensureOk(response: Response) {
    if (response.ok) return response;
    throw new GmartRequestError(await readErrorMessage(response), response.status);
}

export async function uploadProjectFiles(
    files: readonly File[],
    accessToken?: string,
    chatId?: string,
    signal?: AbortSignal,
) {
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    if (chatId) formData.append("chat_id", chatId);

    const response = await fetch(getGmartUrl("/compliance/uploads"), {
        method: "POST",
        headers: getAuthorizationHeaders(accessToken),
        body: formData,
        signal,
    });

    await ensureOk(response);
    return await response.json() as ProjectFilesUpload;
}

export async function updateProjectFileLayerRole(
    uploadId: string,
    layerName: string,
    role: ProjectFileRole,
    accessToken?: string,
    signal?: AbortSignal,
) {
    const response = await fetch(
        getGmartUrl(`/compliance/uploads/${encodeURIComponent(uploadId)}`),
        {
            method: "PATCH",
            headers: {
                ...getAuthorizationHeaders(accessToken),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ roles: { [layerName]: role } }),
            signal,
        },
    );

    await ensureOk(response);
    return await response.json() as ProjectFilesUpload;
}

function normalizeStreamEvent({ eventName, data }: RawSseEvent): ProjectFromFilesStreamEvent | undefined {
    try {
        const payload: unknown = JSON.parse(data);
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;

        const record = payload as Record<string, unknown>;
        const content = record.content && typeof record.content === "object" && !Array.isArray(record.content)
            ? record.content as Record<string, unknown>
            : record;
        const type = typeof record.type === "string" && record.type.trim()
            ? record.type.trim()
            : eventName;

        if (!type) return;
        return { type, content };
    } catch {
        return;
    }
}

export async function streamProjectFromFiles(
    payload: ProjectFromFilesRequest,
    accessToken: string | undefined,
    signal: AbortSignal | undefined,
    onEvent: (event: ProjectFromFilesStreamEvent) => void,
) {
    const response = await fetch(getGmartUrl("/projects/from-files/stream"), {
        method: "POST",
        headers: {
            ...getAuthorizationHeaders(accessToken),
            Accept: "text/event-stream",
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal,
    });

    await ensureOk(response);
    if (!response.body) throw new Error("Сервис не вернул поток данных.");

    await readSseStream(response.body, (rawEvent) => {
        const event = normalizeStreamEvent(rawEvent);
        if (event) onEvent(event);
    });
}

export async function updateProjectPipelineToken(
    requestId: string,
    accessToken?: string,
) {
    const response = await fetch(
        getGmartUrl(`/pipelines/${encodeURIComponent(requestId)}/token`),
        {
            method: "POST",
            headers: getAuthorizationHeaders(accessToken),
        },
    );
    await ensureOk(response);
}

export async function cancelProjectPipeline(
    requestId: string,
    accessToken?: string,
) {
    const response = await fetch(
        getGmartUrl(`/pipelines/${encodeURIComponent(requestId)}/cancel`),
        {
            method: "POST",
            headers: getAuthorizationHeaders(accessToken),
        },
    );
    await ensureOk(response);
}
