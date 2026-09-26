import type { ScenarioImportedGeometry } from "@lib/ScenarioGeoJson";

export type InfrastructureTypeOption = {
    value: number;
    label: string;
    aliases?: string[];
};

export type InfrastructureService = {
    serviceTypeId?: number;
    capacity?: number;
};

export type InfrastructureImportItem = {
    feature: ScenarioImportedGeometry;
    physicalObjectTypeId?: number;
    services: InfrastructureService[];
    physicalObjectCreated?: boolean;
    physicalObjectId?: number;
    objectGeometryId?: number;
    savedServiceCount?: number;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function asId(value: unknown) {
    if (value === null || value === undefined || value === "") return undefined;
    const id = Number(value);
    return Number.isFinite(id) ? id : undefined;
}

export function getCreatedPhysicalObjectIds(value: unknown) {
    const response = asRecord(value);
    const physicalObject = asRecord(response?.physical_object);
    const objectGeometry = asRecord(response?.object_geometry);

    return {
        physicalObjectId: asId(
            physicalObject?.physical_object_id
            ?? response?.physical_object_id
            ?? physicalObject?.urban_object_id
            ?? response?.urban_object_id,
        ),
        objectGeometryId: asId(
            objectGeometry?.object_geometry_id ?? response?.object_geometry_id,
        ),
    };
}

export function getInfrastructurePropertyNames(features: ScenarioImportedGeometry[]) {
    return Array.from(new Set(features.flatMap(({ properties }) => Object.keys(properties))))
        .sort((left, right) => left.localeCompare(right, "ru"));
}

export function getInfrastructurePropertyName(
    names: string[],
    candidates: string[],
) {
    return candidates.find((candidate) => names.includes(candidate)) ?? names[0] ?? "";
}

export function matchInfrastructureType(value: unknown, options: InfrastructureTypeOption[]) {
    const normalized = typeof value === "string" ? value.trim().toLocaleLowerCase("ru") : value;
    return options.find((option) => (
        option.value === value ||
        (value !== null && value !== "" && option.value === Number(value)) ||
        [option.label, ...(option.aliases ?? [])].some((label) => (
            label.trim().toLocaleLowerCase("ru") === normalized
        ))
    ))?.value;
}

function parseList(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return value === null || value === undefined || value === "" ? [] : [value];

    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === "object") return [parsed];
    } catch {
        // Plain names and delimited values remain valid property values.
    }
    return /[,;|]/.test(trimmed)
        ? trimmed.split(/[,;|]/).map((item) => item.trim())
        : [trimmed];
}

function parseCapacity(value: unknown) {
    if (value === null || value === undefined || value === "") return undefined;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export function parseInfrastructureServices(
    serviceValue: unknown,
    capacityValue: unknown,
    options: InfrastructureTypeOption[],
): InfrastructureService[] {
    const services = parseList(serviceValue);
    const capacities = parseList(capacityValue);
    const rows = services.flatMap((service, index): InfrastructureService[] => {
        if (service && typeof service === "object" && !Array.isArray(service)) {
            const record = service as Record<string, unknown>;
            const explicitType = record.service_type_id ?? record.serviceTypeId ?? record.service ?? record.type ?? record.id;
            if (explicitType !== undefined) {
                return [{
                    serviceTypeId: matchInfrastructureType(explicitType, options),
                    capacity: parseCapacity(record.capacity ?? record.service_capacity ?? capacities[index]),
                }];
            }
            return Object.entries(record).map(([type, capacity]) => ({
                serviceTypeId: matchInfrastructureType(type, options),
                capacity: parseCapacity(capacity),
            }));
        }
        return [{
            serviceTypeId: matchInfrastructureType(service, options),
            capacity: parseCapacity(capacities[index]),
        }];
    });

    return rows;
}

export function mapInfrastructureItems(
    features: ScenarioImportedGeometry[],
    typePropertyName: string,
    servicePropertyName: string,
    capacityPropertyName: string,
    physicalObjectTypes: InfrastructureTypeOption[],
    serviceTypes: InfrastructureTypeOption[],
): InfrastructureImportItem[] {
    return features.map((feature) => ({
        feature,
        physicalObjectTypeId: matchInfrastructureType(feature.properties[typePropertyName], physicalObjectTypes),
        services: parseInfrastructureServices(
            feature.properties[servicePropertyName],
            feature.properties[capacityPropertyName],
            serviceTypes,
        ),
    }));
}

export function isInfrastructureItemMapped(item: InfrastructureImportItem) {
    return item.physicalObjectTypeId !== undefined
        && item.services.every(({ serviceTypeId, capacity }) => (
            serviceTypeId !== undefined && capacity !== undefined && Number.isFinite(capacity) && capacity >= 0
        ));
}
