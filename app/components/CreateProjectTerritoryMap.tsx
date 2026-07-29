import { useMemo } from "react";
import Map, { Layer, Source } from "react-map-gl/mapbox";
import type { MapMouseEvent } from "react-map-gl/mapbox";
import type {
    Feature,
    FeatureCollection,
    Geometry,
    LineString,
    MultiPoint,
    Polygon,
    Position,
} from "geojson";
import { MdOutlineDelete, MdUndo } from "react-icons/md";
import type { ProjectCreationTerritory } from "@lib/DataStore";
import "mapbox-gl/dist/mapbox-gl.css";

export type PolygonPoint = [number, number];

interface CreateProjectTerritoryMapProps {
    territory: ProjectCreationTerritory;
    points: PolygonPoint[];
    onPointsChange: (points: PolygonPoint[]) => void;
}

type Bounds = [[number, number], [number, number]];

function extendBounds(
    bounds: Bounds | undefined,
    longitude: number,
    latitude: number,
): Bounds {
    if (!bounds) {
        return [[longitude, latitude], [longitude, latitude]];
    }

    return [
        [Math.min(bounds[0][0], longitude), Math.min(bounds[0][1], latitude)],
        [Math.max(bounds[1][0], longitude), Math.max(bounds[1][1], latitude)],
    ];
}

function collectBounds(value: unknown, bounds?: Bounds): Bounds | undefined {
    if (!Array.isArray(value) || !value.length) return bounds;

    if (
        value.length >= 2
        && typeof value[0] === "number"
        && typeof value[1] === "number"
    ) {
        return extendBounds(bounds, value[0], value[1]);
    }

    return value.reduce<Bounds | undefined>(
        (currentBounds, item) => collectBounds(item, currentBounds),
        bounds,
    );
}

function getTerritoryCentre(territory: ProjectCreationTerritory): PolygonPoint {
    const coordinates = territory.centre_point?.coordinates;

    if (
        Array.isArray(coordinates)
        && typeof coordinates[0] === "number"
        && typeof coordinates[1] === "number"
    ) {
        return [coordinates[0], coordinates[1]];
    }

    const bounds = collectBounds(
        "coordinates" in territory.geometry
            ? territory.geometry.coordinates
            : undefined,
    );

    if (!bounds) return [37.6173, 55.7558];

    return [
        (bounds[0][0] + bounds[1][0]) / 2,
        (bounds[0][1] + bounds[1][1]) / 2,
    ];
}

function getTerritoryZoom(geometry: Geometry) {
    const bounds = collectBounds(
        "coordinates" in geometry ? geometry.coordinates : undefined,
    );

    if (!bounds) return 7;

    const longitudeSpan = Math.abs(bounds[1][0] - bounds[0][0]);
    const latitudeSpan = Math.abs(bounds[1][1] - bounds[0][1]);
    const span = Math.max(longitudeSpan, latitudeSpan);

    if (span > 30) return 3;
    if (span > 15) return 4;
    if (span > 7) return 5;
    if (span > 3) return 6;
    if (span > 1.5) return 7;
    if (span > 0.6) return 8;
    return 9;
}

function getDraftFeatures(points: PolygonPoint[]): FeatureCollection {
    const features: Feature[] = [];

    if (points.length >= 3) {
        const polygon: Polygon = {
            type: "Polygon",
            coordinates: [[...points, points[0]]],
        };

        features.push({
            type: "Feature",
            properties: {},
            geometry: polygon,
        });
    } else if (points.length === 2) {
        const line: LineString = {
            type: "LineString",
            coordinates: points,
        };

        features.push({
            type: "Feature",
            properties: {},
            geometry: line,
        });
    }

    if (points.length) {
        const vertices: MultiPoint = {
            type: "MultiPoint",
            coordinates: points as Position[],
        };

        features.push({
            type: "Feature",
            properties: {},
            geometry: vertices,
        });
    }

    return {
        type: "FeatureCollection",
        features,
    };
}

function CreateProjectTerritoryMap({
    territory,
    points,
    onPointsChange,
}: CreateProjectTerritoryMapProps) {
    const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
    const centre = useMemo(() => getTerritoryCentre(territory), [territory]);
    const zoom = useMemo(
        () => getTerritoryZoom(territory.geometry),
        [territory.geometry],
    );
    const boundaryFeature = useMemo<Feature<Geometry>>(() => ({
        type: "Feature",
        properties: {},
        geometry: territory.geometry,
    }), [territory.geometry]);
    const draftFeatures = useMemo(
        () => getDraftFeatures(points),
        [points],
    );

    const handleMapClick = (event: MapMouseEvent) => {
        onPointsChange([
            ...points,
            [event.lngLat.lng, event.lngLat.lat],
        ]);
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-sm font-medium text-slate-900 customer-dark:text-content-primary">
                        Граница проекта
                    </div>
                    <div className="mt-1 text-xs text-slate-500 customer-dark:text-content-muted">
                        Расставьте на карте минимум три точки
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 customer-dark:text-content-muted">
                        Точек: {points.length}
                    </span>
                    <button
                        type="button"
                        className="
                            rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900
                            disabled:cursor-not-allowed disabled:opacity-35
                            customer-dark:text-content-muted customer-dark:hover:bg-surface-hover customer-dark:hover:text-content-primary
                        "
                        onClick={() => onPointsChange(points.slice(0, -1))}
                        disabled={!points.length}
                        aria-label="Удалить последнюю точку"
                        title="Удалить последнюю точку"
                    >
                        <MdUndo size={19} />
                    </button>
                    <button
                        type="button"
                        className="
                            rounded-xl p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600
                            disabled:cursor-not-allowed disabled:opacity-35
                            customer-dark:text-content-muted customer-dark:hover:bg-danger-soft customer-dark:hover:text-danger
                        "
                        onClick={() => onPointsChange([])}
                        disabled={!points.length}
                        aria-label="Очистить полигон"
                        title="Очистить полигон"
                    >
                        <MdOutlineDelete size={19} />
                    </button>
                </div>
            </div>

            <div className="relative min-h-48 flex-1 overflow-hidden rounded-2xl border border-slate-200 customer-dark:border-ui-border">
                <Map
                    key={territory.territory_id}
                    initialViewState={{
                        longitude: centre[0],
                        latitude: centre[1],
                        zoom,
                    }}
                    mapStyle="mapbox://styles/mapbox/light-v11"
                    language="ru"
                    projection="mercator"
                    mapboxAccessToken={mapboxToken}
                    cursor="crosshair"
                    onClick={handleMapClick}
                >
                    <Source
                        id="create-project-territory-boundary"
                        type="geojson"
                        data={boundaryFeature}
                    >
                        <Layer
                            id="create-project-territory-fill"
                            type="fill"
                            paint={{
                                "fill-color": "#64748B",
                                "fill-opacity": 0.08,
                            }}
                        />
                        <Layer
                            id="create-project-territory-line"
                            type="line"
                            paint={{
                                "line-color": "#64748B",
                                "line-width": 1.5,
                                "line-opacity": 0.7,
                            }}
                        />
                    </Source>

                    <Source
                        id="create-project-draft"
                        type="geojson"
                        data={draftFeatures}
                    >
                        <Layer
                            id="create-project-draft-fill"
                            type="fill"
                            filter={["==", "$type", "Polygon"]}
                            paint={{
                                "fill-color": "#0788CE",
                                "fill-opacity": 0.24,
                            }}
                        />
                        <Layer
                            id="create-project-draft-line"
                            type="line"
                            paint={{
                                "line-color": "#0788CE",
                                "line-width": 3,
                            }}
                        />
                        <Layer
                            id="create-project-draft-points"
                            type="circle"
                            filter={["==", "$type", "Point"]}
                            paint={{
                                "circle-radius": 5,
                                "circle-color": "#0788CE",
                                "circle-stroke-width": 2,
                                "circle-stroke-color": "#FFFFFF",
                            }}
                        />
                    </Source>
                </Map>
            </div>
        </div>
    );
}

export default CreateProjectTerritoryMap;
