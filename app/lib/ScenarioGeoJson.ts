import type { Geometry, MultiPolygon, Polygon } from "geojson";

export type FunctionalZoneGeometry = Polygon | MultiPolygon;
export type ScenarioGeoJsonKind = "functionalZones" | "roads";
export type ScenarioImportedGeometry = {
    geometry: Geometry;
    properties: Record<string, unknown>;
};

const GEOMETRY_TYPES = new Set([
    "Point",
    "MultiPoint",
    "LineString",
    "MultiLineString",
    "Polygon",
    "MultiPolygon",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectGeometries(
    value: unknown,
    geometries: ScenarioImportedGeometry[],
    properties: Record<string, unknown> = {},
) {
    if (!isRecord(value) || typeof value.type !== "string") {
        throw new Error("GeoJSON содержит некорректный объект.");
    }

    if (value.type === "Feature") {
        if (value.geometry === null || value.geometry === undefined) {
            throw new Error("GeoJSON содержит объект без геометрии.");
        }

        collectGeometries(
            value.geometry,
            geometries,
            isRecord(value.properties) ? value.properties : {},
        );
        return;
    }

    if (value.type === "FeatureCollection") {
        if (!Array.isArray(value.features)) {
            throw new Error("GeoJSON FeatureCollection не содержит список объектов.");
        }

        value.features.forEach((feature) => collectGeometries(feature, geometries));
        return;
    }

    if (value.type === "GeometryCollection") {
        if (!Array.isArray(value.geometries)) {
            throw new Error("GeoJSON GeometryCollection не содержит геометрии.");
        }

        value.geometries.forEach((geometry) => collectGeometries(geometry, geometries, properties));
        return;
    }

    if (!GEOMETRY_TYPES.has(value.type) || !("coordinates" in value)) {
        throw new Error("GeoJSON содержит неподдерживаемую геометрию.");
    }

    geometries.push({
        geometry: value as unknown as Geometry,
        properties,
    });
}

export function isGeoJsonFile(file: File) {
    return file.name.toLowerCase().endsWith(".geojson");
}

export function parseScenarioGeoJson(
    source: string,
    kind: ScenarioGeoJsonKind,
): ScenarioImportedGeometry[] {
    let parsed: unknown;

    try {
        parsed = JSON.parse(source);
    } catch {
        throw new Error("Файл не является корректным JSON.");
    }

    const geometries: ScenarioImportedGeometry[] = [];
    collectGeometries(parsed, geometries);

    if (!geometries.length) {
        throw new Error("GeoJSON не содержит геометрий.");
    }

    if (
        kind === "functionalZones" &&
        geometries.some(({ geometry }) => (
            geometry.type !== "Polygon" && geometry.type !== "MultiPolygon"
        ))
    ) {
        throw new Error("Файл функциональных зон должен содержать только Polygon или MultiPolygon.");
    }

    if (
        kind === "roads" &&
        geometries.some(({ geometry }) => (
            geometry.type !== "LineString" && geometry.type !== "MultiLineString"
        ))
    ) {
        throw new Error("Файл дорожной сети должен содержать только LineString или MultiLineString.");
    }

    return geometries;
}

export function formatScenarioGeoJson(source: string) {
    try {
        return JSON.stringify(JSON.parse(source), null, 2);
    } catch {
        throw new Error("Файл не является корректным JSON.");
    }
}

export async function readScenarioGeoJsonFile(
    file: File,
    kind: ScenarioGeoJsonKind,
) {
    if (!isGeoJsonFile(file)) {
        throw new Error("Можно загрузить только файл с расширением .geojson.");
    }

    const source = formatScenarioGeoJson(await file.text());

    return {
        source,
        features: parseScenarioGeoJson(source, kind),
    };
}
