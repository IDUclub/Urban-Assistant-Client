export type FunctionalZoneSource = {
    year: number;
    source: string;
};

export type GenBuilderSetupMode = "scenario" | "files";

export type GenBuilderSetupStatus =
    | "loading"
    | "validating_file"
    | "ready"
    | "awaiting_parameters"
    | "submitting"
    | "running"
    | "finished"
    | "error";

export type GenBuilderSaveStatus = "pending" | "saving" | "saved" | "declined" | "error";

export type SaveGeneratedBuildingsResult = {
    totalCount: number;
    savedCount: number;
    failedCount: number;
    skippedCount: number;
    errors: string[];
};

export type GenBuilderSetupMessage = {
    type: "genbuilder_setup";
    id: string;
    mode: GenBuilderSetupMode;
    projectId?: number;
    scenarioId?: number;
    sources: FunctionalZoneSource[];
    status: GenBuilderSetupStatus;
    selectedYear?: number;
    selectedSource?: string;
    blocksFileName?: string;
    backendChatId?: string;
    errorText?: string;
    savePromptId?: string;
};

export type GenBuilderSavePromptMessage = {
    type: "genbuilder_save_prompt";
    id: string;
    setupId: string;
    status: GenBuilderSaveStatus;
    result?: SaveGeneratedBuildingsResult;
    errorText?: string;
};
