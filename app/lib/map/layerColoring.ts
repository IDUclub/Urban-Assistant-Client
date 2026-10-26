import { PLACEMENT_CLASSES } from "@lib/placement/types";
import type { ExpressionSpecification } from "mapbox-gl";
import type { MapColorMode } from "@lib/MapStore";
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

import {
    PZZ_VERDICT_PROPERTY,
    VRI_TOP1_PROPERTY,
    GENBUILDER_EXCLUDED_PROPERTY,
    GENBUILDER_FUNCTIONAL_ZONE_PROPERTY,
    isPzzActualZoneCodeProperty,
    isPzzCheckResponseLayer,
    isGenBuilderResponseLayer,
    isBuildingLayer,
    isFloorCountProperty,
    getProvisionLayerParts,
    getLayerDisplayName,
    isNormsCheckResultLayer,
    isFunctionalZoneLayer,
    isRoadLayer,
} from "./layerMetadata";
import {
    formatFeaturePropertyValue,
    normalizePropertyName,
    isColorablePropertyValue,
    getLayerFeatures,
    getFeaturePropertyValues,
    getFeaturePropertyNumbers,
    hasFeaturesWithoutPropertyValue,
} from "./geoJson";

const PLACEMENT_VALUE_COLORS = PLACEMENT_CLASSES.map(([code, color]) => [code, color] as const);
const PLACEMENT_LEGEND_GRADIENT = getValueColorGradient(PLACEMENT_VALUE_COLORS);

export const PZZ_VERDICT_COLORS = [
    ["Разрешен", "#22C55E"],
    ["Условно разрешен", "#EAB308"],
    ["Разрешен как вспомогательный", "#14B8A6"],
    ["Не разрешен", "#EF4444"],
    ["Требуется ручная проверка", "#F97316"],
    ["Нет пересечения с ПЗЗ", "#3B82F6"],
    ["Нет описания зоны в шаблоне", "#A855F7"],
    ["Только кандидаты классификатора", "#EC4899"],
] as const;

export const PZZ_VERDICT_LEGEND_GRADIENT = `linear-gradient(to bottom, ${PZZ_VERDICT_COLORS.map(([, color]) => color).join(", ")})`;

export const PZZ_CLASSIFIER_CANDIDATES_VERDICT = "Только кандидаты классификатора";

export const GENBUILDER_BUILDING_COLORS = [
    ["false", "#22C55E"],
    ["true", "#F97316"],
] as const;

export const PZZ_VERDICT_FILL_OPACITY = 0.65;

export const VRI_TOP1_FILL_OPACITY = 0.65;

export const GENERATED_LAYER_FILL_OPACITY = 0.65;

const GENBUILDER_SCALE_COLOR_PROPERTIES = new Set([
    "building_area",
    "capacity",
    "floors_count",
    "living_area",
    "residents_number",
]);

export type ColorPalette = {
    id: string;
    label: string;
    colors: readonly string[];
};

export const CATEGORY_COLOR_PALETTES: readonly ColorPalette[] = [
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

export const SCALE_COLOR_PALETTES: readonly ColorPalette[] = [
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

export const INITIAL_COLOR_PALETTE_VERSION = 1;

export type LayerColorPropertyKind = "category" | "number";

export type LayerColorProperty = {
    name: string;
    kind: LayerColorPropertyKind;
};

export function getColorableLayerProperties(layer: unknown): LayerColorProperty[] {
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

export function getSelectedColorMode(selectedMode?: MapColorMode): MapColorMode {
    return selectedMode ?? "category";
}

export function canUseCategoryColorMode(name?: string) {
    return !getProvisionLayerParts(name);
}

export function canUseScaleColorMode(
    name: string | undefined,
    layer: unknown,
    propertyName: string,
) {
    if (getProvisionLayerParts(name)) return true;
    if (isGenBuilderResponseLayer(name, layer)) {
        return GENBUILDER_SCALE_COLOR_PROPERTIES.has(propertyName);
    }
    if (isNormsCheckResultLayer(name)) return false;
    if (isFunctionalZoneLayer(name, layer)) return false;
    if (isRoadLayer(name)) return false;
    if (!isBuildingLayer(name, layer)) return true;

    const colorProperty = getColorableLayerProperties(layer)
        .find((property) => property.name === propertyName);

    return colorProperty?.kind === "number" && isFloorCountProperty(colorProperty.name);
}

export function getAvailableColorMode(
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

export function getFunctionalZoneStyle(name: string | undefined, layer: unknown): CategoricalLayerStyle | undefined {
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

export function getStableValueColor(value: string) {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
        hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
    }

    const red = 48 + (hash & 0x9f);
    const green = 48 + ((hash >>> 8) & 0x9f);
    const blue = 48 + ((hash >>> 16) & 0x9f);

    return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function getColorPalettes(mode: MapColorMode) {
    return mode === "category"
        ? CATEGORY_COLOR_PALETTES
        : SCALE_COLOR_PALETTES;
}

export function getColorPalette(mode: MapColorMode, paletteId?: string) {
    const palettes = getColorPalettes(mode);
    return palettes.find((palette) => palette.id === paletteId) ?? palettes[0];
}

export function getRandomInitialColorPalette(
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

export function interpolatePaletteColor(colors: readonly string[], position: number) {
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

export function getCategoryPaletteColor(
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

export function getPzzVerdictColor(value: string) {
    return PZZ_VERDICT_COLORS.find(([verdict]) => verdict === value)?.[1] ?? getStableValueColor(value);
}

export function getPzzVerdictValueColors(layer: unknown) {
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

export function getVriTop1ValueColors(layer: unknown) {
    return getFeaturePropertyValues(layer, VRI_TOP1_PROPERTY)
        .sort((left, right) => left.localeCompare(right, "ru"))
        .map((value) => [value, getStableValueColor(value)] as const);
}

export function getGenPlannerRoadStyle(name: string | undefined, layer: unknown) {
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

export function formatSelectedFeaturePropertyValue(
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

export function getGenPlannerLegendTitle(valueColors: readonly CategoryColor[]) {
    const zoneNames = valueColors.map(([value]) => {
        if (value === undefined) {
            return "Неизвестная зона";
        }

        const zoneName = getFunctionalZoneName(value) ?? "Неизвестная зона";
        return `${value} — ${zoneName}`;
    });

    return ["Функциональные зоны по типам", ...zoneNames].join("\n");
}

export type CategoryColor = readonly [value: string | undefined, color: string];

export type CategoricalLayerStyle = {
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

export type NumericLayerStyle = {
    propertyName: string;
    minValue: number;
    maxValue: number;
    fillOpacity: number;
    legendGradient: string;
    colors: readonly string[];
};

export type MapLegendItem = {
    color: string;
    label: string;
};

export function getLegendValueLabel(
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

    if (propertyName === "Класс_пригодности") {
        return `${value} — ${PLACEMENT_CLASSES.find(([code]) => code === value)?.[2] ?? value}`;
    }

    if (propertyName === GENBUILDER_EXCLUDED_PROPERTY) {
        return value === "true" ? "Исключённые объекты" : "Сгенерированные объекты";
    }

    if (value === "true") return "Да";
    if (value === "false") return "Нет";

    return value;
}

export function getMapLegendItems(
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

export function getDefaultCategoricalLayerStyle(name: string | undefined, layer: unknown): CategoricalLayerStyle | undefined {
    if (getFeaturePropertyValues(layer, "Класс_пригодности").length) {
        return {
            propertyName: "Класс_пригодности",
            valueColors: PLACEMENT_VALUE_COLORS,
            fillOpacity: 0.55,
            legendGradient: PLACEMENT_LEGEND_GRADIENT,
            legendTitle: "Классы пригодности для размещения",
        };
    }

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

export function getLayerColorPropertyName(
    name: string | undefined,
    layer: unknown,
    selectedPropertyName?: string,
) {
    if (selectedPropertyName) return selectedPropertyName;

    return getDefaultCategoricalLayerStyle(name, layer)?.propertyName
        ?? getColorableLayerProperties(layer)[0]?.name;
}

export function getSelectedCategoricalLayerStyle(
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

export function getCategoricalLayerStyle(
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

export function getSelectedNumericLayerStyle(
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

export function getValueColorGradient(valueColors: readonly CategoryColor[]) {
    if (!valueColors.length) return undefined;

    return `linear-gradient(to bottom, ${valueColors.map(([, color]) => color).join(", ")})`;
}

export function getCategoricalColorExpression(style: CategoricalLayerStyle): ExpressionSpecification {
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

export function getNumericColorExpression(style: NumericLayerStyle): ExpressionSpecification {
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

export function formatNumericLegendValue(value: number) {
    return new Intl.NumberFormat("ru-RU", {
        maximumFractionDigits: 2,
    }).format(value);
}

export type LayerRenderingStyle = {
    categoricalStyle?: CategoricalLayerStyle;
    numericStyle?: NumericLayerStyle;
};
