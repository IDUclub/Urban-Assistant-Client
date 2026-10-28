import type { ExpressionSpecification } from "mapbox-gl";

import {
    isProvisionLinksLayer,
    isRoadLayer,
} from "./layerMetadata";
import {
    type CategoricalLayerStyle,
} from "./layerColoring";

export const DEFAULT_FILL_OPACITY = 0.24;

export const SELECTED_FEATURE_COLOR = "#EF4444";

export const SELECTED_FEATURE_OUTLINE_COLOR = "#FFFFFF";

export const LIGHT_MAP_STYLE = "mapbox://styles/mapbox/light-v11";

export const DARK_MAP_STYLE = "mapbox://styles/mapbox/dark-v11";

export function createFillLayer(
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

export function createLineLayer(
    id: string,
    color: string | ExpressionSpecification,
    boundaryMaxWidth?: number,
    widthOffset = 0,
) {
    const lineWidth = boundaryMaxWidth
        ? getBoundaryLineWidth(boundaryMaxWidth, widthOffset)
        : getGeometryAwareLineWidth(3, widthOffset);

    return {
        id,
        type: "line" as const,
        paint: {
            "line-color": color,
            "line-width": lineWidth,
        },
    };
}

export function createLineHitLayer(id: string) {
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

export function getBoundaryLineWidth(maxWidth: number, widthOffset = 0): ExpressionSpecification {
    return [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        maxWidth * 0.2 + widthOffset,
        9,
        maxWidth * 0.35 + widthOffset,
        12,
        maxWidth * 0.65 + widthOffset,
        16,
        maxWidth + widthOffset,
    ];
}

function getGeometryAwareLineWidth(maxWidth: number, widthOffset = 0): ExpressionSpecification {
    const lineWidthAtZoom = (lineWidth: number) => [
        "case",
        ["==", ["geometry-type"], "Polygon"],
        0.6 + widthOffset,
        lineWidth + widthOffset,
    ];

    return [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        lineWidthAtZoom(maxWidth * 0.08),
        9,
        lineWidthAtZoom(maxWidth * 0.2),
        12,
        lineWidthAtZoom(maxWidth * 0.5),
        16,
        lineWidthAtZoom(maxWidth),
    ] as ExpressionSpecification;
}

export function getSelectedLineWidth(maxWidth: number): ExpressionSpecification {
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

export function createPointLayer(id: string, color: string | ExpressionSpecification) {
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

export function getLayerLineWidthOffset(name?: string) {
    if (isRoadLayer(name)) return 4;
    if (isProvisionLinksLayer(name)) return 1;

    return 0;
}

export function getProvisionLinksHitLayerId(layerId: string) {
    return `geojson-line-hit-${layerId}`;
}

export function getDefaultRenderedLayerIds(layerId: string) {
    return [
        `geojson-fill-${layerId}`,
        `geojson-line-${layerId}`,
        `geojson-point-${layerId}`,
    ];
}

export function getCategorizedRenderedLayerIds(layerId: string, valueIndex: number) {
    return [
        `geojson-category-fill-${valueIndex}-${layerId}`,
        `geojson-category-line-${valueIndex}-${layerId}`,
        `geojson-category-point-${valueIndex}-${layerId}`,
    ];
}

export function getRenderedLayerIds(layerId: string, categoricalStyle?: CategoricalLayerStyle) {
    if (!categoricalStyle?.valueColors.length || categoricalStyle.useExpression) {
        return getDefaultRenderedLayerIds(layerId);
    }

    return categoricalStyle.valueColors.flatMap((_, valueIndex) =>
        getCategorizedRenderedLayerIds(layerId, valueIndex)
    );
}

export function getInteractiveRenderedLayerIds(
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

export const SELECTED_FEATURE_LAYER_IDS = [
    "selected-feature-line-outline",
    "selected-feature-line",
    "selected-feature-point-outline",
    "selected-feature-point",
];
