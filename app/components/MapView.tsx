import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { IoChevronDown, IoChevronUp, IoClose } from "react-icons/io5";
import {
    MdOutlineVisibility,
    MdOutlineVisibilityOff,
    MdDownload
} from "react-icons/md";
import Map, { Layer, Source } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import type { MapMouseEvent } from "react-map-gl/mapbox";
import type { Feature, Geometry } from "geojson";
import "mapbox-gl/dist/mapbox-gl.css";
import ChatStore from "@lib/ChatStore";
import MapStore from "@lib/MapStore";
import {
    FUNCTIONAL_ZONE_FALLBACK_COLOR,
    FUNCTIONAL_ZONE_ID_PROPERTY,
    FUNCTIONAL_ZONE_NAME_PROPERTY,
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

function getFeatureBounds(featureCollection: any): Bounds | undefined {
    if (!featureCollection || typeof featureCollection !== "object") {
        return undefined;
    }

    if (featureCollection.type === "FeatureCollection" && Array.isArray(featureCollection.features)) {
        const features = featureCollection.features as any[];
        return features.reduce((bounds: Bounds | undefined, feature: any) => {
            return collectBounds(feature?.geometry?.coordinates, bounds);
        }, undefined);
    }

    if (featureCollection.type === "Feature") {
        return collectBounds(featureCollection.geometry?.coordinates);
    }

    return collectBounds(featureCollection.coordinates);
}

function getRandomColor() {
    const red = 40 + Math.floor(Math.random() * 180);
    const green = 40 + Math.floor(Math.random() * 180);
    const blue = 40 + Math.floor(Math.random() * 180);

    return `rgb(${red}, ${green}, ${blue})`;
}

const PZZ_VERDICT_PROPERTY = "Вердикт_ПЗЗ";
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
    const isGenPlannerLayer = name?.trim().toLowerCase() === GENPLANNER_ZONE_LAYER_NAME.toLowerCase();

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
    if (value === undefined) {
        return "Неизвестный тип";
    }

    if (
        propertyName === FUNCTIONAL_ZONE_ID_PROPERTY
        || propertyName === FUNCTIONAL_ZONE_NAME_PROPERTY
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

    return value;
}

function getMapLegendItems(
    layer: { name: string; style: { color: string } },
    categoricalStyle?: CategoricalLayerStyle,
): MapLegendItem[] {
    if (!categoricalStyle) {
        return [{ color: layer.style.color, label: layer.name || "Без названия" }];
    }

    return categoricalStyle.valueColors.map(([value, color]) => ({
        color,
        label: getLegendValueLabel(layer.name, categoricalStyle.propertyName, value),
    }));
}

function getCategoricalLayerStyle(name: string | undefined, layer: unknown): CategoricalLayerStyle | undefined {
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

function createFillLayer(id: string, color: string, opacity = DEFAULT_FILL_OPACITY) {
    return {
        id,
        type: "fill" as const,
        paint: {
            "fill-color": color,
            "fill-opacity": opacity,
        },
    };
}

function createLineLayer(id: string, color: string) {
    return {
        id,
        type: "line" as const,
        paint: {
            "line-color": color,
            "line-width": 3,
        },
    };
}

function createPointLayer(id: string, color: string) {
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

function getDefaultRenderedLayerIds(index: number) {
    return [
        `geojson-fill-${index}`,
        `geojson-line-${index}`,
        `geojson-point-${index}`,
    ];
}

function getCategorizedRenderedLayerIds(index: number, valueIndex: number) {
    return [
        `geojson-category-fill-${valueIndex}-map-${index}`,
        `geojson-category-line-${valueIndex}-map-${index}`,
        `geojson-category-point-${valueIndex}-map-${index}`,
    ];
}

interface MapViewProps {
    isExpanded: boolean;
    onToggleExpanded: () => void;
}

type SelectedFeatureState = {
    layerName: string;
    geometryType: string;
    properties: Record<string, unknown>;
    feature: Feature<Geometry, Record<string, unknown>>;
};

type ScrollShadowState = {
    top: boolean;
    bottom: boolean;
};

function getScrollShadowState(element: HTMLElement | null): ScrollShadowState {
    if (!element) {
        return { top: false, bottom: false };
    }

    const hasOverflow = element.scrollHeight > element.clientHeight + 1;

    return {
        top: hasOverflow && element.scrollTop > 1,
        bottom: hasOverflow && element.scrollTop + element.clientHeight < element.scrollHeight - 1,
    };
}

const MapView = observer(({ isExpanded, onToggleExpanded }: MapViewProps) => {
    const { mapLayers, isMapLayersAvailable } = MapStore;
    const [isMounted, setIsMounted] = useState(false);
    const [isLegendExpanded, setIsLegendExpanded] = useState(true);
    const [selectedFeature, setSelectedFeature] = useState<SelectedFeatureState | null>(null);
    const [propertyScrollShadows, setPropertyScrollShadows] = useState<ScrollShadowState>({ top: false, bottom: false });
    const mapRef = useRef<MapRef | null>(null);
    const propertyListRef = useRef<HTMLDivElement | null>(null);
    const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
    const geoJsonMessages = ChatStore.chatMessages.flatMap(
        (message) => message.message.type === "geojson" ? [message.message] : []
    );
    const parsedGeoJsonMessages = useMemo(
        () => geoJsonMessages.map((message) => ({ ...message, parsedLayer: parseFeatureCollection(message.layer) })),
        [geoJsonMessages]
    );

    const latestLayer = mapLayers.at(-1);
    const latestLayerBounds = useMemo(() => {
        return latestLayer ? getFeatureBounds(latestLayer.layer) : undefined;
    }, [latestLayer?.id]);
    const interactiveLayerIds = useMemo(() => {
        return mapLayers.flatMap((layer, index) => {
            if (!layer.isVisible) return [];

            const categoricalStyle = getCategoricalLayerStyle(layer.name, layer.layer);

            return categoricalStyle?.valueColors.length
                ? categoricalStyle.valueColors.flatMap((_, valueIndex) => getCategorizedRenderedLayerIds(index, valueIndex))
                : getDefaultRenderedLayerIds(index);
        });
    }, [mapLayers]);
    const topVisibleLayer = [...mapLayers].reverse().find((layer) => layer.isVisible);
    const topVisibleLayerStyle = topVisibleLayer
        ? getCategoricalLayerStyle(topVisibleLayer.name, topVisibleLayer.layer)
        : undefined;
    const mapLegendItems = topVisibleLayer
        ? getMapLegendItems(topVisibleLayer, topVisibleLayerStyle)
        : [];

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

    const updatePropertyScrollShadows = () => {
        const nextShadows = getScrollShadowState(propertyListRef.current);

        setPropertyScrollShadows((currentShadows) => (
            currentShadows.top === nextShadows.top && currentShadows.bottom === nextShadows.bottom
                ? currentShadows
                : nextShadows
        ));
    };

    const handleFeatureClick = (event: MapMouseEvent) => {
        const clickedFeature = event.features?.[0];

        if (!clickedFeature) {
            setSelectedFeature(null);
            return;
        }

        const layerId = clickedFeature.layer?.id ?? "";
        const layerIndexMatch = layerId.match(/(\d+)$/);
        const layerIndex = layerIndexMatch ? Number(layerIndexMatch[1]) : -1;
        const sourceLayer = mapLayers[layerIndex];

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

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (!isMounted || !latestLayerBounds) {
            return;
        }

        setTimeout(() => {
            zoomToBounds(latestLayerBounds);
        }, 300)
    }, [isMounted, latestLayerBounds]);

    useEffect(() => {
        setSelectedFeature(null);
    }, [mapLayers]);

    useEffect(() => {
        const animationFrameId = requestAnimationFrame(updatePropertyScrollShadows);

        if (propertyListRef.current) {
            propertyListRef.current.scrollTop = 0;
        }

        return () => cancelAnimationFrame(animationFrameId);
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
                <Map
                    ref={mapRef}
                    interactiveLayerIds={interactiveLayerIds}
                    initialViewState={latestLayerBounds ? {
                        longitude: latestLayerBounds[0][0],
                        latitude: latestLayerBounds[0][1],
                        zoom: 11,
                    } : {
                        longitude: 37.6173,
                        latitude: 55.7558,
                        zoom: 11,
                    }}
                    mapStyle="mapbox://styles/mapbox/light-v11"
                    language="ru"
                    projection="mercator"
                    mapboxAccessToken={mapboxToken}
                    onClick={handleFeatureClick}
                    cursor={interactiveLayerIds.length ? "pointer" : "default"}
                    style={{ borderRadius: "inherit", overflow: "hidden" }}
                >
                    {mapLayers.map((layer, index) => {
                        if (!layer) return null;

                        const layerColor = layer.style?.color ?? "#fff";
                        const isBoundaryLayer = isTerritoryBoundaryLayer(layer.name);
                        const categoricalStyle = getCategoricalLayerStyle(layer.name, layer.layer);

                        if (categoricalStyle?.valueColors.length) {
                            return categoricalStyle.valueColors.map(([value, color], valueIndex) => {
                                const [fillLayerId, lineLayerId, pointLayerId] = getCategorizedRenderedLayerIds(index, valueIndex);

                                return (
                                    <Source
                                        key={`geojson-category-source-${index}-${valueIndex}`}
                                        id={`geojson-category-source-${index}-${valueIndex}`}
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
                                            {...createLineLayer(lineLayerId, categoricalStyle.lineColor ?? color)}
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

                        return (
                            <Source
                                key={`geojson-source-${index}`}
                                id={`geojson-source-${index}`}
                                type="geojson"
                                data={layer.layer}
                            >
                                {!isBoundaryLayer && (
                                    <Layer
                                        {...createFillLayer(`geojson-fill-${index}`, layerColor)}
                                        layout={{ visibility: layer.isVisible ? "visible" : "none" }}
                                    />
                                )}
                                <Layer
                                    {...createLineLayer(`geojson-line-${index}`, layerColor)}
                                    layout={{ visibility: layer.isVisible ? "visible" : "none" }}
                                />
                                {!isBoundaryLayer && (
                                    <Layer
                                        {...createPointLayer(`geojson-point-${index}`, layerColor)}
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
                                    "line-width": 7,
                                }}
                            />
                            <Layer
                                id="selected-feature-line"
                                type="line"
                                paint={{
                                    "line-color": SELECTED_FEATURE_COLOR,
                                    "line-width": 4,
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
                </Map>
            )}
            {isMapLayersAvailable && (
                <div className="pointer-events-auto absolute left-4 top-4 z-10 h-[40%] w-[min(18rem,calc(100%-2rem))] max-w-72">
                    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white/30 px-4 py-3 shadow-sm backdrop-blur-lg customer-dark:border-ui-border customer-dark:bg-surface-panel/30">
                        <div className="mb-3 shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 customer-dark:text-content-muted">
                            Отображаемые слои
                        </div>
                        <div className="min-h-0 flex flex-1 flex-col gap-1.5 overflow-y-auto">
                            {mapLayers.map((layer) => {
                                const categoricalStyle = getCategoricalLayerStyle(layer.name, layer.layer);
                                const legendGradient = categoricalStyle?.legendGradient;

                                return (
                                    <div
                                        key={layer.id}
                                        className={`
                                            flex items-center gap-2 rounded-2xl text-[13px]
                                            ${layer.isVisible
                                              ? "text-gray-700 customer-dark:text-content-secondary"
                                              : "text-gray-400 customer-dark:text-content-muted"}
                                        `}
                                    >
                                        <button
                                            type="button"
                                            className="cursor-pointer text-lg text-gray-500 transition-colors hover:text-[#0788CE] customer:hover:text-brand-primary customer-dark:text-content-muted"
                                            onClick={() => MapStore.toggleLayerVisibility(layer.id)}
                                            aria-label={layer.isVisible ? "Скрыть слой" : "Показать слой"}
                                        >
                                            {layer.isVisible ? <MdOutlineVisibility /> : <MdOutlineVisibilityOff />}
                                        </button>
                                        <span
                                            className="h-4 w-1.5 shrink-0 shadow-sm"
                                            title={categoricalStyle?.legendTitle}
                                            style={legendGradient
                                                ? { background: legendGradient }
                                                : { backgroundColor: layer.style.color }}
                                        />
                                        <button
                                            type="button"
                                            className="min-w-0 flex-1 cursor-pointer truncate text-left transition-colors hover:text-[#0788CE] customer:hover:text-brand-primary"
                                            onClick={() => zoomToLayer(layer.layer)}
                                            title={layer.name || "Без названия"}
                                        >
                                            {layer.name || "Без названия"}
                                        </button>
                                        <button
                                            type="button"
                                            className="cursor-pointer text-lg text-gray-500 transition-colors hover:text-[#0788CE] customer:hover:text-brand-primary customer-dark:text-content-muted"
                                            onClick={() => downloadLayer(layer.name, layer.layer)}
                                            aria-label="Скачать слой"
                                        >
                                            <MdDownload />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
            {topVisibleLayer && mapLegendItems.length > 0 && (
                <div className="pointer-events-auto absolute bottom-8 left-4 z-10 flex max-h-[calc(60%-3.5rem)] w-[min(18rem,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white/30 shadow-lg backdrop-blur customer-dark:border-ui-border customer-dark:bg-surface-panel/30">
                    <button
                        type="button"
                        className="flex w-full shrink-0 cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left text-gray-500 transition-colors hover:bg-slate-50/70 customer-dark:text-content-muted customer-dark:hover:bg-surface-hover/70"
                        onClick={() => setIsLegendExpanded((currentValue) => !currentValue)}
                        aria-expanded={isLegendExpanded}
                    >
                        <span className="truncate text-xs font-semibold uppercase tracking-[0.14em]">
                            {topVisibleLayer.name || "Без названия"}
                        </span>
                        {isLegendExpanded ? <IoChevronDown size={16} /> : <IoChevronUp size={16} />}
                    </button>
                    {isLegendExpanded && (
                        <div className="map-legend-scroll min-h-0 max-h-28 overflow-y-auto border-t border-gray-200 px-4 py-2.5 customer-dark:border-ui-border">
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
                        </div>
                    )}
                </div>
            )}
            {selectedFeature && (
                <div className="pointer-events-auto absolute top-4 right-4 z-10 flex max-h-[calc(100%-2rem)] w-[min(24rem,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white/50 p-3 shadow-lg backdrop-blur customer-dark:border-ui-border customer-dark:bg-surface-panel/50">
                    <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 customer-dark:text-content-muted">
                                {selectedFeature.layerName}
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
                    <div className="relative overflow-hidden rounded-xl bg-slate-50/60 customer-dark:bg-surface-muted/60">
                        <div
                            className="max-h-[calc(50vh-7rem)] overflow-y-auto overscroll-contain py-2"
                            ref={propertyListRef}
                            onScroll={updatePropertyScrollShadows}
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
                        <div
                            className={`
                                pointer-events-none absolute inset-x-0 top-0 h-5 bg-linear-to-b from-slate-400/55 to-transparent
                                backdrop-blur-[1px]
                                transition-opacity duration-200 ${propertyScrollShadows.top ? "opacity-100" : "opacity-0"}
                            `}
                        />
                        <div
                            className={`
                                pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-linear-to-t from-slate-400/55 to-transparent
                                backdrop-blur-[1px]
                                transition-opacity duration-200 ${propertyScrollShadows.bottom ? "opacity-100" : "opacity-0"}
                            `}
                        />
                    </div>
                </div>
            )}
        </div>
    );
});

export default MapView;
