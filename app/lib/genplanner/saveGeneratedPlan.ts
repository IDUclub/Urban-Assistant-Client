import axios from "axios";
import {
    FUNCTIONAL_ZONE_ID_PROPERTY,
    FUNCTIONAL_ZONE_NAME_PROPERTY,
    getFunctionalZoneId,
} from "@lib/functionalZones";
import {
    GENPLANNER_ROAD_TYPE_PROPERTY,
    getGenPlannerRoadTypeId,
} from "@lib/genplanner/roads";
import type { GenPlannerResult, SaveGeneratedPlanResult } from "@lib/genplanner/types";

type GeoJsonGeometry = {
    type: string;
    coordinates?: unknown;
    geometries?: unknown[];
};

type GeoJsonFeature = {
    geometry: GeoJsonGeometry;
    properties: Record<string, unknown>;
};

type SaveGeneratedPlanOptions = {
    baseUrl: string;
    accessToken: string;
    scenarioId: number;
    territoryId: number;
    result: GenPlannerResult;
};

type RoadRequest = {
    geometry: GeoJsonGeometry;
    territory_id: number;
    physical_object_type_id: number;
    properties: Record<string, unknown>;
};

const REQUEST_CHUNK_SIZE = 100;

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function asNumber(value: unknown) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : undefined;
    }

    if (typeof value !== "string" || !value.trim()) {
        return undefined;
    }

    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function parseFeatures(value: unknown): GeoJsonFeature[] | undefined {
    const collection = asRecord(value);
    if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
        return;
    }

    return collection.features.flatMap((feature): GeoJsonFeature[] => {
        const featureRecord = asRecord(feature);
        const geometry = asRecord(featureRecord?.geometry);
        if (featureRecord?.type !== "Feature" || typeof geometry?.type !== "string") {
            return [];
        }

        return [{
            geometry: geometry as GeoJsonGeometry,
            properties: asRecord(featureRecord.properties) ?? {},
        }];
    });
}

function getErrorMessage(error: unknown) {
    if (!axios.isAxiosError(error)) {
        return error instanceof Error ? error.message : "Неизвестная ошибка";
    }

    const data = asRecord(error.response?.data);
    const detail = data?.detail;
    if (typeof detail === "string" && detail.trim()) {
        return detail;
    }

    if (Array.isArray(detail)) {
        const firstDetail = asRecord(detail[0]);
        if (typeof firstDetail?.msg === "string" && firstDetail.msg.trim()) {
            return firstDetail.msg;
        }
    }

    return error.message || "Urban API вернул ошибку";
}

function getExistingRoads(value: unknown) {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((item) => {
        const road = asRecord(item);
        const id = asNumber(road?.physical_object_id);
        return id === undefined
            ? []
            : [{ id, isScenarioObject: road?.is_scenario_object !== false }];
    });
}

async function sendRequestsInChunks<T>(values: T[], request: (value: T) => Promise<unknown>) {
    const results: PromiseSettledResult<unknown>[] = [];

    for (let start = 0; start < values.length; start += REQUEST_CHUNK_SIZE) {
        const requestChunk = values.slice(start, start + REQUEST_CHUNK_SIZE);
        results.push(...await Promise.allSettled(requestChunk.map(request)));
    }

    return results;
}

export async function saveGeneratedPlan({
    baseUrl,
    accessToken,
    scenarioId,
    territoryId,
    result,
}: SaveGeneratedPlanOptions): Promise<SaveGeneratedPlanResult> {
    const zoneFeatures = parseFeatures(result.zones);
    const roadFeatures = parseFeatures(result.roads);
    if (!zoneFeatures || !roadFeatures) {
        throw new Error("Результат GenPlanner не содержит корректные GeoJSON-слои зон и дорог");
    }

    const zones = zoneFeatures.flatMap((feature) => {
        const zoneTypeId = getFunctionalZoneId(
            feature.properties[FUNCTIONAL_ZONE_ID_PROPERTY] ??
            feature.properties[FUNCTIONAL_ZONE_NAME_PROPERTY],
        );
        const isPolygon = feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon";

        return zoneTypeId !== undefined && isPolygon
            ? [{
                geometry: feature.geometry,
                functional_zone_type_id: zoneTypeId,
                year: new Date().getFullYear(),
                source: "User",
            }]
            : [];
    });
    const roads: RoadRequest[] = roadFeatures.flatMap((feature) => {
        const isLine = feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString";
        const roadTypeId = getGenPlannerRoadTypeId(
            feature.properties[GENPLANNER_ROAD_TYPE_PROPERTY],
        );

        return isLine && roadTypeId !== undefined
            ? [{
                geometry: feature.geometry,
                territory_id: territoryId,
                physical_object_type_id: roadTypeId,
                properties: {},
            }]
            : [];
    });

    if (!zones.length || !roads.length) {
        throw new Error(
            "Результат GenPlanner не содержит валидные полигоны зон и дороги с известными physical_object_type_id",
        );
    }

    const saveResult: SaveGeneratedPlanResult = {
        zoneTotalCount: zones.length,
        zoneSavedCount: 0,
        zoneFailedCount: 0,
        roadTotalCount: roads.length,
        roadSavedCount: 0,
        roadFailedCount: 0,
        skippedCount: zoneFeatures.length + roadFeatures.length - zones.length - roads.length,
        errors: [],
    };
    const apiUrlWithoutTrailingSlash = baseUrl.replace(/\/+$/, "");
    const headers = { Authorization: `Bearer ${accessToken}` };

    try {
        const { data: sources } = await axios.get(
            `${apiUrlWithoutTrailingSlash}/scenarios/${scenarioId}/functional_zone_sources`,
            { headers },
        );
        const shouldReplaceZones = Array.isArray(sources) && sources.some((source) => {
            const name = asRecord(source)?.source;
            return name === "PZZ" || name === "OSM";
        });

        if (zones.length && shouldReplaceZones) {
            await axios.delete(`${apiUrlWithoutTrailingSlash}/scenarios/${scenarioId}/functional_zones`, { headers });
        }

        if (zones.length) {
            await axios.post(
                `${apiUrlWithoutTrailingSlash}/scenarios/${scenarioId}/functional_zones`,
                zones,
                { headers },
            );
            saveResult.zoneSavedCount = zones.length;
        }
    } catch (error) {
        saveResult.zoneFailedCount = zones.length;
        saveResult.errors.push(`Функциональные зоны: ${getErrorMessage(error)}`);
    }

    try {
        const { data: currentRoads } = await axios.get(
            `${apiUrlWithoutTrailingSlash}/scenarios/${scenarioId}/physical_objects`,
            {
                headers,
                params: { physical_object_function_id: 26 },
            },
        );
        const deleteResults = await sendRequestsInChunks(
            getExistingRoads(currentRoads),
            ({ id, isScenarioObject }) => axios.delete(
                `${apiUrlWithoutTrailingSlash}/scenarios/${scenarioId}/physical_objects/${id}`,
                {
                    headers,
                    params: { is_scenario_object: isScenarioObject },
                },
            ),
        );
        const failedDelete = deleteResults.find((item) => item.status === "rejected");
        if (failedDelete?.status === "rejected") {
            throw new Error(`Не удалось удалить текущую дорожную сеть: ${getErrorMessage(failedDelete.reason)}`);
        }

        const roadResults = await sendRequestsInChunks(
            roads,
            (road) => axios.post(
                `${apiUrlWithoutTrailingSlash}/scenarios/${scenarioId}/physical_objects`,
                road,
                { headers },
            ),
        );
        roadResults.forEach((item) => {
            if (item.status === "fulfilled") {
                saveResult.roadSavedCount += 1;
            } else {
                saveResult.roadFailedCount += 1;
                saveResult.errors.push(`Дорожная сеть: ${getErrorMessage(item.reason)}`);
            }
        });
    } catch (error) {
        saveResult.roadFailedCount = roads.length;
        saveResult.errors.push(`Дорожная сеть: ${getErrorMessage(error)}`);
    }

    return saveResult;
}
