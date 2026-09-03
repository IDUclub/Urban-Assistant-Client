export const GENPLANNER_ROAD_LEVEL_PROPERTY = "road_lvl";
export const GENPLANNER_ROAD_TYPE_PROPERTY = "physical_object_type_id";

export const GENPLANNER_ROAD_COLORS_BY_ID: Record<number, string> = {
    50: "#ec2525",
    51: "#3bb2d0",
    52: "#969696",
};

const GENPLANNER_ROAD_TYPE_IDS = new Set([50, 51, 52]);

const GENPLANNER_ROAD_TYPE_IDS_BY_LEVEL: Record<string, number> = {
    "regulated highway": 51,
    "local road": 52,
};

export function getGenPlannerRoadTypeId(value: unknown) {
    if (typeof value === "number") {
        return Number.isFinite(value) && GENPLANNER_ROAD_TYPE_IDS.has(value)
            ? value
            : undefined;
    }

    if (typeof value !== "string" || !value.trim()) {
        return undefined;
    }

    const normalizedValue = value.trim().toLowerCase();
    const numericValue = Number(normalizedValue);
    if (Number.isFinite(numericValue) && GENPLANNER_ROAD_TYPE_IDS.has(numericValue)) {
        return numericValue;
    }

    return GENPLANNER_ROAD_TYPE_IDS_BY_LEVEL[normalizedValue];
}
