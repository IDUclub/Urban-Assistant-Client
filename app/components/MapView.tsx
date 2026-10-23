import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { IoArrowBack, IoChevronDown, IoChevronUp, IoClose } from "react-icons/io5";
import { MdPalette } from "react-icons/md";
import { Layer, Source } from "react-map-gl/mapbox";
import MapCanvas from "@components/MapCanvas";
import MapLayersPanel from "@components/map/MapLayersPanel";
import type { MapRef, MapMouseEvent } from "react-map-gl/mapbox";
import type { Feature, Geometry } from "geojson";
import "mapbox-gl/dist/mapbox-gl.css";
import CustomSelect, { type SelectOption } from "@components/ui/Select";
import ChatStore from "@lib/ChatStore";
import AuthStore from "@lib/AuthStore";
import MapStore, { type MapColorMode } from "@lib/MapStore";
import { getFacadeSceneGlb } from "@lib/genbuilder/client";
import { createFacadeSceneLayer } from "@lib/genbuilder/facadeSceneLayer";
import {
    parseFeatureCollection,
    type Bounds,
    mergeBounds,
    getFeatureBounds,
    filterLayerByPropertyValue,
    downloadGeoJsonLayer,
} from "@lib/map/geoJson";
import {
    getLayerDisplayName,
    getLayerListDisplayName,
    isProvisionLinksLayer,
    isTerritoryBoundaryLayer,
} from "@lib/map/layerMetadata";
import {
    type ColorPalette,
    CATEGORY_COLOR_PALETTES,
    SCALE_COLOR_PALETTES,
    INITIAL_COLOR_PALETTE_VERSION,
    getColorableLayerProperties,
    getSelectedColorMode,
    canUseCategoryColorMode,
    canUseScaleColorMode,
    getAvailableColorMode,
    getColorPalettes,
    getColorPalette,
    getRandomInitialColorPalette,
    formatSelectedFeaturePropertyValue,
    getMapLegendItems,
    getDefaultCategoricalLayerStyle,
    getLayerColorPropertyName,
    getCategoricalLayerStyle,
    getSelectedNumericLayerStyle,
    getCategoricalColorExpression,
    getNumericColorExpression,
    formatNumericLegendValue,
    type LayerRenderingStyle,
} from "@lib/map/layerColoring";
import {
    DEFAULT_FILL_OPACITY,
    SELECTED_FEATURE_COLOR,
    SELECTED_FEATURE_OUTLINE_COLOR,
    LIGHT_MAP_STYLE,
    DARK_MAP_STYLE,
    createFillLayer,
    createLineLayer,
    createLineHitLayer,
    getSelectedLineWidth,
    createPointLayer,
    getLayerLineWidthOffset,
    getProvisionLinksHitLayerId,
    getCategorizedRenderedLayerIds,
    getInteractiveRenderedLayerIds,
    SELECTED_FEATURE_LAYER_IDS,
} from "@lib/map/mapboxLayers";

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
                    onReorder={(layerIds) => MapStore.setLayerOrder(layerIds)}
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
                    onDownload={(layer) => downloadGeoJsonLayer(layer.name, layer.layer)}
                    facadeScene={facadeScene}
                    facadeSceneLoadStatus={MapStore.facadeSceneLoadStatus}
                    facadeSceneError={facadeSceneError}
                    onToggleFacadeVisibility={() => MapStore.toggleFacadeSceneVisibility()}
                    onActivateFacade={() => {
                        if (!facadeScene) return;

                        mapRef.current?.flyTo({
                            center: [facadeScene.origin.lon, facadeScene.origin.lat],
                            zoom: 16.5,
                            pitch: 60,
                            essential: true,
                        });
                    }}
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
