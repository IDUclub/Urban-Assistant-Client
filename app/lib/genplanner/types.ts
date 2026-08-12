export type GenPlannerResult = {
    zones: unknown;
    roads: unknown;
};

export type GenPlannerCustomSetupStatus =
    | "awaiting_file"
    | "ready"
    | "submitting"
    | "running"
    | "error";

export type GenPlannerCustomSetupMessage = {
    type: "genplanner_custom_setup";
    id: string;
    status: GenPlannerCustomSetupStatus;
    territoryFileName?: string;
    backendChatId?: string;
    errorText?: string;
};

export type GenPlannerSaveStatus = "pending" | "saving" | "saved" | "declined" | "error";

export type SaveGeneratedPlanResult = {
    zoneTotalCount: number;
    zoneSavedCount: number;
    zoneFailedCount: number;
    roadTotalCount: number;
    roadSavedCount: number;
    roadFailedCount: number;
    skippedCount: number;
    errors: string[];
};

export type GenPlannerSavePromptMessage = {
    type: "genplanner_save_prompt";
    id: string;
    resultId: string;
    projectId: number;
    scenarioId: number;
    status: GenPlannerSaveStatus;
    result?: SaveGeneratedPlanResult;
    errorText?: string;
};
