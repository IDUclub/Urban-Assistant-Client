import type { MultiPolygon, Polygon, Position } from "geojson";

export type ProjectBoundaryGeometry = Polygon | MultiPolygon;

const INVALID_COORDINATES_MESSAGE =
    "GeoJSON содержит некорректные координаты полигона.";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function normalizePosition(value: unknown): Position | null {
    if (!Array.isArray(value) || value.length < 2) return null;

    const longitude = value[0];
    const latitude = value[1];

    if (
        typeof longitude !== "number"
        || typeof latitude !== "number"
        || !Number.isFinite(longitude)
        || !Number.isFinite(latitude)
        || longitude < -180
        || longitude > 180
        || latitude < -90
        || latitude > 90
    ) {
        return null;
    }

    return [longitude, latitude];
}

function positionsMatch(left: Position, right: Position) {
    return left[0] === right[0] && left[1] === right[1];
}

function normalizeLinearRing(value: unknown): Position[] | null {
    if (!Array.isArray(value)) return null;

    const positions = value.map(normalizePosition);

    if (positions.some((position) => position === null)) return null;

    const normalizedPositions = positions as Position[];
    const openRing = normalizedPositions.length > 1
        && positionsMatch(
            normalizedPositions[0],
            normalizedPositions[normalizedPositions.length - 1],
        )
        ? normalizedPositions.slice(0, -1)
        : normalizedPositions;
    const uniquePositions = new Set(
        openRing.map((position) => `${position[0]}:${position[1]}`),
    );

    if (openRing.length < 3 || uniquePositions.size < 3) return null;

    return [...openRing, [...openRing[0]]];
}

function normalizePolygonCoordinates(value: unknown): Position[][] | null {
    if (!Array.isArray(value) || !value.length) return null;

    const rings = value.map(normalizeLinearRing);

    return rings.some((ring) => ring === null)
        ? null
        : rings as Position[][];
}

function collectPolygonCoordinates(
    value: unknown,
    polygons: Position[][][],
): void {
    if (!isRecord(value)) return;

    switch (value.type) {
        case "Feature":
            collectPolygonCoordinates(value.geometry, polygons);
            return;
        case "FeatureCollection": {
            if (!Array.isArray(value.features)) {
                throw new Error("GeoJSON FeatureCollection не содержит список объектов.");
            }

            value.features.forEach((feature) => {
                collectPolygonCoordinates(feature, polygons);
            });
            return;
        }
        case "GeometryCollection": {
            if (!Array.isArray(value.geometries)) {
                throw new Error("GeoJSON GeometryCollection не содержит геометрии.");
            }

            value.geometries.forEach((geometry) => {
                collectPolygonCoordinates(geometry, polygons);
            });
            return;
        }
        case "Polygon": {
            const coordinates = normalizePolygonCoordinates(value.coordinates);

            if (!coordinates) throw new Error(INVALID_COORDINATES_MESSAGE);

            polygons.push(coordinates);
            return;
        }
        case "MultiPolygon": {
            if (!Array.isArray(value.coordinates) || !value.coordinates.length) {
                throw new Error(INVALID_COORDINATES_MESSAGE);
            }

            const coordinates = value.coordinates.map(normalizePolygonCoordinates);

            if (coordinates.some((polygon) => polygon === null)) {
                throw new Error(INVALID_COORDINATES_MESSAGE);
            }

            polygons.push(...coordinates as Position[][][]);
            return;
        }
        default:
            return;
    }
}

export function parseProjectGeoJson(source: string): ProjectBoundaryGeometry {
    let value: unknown;

    try {
        value = JSON.parse(source);
    } catch {
        throw new Error("Файл не является корректным JSON.");
    }

    const polygons: Position[][][] = [];
    collectPolygonCoordinates(value, polygons);

    if (!polygons.length) {
        throw new Error("GeoJSON должен содержать геометрию Polygon или MultiPolygon.");
    }

    return polygons.length === 1
        ? {
            type: "Polygon",
            coordinates: polygons[0],
        }
        : {
            type: "MultiPolygon",
            coordinates: polygons,
        };
}

function getRingArea(ring: Position[]) {
    let doubleArea = 0;

    for (let index = 0; index < ring.length - 1; index += 1) {
        const point = ring[index];
        const nextPoint = ring[index + 1];
        doubleArea += point[0] * nextPoint[1] - nextPoint[0] * point[1];
    }

    return doubleArea / 2;
}

function getRingCentre(ring: Position[]): [number, number] {
    const points = ring.slice(0, -1);
    let doubleArea = 0;
    let longitudeSum = 0;
    let latitudeSum = 0;

    points.forEach((point, index) => {
        const nextPoint = points[(index + 1) % points.length];
        const cross = point[0] * nextPoint[1] - nextPoint[0] * point[1];

        doubleArea += cross;
        longitudeSum += (point[0] + nextPoint[0]) * cross;
        latitudeSum += (point[1] + nextPoint[1]) * cross;
    });

    if (Math.abs(doubleArea) < Number.EPSILON) {
        return [
            points.reduce((sum, point) => sum + point[0], 0) / points.length,
            points.reduce((sum, point) => sum + point[1], 0) / points.length,
        ];
    }

    return [
        longitudeSum / (3 * doubleArea),
        latitudeSum / (3 * doubleArea),
    ];
}

export function getProjectGeometryCentre(
    geometry: ProjectBoundaryGeometry,
): [number, number] {
    const polygons = geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.coordinates;
    const largestOuterRing = polygons
        .map((polygon) => polygon[0])
        .reduce((largestRing, ring) => (
            Math.abs(getRingArea(ring)) > Math.abs(getRingArea(largestRing))
                ? ring
                : largestRing
        ));

    return getRingCentre(largestOuterRing);
}
