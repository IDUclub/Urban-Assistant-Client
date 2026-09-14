import { useEffect, useMemo, useRef, useState } from "react";
import ReactMap, { Layer, Source } from "react-map-gl/mapbox";
import type {
    LayerProps,
    MapMouseEvent,
    MapRef,
} from "react-map-gl/mapbox";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { GeoJSONSource } from "mapbox-gl";
import {
    getTerritoryCentres,
    isDocumentLevel,
    type DocumentLevel,
    type LibraryDocument,
    type TerritoryCentre,
} from "@lib/documentLibrary";
import "mapbox-gl/dist/mapbox-gl.css";

const SOURCE_ID = "document-library-territories";
const CLUSTERS_LAYER_ID = "document-library-clusters";
const CLUSTER_COUNT_LAYER_ID = "document-library-cluster-count";
const TERRITORIES_LAYER_ID = "document-library-territories-points";
const TERRITORY_COUNT_LAYER_ID = "document-library-territory-count";

const INITIAL_VIEW_STATE = {
    longitude: 90,
    latitude: 61,
    zoom: 1.5,
};

type TerritoryPointProperties = {
    territory_id: number;
    territory_name: string;
    document_level: DocumentLevel | "";
    document_count: number;
};

const CLUSTER_CIRCLE_LAYER: LayerProps = {
    id: CLUSTERS_LAYER_ID,
    type: "circle",
    filter: ["has", "point_count"],
    paint: {
        "circle-color": "#0788CE",
        "circle-radius": [
            "step",
            ["get", "document_count"],
            18,
            10,
            22,
            50,
            28,
        ],
        "circle-stroke-color": "#FFFFFF",
        "circle-stroke-width": 2,
    },
};

const CLUSTER_COUNT_LAYER: LayerProps = {
    id: CLUSTER_COUNT_LAYER_ID,
    type: "symbol",
    filter: ["has", "point_count"],
    layout: {
        "text-field": ["to-string", ["get", "document_count"]],
        "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
        "text-size": 13,
    },
    paint: {
        "text-color": "#FFFFFF",
    },
};

const TERRITORY_CIRCLE_LAYER: LayerProps = {
    id: TERRITORIES_LAYER_ID,
    type: "circle",
    filter: ["!", ["has", "point_count"]],
    paint: {
        "circle-color": "#EAF5FF",
        "circle-radius": 17,
        "circle-stroke-color": "#0788CE",
        "circle-stroke-width": 2,
    },
};

const TERRITORY_COUNT_LAYER: LayerProps = {
    id: TERRITORY_COUNT_LAYER_ID,
    type: "symbol",
    filter: ["!", ["has", "point_count"]],
    layout: {
        "text-field": ["to-string", ["get", "document_count"]],
        "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
        "text-size": 13,
    },
    paint: {
        "text-color": "#0B5E8E",
    },
};

type TerritoryDocumentSummary = {
    documentCount: number;
    territoryName: string;
    documentLevel: DocumentLevel | null;
};

type DocumentsByTerritory = Map<number, TerritoryDocumentSummary>;

type DocumentLibraryMapProps = {
    allDocuments: LibraryDocument[];
    visibleDocuments: LibraryDocument[];
    selectedTerritoryId: string;
    onSelectTerritory: (
        territoryId: number,
        territoryName: string,
        documentLevel: DocumentLevel | null,
    ) => void;
};

function getUniqueTerritoryIds(documents: LibraryDocument[]) {
    const territoryIds = new Set<number>();

    documents.forEach((document) => {
        if (document.territoryId !== null) {
            territoryIds.add(document.territoryId);
        }
    });

    return Array.from(territoryIds).sort((left, right) => left - right);
}

function groupDocumentsByTerritory(
    documents: LibraryDocument[],
): DocumentsByTerritory {
    const groups: DocumentsByTerritory = new Map();

    documents.forEach((document) => {
        if (document.territoryId === null) {
            return;
        }

        const existingGroup = groups.get(document.territoryId);
        const documentLevel = document.documentLevel || null;

        groups.set(document.territoryId, {
            documentCount: (existingGroup?.documentCount ?? 0) + 1,
            territoryName:
                document.territoryName || existingGroup?.territoryName || "",
            documentLevel: existingGroup?.documentLevel ?? documentLevel,
        });
    });

    return groups;
}

function createTerritoryPoints(
    documents: LibraryDocument[],
    territoryCentres: Map<number, TerritoryCentre>,
): FeatureCollection<Point, TerritoryPointProperties> {
    const documentsByTerritory = groupDocumentsByTerritory(documents);
    const features: Feature<Point, TerritoryPointProperties>[] = [];

    documentsByTerritory.forEach((group, territoryId) => {
        const territoryCentre = territoryCentres.get(territoryId);

        if (!territoryCentre) {
            return;
        }

        features.push({
            type: "Feature",
            properties: {
                territory_id: territoryId,
                territory_name: group.territoryName || territoryCentre.name,
                document_level: group.documentLevel ?? "",
                document_count: group.documentCount,
            },
            geometry: {
                type: "Point",
                coordinates: territoryCentre.coordinates,
            },
        });
    });

    return {
        type: "FeatureCollection",
        features,
    };
}

function useTerritoryCentres(documents: LibraryDocument[]) {
    const territoryIds = useMemo(
        () => getUniqueTerritoryIds(documents),
        [documents],
    );
    const territoryIdsKey = territoryIds.join(",");
    const [territoryCentres, setTerritoryCentres] = useState(
        new Map<number, TerritoryCentre>(),
    );
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const missingTerritoryIds = territoryIds.filter(
            (territoryId) => !territoryCentres.has(territoryId),
        );

        if (!missingTerritoryIds.length) {
            setIsLoading(false);
            setError(null);

            return;
        }

        const controller = new AbortController();

        setIsLoading(true);
        setError(null);

        getTerritoryCentres(missingTerritoryIds, controller.signal)
            .then((loadedCentres) => {
                if (controller.signal.aborted) {
                    return;
                }

                setTerritoryCentres((currentCentres) => {
                    const updatedCentres = new Map(currentCentres);

                    loadedCentres.forEach((territoryCentre) => {
                        updatedCentres.set(
                            territoryCentre.territoryId,
                            territoryCentre,
                        );
                    });

                    return updatedCentres;
                });
            })
            .catch(() => {
                if (!controller.signal.aborted) {
                    setError("Не удалось загрузить точки территорий");
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setIsLoading(false);
                }
            });

        return () => controller.abort();
    }, [territoryIdsKey]);

    return {
        territoryCentres,
        isLoading,
        error,
    };
}

function getMapStatusText({
    isLoading,
    error,
    hasDocumentsWithTerritory,
    hasTerritoryPoints,
    hasMapboxToken,
}: {
    isLoading: boolean;
    error: string | null;
    hasDocumentsWithTerritory: boolean;
    hasTerritoryPoints: boolean;
    hasMapboxToken: boolean;
}) {
    if (isLoading) {
        return "Загрузка карты…";
    }

    if (error) {
        return error;
    }

    if (!hasMapboxToken) {
        return "Карта недоступна";
    }

    if (!hasDocumentsWithTerritory) {
        return "У найденных документов не указана территория";
    }

    if (!hasTerritoryPoints) {
        return "Не удалось определить точки территорий";
    }

    return null;
}

export default function DocumentLibraryMap({
    allDocuments,
    visibleDocuments,
    selectedTerritoryId,
    onSelectTerritory,
}: DocumentLibraryMapProps) {
    const mapRef = useRef<MapRef | null>(null);
    const { territoryCentres, isLoading, error } =
        useTerritoryCentres(allDocuments);
    const territoryPoints = useMemo(
        () => createTerritoryPoints(visibleDocuments, territoryCentres),
        [visibleDocuments, territoryCentres],
    );
    const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
    const hasDocumentsWithTerritory = visibleDocuments.some(
        (document) => document.territoryId !== null,
    );
    const mapStatusText = getMapStatusText({
        isLoading,
        error,
        hasDocumentsWithTerritory,
        hasTerritoryPoints: territoryPoints.features.length > 0,
        hasMapboxToken: Boolean(mapboxToken),
    });

    useEffect(() => {
        const territoryId = Number(selectedTerritoryId);

        if (!Number.isFinite(territoryId)) {
            return;
        }

        const territoryCentre = territoryCentres.get(territoryId);

        if (!territoryCentre) {
            return;
        }

        mapRef.current?.flyTo({
            center: territoryCentre.coordinates,
            zoom: 7,
            duration: 700,
        });
    }, [selectedTerritoryId, territoryCentres]);

    const zoomIntoCluster = (
        clusterId: number,
        coordinates: [number, number],
    ) => {
        const source = mapRef.current
            ?.getMap()
            .getSource(SOURCE_ID) as GeoJSONSource | undefined;

        if (!source) {
            return;
        }

        source.getClusterExpansionZoom(clusterId, (sourceError, zoom) => {
            if (sourceError || zoom === null || zoom === undefined) {
                return;
            }

            mapRef.current?.easeTo({
                center: coordinates,
                zoom,
                duration: 500,
            });
        });
    };

    const handleMapClick = (event: MapMouseEvent) => {
        const feature = event.features?.[0];

        if (!feature) {
            return;
        }

        if (feature.layer?.id === CLUSTERS_LAYER_ID) {
            const clusterId = Number(feature.properties?.cluster_id);

            if (!Number.isFinite(clusterId)) {
                return;
            }

            const coordinates = (feature.geometry as Point).coordinates as [
                number,
                number,
            ];

            zoomIntoCluster(clusterId, coordinates);

            return;
        }

        const territoryId = Number(feature.properties?.territory_id);

        if (!Number.isFinite(territoryId)) {
            return;
        }

        const territoryName = String(
            feature.properties?.territory_name ?? "",
        );
        const rawDocumentLevel = String(
            feature.properties?.document_level ?? "",
        );
        const documentLevel = isDocumentLevel(rawDocumentLevel)
            ? rawDocumentLevel
            : null;

        onSelectTerritory(territoryId, territoryName, documentLevel);
    };

    return (
        <section
            id="document-library-map"
            className="flex min-h-80 flex-col overflow-hidden rounded-2xl border border-slate-200 customer-dark:border-ui-border"
        >
            <div className="border-b border-slate-100 px-4 py-3 customer-dark:border-ui-border">
                <h3 className="text-sm font-semibold">
                    Документы по территориям
                </h3>
            </div>
            <div className="relative min-h-72 flex-1">
                <ReactMap
                    ref={mapRef}
                    initialViewState={INITIAL_VIEW_STATE}
                    mapStyle="mapbox://styles/mapbox/light-v11"
                    language="ru"
                    projection="mercator"
                    mapboxAccessToken={mapboxToken}
                    interactiveLayerIds={[
                        CLUSTERS_LAYER_ID,
                        TERRITORIES_LAYER_ID,
                    ]}
                    cursor={
                        territoryPoints.features.length ? "pointer" : "default"
                    }
                    onClick={handleMapClick}
                    style={{ width: "100%", height: "100%" }}
                >
                    <Source
                        id={SOURCE_ID}
                        type="geojson"
                        data={territoryPoints}
                        cluster
                        clusterMaxZoom={8}
                        clusterRadius={44}
                        clusterProperties={{
                            document_count: ["+", ["get", "document_count"]],
                        }}
                    >
                        <Layer {...CLUSTER_CIRCLE_LAYER} />
                        <Layer {...CLUSTER_COUNT_LAYER} />
                        <Layer {...TERRITORY_CIRCLE_LAYER} />
                        <Layer {...TERRITORY_COUNT_LAYER} />
                    </Source>
                </ReactMap>
                {mapStatusText && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/80 p-5 text-center text-sm text-slate-600 backdrop-blur-[1px] customer-dark:bg-surface-raised/80 customer-dark:text-content-secondary">
                        {mapStatusText}
                    </div>
                )}
            </div>
        </section>
    );
}
