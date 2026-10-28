import {
    FUNCTIONAL_ZONE_ID_PROPERTY,
    FUNCTIONAL_ZONE_NAME_PROPERTY,
} from "@lib/functionalZones";

import {
    normalizePropertyName,
    hasLayerProperty,
} from "./geoJson";

export const PZZ_VERDICT_PROPERTY = "Вердикт_ПЗЗ";

export const PZZ_ACTUAL_ZONE_CODE_PROPERTY = "Код фактической зоны нахождения кадастра";

export const VRI_TOP1_PROPERTY = "Топ1_возможный_ВРИ";

export const GENBUILDER_EXCLUDED_PROPERTY = "is_excluded";

export const GENBUILDER_FUNCTIONAL_ZONE_PROPERTY = "zone";

export const GENBUILDER_SERVICE_PROPERTY = "service";

export function isPzzActualZoneCodeProperty(propertyName: string) {
    return normalizePropertyName(propertyName) === normalizePropertyName(PZZ_ACTUAL_ZONE_CODE_PROPERTY);
}

export function isPzzCheckResponseLayer(name: string | undefined, layer: unknown) {
    const normalizedName = name?.trim().toLowerCase() ?? "";

    return normalizedName.includes("результат проверки пзз") || hasLayerProperty(layer, PZZ_VERDICT_PROPERTY);
}

export function isGenBuilderResponseLayer(name: string | undefined, layer: unknown) {
    const normalizedName = name?.trim().toLowerCase() ?? "";

    return normalizedName.includes("сгенерированная застройка") ||
        normalizedName === "buildings.geojson" ||
        hasLayerProperty(layer, GENBUILDER_EXCLUDED_PROPERTY);
}

export function isBuildingLayer(name: string | undefined, layer: unknown) {
    const normalizedName = name?.trim().toLowerCase() ?? "";

    return normalizedName.includes("здани") ||
        normalizedName.includes("застройк") ||
        normalizedName.includes("building") ||
        isGenBuilderResponseLayer(name, layer);
}

export function isFloorCountProperty(propertyName: string) {
    const normalizedName = normalizePropertyName(propertyName);

    return normalizedName.includes("этажност") ||
        normalizedName.includes("количествоэтаж") ||
        normalizedName.includes("floors") ||
        normalizedName.includes("floorcount") ||
        normalizedName.includes("storeys") ||
        normalizedName.includes("stories") ||
        normalizedName.includes("levels");
}

export const PROVISION_LAYER_TYPE_LABELS = {
    buildings: "здания",
    services: "сервисы",
    links: "связи",
} as const;

export function getProvisionServiceDisplayName(serviceName: string) {
    return serviceName
        .trim()
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .toLocaleLowerCase("ru-RU");
}

export function getProvisionLayerParts(name?: string) {
    const match = name?.trim().match(/^provision\.(.+)\.(buildings|services|links)$/iu);
    if (!match) return;

    const [, serviceName, layerType] = match;

    return {
        serviceName,
        layerType: layerType.toLowerCase() as keyof typeof PROVISION_LAYER_TYPE_LABELS,
    };
}

export function getLayerDisplayName(name?: string) {
    const provisionLayer = getProvisionLayerParts(name);

    if (!provisionLayer) return name || "Без названия";

    const serviceName = getProvisionServiceDisplayName(provisionLayer.serviceName);

    return `Обеспеченность сервисом «${serviceName}» (${PROVISION_LAYER_TYPE_LABELS[provisionLayer.layerType]})`;
}

export function getLayerListDisplayName(name?: string) {
    const provisionLayer = getProvisionLayerParts(name);

    if (!provisionLayer) return getLayerDisplayName(name);

    const serviceName = getProvisionServiceDisplayName(provisionLayer.serviceName);
    const capitalizedServiceName = serviceName.replace(
        /^./u,
        (firstLetter) => firstLetter.toLocaleUpperCase("ru-RU"),
    );

    return `${capitalizedServiceName} — ${PROVISION_LAYER_TYPE_LABELS[provisionLayer.layerType]}`;
}

export function isProvisionLinksLayer(name?: string) {
    return getProvisionLayerParts(name)?.layerType === "links";
}

export function isNormsCheckResultLayer(name?: string) {
    const normalizedName = name?.trim().toLowerCase() ?? "";

    return normalizedName === "объекты без нарушений" ||
        normalizedName.startsWith("нарушение нормы");
}

export function isFunctionalZoneLayer(name: string | undefined, layer: unknown) {
    const normalizedName = name?.trim().toLowerCase() ?? "";

    return normalizedName === "функциональные зоны" ||
        normalizedName === "functional_zones.geojson" ||
        hasLayerProperty(layer, FUNCTIONAL_ZONE_ID_PROPERTY) ||
        hasLayerProperty(layer, FUNCTIONAL_ZONE_NAME_PROPERTY) ||
        (
            hasLayerProperty(layer, GENBUILDER_FUNCTIONAL_ZONE_PROPERTY) &&
            hasLayerProperty(layer, "zone_nickname")
        );
}

export function isTerritoryBoundaryLayer(name?: string) {
    const normalizedName = name?.trim().toLowerCase();

    return normalizedName === "граница территории" || normalizedName === "границы территории";
}

export function isRoadLayer(name?: string) {
    const normalizedName = name?.trim().toLowerCase() ?? "";

    return normalizedName === "дороги" ||
        normalizedName.includes("дорожн") ||
        normalizedName === "roads" ||
        normalizedName.includes("road network");
}
