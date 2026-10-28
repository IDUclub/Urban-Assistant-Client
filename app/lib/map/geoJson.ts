export function parseFeatureCollection(layer: unknown) {
    if (!layer) return undefined;

    if (typeof layer === "string") {
        try {
            return JSON.parse(layer);
        } catch {
            const uri = layer.trim();
            return isGeoJsonLayerUri(uri) ? uri : undefined;
        }
    }

    if (typeof layer === "object") {
        return layer;
    }

    return undefined;
}

export function isGeoJsonLayerUri(value: unknown): value is string {
    if (typeof value !== "string" || !value.trim()) return false;

    try {
        const parsedUrl = new URL(value.trim());
        return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
    } catch {
        return false;
    }
}

export type Bounds = [[number, number], [number, number]];

export function extendBounds(bounds: Bounds | undefined, longitude: number, latitude: number): Bounds {
    if (!bounds) {
        return [[longitude, latitude], [longitude, latitude]];
    }

    return [
        [Math.min(bounds[0][0], longitude), Math.min(bounds[0][1], latitude)],
        [Math.max(bounds[1][0], longitude), Math.max(bounds[1][1], latitude)],
    ];
}

export function mergeBounds(current: Bounds | undefined, incoming: Bounds | undefined) {
    if (!incoming) {
        return current;
    }

    return extendBounds(
        extendBounds(current, incoming[0][0], incoming[0][1]),
        incoming[1][0],
        incoming[1][1],
    );
}

export function collectBounds(coordinates: unknown, bounds?: Bounds): Bounds | undefined {
    if (!Array.isArray(coordinates) || !coordinates.length) {
        return bounds;
    }

    if (
        coordinates.length >= 2 &&
        typeof coordinates[0] === "number" &&
        typeof coordinates[1] === "number"
    ) {
        return extendBounds(bounds, coordinates[0], coordinates[1]);
    }

    return coordinates.reduce<Bounds | undefined>(
        (currentBounds, coordinate) => collectBounds(coordinate, currentBounds),
        bounds
    );
}

export function getGeometryBounds(geometry: unknown, bounds?: Bounds): Bounds | undefined {
    if (!geometry || typeof geometry !== "object") {
        return bounds;
    }
    const value = geometry as Record<string, unknown>;

    if (value.type === "GeometryCollection" && Array.isArray(value.geometries)) {
        return value.geometries.reduce(
            (currentBounds: Bounds | undefined, childGeometry: unknown) => (
                getGeometryBounds(childGeometry, currentBounds)
            ),
            bounds,
        );
    }

    return collectBounds(value.coordinates, bounds);
}

export function getFeatureBounds(featureCollection: any): Bounds | undefined {
    if (!featureCollection || typeof featureCollection !== "object") {
        return undefined;
    }

    if (featureCollection.type === "FeatureCollection" && Array.isArray(featureCollection.features)) {
        const features = featureCollection.features as any[];
        return features.reduce((bounds: Bounds | undefined, feature: any) => {
            return getGeometryBounds(feature?.geometry, bounds);
        }, undefined);
    }

    if (featureCollection.type === "Feature") {
        return getGeometryBounds(featureCollection.geometry);
    }

    return getGeometryBounds(featureCollection);
}

export function getPropertyMatchValue(value: unknown) {
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return undefined;

    const matchValue = String(value);
    return matchValue.trim() ? matchValue : undefined;
}

function getServiceIdentifiers(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.flatMap(getServiceIdentifiers);
    }

    const primitiveValue = getPropertyMatchValue(value);
    if (primitiveValue !== undefined) {
        return [primitiveValue];
    }

    if (!value || typeof value !== "object") {
        return [];
    }

    const record = value as Record<string, unknown>;
    const directServiceValue = record.service_type_id
        ?? record.serviceTypeId
        ?? record.service
        ?? record.type
        ?? record.id;
    if (directServiceValue !== undefined) {
        return getServiceIdentifiers(directServiceValue);
    }

    return Object.keys(record).filter((key) => (
        key !== "capacity" && key !== "service_capacity"
    ));
}

export function getFeaturePropertyMatchValue(feature: any, propertyName: string) {
    const value = getFeatureProperty(feature, propertyName);
    if (normalizePropertyName(propertyName) !== "service") {
        return getPropertyMatchValue(value);
    }

    const serviceIdentifiers = Array.from(new Set(getServiceIdentifiers(value)))
        .sort((left, right) => left.localeCompare(right, "ru", { numeric: true }));

    return serviceIdentifiers.length ? serviceIdentifiers.join(", ") : undefined;
}

export function formatFeaturePropertyValue(value: unknown): string {
    if (value === null || value === undefined) {
        return "—";
    }

    if (typeof value === "boolean") {
        return value ? "Да" : "Нет";
    }

    if (Array.isArray(value)) {
        return value.length ? value.map(formatFeaturePropertyValue).join(", ") : "—";
    }

    if (typeof value === "string") {
        if (!value.trim()) return "—";

        const normalizedValue = value.trim().toLowerCase();

        if (normalizedValue === "true") return "Да";
        if (normalizedValue === "false") return "Нет";

        try {
            const parsedValue: unknown = JSON.parse(value);

            if (Array.isArray(parsedValue)) {
                return parsedValue.length
                    ? parsedValue.map(formatFeaturePropertyValue).join(", ")
                    : "—";
            }
        } catch {
        }

        return value;
    }

    if (value && typeof value === "object") {
        return JSON.stringify(value);
    }

    return String(value);
}

export function normalizePropertyName(value: string) {
    return value.trim().toLowerCase().replace(/[\s_]+/g, "");
}

export function getFeatureProperty(feature: any, propertyName: string) {
    const properties = feature?.properties;
    if (!properties || typeof properties !== "object") return undefined;

    if (propertyName in properties) return properties[propertyName];

    const normalizedPropertyName = normalizePropertyName(propertyName);
    const matchedKey = Object.keys(properties).find((key) =>
        normalizePropertyName(key) === normalizedPropertyName
    );

    return matchedKey ? properties[matchedKey] : undefined;
}

export function isColorablePropertyValue(
    value: unknown,
): value is string | number | boolean {
    return typeof value === "string"
        || typeof value === "number"
        || typeof value === "boolean";
}

export function getLayerFeatures(layer: unknown): any[] {
    const parsedLayer = parseFeatureCollection(layer);
    if (!parsedLayer || typeof parsedLayer !== "object" || typeof parsedLayer === "string") return [];

    const record = parsedLayer as Record<string, any>;

    if (record.type === "FeatureCollection" && Array.isArray(record.features)) return record.features;
    if (record.type === "Feature") return [record];

    return [];
}

export function getFeaturePropertyValues(layer: unknown, propertyName: string): string[] {
    const parsedLayer = parseFeatureCollection(layer);
    if (!parsedLayer || typeof parsedLayer !== "object" || typeof parsedLayer === "string") return [];

    const record = parsedLayer as Record<string, any>;
    const values = new Set<string>();
    const collectValue = (feature: any) => {
        const value = getFeaturePropertyMatchValue(feature, propertyName);

        if (value) {
            values.add(value);
        }
    };

    if (record.type === "FeatureCollection" && Array.isArray(record.features)) {
        record.features.forEach(collectValue);
        return Array.from(values);
    }

    if (record.type === "Feature") {
        collectValue(record);
        return Array.from(values);
    }

    const value = getFeaturePropertyMatchValue(record, propertyName);
    return value ? [value] : [];
}

export function getFeaturePropertyNumbers(layer: unknown, propertyName: string): number[] {
    return getLayerFeatures(layer)
        .map((feature) => getFeatureProperty(feature, propertyName))
        .filter(
            (value): value is number =>
                typeof value === "number" && Number.isFinite(value)
        );
}

export function hasLayerProperty(layer: unknown, propertyName: string): boolean {
    return getFeaturePropertyValues(layer, propertyName).length > 0;
}

export function hasFeaturesWithoutPropertyValue(layer: unknown, propertyName: string): boolean {
    const parsedLayer = parseFeatureCollection(layer);
    if (!parsedLayer || typeof parsedLayer !== "object" || typeof parsedLayer === "string") {
        return false;
    }

    const record = parsedLayer as Record<string, any>;
    const isMissingValue = (feature: any) => (
        getFeaturePropertyMatchValue(feature, propertyName) === undefined
    );

    if (record.type === "FeatureCollection" && Array.isArray(record.features)) {
        return record.features.some(isMissingValue);
    }

    return record.type === "Feature" && isMissingValue(record);
}

export function filterLayerByPropertyValue(
    layer: unknown,
    propertyName: string,
    expectedValue: string | undefined,
    fallbackValue?: string,
): any {
    const parsedLayer = parseFeatureCollection(layer);
    if (!parsedLayer || typeof parsedLayer !== "object" || typeof parsedLayer === "string") return layer;

    const matchesValue = (feature: any) => {
        const value = getFeaturePropertyMatchValue(feature, propertyName)
            ?? fallbackValue;
        return value === expectedValue;
    };

    const record = parsedLayer as Record<string, any>;

    if (record.type === "FeatureCollection" && Array.isArray(record.features)) {
        return {
            ...record,
            features: record.features.filter(matchesValue),
        };
    }

    if (record.type === "Feature") {
        return matchesValue(record) ? record : {
            type: "FeatureCollection",
            features: [],
        };
    }

    return layer;
}

export function downloadGeoJsonLayer(name: string, layer: unknown) {
    const fileName = `${(name || "layer")
        .trim()
        .replace(/[^\\w.-]+/g, "_")
        .replace(/^_+|_+$/g, "") || "layer"}.geojson`;

    if (isGeoJsonLayerUri(layer)) {
        const anchor = document.createElement("a");

        anchor.href = layer.trim();
        anchor.download = fileName;
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
        anchor.click();
        return;
    }

    const blob = new Blob([JSON.stringify(layer, null, 2)], {
        type: "application/geo+json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = fileName;
    anchor.click();

    URL.revokeObjectURL(url);
}
