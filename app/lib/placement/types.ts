import type { FunctionalZoneSource } from "../genbuilder/types";

export const PLACEMENT_CLASSES = [
    ["A", "#15803d", "Подходит"],
    ["A*", "#86c98a", "Подходит, объект уже есть"],
    ["B", "#eab308", "Подходит с ограничением"],
    ["B*", "#f5df88", "С ограничением, объект уже есть"],
    ["C", "#dc4848", "Не подходит"],
    ["D", "#9ca3af", "Нет описания зоны"],
] as const;

export type PlacementFileKey = "zones" | "descriptions" | "cadastre" | "objects";

export const PLACEMENT_FILE_FIELDS: Record<PlacementFileKey, string> = {
    zones: "pzz_zones_feature_collection_file",
    descriptions: "pzz_descriptions_file",
    cadastre: "cadastral_feature_collection_file",
    objects: "existing_objects_feature_collection_file",
};

export type PlacementSetup = {
    type: "placement_setup";
    id: string;
    request: string;
    scenarioId?: number;
    projectId?: number;
    sources: FunctionalZoneSource[];
    year?: number;
    source?: string;
    status: "loading" | "ready" | "running" | "queued" | "waiting_capacity" | "finished" | "error";
    step: PlacementFileKey | "complete";
    fileNames: Partial<Record<PlacementFileKey, string>>;
    errorText?: string;
    taskId?: string;
    retry?: boolean;
};

export type PlacementSummaryMessage = {
    type: "placement_summary";
    taskId?: string;
    summary: {
        service_name?: string;
        vri_code?: string;
        vri_name?: string;
        classes?: Record<string, { zones: number; ha: number }>;
        zones_total?: number;
        best_zones?: { code: string; name: string; ha: number; limits?: string }[];
        regulations?: { source?: string; document?: string; version?: string };
        notes?: string[];
        norms?: {
            requirement: string;
            document?: string;
            clause?: string;
            status?: string;
            note?: string;
        }[];
        cadastre_used?: boolean;
        scenario_objects_used?: boolean;
        existing_objects_count?: number;
        existing_objects_source?: string;
    };
};

export function parsePlacementSummary(value: unknown): PlacementSummaryMessage | undefined {
    if (!value || typeof value !== "object") {
        return;
    }

    const outer = value as Record<string, unknown>;
    const payload = (
        outer.content && typeof outer.content === "object" ? outer.content : outer
    ) as Record<string, unknown>;

    const summary = payload.summary;
    if (!summary || typeof summary !== "object") {
        return;
    }

    const classes = (summary as Record<string, unknown>).classes;
    if (!classes || typeof classes !== "object" || Array.isArray(classes)) {
        return;
    }

    const isPlacement =
        payload.mode === "placement" ||
        outer.type === "placement_summary" ||
        payload.type === "placement_summary" ||
        PLACEMENT_CLASSES.some(([code]) => code in classes);

    if (!isPlacement) {
        return;
    }

    return {
        type: "placement_summary",
        taskId: typeof payload.task_external_id === "string" ? payload.task_external_id : undefined,
        summary: summary as PlacementSummaryMessage["summary"],
    };
}
