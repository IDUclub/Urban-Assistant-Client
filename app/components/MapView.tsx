import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { IoChevronDown, IoChevronUp } from "react-icons/io5";
import Map, { Layer, Source } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import ChatStore from "@lib/ChatStore";

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
        filter: [
            ["all"],
            ["==", "$type", "Point"]
        ]
    };
}

interface MapViewProps {
    isExpanded: boolean;
    onToggleExpanded: () => void;
}

const MapView = observer(({ isExpanded, onToggleExpanded }: MapViewProps) => {
    const [isMounted, setIsMounted] = useState(false);
    const mapRef = useRef<MapRef | null>(null);
    const layerColorsRef = useRef<globalThis.Map<string, string>>(new globalThis.Map());
    const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
    const geoJsonMessages = ChatStore.chatMessages.flatMap(
        (message) => message.message.type === "geojson" ? [message.message] : []
    );
    const parsedGeoJsonMessages = useMemo(
        () => geoJsonMessages.map((message) => ({ ...message, parsedLayer: parseFeatureCollection(message.layer) })),
        [geoJsonMessages]
    );
    const latestLayerBounds = useMemo(() => {
        const latestLayer = parsedGeoJsonMessages.at(-1)?.parsedLayer;
        return latestLayer ? getFeatureBounds(latestLayer) : undefined;
    }, [parsedGeoJsonMessages]);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (!isMounted || !latestLayerBounds || !mapRef.current) {
            return;
        }

        const map = mapRef.current;
        const [[minLng, minLat], [maxLng, maxLat]] = latestLayerBounds;

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
                    initialViewState={{
                        longitude: 37.6173,
                        latitude: 55.7558,
                        zoom: 9,
                    }}
                    mapStyle="mapbox://styles/mapbox/light-v11"
                    mapboxAccessToken={mapboxToken}
                >
                    {parsedGeoJsonMessages.map((message, index) => {
                        const layer = message.parsedLayer;

                        if (!layer) return null;

                        const layerKey = `${message.name}-${index}`;
                        let layerColor = layerColorsRef.current.get(layerKey);

                        if (!layerColor) {
                            layerColor = getRandomColor();
                            layerColorsRef.current.set(layerKey, layerColor);
                        }

                        return (
                            <Source
                                key={`geojson-source-${index}`}
                                id={`geojson-source-${index}`}
                                type="geojson"
                                data={layer}
                            >
                                <Layer {...createFillLayer(`geojson-fill-${index}`, layerColor)} />
                                <Layer {...createLineLayer(`geojson-line-${index}`, layerColor)} />
                                <Layer {...createPointLayer(`geojson-point-${index}`, layerColor)} />
                            </Source>
                        );
                    })}
                </Map>
            )}
        </div>
    );
});

export default MapView;
