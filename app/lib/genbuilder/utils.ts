import type { FunctionalZoneSource } from "@lib/genbuilder/types";

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

export function parseNumber(value: unknown) {
    if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) {
        return;
    }

    const numberValue = typeof value === "number" ? value : Number(value.trim());
    return Number.isFinite(numberValue) ? numberValue : undefined;
}

export function normalizeFunctionalZoneSources(value: unknown): FunctionalZoneSource[] {
    const sources = Array.isArray(value) ? value : [];
    const seenSources = new Set<string>();

    return sources.flatMap((sourceItem) => {
        const record = asRecord(sourceItem);
        const year = parseNumber(record?.year);
        const source = typeof record?.source === "string"
            ? record.source.trim()
            : undefined;

        if (year === undefined || !source) {
            return [];
        }

        const key = `${year}:${source}`;
        if (seenSources.has(key)) {
            return [];
        }
        seenSources.add(key);

        return { year, source };
    }).sort((left, right) => right.year - left.year || left.source.localeCompare(right.source));
}

export async function validateGenBuilderBlocksFile(file: File) {
    let parsed: unknown;

    try {
        parsed = JSON.parse(await file.text());
    } catch {
        return "Файл не является корректным JSON.";
    }

    const featureCollection = asRecord(parsed);
    if (featureCollection?.type !== "FeatureCollection" || !Array.isArray(featureCollection.features)) {
        return "Ожидается GeoJSON FeatureCollection.";
    }

    if (!featureCollection.features.length) {
        return "В файле нет функциональных зон.";
    }

    for (let index = 0; index < featureCollection.features.length; index += 1) {
        const feature = asRecord(featureCollection.features[index]);
        const geometry = asRecord(feature?.geometry);
        const properties = asRecord(feature?.properties);
        const zone = typeof properties?.zone === "string"
            ? properties.zone.trim()
            : undefined;

        if (feature?.type !== "Feature") {
            return `Объект ${index + 1} не является GeoJSON Feature.`;
        }

        if (geometry?.type !== "Polygon" && geometry?.type !== "MultiPolygon") {
            return `У объекта ${index + 1} геометрия должна быть Polygon или MultiPolygon.`;
        }

        if (!zone) {
            return `У объекта ${index + 1} не заполнено properties.zone.`;
        }
    }

    return;
}
