import axios from "axios";
import type { SaveGeneratedBuildingsResult } from "@lib/genbuilder/types";
import { parseNumber } from "@lib/genbuilder/utils";

type GeoJsonGeometry = {
    type: string;
    coordinates?: unknown;
    geometries?: unknown[];
};

type GeoJsonFeature = {
    type: "Feature";
    geometry: GeoJsonGeometry;
    properties?: Record<string, unknown> | null;
};

type GeoJsonFeatureCollection = {
    type: "FeatureCollection";
    features: GeoJsonFeature[];
};

type SaveGeneratedBuildingsOptions = {
    baseUrl: string;
    accessToken: string;
    scenarioId: number;
    territoryId: number;
    layer: unknown;
    batchSize?: number;
};

const BUILDING_WITH_LIVING_AREA_TYPE_ID = 4;
const BUILDING_WITHOUT_LIVING_AREA_TYPE_ID = 5;

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function parseFeatureCollection(value: unknown): GeoJsonFeatureCollection | undefined {
    const parsedValue = typeof value === "string"
        ? (() => {
            try {
                return JSON.parse(value) as unknown;
            } catch {
                return undefined;
            }
        })()
        : value;
    const record = asRecord(parsedValue);

    if (record?.type !== "FeatureCollection" || !Array.isArray(record.features)) {
        return undefined;
    }

    return {
        type: "FeatureCollection",
        features: record.features.flatMap((feature): GeoJsonFeature[] => {
            const featureRecord = asRecord(feature);
            const geometry = asRecord(featureRecord?.geometry);

            if (
                featureRecord?.type !== "Feature" ||
                !geometry ||
                typeof geometry.type !== "string"
            ) {
                return [];
            }

            return [{
                type: "Feature",
                geometry: geometry as GeoJsonGeometry,
                properties: asRecord(featureRecord.properties) ?? null,
            }];
        }),
    };
}

function isGeneratedBuilding(feature: GeoJsonFeature) {
    const properties = feature.properties ?? {};
    const explicitGenerated = properties.is_generated ?? properties.generated;
    const hasBuildingGeometry = feature.geometry.type === "Polygon" ||
        feature.geometry.type === "MultiPolygon";

    if (!hasBuildingGeometry) {
        return false;
    }

    if (properties.is_excluded === true || properties.excluded === true) {
        return false;
    }

    if (explicitGenerated === false) {
        return false;
    }

    if (
        properties.physical_object_id !== undefined ||
        properties.object_geometry_id !== undefined ||
        properties.physical_objects !== undefined
    ) {
        return false;
    }

    if (explicitGenerated === true) {
        return true;
    }

    return (
        parseNumber(properties.floors_count) !== undefined ||
        parseNumber(properties.building_area) !== undefined ||
        parseNumber(properties.living_area) !== undefined
    );
}

function getErrorMessage(error: unknown) {
    if (!axios.isAxiosError(error)) {
        return error instanceof Error ? error.message : "Неизвестная ошибка";
    }

    const responseData = asRecord(error.response?.data);
    const detail = responseData?.detail;

    if (typeof detail === "string" && detail.trim()) {
        return detail;
    }

    if (typeof error.message === "string" && error.message.trim()) {
        return error.message;
    }

    return "Urban API вернул ошибку";
}

function getPhysicalObjectTypeId(properties: Record<string, unknown>) {
    const livingArea = parseNumber(properties.living_area) ?? 0;
    return livingArea > 0
        ? BUILDING_WITH_LIVING_AREA_TYPE_ID
        : BUILDING_WITHOUT_LIVING_AREA_TYPE_ID;
}

function getServiceRequests(value: unknown) {
    const values = Array.isArray(value) ? value : value ? [value] : [];

    return values.flatMap((item) => {
        const record = asRecord(item);
        if (!record) {
            return [];
        }

        return Object.entries(record).flatMap(([serviceType, capacity]) => {
            const serviceTypeId = parseNumber(serviceType);
            const serviceCapacity = parseNumber(capacity);

            if (serviceTypeId === undefined || serviceCapacity === undefined) {
                return [];
            }

            return [{
                serviceTypeId,
                capacity: serviceCapacity,
            }];
        });
    });
}

function getResponseObjectIds(value: unknown) {
    const response = asRecord(value);
    const physicalObject = asRecord(response?.physical_object);
    const objectGeometry = asRecord(response?.object_geometry);

    return {
        physicalObjectId: parseNumber(
            physicalObject?.physical_object_id ?? response?.physical_object_id,
        ),
        objectGeometryId: parseNumber(
            objectGeometry?.object_geometry_id ?? response?.object_geometry_id,
        ),
    };
}

async function saveBuildingFeature({
    baseUrl,
    accessToken,
    scenarioId,
    territoryId,
    feature,
}: Omit<SaveGeneratedBuildingsOptions, "layer" | "batchSize"> & {
    feature: GeoJsonFeature;
}) {
    const properties = feature.properties ?? {};
    const headers = { Authorization: `Bearer ${accessToken}` };
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    const physicalObjectTypeId = getPhysicalObjectTypeId(properties);
    const services = getServiceRequests(properties.service);
    const { data: physicalObjectResponse } = await axios.post(
        `${normalizedBaseUrl}/scenarios/${scenarioId}/physical_objects`,
        {
            geometry: feature.geometry,
            territory_id: territoryId,
            physical_object_type_id: physicalObjectTypeId,
            properties,
        },
        { headers },
    );
    const { physicalObjectId, objectGeometryId } = getResponseObjectIds(physicalObjectResponse);

    if (physicalObjectId === undefined) {
        throw new Error("Urban API не вернул physical_object_id");
    }

    const floors = parseNumber(properties.floors_count);
    await axios.post(
        `${normalizedBaseUrl}/scenarios/${scenarioId}/buildings`,
        {
            physical_object_id: physicalObjectId,
            is_scenario_object: true,
            ...(floors !== undefined ? { floors } : {}),
        },
        { headers },
    );

    if (!services.length || objectGeometryId === undefined) {
        return;
    }

    await Promise.all(services.map((service) => axios.post(
        `${normalizedBaseUrl}/scenarios/${scenarioId}/services`,
        {
            physical_object_id: physicalObjectId,
            is_scenario_physical_object: true,
            object_geometry_id: objectGeometryId,
            is_scenario_geometry: true,
            service_type_id: service.serviceTypeId,
            capacity: service.capacity,
        },
        { headers },
    )));
}

export async function saveGeneratedBuildings({
    baseUrl,
    accessToken,
    scenarioId,
    territoryId,
    layer,
    batchSize = 5,
}: SaveGeneratedBuildingsOptions): Promise<SaveGeneratedBuildingsResult> {
    const featureCollection = parseFeatureCollection(layer);
    if (!featureCollection) {
        throw new Error("Результат генерации не является GeoJSON FeatureCollection");
    }

    const generatedFeatures = featureCollection.features.filter(isGeneratedBuilding);
    const skippedCount = featureCollection.features.length - generatedFeatures.length;
    const errors: string[] = [];
    let savedCount = 0;
    const normalizedBatchSize = Math.max(1, Math.floor(batchSize));

    for (
        let startIndex = 0;
        startIndex < generatedFeatures.length;
        startIndex += normalizedBatchSize
    ) {
        const featureBatch = generatedFeatures.slice(
            startIndex,
            startIndex + normalizedBatchSize,
        );
        const batchResults = await Promise.allSettled(
            featureBatch.map((feature) => saveBuildingFeature({
                baseUrl,
                accessToken,
                scenarioId,
                territoryId,
                feature,
            })),
        );

        batchResults.forEach((result, index) => {
            if (result.status === "fulfilled") {
                savedCount += 1;
                return;
            }

            errors.push(
                `Объект ${startIndex + index + 1}: ${getErrorMessage(result.reason)}`,
            );
        });
    }

    return {
        totalCount: generatedFeatures.length,
        savedCount,
        failedCount: errors.length,
        skippedCount,
        errors,
    };
}
