import axios from "axios";
import { makeAutoObservable, runInAction } from "mobx";
import AuthStore from "@lib/AuthStore";

export type UserDocument = {
    id: string;
    name: string;
    version: string;
    territoryId: number | null;
    territoryName: string | null;
    uploadedAt: string | null;
};

export type UploadUserDocumentPayload = {
    file: File;
    projectId: number;
    name?: string;
    version?: string;
    territoryId?: number | null;
};

export type UploadUserDocumentResponse = {
    job_id: string;
    status: string;
};

type UploadJobState = "uploading" | "completed" | "failed";

type UploadJobStatusResponse = UploadUserDocumentResponse & {
    filename?: string | null;
    stage?: string | null;
    stage_index?: number | null;
    stage_total?: number | null;
    phase?: string | null;
    progress?: number | null;
    progress_total?: number | null;
    task_progress?: number | null;
    overall_progress?: number | null;
    name?: string | null;
    error?: string | null;
};

export type DocumentUploadJob = {
    jobId: string;
    projectId: number;
    title: string;
    status: string;
    statusMessage: string;
    progress: number;
    state: UploadJobState;
    startedAt: number;
};

const UPLOAD_JOB_POLL_INTERVAL_MS = 7_000;
const FINISHED_JOB_VISIBILITY_MS = 20_000;
const COMPLETED_UPLOAD_STATUSES = new Set([
    "complete",
    "completed",
    "done",
    "finished",
    "indexed",
    "ready",
    "success",
    "succeeded",
]);
const FAILED_UPLOAD_STATUSES = new Set([
    "cancelled",
    "canceled",
    "error",
    "failed",
]);

const STATUS_LABELS: Record<string, string> = {
    accepted: "Принято в обработку",
    pending: "Ожидает обработки",
    queued: "В очереди",
    running: "Обработка",
    processing: "Обработка",
    in_progress: "Обработка",
    loading: "Загрузка файла",
    uploading: "Загрузка файла",
    extracting: "Извлечение текста",
    parsing: "Обработка содержимого",
    chunking: "Разбиение документа",
    embedding: "Индексация",
    indexing: "Индексация",
    saving: "Сохранение",
    complete: "Завершено",
    completed: "Завершено",
    done: "Завершено",
    finished: "Завершено",
    indexed: "Завершено",
    ready: "Завершено",
    success: "Завершено",
    succeeded: "Завершено",
    cancelled: "Отменено",
    canceled: "Отменено",
    error: "Ошибка",
    failed: "Ошибка",
};

function normalizeJobStatus(value: unknown) {
    return typeof value === "string"
        ? value.trim().toLowerCase().replace(/[\s-]+/g, "_")
        : "";
}

function getUploadJobState(status: string, error?: string | null): UploadJobState {
    if (error || FAILED_UPLOAD_STATUSES.has(status)) return "failed";
    if (COMPLETED_UPLOAD_STATUSES.has(status)) return "completed";
    return "uploading";
}

function getUploadJobProgress(
    snapshot: UploadJobStatusResponse,
    state: UploadJobState,
) {
    if (state === "completed") return 100;

    const toFiniteNumber = (value: unknown) => {
        if (value === null || value === undefined || value === "") return null;
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    };
    const overallProgress = toFiniteNumber(snapshot.overall_progress);
    if (overallProgress !== null) {
        return Math.round(Math.min(100, Math.max(0, overallProgress)));
    }

    const progress = toFiniteNumber(snapshot.progress);
    const progressTotal = toFiniteNumber(snapshot.progress_total);
    if (progress !== null && progressTotal !== null && progressTotal > 0) {
        return Math.round(Math.min(100, Math.max(0, progress / progressTotal * 100)));
    }

    const taskProgress = toFiniteNumber(snapshot.task_progress);
    return taskProgress !== null
        ? Math.round(Math.min(100, Math.max(0, taskProgress)))
        : 0;
}

function getUploadJobStatusMessage(
    snapshot: UploadJobStatusResponse,
    status: string,
    state: UploadJobState,
) {
    if (state === "failed" && snapshot.error?.trim()) return snapshot.error.trim();

    const detailedStatus = normalizeJobStatus(snapshot.phase ?? snapshot.stage);
    return STATUS_LABELS[detailedStatus]
        ?? STATUS_LABELS[status]
        ?? snapshot.phase?.trim()
        ?? snapshot.stage?.trim()
        ?? snapshot.status?.trim()
        ?? "Обработка";
}

export type UpdateUserDocumentPayload = Omit<UploadUserDocumentPayload, "name"> & {
    originalDocumentName: string;
    title: string;
};

export type DeleteUserDocumentPayload = {
    projectId: number;
    documentName: string;
};

function getAuthorizationHeaders() {
    return AuthStore.accessToken
        ? { Authorization: `Bearer ${AuthStore.accessToken}` }
        : {};
}

function normalizeDocument(document: any, index: number): UserDocument {
    const territoryId = document?.territory_id == null || document.territory_id === ""
        ? NaN
        : Number(document.territory_id);

    return {
        id: String(document?.doc_id ?? document?.id ?? `${document?.name ?? "document"}-${index}`),
        name: typeof document?.name === "string" && document.name.trim()
            ? document.name
            : "Без названия",
        version: typeof document?.version === "string"
            ? document.version.trim()
            : String(document?.version ?? ""),
        territoryId: Number.isFinite(territoryId) ? territoryId : null,
        territoryName: typeof document?.territory_name === "string" && document.territory_name.trim()
            ? document.territory_name.trim()
            : null,
        uploadedAt: typeof document?.uploaded_at === "string" && document.uploaded_at.trim()
            ? document.uploaded_at
            : null,
    };
}

export function getDocumentsRequestErrorMessage(
    error: unknown,
    fallback = "Не удалось выполнить запрос. Попробуйте ещё раз.",
) {
    if (!axios.isAxiosError(error)) return fallback;

    const detail = error.response?.data?.detail;

    if (typeof detail === "string" && detail.trim()) return detail;

    if (Array.isArray(detail)) {
        const messages = detail.flatMap((item) => (
            typeof item?.msg === "string" && item.msg.trim()
                ? [item.msg]
                : []
        ));

        if (messages.length) return messages.join(". ");
    }

    if (error.response?.status === 401 || error.response?.status === 403) {
        return "Недостаточно прав для работы с документами. Обновите страницу и войдите снова.";
    }

    return fallback;
}

class AppDocumentsStore {
    documentsByProject = new Map<number, UserDocument[]>();
    documentCounts = new Map<number, number>();
    loadingProjects = new Set<number>();
    errorsByProject = new Map<number, string>();
    uploadJobs = new Map<string, DocumentUploadJob>();
    private projectRequests = new Map<number, Promise<UserDocument[]>>();
    private uploadPollTimer: ReturnType<typeof setTimeout> | null = null;
    private isPollingUploadJobs = false;

    constructor() {
        makeAutoObservable(this, {}, { autoBind: true });
    }

    get activeUploadCount() {
        return Array.from(this.uploadJobs.values()).filter(
            (job) => job.state === "uploading",
        ).length;
    }

    get trackedUploadJobs() {
        return Array.from(this.uploadJobs.values()).sort(
            (left, right) => right.startedAt - left.startedAt,
        );
    }

    async getProjectDocuments(
        projectId: number,
        force = false,
    ): Promise<UserDocument[]> {
        if (!force && this.documentsByProject.has(projectId)) {
            return this.documentsByProject.get(projectId) ?? [];
        }

        const currentRequest = this.projectRequests.get(projectId);
        if (currentRequest) return currentRequest;

        runInAction(() => {
            this.loadingProjects.add(projectId);
            this.errorsByProject.delete(projectId);
        });

        const request = (async () => {
            try {
                await AuthStore.refreshTokenIfNeeded();

                const { data } = await axios.get(
                    `${import.meta.env.VITE_DOCUMENTS_API}/user-documents`,
                    {
                        headers: getAuthorizationHeaders(),
                        params: { project_id: String(projectId) },
                    },
                );
                const rawDocuments = Array.isArray(data?.documents)
                    ? data.documents
                    : Array.isArray(data)
                        ? data
                        : [];
                const documents = rawDocuments.map(normalizeDocument);
                const responseCount = Number(data?.count);
                const count = Number.isFinite(responseCount)
                    ? responseCount
                    : documents.length;

                runInAction(() => {
                    this.documentsByProject.set(projectId, documents);
                    this.documentCounts.set(projectId, count);
                });

                return documents;
            } catch (error) {
                runInAction(() => {
                    this.errorsByProject.set(
                        projectId,
                        getDocumentsRequestErrorMessage(
                            error,
                            "Не удалось загрузить документы проекта.",
                        ),
                    );
                });
                throw error;
            }
        })();

        this.projectRequests.set(projectId, request);

        try {
            return await request;
        } finally {
            runInAction(() => {
                this.projectRequests.delete(projectId);
                this.loadingProjects.delete(projectId);
            });
        }
    }

    async uploadDocument(
        payload: UploadUserDocumentPayload,
    ): Promise<UploadUserDocumentResponse> {
        await AuthStore.refreshTokenIfNeeded();

        const formData = new FormData();
        formData.append("file", payload.file);
        formData.append("project_id", String(payload.projectId));

        if (payload.name?.trim()) formData.append("name", payload.name.trim());
        if (payload.version?.trim()) formData.append("version", payload.version.trim());
        if (payload.territoryId !== null && payload.territoryId !== undefined) {
            formData.append("territory_id", String(payload.territoryId));
        }

        const { data } = await axios.post(
            `${import.meta.env.VITE_DOCUMENTS_API}/user-documents`,
            formData,
            { headers: getAuthorizationHeaders() },
        );
        const response = data as UploadUserDocumentResponse;

        this.registerUploadJob({
            response,
            projectId: payload.projectId,
            title: payload.name?.trim() || payload.file.name,
        });

        return response;
    }

    async updateDocument(
        payload: UpdateUserDocumentPayload,
    ): Promise<UploadUserDocumentResponse> {
        await AuthStore.refreshTokenIfNeeded();

        const formData = new FormData();
        formData.append("file", payload.file);

        if (payload.title.trim()) formData.append("title", payload.title.trim());
        if (payload.version?.trim()) formData.append("version", payload.version.trim());
        if (payload.territoryId !== null && payload.territoryId !== undefined) {
            formData.append("territory_id", String(payload.territoryId));
        }

        const { data } = await axios.patch(
            `${import.meta.env.VITE_DOCUMENTS_API}/user-documents/${encodeURIComponent(payload.originalDocumentName)}`,
            formData,
            {
                headers: getAuthorizationHeaders(),
                params: { project_id: String(payload.projectId) },
            },
        );

        // Let any older list request finish before invalidating its cached result.
        await this.projectRequests.get(payload.projectId)?.catch(() => undefined);

        runInAction(() => {
            this.documentsByProject.delete(payload.projectId);
            this.documentCounts.delete(payload.projectId);
            this.errorsByProject.delete(payload.projectId);
        });

        return data as UploadUserDocumentResponse;
    }

    async deleteDocument(payload: DeleteUserDocumentPayload): Promise<void> {
        await AuthStore.refreshTokenIfNeeded();

        await axios.delete(
            `${import.meta.env.VITE_DOCUMENTS_API}/user-documents/${encodeURIComponent(payload.documentName)}`,
            {
                headers: getAuthorizationHeaders(),
                params: { project_id: String(payload.projectId) },
            },
        );

        // Prevent an older list response from restoring a document already deleted.
        await this.projectRequests.get(payload.projectId)?.catch(() => undefined);

        runInAction(() => {
            const documents = this.documentsByProject.get(payload.projectId);
            if (documents) {
                // Deleting by name without a version removes every version.
                const remaining = documents.filter((document) => document.name !== payload.documentName);
                const count = this.documentCounts.get(payload.projectId) ?? documents.length;
                this.documentsByProject.set(payload.projectId, remaining);
                this.documentCounts.set(
                    payload.projectId,
                    Math.max(0, count - (documents.length - remaining.length)),
                );
            }
            this.errorsByProject.delete(payload.projectId);
        });

        // A failed refresh must not turn a successful deletion into a deletion error.
        try {
            await this.getProjectDocuments(payload.projectId, true);
        } catch (error) {
            console.error("Error refreshing project documents after deletion:", error);
        }
    }

    private registerUploadJob({
        response,
        projectId,
        title,
    }: {
        response: UploadUserDocumentResponse;
        projectId: number;
        title: string;
    }) {
        const jobId = String(response.job_id ?? "").trim();
        if (!jobId) return;

        const status = normalizeJobStatus(response.status) || "queued";
        const state = getUploadJobState(status);

        this.uploadJobs.set(jobId, {
            jobId,
            projectId,
            title,
            status,
            statusMessage: STATUS_LABELS[status] ?? response.status ?? "В очереди",
            progress: state === "completed" ? 100 : 0,
            state,
            startedAt: Date.now(),
        });

        if (state === "uploading") {
            this.scheduleUploadJobPoll();
        } else {
            this.finishUploadJob(jobId, projectId, state);
        }
    }

    private scheduleUploadJobPoll() {
        if (this.uploadPollTimer || this.activeUploadCount === 0) return;

        this.uploadPollTimer = setTimeout(() => {
            this.uploadPollTimer = null;
            void this.pollUploadJobs();
        }, UPLOAD_JOB_POLL_INTERVAL_MS);
    }

    private async pollUploadJobs() {
        if (this.isPollingUploadJobs) return;

        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
            this.scheduleUploadJobPoll();
            return;
        }

        const activeJobs = this.trackedUploadJobs.filter(
            (job) => job.state === "uploading",
        );
        if (!activeJobs.length) return;

        this.isPollingUploadJobs = true;

        try {
            await Promise.all(activeJobs.map((job) => this.refreshUploadJob(job)));
        } finally {
            runInAction(() => {
                this.isPollingUploadJobs = false;
            });
            this.scheduleUploadJobPoll();
        }
    }

    private async refreshUploadJob(job: DocumentUploadJob) {
        try {
            await AuthStore.refreshTokenIfNeeded();
            const { data } = await axios.get<UploadJobStatusResponse>(
                `${import.meta.env.VITE_DOCUMENTS_API}/user-documents/jobs/${encodeURIComponent(job.jobId)}`,
                { headers: getAuthorizationHeaders() },
            );
            const status = normalizeJobStatus(data.status) || job.status;
            const state = getUploadJobState(status, data.error);
            const title = data.name?.trim() || data.filename?.trim() || job.title;

            runInAction(() => {
                this.uploadJobs.set(job.jobId, {
                    ...job,
                    title,
                    status,
                    statusMessage: getUploadJobStatusMessage(data, status, state),
                    progress: getUploadJobProgress(data, state),
                    state,
                });
            });

            if (state !== "uploading") {
                this.finishUploadJob(job.jobId, job.projectId, state);
            }
        } catch (error) {
            const isMissingJob = axios.isAxiosError(error)
                && (error.response?.status === 404 || error.response?.status === 410);

            runInAction(() => {
                this.uploadJobs.set(job.jobId, {
                    ...job,
                    statusMessage: isMissingJob
                        ? "Задание загрузки не найдено"
                        : "Не удалось получить статус. Повторяем запрос…",
                    state: isMissingJob ? "failed" : "uploading",
                });
            });

            if (isMissingJob) this.finishUploadJob(job.jobId, job.projectId, "failed");
        }
    }

    private finishUploadJob(
        jobId: string,
        projectId: number,
        state: Exclude<UploadJobState, "uploading">,
    ) {
        if (state === "completed") {
            void this.refreshProjectAfterUpload(projectId);
        }

        setTimeout(() => {
            runInAction(() => {
                this.uploadJobs.delete(jobId);
            });
        }, FINISHED_JOB_VISIBILITY_MS);
    }

    private async refreshProjectAfterUpload(projectId: number) {
        await this.projectRequests.get(projectId)?.catch(() => undefined);

        try {
            await this.getProjectDocuments(projectId, true);
        } catch (error) {
            console.error("Error refreshing project documents after upload:", error);
        }
    }
}

const DocumentsStore = new AppDocumentsStore();

export default DocumentsStore;
