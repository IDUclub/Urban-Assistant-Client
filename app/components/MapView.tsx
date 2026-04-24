import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { IoChevronDown, IoChevronUp } from "react-icons/io5";
import {
    MdOutlineVisibility,
    MdOutlineVisibilityOff,
    MdDownload
} from "react-icons/md";
import Map, { Layer, Source } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import ChatStore from "@lib/ChatStore";
import MapStore from "@lib/MapStore";

function parseFeatureCollection(layer: unknown) {
    if (!layer) return undefined;

    if (typeof layer === "string") {
        try {
            return JSON.parse(layer);
        } catch {
            return undefined;
        }
    }

    if (typeof layer === "object") {
        return layer;
    }

    return undefined;
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

function createFillLayer(id: string, color: string) {
    return {
        id,
        type: "fill" as const,
        paint: {
            "fill-color": color,
            "fill-opacity": 0.24,
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

interface MapViewProps {
    isExpanded: boolean;
    onToggleExpanded: () => void;
}

const MapView = observer(({ isExpanded, onToggleExpanded }: MapViewProps) => {
    const { mapLayers, isMapLayersAvailable } = MapStore;
    const [isMounted, setIsMounted] = useState(false);
    const mapRef = useRef<MapRef | null>(null);
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

    const downloadLayer = (name: string, layer: unknown) => {
        const fileName = `${(name || "layer")
            .trim()
            .replace(/[^\w.-]+/g, "_")
            .replace(/^_+|_+$/g, "") || "layer"}.geojson`;
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

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (!isMounted || !latestLayerBounds || !mapRef.current) {
            return;
        }

        const map = mapRef.current;
        const [[minLng, minLat], [maxLng, maxLat]] = latestLayerBounds;

        setTimeout(() => {
            if (minLng === maxLng && minLat === maxLat) {
                map.flyTo({
                    center: [minLng, minLat],
                    zoom: 14,
                    duration: 1600,
                    essential: true,
                });
                return;
            }

            map.fitBounds(latestLayerBounds, {
                padding: 64,
                duration: 1600,
                essential: true,
            });
        }, 300)
    }, [isMounted, latestLayerBounds]);

    return (
        <div className="relative h-full w-full overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
            <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
                <button
                    type="button"
                    className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm backdrop-blur transition-colors hover:border-[#0788CE] hover:text-[#0788CE]"
                    onClick={onToggleExpanded}
                >
                    {isExpanded ? <IoChevronDown size={18} /> : <IoChevronUp size={18} />}
                    {isExpanded ? "Свернуть карту" : "Поднять карту"}
                </button>
            </div>
            {!isMounted ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                    Loading map...
                </div>
            ) : (
                <Map
                    ref={mapRef}
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
                    mapboxAccessToken={mapboxToken}
                >
                    {mapLayers.map((layer, index) => {
                        if (!layer) return null;

                        const layerColor = layer.style?.color ?? "#fff";

                        return (
                            <Source
                                key={`geojson-source-${index}`}
                                id={`geojson-source-${index}`}
                                type="geojson"
                                data={layer.layer}
                            >
                                <Layer
                                    {...createFillLayer(`geojson-fill-${index}`, layerColor)}
                                    layout={{ visibility: layer.isVisible ? "visible" : "none" }}
                                />
                                <Layer
                                    {...createLineLayer(`geojson-line-${index}`, layerColor)}
                                    layout={{ visibility: layer.isVisible ? "visible" : "none" }}
                                />
                                <Layer
                                    {...createPointLayer(`geojson-point-${index}`, layerColor)}
                                    layout={{ visibility: layer.isVisible ? "visible" : "none" }}
                                />
                            </Source>
                        );
                    })}
                </Map>
            )}
            {isMapLayersAvailable && (
                <div className="pointer-events-auto absolute left-4 top-4 z-10 max-w-72 translate-y-1/2">
                    <div className="rounded-3xl border border-gray-200 bg-white/90 px-6 py-4 shadow-sm backdrop-blur-lg">
                        <div className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                            Отображаемые слои
                        </div>
                        <div className="h-52 flex flex-col gap-2 overflow-y-auto">
                            {mapLayers.map((layer) => (
                                <div
                                    key={layer.id}
                                    className={`
                                        flex items-center gap-3 rounded-2xl py-2 text-sm
                                        ${layer.isVisible ? "text-gray-700" : "text-gray-400"}
                                    `}
                                >
                                    <button
                                        type="button"
                                        className="cursor-pointer text-lg text-gray-500 transition-colors hover:text-[#0788CE]"
                                        onClick={() => MapStore.toggleLayerVisibility(layer.id)}
                                        aria-label={layer.isVisible ? "Скрыть слой" : "Показать слой"}
                                    >
                                        {layer.isVisible ? <MdOutlineVisibility /> : <MdOutlineVisibilityOff />}
                                    </button>
                                    <span
                                        className="h-4 w-1.5 shrink-0 shadow-sm"
                                        style={{ backgroundColor: layer.style.color }}
                                    />
                                    <span className="min-w-0 flex-1 truncate">{layer.name || "Без названия"}</span>
                                    <button
                                        type="button"
                                        className="cursor-pointer text-lg text-gray-500 transition-colors hover:text-[#0788CE]"
                                        onClick={() => downloadLayer(layer.name, layer.layer)}
                                        aria-label="Скачать слой"
                                    >
                                        <MdDownload />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

export default MapView;
