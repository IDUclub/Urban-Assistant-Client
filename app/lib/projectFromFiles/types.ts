export const PROJECT_FILE_ROLES = ["project", "context", "border"] as const;

export type ProjectFileRole = typeof PROJECT_FILE_ROLES[number];

export type ProjectFileLayer = {
    name: string;
    role: ProjectFileRole;
    role_source: "auto" | "user";
    feature_count: number;
    geometry_types: string[];
    warnings: string[];
};

export type ProjectFilesUpload = {
    upload_id: string;
    created_at: string;
    expires_at: string;
    files: string[];
    layers: ProjectFileLayer[];
};

export type ProjectClarificationOption = {
    value: string | number | null;
    label: string;
    number?: number;
    entity_type?: string;
    confidence?: number;
    count?: number;
    layers?: string[];
};

export type ProjectClarification = {
    question: string;
    kind?: "reuse_files" | "entity_mapping" | "region" | "profile" | "existing_objects" | "retry";
    options?: ProjectClarificationOption[];
};

export type ProjectFileMappingProposal = {
    signature: string;
    label: string;
    count: number;
    layers: string[];
    roles: Partial<Record<ProjectFileRole, number>>;
    entity: string | null;
    entity_type: "physical_object" | "service" | "functional_zone" | null;
    confidence: number;
    source: "table" | "llm" | "user" | "none";
    reason: string | null;
};

export type ProjectUserFiles = {
    uploadIds: string[];
    mapping: ProjectFileMappingProposal[];
    pending: string[];
};

export type ProjectFromFilesSetupStatus =
    | "selecting_files"
    | "uploading"
    | "ready"
    | "updating_role"
    | "creating"
    | "clarification"
    | "success"
    | "stayed"
    | "error";

export type ProjectFromFilesSetupMessage = {
    type: "project_from_files_setup";
    id: string;
    status: ProjectFromFilesSetupStatus;
    fileNames: string[];
    upload?: ProjectFilesUpload;
    userFiles?: ProjectUserFiles;
    clarification?: ProjectClarification;
    backendChatId?: string;
    pipelineRequestId?: string;
    projectId?: number;
    scenarioId?: number;
    projectName?: string;
    scenarioName?: string;
    summary?: Record<string, unknown>;
    resultText?: string;
    errorText?: string;
};

export type ProjectFromFilesRequest = {
    request: string;
    upload_ids?: string[];
    chat_id?: string;
    request_id?: string;
    inputs?: {
        project_name?: string;
        scenario_name?: string;
        territory_id?: number;
        functional_zone_type_id?: number;
        existing_objects?: "replace_same" | "delete_all" | "keep";
    };
};

export type ProjectFromFilesStreamEvent = {
    type: string;
    content: Record<string, unknown>;
};
