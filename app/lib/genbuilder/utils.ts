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
