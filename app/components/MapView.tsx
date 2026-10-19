import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { IoArrowBack, IoChevronDown, IoChevronUp, IoClose } from "react-icons/io5";
import {
    MdOutlineVisibility,
    MdOutlineVisibilityOff,
    MdDownload,
    MdDragHandle,
    MdPalette,
} from "react-icons/md";
import { Layer, Source } from "react-map-gl/mapbox";
import MapCanvas from "@components/MapCanvas";
import type { MapRef } from "react-map-gl/mapbox";
import type { MapMouseEvent } from "react-map-gl/mapbox";
import type { ExpressionSpecification } from "mapbox-gl";
import type { Feature, Geometry } from "geojson";
import "mapbox-gl/dist/mapbox-gl.css";
import CustomSelect, { type SelectOption } from "@components/ui/Select";
import ChatStore from "@lib/ChatStore";
import AuthStore from "@lib/AuthStore";
import MapStore, { type MapColorMode } from "@lib/MapStore";
import { getFacadeSceneGlb } from "@lib/genbuilder/client";
import { createFacadeSceneLayer } from "@lib/genbuilder/facadeSceneLayer";
import {
    FUNCTIONAL_ZONE_FALLBACK_COLOR,
    FUNCTIONAL_ZONE_ID_PROPERTY,
    FUNCTIONAL_ZONE_NAME_PROPERTY,
    FUNCTIONAL_ZONE_TYPE_PROPERTY,
    getFunctionalZoneColor,
    getFunctionalZoneName,
} from "@lib/functionalZones";
import {
    GENPLANNER_ROAD_COLORS_BY_ID,
    GENPLANNER_ROAD_LEVEL_PROPERTY,
    GENPLANNER_ROAD_NAMES_BY_ID,
    GENPLANNER_ROAD_TYPE_PROPERTY,
    getGenPlannerRoadTypeId,
} from "@lib/genplanner/roads";
import {
    GENPLANNER_ROAD_LAYER_NAME,
    GENPLANNER_ZONE_LAYER_NAME,
} from "@lib/genplanner/constants";

function parseFeatureCollection(layer: unknown) {
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

function isGeoJsonLayerUri(value: unknown): value is string {
    if (typeof value !== "string" || !value.trim()) return false;

    try {
        const parsedUrl = new URL(value.trim());
        return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
    } catch {
        return false;
    }
}

type Bounds = [[number, number], [number, number]];

function extendBounds(bounds: Bounds | undefined, longitude: number, latitude: number): Bounds {
    if (!bounds) {
        return [[longitude, latitude], [longitude, latitude]];
    }

    return [
        [Math.min(bounds[0][0], longitude), Math.min(bounds[0][1], latitude)],
        [Math.max(bounds[1][0], longitude), Math.max(bounds[1][1], latitude)],
    ];
}

function mergeBounds(current: Bounds | undefined, incoming: Bounds | undefined) {
    if (!incoming) {
        return current;
    }

    return extendBounds(
        extendBounds(current, incoming[0][0], incoming[0][1]),
        incoming[1][0],
        incoming[1][1],
    );
}

function collectBounds(coordinates: unknown, bounds?: Bounds): Bounds | undefined {
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

function getGeometryBounds(geometry: unknown, bounds?: Bounds): Bounds | undefined {
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

function getFeatureBounds(featureCollection: any): Bounds | undefined {
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

function getRandomColor() {
    const red = 40 + Math.floor(Math.random() * 180);
    const green = 40 + Math.floor(Math.random() * 180);
    const blue = 40 + Math.floor(Math.random() * 180);

    return `rgb(${red}, ${green}, ${blue})`;
}

const PZZ_VERDICT_PROPERTY = "Вердикт_ПЗЗ";
const PZZ_ACTUAL_ZONE_CODE_PROPERTY = "Код фактической зоны нахождения кадастра";
const PZZ_VERDICT_COLORS = [
    ["Разрешен", "#22C55E"],
    ["Условно разрешен", "#EAB308"],
    ["Разрешен как вспомогательный", "#14B8A6"],
    ["Не разрешен", "#EF4444"],
    ["Требуется ручная проверка", "#F97316"],
    ["Нет пересечения с ПЗЗ", "#3B82F6"],
    ["Нет описания зоны в шаблоне", "#A855F7"],
    ["Только кандидаты классификатора", "#EC4899"],
] as const;
const PZZ_VERDICT_LEGEND_GRADIENT = `linear-gradient(to bottom, ${PZZ_VERDICT_COLORS.map(([, color]) => color).join(", ")})`;
const PZZ_CLASSIFIER_CANDIDATES_VERDICT = "Только кандидаты классификатора";
const VRI_TOP1_PROPERTY = "Топ1_возможный_ВРИ";
const GENBUILDER_EXCLUDED_PROPERTY = "is_excluded";
const GENBUILDER_BUILDING_COLORS = [
    ["false", "#22C55E"],
    ["true", "#F97316"],
] as const;
const GENBUILDER_FUNCTIONAL_ZONE_PROPERTY = "zone";
const DEFAULT_FILL_OPACITY = 0.24;
const PZZ_VERDICT_FILL_OPACITY = 0.65;
const VRI_TOP1_FILL_OPACITY = 0.65;
const GENERATED_LAYER_FILL_OPACITY = 0.65;
const SELECTED_FEATURE_COLOR = "#EF4444";
const SELECTED_FEATURE_OUTLINE_COLOR = "#FFFFFF";
const LIGHT_MAP_STYLE = "mapbox://styles/mapbox/light-v11";
const DARK_MAP_STYLE = "mapbox://styles/mapbox/dark-v11";

type ColorPalette = {
    id: string;
    label: string;
    colors: readonly string[];
};

const CATEGORY_COLOR_PALETTES: readonly ColorPalette[] = [
    {
        id: "tab10",
        label: "Tab10",
        colors: ["#1F77B4", "#FF7F0E", "#2CA02C", "#D62728", "#9467BD", "#8C564B", "#E377C2", "#7F7F7F", "#BCBD22", "#17BECF"],
    },
    {
        id: "tab20",
        label: "Tab20",
        colors: ["#1F77B4", "#AEC7E8", "#FF7F0E", "#FFBB78", "#2CA02C", "#98DF8A", "#D62728", "#FF9896", "#9467BD", "#C5B0D5", "#8C564B", "#C49C94", "#E377C2", "#F7B6D2", "#7F7F7F", "#C7C7C7", "#BCBD22", "#DBDB8D", "#17BECF", "#9EDAE5"],
    },
    {
        id: "set2",
        label: "Set2",
        colors: ["#66C2A5", "#FC8D62", "#8DA0CB", "#E78AC3", "#A6D854", "#FFD92F", "#E5C494", "#B3B3B3"],
    },
    {
        id: "dark2",
        label: "Dark2",
        colors: ["#1B9E77", "#D95F02", "#7570B3", "#E7298A", "#66A61E", "#E6AB02", "#A6761D", "#666666"],
    },
];

const SCALE_COLOR_PALETTES: readonly ColorPalette[] = [
    {
        id: "viridis",
        label: "Viridis",
        colors: ["#440154", "#414487", "#2A788E", "#22A884", "#7AD151", "#FDE725"],
    },
    {
        id: "plasma",
        label: "Plasma",
        colors: ["#0D0887", "#6A00A8", "#B12A90", "#E16462", "#FCA636", "#F0F921"],
    },
    {
        id: "inferno",
        label: "Inferno",
        colors: ["#000004", "#420A68", "#932667", "#DD513A", "#FCA50A", "#FCFFA4"],
    },
    {
        id: "magma",
        label: "Magma",
        colors: ["#000004", "#3B0F70", "#8C2981", "#DE4968", "#FE9F6D", "#FCFDBF"],
    },
    {
        id: "cividis",
        label: "Cividis",
        colors: ["#00224E", "#31446B", "#666970", "#958F78", "#CAB969", "#FEE838"],
    },
    {
        id: "coolwarm",
        label: "Coolwarm",
        colors: ["#3B4CC0", "#7295F4", "#AAC7FD", "#DDDDDD", "#F7B89C", "#E7745B", "#B40426"],
    },
];
const INITIAL_COLOR_PALETTE_VERSION = 1;

function getPropertyMatchValue(value: unknown) {
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return undefined;

    const matchValue = String(value);
    return matchValue.trim() ? matchValue : undefined;
}

function formatFeaturePropertyValue(value: unknown): string {
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

function normalizePropertyName(value: string) {
    return value.trim().toLowerCase().replace(/[\s_]+/g, "");
}

function isPzzActualZoneCodeProperty(propertyName: string) {
    return normalizePropertyName(propertyName) === normalizePropertyName(PZZ_ACTUAL_ZONE_CODE_PROPERTY);
}

function getFeatureProperty(feature: any, propertyName: string) {
    const properties = feature?.properties;
    if (!properties || typeof properties !== "object") return undefined;

    if (propertyName in properties) return properties[propertyName];

    const normalizedPropertyName = normalizePropertyName(propertyName);
    const matchedKey = Object.keys(properties).find((key) =>
        normalizePropertyName(key) === normalizedPropertyName
    );

    return matchedKey ? properties[matchedKey] : undefined;
}

type LayerColorPropertyKind = "category" | "number";

type LayerColorProperty = {
    name: string;
    kind: LayerColorPropertyKind;
};

function isColorablePropertyValue(
    value: unknown,
): value is string | number | boolean {
    return typeof value === "string"
        || typeof value === "number"
        || typeof value === "boolean";
}

function getLayerFeatures(layer: unknown): any[] {
    const parsedLayer = parseFeatureCollection(layer);
    if (!parsedLayer || typeof parsedLayer !== "object" || typeof parsedLayer === "string") return [];

    const record = parsedLayer as Record<string, any>;

    if (record.type === "FeatureCollection" && Array.isArray(record.features)) return record.features;
    if (record.type === "Feature") return [record];

    return [];
}

function getColorableLayerProperties(layer: unknown): LayerColorProperty[] {
    const propertyValues = new globalThis.Map<string, unknown[]>();

    getLayerFeatures(layer).forEach((feature) => {
        const properties = feature?.properties;
        if (!properties || typeof properties !== "object") return;

        Object.entries(properties).forEach(([propertyName, value]) => {
            if (value === null || value === undefined || value === "") return;
            if (!isColorablePropertyValue(value)) return;

            const values = propertyValues.get(propertyName) ?? [];

            values.push(value);
            propertyValues.set(propertyName, values);
        });
    });

    return Array.from(propertyValues.entries())
        .map(([name, values]) => {
            const isNumeric = !isPzzActualZoneCodeProperty(name) && values.every(
                (value) => typeof value === "number" && Number.isFinite(value)
            );

            return {
                name,
                kind: isNumeric ? "number" : "category",
            } satisfies LayerColorProperty;
        })
        .sort((left, right) => left.name.localeCompare(right.name, "ru"));
}

function getSelectedColorMode(selectedMode?: MapColorMode): MapColorMode {
    return selectedMode ?? "category";
}

function getFeaturePropertyValues(layer: unknown, propertyName: string): string[] {
    const parsedLayer = parseFeatureCollection(layer);
    if (!parsedLayer || typeof parsedLayer !== "object" || typeof parsedLayer === "string") return [];

    const record = parsedLayer as Record<string, any>;
    const values = new Set<string>();
    const collectValue = (feature: any) => {
        const value = getPropertyMatchValue(getFeatureProperty(feature, propertyName));

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

    const value = getPropertyMatchValue(getFeatureProperty(record, propertyName));
    return value ? [value] : [];
}

function getFeaturePropertyNumbers(layer: unknown, propertyName: string): number[] {
    return getLayerFeatures(layer)
        .map((feature) => getFeatureProperty(feature, propertyName))
        .filter(
            (value): value is number =>
                typeof value === "number" && Number.isFinite(value)
        );
}

function hasLayerProperty(layer: unknown, propertyName: string): boolean {
    return getFeaturePropertyValues(layer, propertyName).length > 0;
}

function hasFeaturesWithoutPropertyValue(layer: unknown, propertyName: string): boolean {
    const parsedLayer = parseFeatureCollection(layer);
    if (!parsedLayer || typeof parsedLayer !== "object" || typeof parsedLayer === "string") {
        return false;
    }

    const record = parsedLayer as Record<string, any>;
    const isMissingValue = (feature: any) => (
        getPropertyMatchValue(getFeatureProperty(feature, propertyName)) === undefined
    );

    if (record.type === "FeatureCollection" && Array.isArray(record.features)) {
        return record.features.some(isMissingValue);
    }

    return record.type === "Feature" && isMissingValue(record);
}

function isPzzCheckResponseLayer(name: string | undefined, layer: unknown) {
    const normalizedName = name?.trim().toLowerCase() ?? "";

    return normalizedName.includes("результат проверки пзз") || hasLayerProperty(layer, PZZ_VERDICT_PROPERTY);
}

function isGenBuilderResponseLayer(name: string | undefined, layer: unknown) {
    const normalizedName = name?.trim().toLowerCase() ?? "";

    return normalizedName.includes("сгенерированная застройка") ||
        normalizedName === "buildings.geojson" ||
        hasLayerProperty(layer, GENBUILDER_EXCLUDED_PROPERTY);
}

function isBuildingLayer(name: string | undefined, layer: unknown) {
    const normalizedName = name?.trim().toLowerCase() ?? "";

    return normalizedName.includes("здани") ||
        normalizedName.includes("застройк") ||
        normalizedName.includes("building") ||
        isGenBuilderResponseLayer(name, layer);
}

function isFloorCountProperty(propertyName: string) {
    const normalizedName = normalizePropertyName(propertyName);

    return normalizedName.includes("этажност") ||
        normalizedName.includes("количествоэтаж") ||
        normalizedName.includes("floors") ||
        normalizedName.includes("floorcount") ||
        normalizedName.includes("storeys") ||
        normalizedName.includes("stories") ||
        normalizedName.includes("levels");
}

const PROVISION_LAYER_TYPE_LABELS = {
    buildings: "здания",
    services: "сервисы",
    links: "связи",
} as const;

function getProvisionServiceDisplayName(serviceName: string) {
    return serviceName
        .trim()
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .toLocaleLowerCase("ru-RU");
}

function getProvisionLayerParts(name?: string) {
    const match = name?.trim().match(/^provision\.(.+)\.(buildings|services|links)$/iu);
    if (!match) return;

    const [, serviceName, layerType] = match;

    return {
        serviceName,
        layerType: layerType.toLowerCase() as keyof typeof PROVISION_LAYER_TYPE_LABELS,
    };
}

function getLayerDisplayName(name?: string) {
    const provisionLayer = getProvisionLayerParts(name);

    if (!provisionLayer) return name || "Без названия";

    const serviceName = getProvisionServiceDisplayName(provisionLayer.serviceName);

    return `Обеспеченность сервисом «${serviceName}» (${PROVISION_LAYER_TYPE_LABELS[provisionLayer.layerType]})`;
}

function getLayerListDisplayName(name?: string) {
    const provisionLayer = getProvisionLayerParts(name);

    if (!provisionLayer) return getLayerDisplayName(name);

    const serviceName = getProvisionServiceDisplayName(provisionLayer.serviceName);
    const capitalizedServiceName = serviceName.replace(
        /^./u,
        (firstLetter) => firstLetter.toLocaleUpperCase("ru-RU"),
    );

    return `${capitalizedServiceName} — ${PROVISION_LAYER_TYPE_LABELS[provisionLayer.layerType]}`;
}

function isProvisionLinksLayer(name?: string) {
    return getProvisionLayerParts(name)?.layerType === "links";
}

function canUseCategoryColorMode(name?: string) {
    return !getProvisionLayerParts(name);
}

function isNormsCheckResultLayer(name?: string) {
    const normalizedName = name?.trim().toLowerCase() ?? "";

    return normalizedName === "объекты без нарушений" ||
        normalizedName.startsWith("нарушение нормы");
}

function canUseScaleColorMode(
    name: string | undefined,
    layer: unknown,
    propertyName: string,
) {
    if (getProvisionLayerParts(name)) return true;
    if (isGenBuilderResponseLayer(name, layer)) return true;
    if (isNormsCheckResultLayer(name)) return false;
    if (isFunctionalZoneLayer(name, layer)) return false;
    if (isRoadLayer(name)) return false;
    if (!isBuildingLayer(name, layer)) return true;

    const colorProperty = getColorableLayerProperties(layer)
        .find((property) => property.name === propertyName);

    return colorProperty?.kind === "number" && isFloorCountProperty(colorProperty.name);
}

function getAvailableColorMode(
    name: string | undefined,
    layer: unknown,
    propertyName: string,
    requestedMode: MapColorMode,
) {
    if (requestedMode === "category" && !canUseCategoryColorMode(name)) {
        return "scale";
    }

    if (requestedMode === "scale" && !canUseScaleColorMode(name, layer, propertyName)) {
        return "category";
    }

    return requestedMode;
}

function isFunctionalZoneLayer(name: string | undefined, layer: unknown) {
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

function getFunctionalZoneStyle(name: string | undefined, layer: unknown): CategoricalLayerStyle | undefined {
    if (!isFunctionalZoneLayer(name, layer)) {
        return;
    }

    const functionalZoneProperty = [
        FUNCTIONAL_ZONE_ID_PROPERTY,
        FUNCTIONAL_ZONE_NAME_PROPERTY,
        FUNCTIONAL_ZONE_TYPE_PROPERTY,
        GENBUILDER_FUNCTIONAL_ZONE_PROPERTY,
    ].map((propertyName) => ({
        propertyName,
        values: getFeaturePropertyValues(layer, propertyName),
    })).find(({ values }) => values.length);

    if (!functionalZoneProperty) {
        return;
    }

    const valueColors: CategoryColor[] = functionalZoneProperty.values
        .sort((left, right) => left.localeCompare(right, "ru", { numeric: true }))
        .map((value) => [value, getFunctionalZoneColor(value)] as const);
    if (hasFeaturesWithoutPropertyValue(layer, functionalZoneProperty.propertyName)) {
        valueColors.push([undefined, FUNCTIONAL_ZONE_FALLBACK_COLOR]);
    }
    const isGenPlannerLayer =
        name?.trim().toLowerCase() === GENPLANNER_ZONE_LAYER_NAME.toLowerCase() &&
        functionalZoneProperty.propertyName === FUNCTIONAL_ZONE_ID_PROPERTY;

    return {
        propertyName: functionalZoneProperty.propertyName,
        valueColors,
        fillOpacity: GENERATED_LAYER_FILL_OPACITY,
        legendGradient: getValueColorGradient(valueColors),
        lineColor: isGenPlannerLayer ? "#6B7280" : undefined,
        legendTitle: isGenPlannerLayer
            ? getGenPlannerLegendTitle(valueColors)
            : "Цвета функциональных зон",
    };
}

function getStableValueColor(value: string) {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
        hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
    }

    const red = 48 + (hash & 0x9f);
    const green = 48 + ((hash >>> 8) & 0x9f);
    const blue = 48 + ((hash >>> 16) & 0x9f);

    return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function getColorPalettes(mode: MapColorMode) {
    return mode === "category"
        ? CATEGORY_COLOR_PALETTES
        : SCALE_COLOR_PALETTES;
}

function getColorPalette(mode: MapColorMode, paletteId?: string) {
    const palettes = getColorPalettes(mode);
    return palettes.find((palette) => palette.id === paletteId) ?? palettes[0];
}

function getRandomInitialColorPalette(
    mode: MapColorMode,
    usedPaletteIds: ReadonlySet<string>,
) {
    const palettes = getColorPalettes(mode);
    const initialPalettes = palettes.length > 1 ? palettes.slice(1) : palettes;
    const unusedPalettes = initialPalettes.filter(
        (palette) => !usedPaletteIds.has(palette.id),
    );
    const candidates = unusedPalettes.length ? unusedPalettes : initialPalettes;

    return candidates[Math.floor(Math.random() * candidates.length)];
}

function interpolatePaletteColor(colors: readonly string[], position: number) {
    if (colors.length === 1) return colors[0];

    const normalizedPosition = Math.min(Math.max(position, 0), 1);
    const scaledPosition = normalizedPosition * (colors.length - 1);
    const leftIndex = Math.floor(scaledPosition);
    const rightIndex = Math.min(leftIndex + 1, colors.length - 1);
    const ratio = scaledPosition - leftIndex;
    const parseHexColor = (color: string) => [
        Number.parseInt(color.slice(1, 3), 16),
        Number.parseInt(color.slice(3, 5), 16),
        Number.parseInt(color.slice(5, 7), 16),
    ];
    const leftColor = parseHexColor(colors[leftIndex]);
    const rightColor = parseHexColor(colors[rightIndex]);
    const result = leftColor.map((channel, index) => (
        Math.round(channel + (rightColor[index] - channel) * ratio)
    ));

    return `#${result.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function getCategoryPaletteColor(
    palette: ColorPalette,
    index: number,
    colorCount: number,
) {
    if (colorCount <= palette.colors.length) {
        return palette.colors[index];
    }

    return interpolatePaletteColor(
        palette.colors,
        colorCount === 1 ? 0.5 : index / (colorCount - 1),
    );
}

function getPzzVerdictColor(value: string) {
    return PZZ_VERDICT_COLORS.find(([verdict]) => verdict === value)?.[1] ?? getStableValueColor(value);
}

function getPzzVerdictValueColors(layer: unknown) {
    const orderByVerdict = new globalThis.Map<string, number>(
        PZZ_VERDICT_COLORS.map(([value], index) => [value, index])
    );

    return getFeaturePropertyValues(layer, PZZ_VERDICT_PROPERTY)
        .sort((left, right) => {
            const leftOrder = orderByVerdict.get(left) ?? Number.POSITIVE_INFINITY;
            const rightOrder = orderByVerdict.get(right) ?? Number.POSITIVE_INFINITY;

            return leftOrder - rightOrder || left.localeCompare(right, "ru");
        })
        .map((value) => [value, getPzzVerdictColor(value)] as const);
}

function getVriTop1ValueColors(layer: unknown) {
    return getFeaturePropertyValues(layer, VRI_TOP1_PROPERTY)
        .sort((left, right) => left.localeCompare(right, "ru"))
        .map((value) => [value, getStableValueColor(value)] as const);
}

function getGenPlannerRoadStyle(name: string | undefined, layer: unknown) {
    const isGenPlannerRoadLayer = name?.trim().toLowerCase() === GENPLANNER_ROAD_LAYER_NAME.toLowerCase();
    if (!isGenPlannerRoadLayer) {
        return;
    }

    const roadTypeValues = getFeaturePropertyValues(layer, GENPLANNER_ROAD_TYPE_PROPERTY);
    const propertyName = roadTypeValues.length
        ? GENPLANNER_ROAD_TYPE_PROPERTY
        : GENPLANNER_ROAD_LEVEL_PROPERTY;
    const propertyValues = roadTypeValues.length
        ? roadTypeValues
        : getFeaturePropertyValues(layer, GENPLANNER_ROAD_LEVEL_PROPERTY);

    if (!propertyValues.length) {
        return;
    }

    const valueColors: CategoryColor[] = propertyValues
        .sort((left, right) => left.localeCompare(right, "ru", { numeric: true }))
        .map((value) => {
            const roadTypeId = getGenPlannerRoadTypeId(value);
            const color = roadTypeId !== undefined
                ? GENPLANNER_ROAD_COLORS_BY_ID[roadTypeId]
                : FUNCTIONAL_ZONE_FALLBACK_COLOR;

            return [value, color] as const;
        });
    if (hasFeaturesWithoutPropertyValue(layer, propertyName)) {
        valueColors.push([undefined, FUNCTIONAL_ZONE_FALLBACK_COLOR]);
    }

    return {
        propertyName,
        valueColors,
    };
}

function formatSelectedFeaturePropertyValue(
    layerName: string,
    propertyName: string,
    value: unknown,
) {
    const formattedValue = formatFeaturePropertyValue(value);
    const normalizedPropertyName = normalizePropertyName(propertyName);
    const normalizedLayerName = layerName.trim().toLowerCase();

    if (
        normalizedLayerName === GENPLANNER_ZONE_LAYER_NAME.toLowerCase()
        && normalizedPropertyName === normalizePropertyName(FUNCTIONAL_ZONE_ID_PROPERTY)
    ) {
        const zoneName = getFunctionalZoneName(value);
        return zoneName ? `${formattedValue} — ${zoneName}` : formattedValue;
    }

    return formattedValue;
}

function getGenPlannerLegendTitle(valueColors: readonly CategoryColor[]) {
    const zoneNames = valueColors.map(([value]) => {
        if (value === undefined) {
            return "Неизвестная зона";
        }

        const zoneName = getFunctionalZoneName(value) ?? "Неизвестная зона";
        return `${value} — ${zoneName}`;
    });

    return ["Функциональные зоны по типам", ...zoneNames].join("\n");
}

type CategoryColor = readonly [value: string | undefined, color: string];

type CategoricalLayerStyle = {
    propertyName: string;
    valueColors: readonly CategoryColor[];
    fillOpacity: number;
    legendGradient: string | undefined;
    lineColor?: string;
    fallbackValue?: string;
    legendTitle?: string;
    useExpression?: boolean;
    scaleLabels?: readonly [string, string];
    scaleGradient?: string;
};

type NumericLayerStyle = {
    propertyName: string;
    minValue: number;
    maxValue: number;
    fillOpacity: number;
    legendGradient: string;
    colors: readonly string[];
};

type MapLegendItem = {
    color: string;
    label: string;
};

function getLegendValueLabel(
    layerName: string,
    propertyName: string,
    value?: string,
) {
    if (value === undefined) return "Нет данных";

    if (
        propertyName === FUNCTIONAL_ZONE_ID_PROPERTY
        || propertyName === FUNCTIONAL_ZONE_NAME_PROPERTY
        || propertyName === FUNCTIONAL_ZONE_TYPE_PROPERTY
        || propertyName === GENBUILDER_FUNCTIONAL_ZONE_PROPERTY
    ) {
        return getFunctionalZoneName(value) ?? value;
    }

    if (layerName.trim().toLowerCase() === GENPLANNER_ROAD_LAYER_NAME.toLowerCase()) {
        const roadTypeId = getGenPlannerRoadTypeId(value);
        return roadTypeId === undefined
            ? value
            : GENPLANNER_ROAD_NAMES_BY_ID[roadTypeId] ?? value;
    }

    if (propertyName === GENBUILDER_EXCLUDED_PROPERTY) {
        return value === "true" ? "Исключённые объекты" : "Сгенерированные объекты";
    }

    if (value === "true") return "Да";
    if (value === "false") return "Нет";

    return value;
}

function getMapLegendItems(
    layer: { name: string; style: { color: string } },
    categoricalStyle?: CategoricalLayerStyle,
): MapLegendItem[] {
    if (!categoricalStyle) {
        return [{ color: layer.style.color, label: getLayerDisplayName(layer.name) }];
    }

    const legendItems: MapLegendItem[] = [];
    for (const [value, color] of categoricalStyle.valueColors) {
        const label = getLegendValueLabel(layer.name, categoricalStyle.propertyName, value);
        if (!legendItems.some((item) => item.label === label && item.color === color)) {
            legendItems.push({ color, label });
        }
    }

    return legendItems;
}

function getDefaultCategoricalLayerStyle(name: string | undefined, layer: unknown): CategoricalLayerStyle | undefined {
    const functionalZoneStyle = getFunctionalZoneStyle(name, layer);

    if (functionalZoneStyle) {
        return functionalZoneStyle;
    }

    if (isGenBuilderResponseLayer(name, layer)) {
        const hasExcludedObjects = getFeaturePropertyValues(
            layer,
            GENBUILDER_EXCLUDED_PROPERTY,
        ).includes("true");
        const valueColors = hasExcludedObjects
            ? GENBUILDER_BUILDING_COLORS
            : GENBUILDER_BUILDING_COLORS.slice(0, 1);

        return {
            propertyName: GENBUILDER_EXCLUDED_PROPERTY,
            valueColors,
            fillOpacity: GENERATED_LAYER_FILL_OPACITY,
            legendGradient: getValueColorGradient(valueColors),
            fallbackValue: "false",
            legendTitle: hasExcludedObjects
                ? "Сгенерированные — зелёные, исключённые — оранжевые"
                : "Сгенерированные объекты",
        };
    }

    const genPlannerRoadStyle = getGenPlannerRoadStyle(name, layer);
    if (genPlannerRoadStyle) {
        return {
            propertyName: genPlannerRoadStyle.propertyName,
            valueColors: genPlannerRoadStyle.valueColors,
            fillOpacity: GENERATED_LAYER_FILL_OPACITY,
            legendGradient: getValueColorGradient(genPlannerRoadStyle.valueColors),
            legendTitle: "Дороги по типам",
        };
    }

    const pzzVerdictValues = getFeaturePropertyValues(layer, PZZ_VERDICT_PROPERTY);
    const vriTop1ValueColors = getVriTop1ValueColors(layer);
    const isPzzLayer = isPzzCheckResponseLayer(name, layer);

    if (
        isPzzLayer &&
        pzzVerdictValues.length === 1 &&
        pzzVerdictValues[0] === PZZ_CLASSIFIER_CANDIDATES_VERDICT &&
        vriTop1ValueColors.length > 1
    ) {
        return {
            propertyName: VRI_TOP1_PROPERTY,
            valueColors: vriTop1ValueColors,
            fillOpacity: VRI_TOP1_FILL_OPACITY,
            legendGradient: getValueColorGradient(vriTop1ValueColors),
        };
    }

    if (isPzzLayer && pzzVerdictValues.length) {
        const valueColors = getPzzVerdictValueColors(layer);

        return {
            propertyName: PZZ_VERDICT_PROPERTY,
            valueColors,
            fillOpacity: PZZ_VERDICT_FILL_OPACITY,
            legendGradient: getValueColorGradient(valueColors) ?? PZZ_VERDICT_LEGEND_GRADIENT,
        };
    }

    if (!isPzzLayer && vriTop1ValueColors.length) {
        return {
            propertyName: VRI_TOP1_PROPERTY,
            valueColors: vriTop1ValueColors,
            fillOpacity: VRI_TOP1_FILL_OPACITY,
            legendGradient: getValueColorGradient(vriTop1ValueColors),
        };
    }

    return undefined;
}

function getLayerColorPropertyName(
    name: string | undefined,
    layer: unknown,
    selectedPropertyName?: string,
) {
    if (selectedPropertyName) return selectedPropertyName;

    return getDefaultCategoricalLayerStyle(name, layer)?.propertyName
        ?? getColorableLayerProperties(layer)[0]?.name;
}

function getSelectedCategoricalLayerStyle(
    layer: unknown,
    propertyName: string,
    palette: ColorPalette,
    useScale: boolean,
    originalStyle?: CategoricalLayerStyle,
): CategoricalLayerStyle | undefined {
    const colorProperty = getColorableLayerProperties(layer)
        .find((property) => property.name === propertyName);

    if (!colorProperty) return;

    const originalValueOrder = originalStyle?.propertyName === propertyName
        ? new globalThis.Map(
            originalStyle.valueColors.map(([value], index) => [value, index]),
        )
        : undefined;
    const values = getFeaturePropertyValues(layer, propertyName)
        .sort((left, right) => {
            const leftOrder = originalValueOrder?.get(left) ?? Number.POSITIVE_INFINITY;
            const rightOrder = originalValueOrder?.get(right) ?? Number.POSITIVE_INFINITY;

            return leftOrder - rightOrder || left.localeCompare(right, "ru", { numeric: true });
        });
    const valueColors: CategoryColor[] = values.map((value, index) => [
        value,
        useScale
            ? interpolatePaletteColor(palette.colors, values.length === 1 ? 0.5 : index / (values.length - 1))
            : getCategoryPaletteColor(palette, index, values.length),
    ] as const);

    if (hasFeaturesWithoutPropertyValue(layer, propertyName)) {
        valueColors.push([undefined, FUNCTIONAL_ZONE_FALLBACK_COLOR]);
    }

    return {
        propertyName,
        valueColors,
        fillOpacity: GENERATED_LAYER_FILL_OPACITY,
        legendGradient: getValueColorGradient(valueColors),
        useExpression: true,
        scaleLabels: useScale && values.length
            ? [values[0], values.at(-1) ?? values[0]]
            : undefined,
        scaleGradient: useScale
            ? `linear-gradient(to right, ${palette.colors.join(", ")})`
            : undefined,
    };
}

function getCategoricalLayerStyle(
    name: string | undefined,
    layer: unknown,
    selectedPropertyName?: string,
    selectedMode?: MapColorMode,
    selectedPaletteId?: string,
): CategoricalLayerStyle | undefined {
    const defaultStyle = getDefaultCategoricalLayerStyle(name, layer);
    const originalStyle = defaultStyle;

    if (!selectedPropertyName) return defaultStyle;

    const colorProperty = getColorableLayerProperties(layer)
        .find((property) => property.name === selectedPropertyName);
    if (!colorProperty) return defaultStyle;

    const mode = selectedMode ?? (colorProperty.kind === "number" ? "scale" : "category");
    const usesOriginalStyle = mode === "category"
        && (!selectedPaletteId || selectedPaletteId === "original")
        && originalStyle?.propertyName === selectedPropertyName;

    if (usesOriginalStyle) return originalStyle;
    if (mode === "scale" && colorProperty.kind === "number") return;

    return getSelectedCategoricalLayerStyle(
        layer,
        selectedPropertyName,
        getColorPalette(mode, selectedPaletteId),
        mode === "scale",
        originalStyle,
    );
}

function getSelectedNumericLayerStyle(
    layer: unknown,
    propertyName?: string,
    paletteId?: string,
): NumericLayerStyle | undefined {
    if (!propertyName) return;

    const colorProperty = getColorableLayerProperties(layer)
        .find((property) => property.name === propertyName);

    if (!colorProperty || colorProperty.kind !== "number") return;

    const values = getFeaturePropertyNumbers(layer, propertyName);
    if (!values.length) return;

    const minValue = values.reduce(
        (currentMin, value) => Math.min(currentMin, value),
        values[0]
    );
    const maxValue = values.reduce(
        (currentMax, value) => Math.max(currentMax, value),
        values[0]
    );
    const palette = getColorPalette("scale", paletteId);

    return {
        propertyName,
        minValue,
        maxValue,
        fillOpacity: GENERATED_LAYER_FILL_OPACITY,
        legendGradient: minValue === maxValue
            ? palette.colors[Math.floor(palette.colors.length / 2)]
            : `linear-gradient(to right, ${palette.colors.join(", ")})`,
        colors: palette.colors,
    };
}

function filterLayerByPropertyValue(
    layer: unknown,
    propertyName: string,
    expectedValue: string | undefined,
    fallbackValue?: string,
): any {
    const parsedLayer = parseFeatureCollection(layer);
    if (!parsedLayer || typeof parsedLayer !== "object" || typeof parsedLayer === "string") return layer;

    const matchesValue = (feature: any) => {
        const value = getPropertyMatchValue(getFeatureProperty(feature, propertyName))
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

function getValueColorGradient(valueColors: readonly CategoryColor[]) {
    if (!valueColors.length) return undefined;

    return `linear-gradient(to bottom, ${valueColors.map(([, color]) => color).join(", ")})`;
}

function getCategoricalColorExpression(style: CategoricalLayerStyle): ExpressionSpecification {
    const matches = style.valueColors.flatMap(([value, color]) =>
        value === undefined ? [] : [value, color]
    );

    return [
        "case",
        ["all", ["has", style.propertyName], ["!=", ["get", style.propertyName], null]],
        [
            "match",
            ["to-string", ["get", style.propertyName]],
            ...matches,
            FUNCTIONAL_ZONE_FALLBACK_COLOR,
        ],
        FUNCTIONAL_ZONE_FALLBACK_COLOR,
    ] as ExpressionSpecification;
}

function getNumericColorExpression(style: NumericLayerStyle): ExpressionSpecification {
    const valueExpression: ExpressionSpecification = [
        "to-number",
        ["get", style.propertyName],
    ];
    const hasValueExpression: ExpressionSpecification = [
        "all",
        ["has", style.propertyName],
        ["!=", ["get", style.propertyName], null],
    ];

    if (style.minValue === style.maxValue) {
        return [
            "case",
            hasValueExpression,
            style.colors[Math.floor(style.colors.length / 2)],
            FUNCTIONAL_ZONE_FALLBACK_COLOR,
        ];
    }

    const colorStops = style.colors.flatMap((color, index) => [
        style.minValue + (style.maxValue - style.minValue) * index / (style.colors.length - 1),
        color,
    ]);

    return [
        "case",
        hasValueExpression,
        [
            "interpolate",
            ["linear"],
            valueExpression,
            ...colorStops,
        ],
        FUNCTIONAL_ZONE_FALLBACK_COLOR,
    ];
}

function createFillLayer(
    id: string,
    color: string | ExpressionSpecification,
    opacity = DEFAULT_FILL_OPACITY,
) {
    return {
        id,
        type: "fill" as const,
        paint: {
            "fill-color": color,
            "fill-opacity": opacity,
        },
    };
}

function createLineLayer(
    id: string,
    color: string | ExpressionSpecification,
    boundaryMaxWidth?: number,
    widthOffset = 0,
) {
    const lineWidth = boundaryMaxWidth
        ? getBoundaryLineWidth(boundaryMaxWidth)
        : [
            "case",
            ["==", ["geometry-type"], "Polygon"],
            0.6,
            getSelectedLineWidth(3),
        ] as ExpressionSpecification;

    return {
        id,
        type: "line" as const,
        paint: {
            "line-color": color,
            "line-width": widthOffset
                ? ["+", lineWidth, widthOffset] as ExpressionSpecification
                : lineWidth,
        },
    };
}

function createLineHitLayer(id: string) {
    return {
        id,
        type: "line" as const,
        paint: {
            "line-color": "#000000",
            "line-opacity": 0,
            "line-width": 10,
        },
    };
}

function getBoundaryLineWidth(maxWidth: number): ExpressionSpecification {
    return [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        maxWidth * 0.2,
        9,
        maxWidth * 0.35,
        12,
        maxWidth * 0.65,
        16,
        maxWidth,
    ];
}

function getSelectedLineWidth(maxWidth: number): ExpressionSpecification {
    return [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        maxWidth * 0.08,
        9,
        maxWidth * 0.2,
        12,
        maxWidth * 0.5,
        16,
        maxWidth,
    ];
}

function createPointLayer(id: string, color: string | ExpressionSpecification) {
    return {
        id,
        type: "circle" as const,
        paint: {
            "circle-radius": 6,
            "circle-color": color,
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
        },
        filter: ["all", ["==", "$type", "Point"]],
    };
}

function isTerritoryBoundaryLayer(name?: string) {
    const normalizedName = name?.trim().toLowerCase();

    return normalizedName === "граница территории" || normalizedName === "границы территории";
}

function isRoadLayer(name?: string) {
    const normalizedName = name?.trim().toLowerCase() ?? "";

    return normalizedName === "дороги" ||
        normalizedName.includes("дорожн") ||
        normalizedName === "roads" ||
        normalizedName.includes("road network");
}

function getLayerLineWidthOffset(name?: string) {
    if (isRoadLayer(name)) return 4;
    if (isProvisionLinksLayer(name)) return 1;

    return 0;
}

function getProvisionLinksHitLayerId(layerId: string) {
    return `geojson-line-hit-${layerId}`;
}

function getDefaultRenderedLayerIds(layerId: string) {
    return [
        `geojson-fill-${layerId}`,
        `geojson-line-${layerId}`,
        `geojson-point-${layerId}`,
    ];
}

function getCategorizedRenderedLayerIds(layerId: string, valueIndex: number) {
    return [
        `geojson-category-fill-${valueIndex}-${layerId}`,
        `geojson-category-line-${valueIndex}-${layerId}`,
        `geojson-category-point-${valueIndex}-${layerId}`,
    ];
}

function getRenderedLayerIds(layerId: string, categoricalStyle?: CategoricalLayerStyle) {
    if (!categoricalStyle?.valueColors.length || categoricalStyle.useExpression) {
        return getDefaultRenderedLayerIds(layerId);
    }

    return categoricalStyle.valueColors.flatMap((_, valueIndex) =>
        getCategorizedRenderedLayerIds(layerId, valueIndex)
    );
}

function getInteractiveRenderedLayerIds(
    layerId: string,
    layerName: string | undefined,
    categoricalStyle?: CategoricalLayerStyle,
) {
    const renderedLayerIds = getRenderedLayerIds(layerId, categoricalStyle);

    if (
        isProvisionLinksLayer(layerName)
        && (!categoricalStyle?.valueColors.length || categoricalStyle.useExpression)
    ) {
        renderedLayerIds.push(getProvisionLinksHitLayerId(layerId));
    }

    return renderedLayerIds;
}

function formatNumericLegendValue(value: number) {
    return new Intl.NumberFormat("ru-RU", {
        maximumFractionDigits: 2,
    }).format(value);
}

const SELECTED_FEATURE_LAYER_IDS = [
    "selected-feature-line-outline",
    "selected-feature-line",
    "selected-feature-point-outline",
    "selected-feature-point",
];

interface MapViewProps {
    isExpanded: boolean;
    onToggleExpanded: () => void;
    fitAllLayers?: boolean;
}

type SelectedFeatureState = {
    layerName: string;
    geometryType: string;
    properties: Record<string, unknown>;
    feature: Feature<Geometry, Record<string, unknown>>;
};

type MapLayerItem = (typeof MapStore.mapLayers)[number];
type LayerRenderingStyle = {
    categoricalStyle?: CategoricalLayerStyle;
    numericStyle?: NumericLayerStyle;
};

type MapLayersPanelProps = {
    mapLayers: typeof MapStore.mapLayers;
    layerRenderingStyles: globalThis.Map<string, LayerRenderingStyle>;
    activeLayerId?: string;
    isExpanded: boolean;
    footerContent?: ReactNode;
    onToggleExpanded: () => void;
    onToggleVisibility: (layer: MapLayerItem) => void;
    onActivate: (layer: MapLayerItem) => void;
    onDownload: (layer: MapLayerItem) => void;
};

const MapLayersPanel = ({
    mapLayers,
    layerRenderingStyles,
    activeLayerId,
    isExpanded,
    footerContent,
    onToggleExpanded,
    onToggleVisibility,
    onActivate,
    onDownload,
}: MapLayersPanelProps) => {
    const [draggedLayerId, setDraggedLayerId] = useState<string>();
    const [dragPreviewLayerIds, setDragPreviewLayerIds] = useState<string[]>();
    const layerRowRefs = useRef(new globalThis.Map<string, HTMLDivElement>());
    const dragPreviewLayerIdsRef = useRef<string[] | undefined>(undefined);
    const dragPointerYRef = useRef<number | undefined>(undefined);
    const dragFrameRef = useRef<number | undefined>(undefined);
    const layerRows = mapLayers.map((layer) => {
        const { categoricalStyle, numericStyle } = layerRenderingStyles.get(layer.id) ?? {};

        return {
            layer,
            legendGradient: numericStyle?.legendGradient ?? categoricalStyle?.legendGradient,
            legendTitle: categoricalStyle?.legendTitle,
        };
    });
    const displayedLayerRows = dragPreviewLayerIds
        ? dragPreviewLayerIds
            .map((layerId) => layerRows.find(({ layer }) => layer.id === layerId))
            .filter((row): row is (typeof layerRows)[number] => Boolean(row))
        : layerRows;

    const updateLayerDragPreview = (clientY: number) => {
        if (!draggedLayerId) return;

        const currentLayerIds = dragPreviewLayerIdsRef.current;
        if (!currentLayerIds) return;

        const targetLayerId = currentLayerIds.reduce<{
            id: string;
            distance: number;
        } | undefined>((closestLayer, layerId) => {
            const row = layerRowRefs.current.get(layerId);
            if (!row) return closestLayer;

            const bounds = row.getBoundingClientRect();
            const distance = Math.abs(clientY - (bounds.top + bounds.bottom) / 2);

            return !closestLayer || distance < closestLayer.distance
                ? { id: layerId, distance }
                : closestLayer;
        }, undefined)?.id;

        if (!targetLayerId || targetLayerId === draggedLayerId) return;

        const sourceIndex = currentLayerIds.indexOf(draggedLayerId);
        const targetIndex = currentLayerIds.indexOf(targetLayerId);
        if (sourceIndex === -1 || targetIndex === -1) return;

        const nextLayerIds = [...currentLayerIds];
        const [movedLayerId] = nextLayerIds.splice(sourceIndex, 1);

        nextLayerIds.splice(targetIndex, 0, movedLayerId);
        dragPreviewLayerIdsRef.current = nextLayerIds;

        setDragPreviewLayerIds(nextLayerIds);
    };

    const finishLayerDrag = (applyOrder: boolean) => {
        if (dragFrameRef.current !== undefined) {
            cancelAnimationFrame(dragFrameRef.current);
            dragFrameRef.current = undefined;
        }

        if (dragPointerYRef.current !== undefined) {
            updateLayerDragPreview(dragPointerYRef.current);
        }

        if (applyOrder && dragPreviewLayerIdsRef.current) {
            MapStore.setLayerOrder(dragPreviewLayerIdsRef.current);
        }

        setDraggedLayerId(undefined);
        setDragPreviewLayerIds(undefined);
        dragPreviewLayerIdsRef.current = undefined;
        dragPointerYRef.current = undefined;
    };

    useEffect(() => {
        if (!draggedLayerId) return;

        const handlePointerMove = (event: PointerEvent) => {
            event.preventDefault();
            dragPointerYRef.current = event.clientY;

            if (dragFrameRef.current !== undefined) return;

            dragFrameRef.current = requestAnimationFrame(() => {
                dragFrameRef.current = undefined;

                if (dragPointerYRef.current !== undefined) {
                    updateLayerDragPreview(dragPointerYRef.current);
                }
            });
        };
        const handlePointerUp = () => finishLayerDrag(true);
        const handlePointerCancel = () => finishLayerDrag(false);

        window.addEventListener("pointermove", handlePointerMove, { passive: false });
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerCancel);
        window.addEventListener("blur", handlePointerCancel);

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerCancel);
            window.removeEventListener("blur", handlePointerCancel);
        };
    }, [draggedLayerId]);

    return (
        <div className={`pointer-events-auto absolute left-4 top-4 z-10 w-[min(18rem,calc(100%-2rem))] max-w-72 ${isExpanded ? "h-[40%]" : ""}`}>
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white/30 px-4 py-3 shadow-sm backdrop-blur-lg customer-dark:border-ui-border customer-dark:bg-surface-panel/30">
                <button
                    type="button"
                    onClick={onToggleExpanded}
                    aria-expanded={isExpanded}
                    className={`flex shrink-0 cursor-pointer items-center justify-between gap-2 text-left text-gray-500 customer-dark:text-content-muted ${isExpanded ? "mb-3" : ""}`}
                >
                    <span className="text-xs font-semibold uppercase tracking-[0.14em]">
                        Отображаемые слои
                    </span>
                    {isExpanded ? <IoChevronDown size={16} /> : <IoChevronUp size={16} />}
                </button>
                <div className={`min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto ${isExpanded ? "flex" : "hidden"}`}>
                    {displayedLayerRows.map(({ layer, legendGradient, legendTitle }) => {
                        const isActiveLayer = activeLayerId === layer.id;
                        const displayName = getLayerDisplayName(layer.name);
                        const listDisplayName = getLayerListDisplayName(layer.name);

                        return (
                            <div
                                key={layer.id}
                                ref={(element) => {
                                    if (element) {
                                        layerRowRefs.current.set(layer.id, element);
                                    } else {
                                        layerRowRefs.current.delete(layer.id);
                                    }
                                }}
                                className={`
                                    flex items-center gap-2 rounded-2xl text-[13px] transition-colors
                                    ${draggedLayerId === layer.id
                                      ? "-mx-1 bg-gray-200/40 px-1 customer-dark:bg-white/5"
                                      : ""}
                                    ${layer.isVisible
                                      ? "text-gray-700 customer-dark:text-content-secondary"
                                      : "text-gray-400 customer-dark:text-content-muted"}
                                `}
                            >
                                <button
                                    type="button"
                                    className="cursor-pointer text-lg text-gray-500 transition-colors hover:text-[#0788CE] customer:hover:text-brand-primary customer-dark:text-content-muted"
                                    onClick={() => onToggleVisibility(layer)}
                                    aria-label={layer.isVisible ? "Скрыть слой" : "Показать слой"}
                                >
                                    {layer.isVisible ? <MdOutlineVisibility /> : <MdOutlineVisibilityOff />}
                                </button>
                                <span
                                    className="h-4 w-1.5 shrink-0 shadow-sm"
                                    title={legendTitle}
                                    style={legendGradient
                                        ? { background: legendGradient }
                                        : { backgroundColor: layer.style.color }}
                                />
                                <button
                                    type="button"
                                    className={`
                                        min-w-0 flex-1 cursor-pointer truncate text-left transition-colors
                                        hover:text-[#0788CE] customer:hover:text-brand-primary customer-dark:hover:text-[#9A252B]
                                        ${isActiveLayer
                                          ? "font-semibold text-[#0788CE] customer:text-brand-primary customer-dark:text-[#9A252B]"
                                          : ""}
                                    `}
                                    onClick={() => onActivate(layer)}
                                    title={displayName}
                                    aria-pressed={isActiveLayer}
                                >
                                    {listDisplayName}
                                </button>
                                <button
                                    type="button"
                                    className="cursor-pointer text-lg text-gray-500 transition-colors hover:text-[#0788CE] customer:hover:text-brand-primary customer-dark:text-content-muted"
                                    onClick={() => onDownload(layer)}
                                    aria-label="Скачать слой"
                                >
                                    <MdDownload />
                                </button>
                                <span
                                    className={`flex shrink-0 touch-none select-none items-center justify-center text-lg transition-colors ${draggedLayerId === layer.id
                                        ? "cursor-grabbing text-[#0788CE] customer:text-brand-primary"
                                        : "cursor-grab text-gray-500 hover:text-[#0788CE] customer:hover:text-brand-primary customer-dark:text-content-muted"}`}
                                    title="Перетащить слой"
                                    aria-label="Перетащить слой"
                                    onPointerDown={(event) => {
                                        if (event.button !== 0) return;

                                        event.preventDefault();
                                        const initialLayerIds = mapLayers.map((currentLayer) => currentLayer.id);

                                        setDraggedLayerId(layer.id);
                                        setDragPreviewLayerIds(initialLayerIds);
                                        dragPreviewLayerIdsRef.current = initialLayerIds;
                                    }}
                                >
                                    <MdDragHandle />
                                </span>
                            </div>
                        );
                    })}
                    {footerContent}
                </div>
            </div>
        </div>
    );
};

const MapView = observer(({
    isExpanded,
    onToggleExpanded,
    fitAllLayers = false,
}: MapViewProps) => {
    const { mapLayers, facadeScene, isMapLayersAvailable } = MapStore;
    const [isMounted, setIsMounted] = useState(false);
    const [mapStyle, setMapStyle] = useState(LIGHT_MAP_STYLE);
    const [isLayersExpanded, setIsLayersExpanded] = useState(true);
    const [isLegendExpanded, setIsLegendExpanded] = useState(true);
    const [isColorSettingsOpen, setIsColorSettingsOpen] = useState(false);
    const [activeLayerId, setActiveLayerId] = useState<string>();
    const [selectedFeature, setSelectedFeature] = useState<SelectedFeatureState | null>(null);
    const [facadeSceneError, setFacadeSceneError] = useState<string>();
    const mapRef = useRef<MapRef | null>(null);
    const propertyListRef = useRef<HTMLDivElement | null>(null);
    const hasAppliedInitialMapPosition = useRef(false);
    const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
    const geoJsonMessages = ChatStore.chatMessages.flatMap(
        (message) => message.message.type === "geojson" ? [message.message] : []
    );
    const parsedGeoJsonMessages = useMemo(
        () => geoJsonMessages.map((message) => ({ ...message, parsedLayer: parseFeatureCollection(message.layer) })),
        [geoJsonMessages]
    );
    const mapBoundsKey = mapLayers
        .map((layer) => `${layer.id}:${layer.isVisible}`)
        .sort()
        .join("|");
    const displayedLayersBounds = useMemo(
        () => fitAllLayers
            ? mapLayers.reduce<Bounds | undefined>(
                (bounds, layer) => layer.isVisible
                    ? mergeBounds(bounds, getFeatureBounds(layer.layer))
                    : bounds,
                undefined,
            )
            : getFeatureBounds(mapLayers.at(-1)?.layer),
        [fitAllLayers, mapBoundsKey],
    );
    const layerRenderingStylesKey = mapLayers
        .map((layer) => [
            layer.id,
            layer.name,
            layer.style.color,
            layer.style.colorByProperty ?? "",
            layer.style.colorMode ?? "",
            layer.style.colorPalette ?? "",
        ].join(":"))
        .sort()
        .join("|");
    const layerRenderingStyles = useMemo(() => new globalThis.Map(
        mapLayers.map((layer) => {
            if (isTerritoryBoundaryLayer(layer.name)) {
                const boundaryRenderingStyle: LayerRenderingStyle = {};

                return [layer.id, boundaryRenderingStyle] as const;
            }

            const colorPropertyName = getLayerColorPropertyName(
                layer.name,
                layer.layer,
                layer.style.colorByProperty,
            );
            const colorMode = getAvailableColorMode(
                layer.name,
                layer.layer,
                colorPropertyName ?? "",
                getSelectedColorMode(layer.style.colorMode),
            );
            const categoricalStyle = getCategoricalLayerStyle(
                layer.name,
                layer.layer,
                colorPropertyName,
                colorMode,
                layer.style.colorPalette,
            );
            const numericStyle = categoricalStyle
                ? undefined
                : getSelectedNumericLayerStyle(
                    layer.layer,
                    colorPropertyName,
                    layer.style.colorPalette,
                );

            return [layer.id, { categoricalStyle, numericStyle }] as const;
        }),
    ), [layerRenderingStylesKey]);
    const interactiveLayers = mapLayers.flatMap((layer) => {
        if (!layer.isVisible) {
            return [];
        }

        const categoricalStyle = layerRenderingStyles.get(layer.id)?.categoricalStyle;

        return getInteractiveRenderedLayerIds(
            layer.id,
            layer.name,
            categoricalStyle,
        ).map((renderedLayerId) => ({
            renderedLayerId,
            layer,
        }));
    });
    const interactiveLayerIds = interactiveLayers.map(({ renderedLayerId }) => renderedLayerId);
    const renderedMapLayers = [...mapLayers].reverse();
    const layerOrderKey = mapLayers.map((layer) => layer.id).join("|");
    const activeLayer = mapLayers.find(
        (layer) => layer.id === activeLayerId && layer.isVisible,
    )
        ?? [...mapLayers].reverse().find((layer) => layer.isVisible);
    const activeLayerColorProperties = activeLayer
        ? getColorableLayerProperties(activeLayer.layer)
        : [];
    const activeColorPropertyName = activeLayer
        ? getLayerColorPropertyName(
            activeLayer.name,
            activeLayer.layer,
            activeLayer.style.colorByProperty,
        ) ?? ""
        : "";
    const requestedActiveColorMode = getSelectedColorMode(activeLayer?.style.colorMode);
    const activeColorMode = activeLayer
        ? getAvailableColorMode(
            activeLayer.name,
            activeLayer.layer,
            activeColorPropertyName,
            requestedActiveColorMode,
        )
        : requestedActiveColorMode;
    const activeOriginalLayerStyle = activeLayer
        ? getDefaultCategoricalLayerStyle(activeLayer.name, activeLayer.layer)
        : undefined;
    const canUseActiveScaleColorMode = activeLayer
        ? canUseScaleColorMode(
            activeLayer.name,
            activeLayer.layer,
            activeColorPropertyName,
        )
        : true;
    const canUseActiveCategoryColorMode = activeLayer
        ? canUseCategoryColorMode(activeLayer.name)
        : true;
    const canUseOriginalPalette = activeColorMode === "category"
        && activeOriginalLayerStyle?.propertyName === activeColorPropertyName;
    const activePalette = getColorPalette(activeColorMode, activeLayer?.style.colorPalette);
    const activePaletteId = canUseOriginalPalette
        && (!activeLayer?.style.colorPalette || activeLayer.style.colorPalette === "original")
        ? "original"
        : activePalette.id;
    const availableColorPalettes: readonly ColorPalette[] = activeColorMode === "category"
        ? [
            ...(canUseOriginalPalette && activeOriginalLayerStyle
                ? [{
                    id: "original",
                    label: "Исходная",
                    colors: activeOriginalLayerStyle.valueColors.map(([, color]) => color),
                }]
                : []),
            ...CATEGORY_COLOR_PALETTES,
        ]
        : SCALE_COLOR_PALETTES;
    const activeLayerStyle = activeLayer
        ? getCategoricalLayerStyle(
            activeLayer.name,
            activeLayer.layer,
            activeColorPropertyName,
            activeColorMode,
            activeLayer.style.colorPalette,
        )
        : undefined;
    const activeNumericStyle = activeLayer && !activeLayerStyle
        ? getSelectedNumericLayerStyle(
            activeLayer.layer,
            activeColorPropertyName,
            activeLayer.style.colorPalette,
        )
        : undefined;
    const mapLegendItems = activeLayer && !activeNumericStyle
        ? getMapLegendItems(activeLayer, activeLayerStyle)
        : [];
    const colorPropertyOptions: SelectOption[] = activeLayerColorProperties.map((property) => ({
        value: property.name,
        label: property.name,
    }));
    const activeScaleLegend = activeNumericStyle
        ? {
            gradient: activeNumericStyle.legendGradient,
            minLabel: formatNumericLegendValue(activeNumericStyle.minValue),
            maxLabel: formatNumericLegendValue(activeNumericStyle.maxValue),
        }
        : activeLayerStyle?.scaleLabels
            ? {
                gradient: activeLayerStyle.scaleGradient,
                minLabel: activeLayerStyle.scaleLabels[0],
                maxLabel: activeLayerStyle.scaleLabels[1],
            }
            : undefined;
    const initialViewState = displayedLayersBounds
        ? {
            longitude: fitAllLayers
                ? (displayedLayersBounds[0][0] + displayedLayersBounds[1][0]) / 2
                : displayedLayersBounds[0][0],
            latitude: fitAllLayers
                ? (displayedLayersBounds[0][1] + displayedLayersBounds[1][1]) / 2
                : displayedLayersBounds[0][1],
            zoom: 11,
        }
        : facadeScene
            ? {
                longitude: facadeScene.origin.lon,
                latitude: facadeScene.origin.lat,
                zoom: 16.5,
                pitch: 60,
            }
            : {
                longitude: 37.6173,
                latitude: 55.7558,
                zoom: 11,
            };

    const downloadLayer = (name: string, layer: unknown) => {
        const fileName = `${(name || "layer")
            .trim()
            .replace(/[^\w.-]+/g, "_")
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
    };

    const getMapLayerByRenderedLayerId = (renderedLayerId?: string) => {
        return interactiveLayers.find(
            (interactiveLayer) => interactiveLayer.renderedLayerId === renderedLayerId,
        )?.layer;
    };

    const handleFeatureClick = (event: MapMouseEvent) => {
        const clickedFeature = event.features?.find((feature) => (
            getMapLayerByRenderedLayerId(feature.layer?.id)?.id === activeLayer?.id
        )) ?? event.features?.[0];

        if (!clickedFeature) {
            setSelectedFeature(null);
            return;
        }

        const sourceLayer = getMapLayerByRenderedLayerId(clickedFeature.layer?.id);

        const properties = clickedFeature.properties ?? {};

        setSelectedFeature({
            layerName: sourceLayer?.name || "Без названия",
            geometryType: clickedFeature.geometry?.type || "Unknown",
            properties,
            feature: {
                type: "Feature",
                geometry: clickedFeature.geometry,
                properties,
            },
        });
    };

    const zoomToBounds = (bounds: Bounds | undefined, duration = 1600) => {
        if (!bounds || !mapRef.current) return;

        const map = mapRef.current;
        const [[minLng, minLat], [maxLng, maxLat]] = bounds;

        if (minLng === maxLng && minLat === maxLat) {
            map.flyTo({
                center: [minLng, minLat],
                zoom: 14,
                duration,
                essential: true,
            });
            return;
        }

        map.fitBounds(bounds, {
            padding: 64,
            duration,
            essential: true,
        });
    };

    const zoomToLayer = (layer: unknown) => {
        zoomToBounds(getFeatureBounds(layer));
    };

    const syncMapLayerOrder = () => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        const desiredLayerIds = [
            ...renderedMapLayers.flatMap((layer) => {
                const categoricalStyle = layerRenderingStyles.get(layer.id)?.categoricalStyle;

                return getInteractiveRenderedLayerIds(
                    layer.id,
                    layer.name,
                    categoricalStyle,
                );
            }),
            ...SELECTED_FEATURE_LAYER_IDS,
        ].filter((layerId) => Boolean(map.getLayer(layerId)));
        const desiredLayerIdSet = new Set(desiredLayerIds);
        const currentLayerIds = map.getStyle().layers
            .map((layer) => layer.id)
            .filter((layerId) => desiredLayerIdSet.has(layerId));
        const isAlreadyOrdered = desiredLayerIds.length === currentLayerIds.length
            && desiredLayerIds.every((layerId, index) => currentLayerIds[index] === layerId);

        if (isAlreadyOrdered) return;

        desiredLayerIds.forEach((layerId) => map.moveLayer(layerId));
    };

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (!activeLayer || requestedActiveColorMode === activeColorMode) return;

        const usesOriginalPalette = activeColorMode === "category"
            && activeOriginalLayerStyle?.propertyName === activeColorPropertyName;

        MapStore.setLayerColorSettings(activeLayer.id, {
            mode: activeColorMode,
            palette: usesOriginalPalette
                ? "original"
                : getColorPalette(activeColorMode, activeLayer.style.colorPalette).id,
        });
    }, [
        activeLayer?.id,
        requestedActiveColorMode,
        activeColorMode,
        activeColorPropertyName,
    ]);

    useEffect(() => {
        const usedPaletteIds = new globalThis.Map<MapColorMode, Set<string>>([
            ["category", new Set<string>()],
            ["scale", new Set<string>()],
        ]);

        mapLayers.forEach((layer) => {
            if (
                !layer.style.colorPalette ||
                (
                    layer.style.colorPaletteSelection !== "user" &&
                    layer.style.colorPaletteAutoVersion !== INITIAL_COLOR_PALETTE_VERSION
                )
            ) return;

            const propertyName = getLayerColorPropertyName(
                layer.name,
                layer.layer,
                layer.style.colorByProperty,
            );
            if (!propertyName) return;

            const mode = getAvailableColorMode(
                layer.name,
                layer.layer,
                propertyName,
                getSelectedColorMode(layer.style.colorMode),
            );

            if (getColorPalettes(mode).some((palette) => palette.id === layer.style.colorPalette)) {
                usedPaletteIds.get(mode)?.add(layer.style.colorPalette);
            }
        });

        mapLayers.forEach((layer) => {
            if (
                isTerritoryBoundaryLayer(layer.name) ||
                layer.style.colorPaletteSelection === "user" ||
                layer.style.colorPaletteAutoVersion === INITIAL_COLOR_PALETTE_VERSION
            ) return;

            const propertyName = getLayerColorPropertyName(
                layer.name,
                layer.layer,
                layer.style.colorByProperty,
            );
            if (!propertyName) return;

            const mode = getAvailableColorMode(
                layer.name,
                layer.layer,
                propertyName,
                getSelectedColorMode(layer.style.colorMode),
            );
            const modePaletteIds = usedPaletteIds.get(mode) ?? new Set<string>();
            const palette = getRandomInitialColorPalette(mode, modePaletteIds);

            modePaletteIds.add(palette.id);
            usedPaletteIds.set(mode, modePaletteIds);
            MapStore.setLayerColorSettings(layer.id, {
                mode,
                palette: palette.id,
                paletteSelection: "auto",
                paletteAutoVersion: INITIAL_COLOR_PALETTE_VERSION,
            });
        });
    }, [mapLayers]);

    useEffect(() => {
        const updateMapStyle = () => {
            const isDarkTheme = document.documentElement.dataset.colorScheme === "dark";

            setMapStyle(isDarkTheme ? DARK_MAP_STYLE : LIGHT_MAP_STYLE);
        };

        const themeObserver = new MutationObserver(updateMapStyle);

        updateMapStyle();
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["data-color-scheme"],
        });

        return () => themeObserver.disconnect();
    }, []);

    useEffect(() => {
        if (!isMounted || !mapRef.current) return;

        const animationFrameId = requestAnimationFrame(syncMapLayerOrder);

        return () => cancelAnimationFrame(animationFrameId);
    }, [isMounted, layerOrderKey, layerRenderingStyles, mapStyle]);

    useEffect(() => {
        if (
            !isMounted
            || !displayedLayersBounds
            || facadeScene?.isVisible
            || hasAppliedInitialMapPosition.current
        ) {
            return;
        }

        const timeout = window.setTimeout(() => {
            zoomToBounds(displayedLayersBounds);
            hasAppliedInitialMapPosition.current = true;
        }, 300);

        return () => window.clearTimeout(timeout);
    }, [isMounted, displayedLayersBounds, facadeScene?.isVisible]);

    useEffect(() => {
        if (!isMounted || !facadeScene?.isVisible || !mapRef.current) return;

        mapRef.current.flyTo({
            center: [facadeScene.origin.lon, facadeScene.origin.lat],
            zoom: 16.5,
            pitch: 60,
            duration: 1600,
            essential: true,
        });
    }, [isMounted, facadeScene?.resultId, facadeScene?.isVisible]);

    useEffect(() => {
        setFacadeSceneError(undefined);
        if (!isMounted || !facadeScene?.isVisible || !mapRef.current) return;

        const baseUrl = import.meta.env.VITE_GENBUILDER_API;
        const accessToken = AuthStore.accessToken;
        if (!baseUrl || !accessToken) {
            setFacadeSceneError("Не удалось загрузить 3D-модель: сервис недоступен.");
            MapStore.setFacadeSceneLoadStatus(facadeScene.resultId, "error");
            return;
        }

        const map = mapRef.current.getMap();
        const controller = new AbortController();
        let modelUrl: string | undefined;
        let layer: ReturnType<typeof createFacadeSceneLayer> | undefined;
        let disposed = false;
        let hasFitModel = false;
        const addLayer = () => {
            if (disposed || !layer || !map.isStyleLoaded() || map.getLayer(layer.id)) return;
            try {
                map.addLayer(layer);
            } catch (error) {
                console.error("Error adding facade scene to map:", error);
                setFacadeSceneError("Не удалось отобразить 3D-модель на карте.");
                MapStore.setFacadeSceneLoadStatus(facadeScene.resultId, "error");
            }
        };

        map.on("style.load", addLayer);
        void getFacadeSceneGlb(baseUrl, accessToken, facadeScene.glbUrl, controller.signal)
            .then((blob) => {
                if (disposed) return;
                modelUrl = URL.createObjectURL(blob);
                layer = createFacadeSceneLayer(facadeScene, modelUrl, () => {
                    setFacadeSceneError("Не удалось открыть GLB-файл 3D-модели.");
                    MapStore.setFacadeSceneLoadStatus(facadeScene.resultId, "error");
                }, (bounds) => {
                    if (disposed || hasFitModel) return;
                    hasFitModel = true;
                    map.fitBounds(bounds, {
                        padding: 80,
                        maxZoom: 16.5,
                        pitch: 60,
                        duration: 1600,
                        essential: true,
                    });
                }, () => {
                    if (!disposed) MapStore.setFacadeSceneLoadStatus(facadeScene.resultId, "ready");
                });
                addLayer();
            })
            .catch((error) => {
                if (disposed || controller.signal.aborted) return;
                console.error("Error downloading facade scene:", error);
                setFacadeSceneError("Не удалось загрузить GLB-файл 3D-модели.");
                MapStore.setFacadeSceneLoadStatus(facadeScene.resultId, "error");
            });

        return () => {
            disposed = true;
            controller.abort();
            map.off("style.load", addLayer);
            try {
                if (layer && map.getLayer(layer.id)) map.removeLayer(layer.id);
            } catch {
                // The map may already have removed its style while unmounting.
            }
            if (modelUrl) URL.revokeObjectURL(modelUrl);
        };
    }, [isMounted, facadeScene?.resultId, facadeScene?.glbUrl, facadeScene?.isVisible]);

    useEffect(() => {
        setSelectedFeature(null);
    }, [mapLayers]);

    useEffect(() => {
        if (propertyListRef.current) {
            propertyListRef.current.scrollTop = 0;
        }
    }, [selectedFeature]);

    return (
        <div className="relative h-full w-full overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm customer-dark:border-ui-border customer-dark:bg-surface-panel">
            <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
                <button
                    type="button"
                    className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm backdrop-blur transition-colors hover:border-[#0788CE] hover:text-[#0788CE] customer:hover:border-brand-primary customer:hover:text-brand-primary customer-dark:border-ui-border customer-dark:bg-surface-raised/95 customer-dark:text-content-secondary"
                    onClick={onToggleExpanded}
                >
                    {isExpanded ? <IoChevronDown size={18} /> : <IoChevronUp size={18} />}
                    {isExpanded ? "Свернуть карту" : "Поднять карту"}
                </button>
            </div>
            {!isMounted ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500 customer-dark:text-content-muted">
                    Loading map...
                </div>
            ) : (
                <MapCanvas
                    mapRef={mapRef}
                    interactiveLayerIds={interactiveLayerIds}
                    initialViewState={initialViewState}
                    mapStyle={mapStyle}
                    language="ru"
                    projection="mercator"
                    mapboxAccessToken={mapboxToken}
                    onClick={handleFeatureClick}
                    onIdle={syncMapLayerOrder}
                    cursor={interactiveLayerIds.length ? "pointer" : "default"}
                    style={{ borderRadius: "inherit", overflow: "hidden" }}
                >
                    {renderedMapLayers.map((layer) => {
                        if (!layer) return null;

                        const layerColor = layer.style?.color ?? "#fff";
                        const isBoundaryLayer = isTerritoryBoundaryLayer(layer.name);
                        const { categoricalStyle, numericStyle } = layerRenderingStyles.get(layer.id) ?? {};

                        if (categoricalStyle?.valueColors.length && !categoricalStyle.useExpression) {
                            return categoricalStyle.valueColors.map(([value, color], valueIndex) => {
                                const [fillLayerId, lineLayerId, pointLayerId] = getCategorizedRenderedLayerIds(layer.id, valueIndex);

                                return (
                                    <Source
                                        key={`geojson-category-source-${layer.id}-${valueIndex}`}
                                        id={`geojson-category-source-${layer.id}-${valueIndex}`}
                                        type="geojson"
                                        data={filterLayerByPropertyValue(
                                            layer.layer,
                                            categoricalStyle.propertyName,
                                            value,
                                            categoricalStyle.fallbackValue,
                                        )}
                                    >
                                        {!isBoundaryLayer && (
                                            <Layer
                                                {...createFillLayer(fillLayerId, color, categoricalStyle.fillOpacity)}
                                                layout={{ visibility: layer.isVisible ? "visible" : "none" }}
                                            />
                                        )}
                                        <Layer
                                            {...createLineLayer(
                                                lineLayerId,
                                                categoricalStyle.lineColor ?? color,
                                                isBoundaryLayer ? 3 : undefined,
                                                getLayerLineWidthOffset(layer.name),
                                            )}
                                            layout={{ visibility: layer.isVisible ? "visible" : "none" }}
                                        />
                                        {!isBoundaryLayer && (
                                            <Layer
                                                {...createPointLayer(pointLayerId, color)}
                                                layout={{ visibility: layer.isVisible ? "visible" : "none" }}
                                            />
                                        )}
                                    </Source>
                                );
                            });
                        }

                        const dataDrivenColor = categoricalStyle?.useExpression
                            ? getCategoricalColorExpression(categoricalStyle)
                            : numericStyle
                                ? getNumericColorExpression(numericStyle)
                                : undefined;
                        const renderedColor = dataDrivenColor ?? layerColor;
                        const fillOpacity = categoricalStyle?.fillOpacity
                            ?? numericStyle?.fillOpacity
                            ?? DEFAULT_FILL_OPACITY;

                        return (
                            <Source
                                key={`geojson-source-${layer.id}`}
                                id={`geojson-source-${layer.id}`}
                                type="geojson"
                                data={layer.layer}
                            >
                                {!isBoundaryLayer && (
                                    <Layer
                                        {...createFillLayer(`geojson-fill-${layer.id}`, renderedColor, fillOpacity)}
                                        layout={{ visibility: layer.isVisible ? "visible" : "none" }}
                                    />
                                )}
                                <Layer
                                    {...createLineLayer(
                                        `geojson-line-${layer.id}`,
                                        renderedColor,
                                        isBoundaryLayer ? 3 : undefined,
                                        getLayerLineWidthOffset(layer.name),
                                    )}
                                    layout={{ visibility: layer.isVisible ? "visible" : "none" }}
                                />
                                {isProvisionLinksLayer(layer.name) && (
                                    <Layer
                                        {...createLineHitLayer(getProvisionLinksHitLayerId(layer.id))}
                                        layout={{ visibility: layer.isVisible ? "visible" : "none" }}
                                    />
                                )}
                                {!isBoundaryLayer && (
                                    <Layer
                                        {...createPointLayer(`geojson-point-${layer.id}`, renderedColor)}
                                        layout={{ visibility: layer.isVisible ? "visible" : "none" }}
                                    />
                                )}
                            </Source>
                        );
                    })}
                    {selectedFeature && (
                        <Source
                            id="selected-feature-source"
                            type="geojson"
                            data={selectedFeature.feature}
                        >
                            <Layer
                                id="selected-feature-line-outline"
                                type="line"
                                paint={{
                                    "line-color": SELECTED_FEATURE_OUTLINE_COLOR,
                                    "line-width": getSelectedLineWidth(7),
                                }}
                            />
                            <Layer
                                id="selected-feature-line"
                                type="line"
                                paint={{
                                    "line-color": SELECTED_FEATURE_COLOR,
                                    "line-width": getSelectedLineWidth(4),
                                }}
                            />
                            <Layer
                                id="selected-feature-point-outline"
                                type="circle"
                                paint={{
                                    "circle-radius": 10,
                                    "circle-color": SELECTED_FEATURE_OUTLINE_COLOR,
                                }}
                                filter={["==", "$type", "Point"]}
                            />
                            <Layer
                                id="selected-feature-point"
                                type="circle"
                                paint={{
                                    "circle-radius": 7,
                                    "circle-color": SELECTED_FEATURE_COLOR,
                                }}
                                filter={["==", "$type", "Point"]}
                            />
                        </Source>
                    )}
                </MapCanvas>
            )}
            {isMapLayersAvailable && (
                <MapLayersPanel
                    mapLayers={mapLayers}
                    layerRenderingStyles={layerRenderingStyles}
                    activeLayerId={activeLayer?.id}
                    isExpanded={isLayersExpanded}
                    onToggleExpanded={() => setIsLayersExpanded((current) => !current)}
                    onToggleVisibility={(layer) => {
                        if (activeLayer?.id === layer.id) {
                            setActiveLayerId(undefined);
                        }

                        MapStore.toggleLayerVisibility(layer.id);
                    }}
                    onActivate={(layer) => {
                        if (layer.isVisible) {
                            setActiveLayerId(layer.id);
                            setIsColorSettingsOpen(false);
                        }

                        zoomToLayer(layer.layer);
                    }}
                    onDownload={(layer) => downloadLayer(layer.name, layer.layer)}
                    footerContent={(
                        <>
                            {facadeScene && (
                                <div className={`flex items-center gap-2 rounded-2xl text-[13px] ${facadeScene.isVisible ? "text-gray-700 customer-dark:text-content-secondary" : "text-gray-400 customer-dark:text-content-muted"}`}>
                                    <button
                                        type="button"
                                        className="cursor-pointer text-lg text-gray-500 customer-dark:text-content-muted"
                                        onClick={() => MapStore.toggleFacadeSceneVisibility()}
                                        aria-label={facadeScene.isVisible ? "Скрыть 3D-модель" : "Показать 3D-модель"}
                                    >
                                        {facadeScene.isVisible ? <MdOutlineVisibility /> : <MdOutlineVisibilityOff />}
                                    </button>
                                    <span className="h-4 w-1.5 shrink-0 bg-blue-500 shadow-sm" />
                                    <button
                                        type="button"
                                        className="min-w-0 flex-1 cursor-pointer truncate text-left hover:text-[#0788CE] customer:hover:text-brand-primary"
                                        onClick={() => mapRef.current?.flyTo({ center: [facadeScene.origin.lon, facadeScene.origin.lat], zoom: 16.5, pitch: 60, essential: true })}
                                        title={facadeScene.facadeStyle ? `3D-застройка: ${facadeScene.facadeStyle}` : "3D-застройка"}
                                    >
                                        3D-застройка{facadeScene.facadeStyle ? ` · ${facadeScene.facadeStyle}` : ""}
                                    </button>
                                </div>
                            )}
                            {facadeScene?.isVisible && MapStore.facadeSceneLoadStatus === "loading" && (
                                <div className="pl-7 text-xs text-gray-500 customer-dark:text-content-muted" role="status">
                                    Загружаем 3D-модель...
                                </div>
                            )}
                            {facadeSceneError && (
                                <div className="text-xs text-red-700 customer:text-danger-content">{facadeSceneError}</div>
                            )}
                        </>
                    )}
                />
            )}
            {activeLayer && (activeLayerColorProperties.length > 0 || mapLegendItems.length > 0) && (
                <div className="pointer-events-auto absolute bottom-8 left-4 z-10 flex max-h-[calc(60%-3.5rem)] w-[min(18rem,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white/30 shadow-lg backdrop-blur customer-dark:border-ui-border customer-dark:bg-surface-panel/30">
                    <div className={`flex w-full shrink-0 items-center gap-2 px-4 text-gray-500 customer-dark:text-content-muted ${isColorSettingsOpen ? "py-2" : "py-2.5 transition-colors hover:bg-slate-50/70 customer-dark:hover:bg-surface-hover/70"}`}>
                        {isColorSettingsOpen ? (
                            <button
                                type="button"
                                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left transition-colors hover:text-[#0788CE] customer:hover:text-brand-primary"
                                onClick={() => setIsColorSettingsOpen(false)}
                            >
                                <IoArrowBack className="shrink-0" size={16} />
                                <span className="truncate text-xs font-semibold uppercase tracking-[0.14em]">
                                    Настройка раскраски
                                </span>
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    className="flex min-w-0 flex-1 cursor-pointer items-center text-left transition-colors hover:text-slate-700 customer-dark:hover:text-content-primary"
                                    onClick={() => setIsLegendExpanded((currentValue) => !currentValue)}
                                    aria-expanded={isLegendExpanded}
                                >
                                    <span className="truncate text-xs font-semibold uppercase tracking-[0.14em]">
                                        {getLayerDisplayName(activeLayer.name)}
                                    </span>
                                </button>
                                {activeLayerColorProperties.length > 0 && (
                                    <button
                                        type="button"
                                        className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-slate-100 hover:text-[#0788CE] customer:hover:bg-brand-soft customer:hover:text-brand-primary customer-dark:hover:bg-surface-hover"
                                        onClick={() => {
                                            setIsLegendExpanded(true);
                                            setIsColorSettingsOpen(true);
                                        }}
                                        aria-label="Настроить раскраску"
                                    >
                                        <MdPalette size={16} />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-slate-100 hover:text-slate-700 customer-dark:hover:bg-surface-hover customer-dark:hover:text-content-primary"
                                    onClick={() => setIsLegendExpanded((currentValue) => !currentValue)}
                                    aria-label={isLegendExpanded ? "Свернуть легенду" : "Развернуть легенду"}
                                    aria-expanded={isLegendExpanded}
                                >
                                    {isLegendExpanded ? <IoChevronDown size={16} /> : <IoChevronUp size={16} />}
                                </button>
                            </>
                        )}
                    </div>
                    {(isLegendExpanded || isColorSettingsOpen) && (
                        <div className={`map-legend-scroll min-h-0 overflow-y-auto border-t border-gray-200 px-4 py-2.5 customer-dark:border-ui-border ${isColorSettingsOpen ? "max-h-72" : "max-h-28"}`}>
                            {isColorSettingsOpen ? (
                                <div className="flex flex-col gap-3">
                                    <div className="flex flex-col gap-1">
                                        <div className="text-[11px] font-medium text-slate-500 customer-dark:text-content-muted">
                                            Атрибут
                                        </div>
                                        <CustomSelect
                                            value={activeColorPropertyName || undefined}
                                            options={colorPropertyOptions}
                                            placeholder="Выберите атрибут"
                                            ariaLabel="Выберите атрибут раскраски"
                                            block
                                            compact
                                            fitMenuToOptions
                                            onChange={(value) => {
                                                const propertyName = String(value);
                                                const colorMode = getAvailableColorMode(
                                                    activeLayer.name,
                                                    activeLayer.layer,
                                                    propertyName,
                                                    activeColorMode,
                                                );
                                                const usesOriginalPalette = colorMode === "category"
                                                    && activeOriginalLayerStyle?.propertyName === propertyName;

                                                MapStore.setLayerColorSettings(activeLayer.id, {
                                                    propertyName,
                                                    mode: colorMode,
                                                    palette: usesOriginalPalette
                                                        ? "original"
                                                        : getColorPalette(
                                                            colorMode,
                                                            activeLayer.style.colorPalette,
                                                        ).id,
                                                });
                                            }}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <div className="text-[11px] font-medium text-slate-500 customer-dark:text-content-muted">
                                            Тип раскраски
                                        </div>
                                        <div className="grid grid-cols-2 gap-1">
                                            {([
                                                ["category", "Категориальная"],
                                                ["scale", "Градиентная"],
                                            ] as const).map(([mode, label]) => {
                                                const isDisabled = mode === "category"
                                                    ? !canUseActiveCategoryColorMode
                                                    : !canUseActiveScaleColorMode;

                                                return (
                                                    <button
                                                        key={mode}
                                                        type="button"
                                                        className={`h-7 rounded-lg border px-2 !text-[11px] font-medium transition-colors ${isDisabled
                                                            ? "cursor-default border-slate-200 bg-slate-100 text-slate-400 customer-dark:border-ui-border customer-dark:bg-surface-muted customer-dark:text-content-muted"
                                                            : activeColorMode === mode
                                                                ? "border-[#0788CE] bg-[#EAF5FF] text-[#0B5E8E] customer:border-brand-primary customer:bg-brand-soft customer:text-brand-contrast"
                                                                : "border-slate-200 bg-white text-slate-600 hover:border-[#0788CE] customer:hover:border-brand-primary customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-secondary"}`}
                                                        disabled={isDisabled}
                                                        onClick={() => MapStore.setLayerColorSettings(activeLayer.id, {
                                                            mode,
                                                            palette: mode === "category" && activeOriginalLayerStyle?.propertyName === activeColorPropertyName
                                                                ? "original"
                                                                : getColorPalette(mode, activeLayer.style.colorPalette).id,
                                                        })}
                                                    >
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <div className="text-[11px] font-medium text-slate-500 customer-dark:text-content-muted">
                                            Палитра
                                        </div>
                                        <div className="grid grid-cols-2 gap-1">
                                            {availableColorPalettes.map((palette) => (
                                                <button
                                                    key={palette.id}
                                                    type="button"
                                                    className={`w-full rounded-lg border p-1.5 transition-colors ${activePaletteId === palette.id
                                                        ? "border-[#0788CE] bg-[#EAF5FF] customer:border-brand-primary customer:bg-brand-soft"
                                                        : "border-slate-200 bg-white hover:border-[#0788CE] customer:hover:border-brand-primary customer-dark:border-ui-border customer-dark:bg-surface-raised"}`}
                                                    onClick={() => MapStore.setLayerColorSettings(activeLayer.id, {
                                                        palette: palette.id,
                                                        paletteSelection: "user",
                                                    })}
                                                    aria-label={`Выбрать палитру ${palette.label}`}
                                                >
                                                    <span
                                                        className="block h-3 w-full rounded-full border border-black/10"
                                                        style={{ background: `linear-gradient(to right, ${palette.colors.join(", ")})` }}
                                                    />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : activeScaleLegend ? (
                                <div className="flex flex-col gap-1.5">
                                    <div
                                        className="h-3 w-full rounded-full border border-black/10"
                                        style={{ background: activeScaleLegend.gradient }}
                                    />
                                    <div className="flex justify-between gap-3 text-[11px] text-slate-600 customer-dark:text-content-muted">
                                        <span>{activeScaleLegend.minLabel}</span>
                                        <span>{activeScaleLegend.maxLabel}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-1.5">
                                    {mapLegendItems.map((item, index) => (
                                        <div
                                            key={`${item.label}-${index}`}
                                            className="flex items-center gap-2 text-[13px] text-slate-700 customer-dark:text-content-secondary"
                                        >
                                            <span
                                                className="h-3 w-3 shrink-0 rounded-sm border border-black/10"
                                                style={{ backgroundColor: item.color }}
                                            />
                                            <span>{item.label}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            {selectedFeature && (
                <div className="pointer-events-auto absolute top-4 right-4 z-10 flex max-h-[calc(100%-2rem)] w-[min(24rem,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white/50 p-3 shadow-lg backdrop-blur customer-dark:border-ui-border customer-dark:bg-surface-panel/50">
                    <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="truncate pl-[5px] text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 customer-dark:text-content-muted">
                                {getLayerListDisplayName(selectedFeature.layerName)}
                            </div>
                        </div>
                        <button
                            type="button"
                            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 customer-dark:text-content-muted customer-dark:hover:bg-surface-hover customer-dark:hover:text-content-primary"
                            onClick={() => setSelectedFeature(null)}
                            aria-label="Закрыть свойства"
                        >
                            <IoClose aria-hidden="true" size={16} />
                        </button>
                    </div>
                    <div
                        className="map-property-scroll min-h-0 overflow-y-auto overscroll-contain rounded-xl bg-slate-50/60 py-2 customer-dark:bg-surface-muted/60"
                        ref={propertyListRef}
                        onWheel={(event) => event.stopPropagation()}
                        onTouchMove={(event) => event.stopPropagation()}
                    >
                        {Object.keys(selectedFeature.properties).length ? (
                            Object.entries(selectedFeature.properties).map(([key, propertyValue]) => (
                                <div key={key} className="mx-3 border-b border-slate-200 py-2 last:border-b-0 customer-dark:border-ui-border">
                                    <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500 customer-dark:text-content-muted">
                                        {key}
                                    </div>
                                    <div className="mt-1 wrap-break-word text-sm text-slate-800 customer-dark:text-content-primary">
                                        {formatSelectedFeaturePropertyValue(
                                            selectedFeature.layerName,
                                            key,
                                            propertyValue,
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="mx-3 py-2 text-sm text-slate-500 customer-dark:text-content-muted">
                                У объекта нет свойств
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});

export default MapView;
