import { useMemo } from "react";
import Map, { Layer, Source } from "react-map-gl/mapbox";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { ScenarioImportedGeometry } from "@lib/ScenarioGeoJson";
import type { InfrastructureImportItem, InfrastructureTypeOption } from "@lib/ScenarioInfrastructure";
import {
    FUNCTIONAL_ZONE_FALLBACK_COLOR,
    getFunctionalZoneColor,
} from "@lib/functionalZones";
import { GENPLANNER_ROAD_COLORS_BY_ID } from "@lib/genplanner/roads";
import "mapbox-gl/dist/mapbox-gl.css";

type ScenarioImportPreviewMapProps = {
    functionalZones: ScenarioImportedGeometry[];
    functionalZoneTypeIds: Array<number | undefined>;
    roads: ScenarioImportedGeometry[];
    roadTypeIds: Array<number | undefined>;
    infrastructure: InfrastructureImportItem[];
    physicalObjectTypes: InfrastructureTypeOption[];
};

type Coordinates = [number, number];
type Bounds = [Coordinates, Coordinates];

const DEFAULT_CENTRE: Coordinates = [37.6173, 55.7558];
const PREVIEW_COLOR_PROPERTY = "__scenario_preview_color";

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
        value.length >= 2 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number" &&
        Number.isFinite(value[0]) &&
        Number.isFinite(value[1])
    ) {
        return extendBounds(bounds, value[0], value[1]);
    }

    return value.reduce<Bounds | undefined>(
        (currentBounds, item) => collectBounds(item, currentBounds),
        bounds,
    );
}

function getGeometryBounds(geometries: Geometry[]) {
    return geometries.reduce<Bounds | undefined>((bounds, geometry) => (
        "coordinates" in geometry
            ? collectBounds(geometry.coordinates, bounds)
            : bounds
    ), undefined);
}

function getZoom(bounds: Bounds | undefined) {
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
    return 10;
}

function toFeatureCollection(
    features: ScenarioImportedGeometry[],
    colors: string[],
): FeatureCollection<Geometry> {
    return {
        type: "FeatureCollection",
        features: features.map<Feature<Geometry>>((feature, index) => ({
            type: "Feature",
            properties: {
                ...feature.properties,
                [PREVIEW_COLOR_PROPERTY]: colors[index] ?? FUNCTIONAL_ZONE_FALLBACK_COLOR,
            },
            geometry: feature.geometry,
        })),
    };
}

function getLegendBackground(colors: string[]) {
    const uniqueColors = Array.from(new Set(colors));

    if (uniqueColors.length <= 1) {
        return uniqueColors[0] ?? FUNCTIONAL_ZONE_FALLBACK_COLOR;
    }

    return `linear-gradient(to right, ${uniqueColors.join(", ")})`;
}

function getInfrastructureColor(typeId: number | undefined) {
    if (typeId === undefined) return FUNCTIONAL_ZONE_FALLBACK_COLOR;
    // Stable pseudo-random color: all objects of one physical type share a color.
    const hue = ((Math.imul(typeId, 137) % 360) + 360) % 360;
    return `hsl(${hue}, 68%, 43%)`;
}

function ScenarioImportPreviewMap({
    functionalZones,
    functionalZoneTypeIds,
    roads,
    roadTypeIds,
    infrastructure,
    physicalObjectTypes,
}: ScenarioImportPreviewMapProps) {
    const allGeometries = useMemo<Geometry[]>(
        () => [...functionalZones, ...roads, ...infrastructure.map(({ feature }) => feature)]
            .map(({ geometry }) => geometry),
        [functionalZones, roads, infrastructure],
    );
    const bounds = useMemo(() => getGeometryBounds(allGeometries), [allGeometries]);
    const centre: Coordinates = bounds
        ? [
            (bounds[0][0] + bounds[1][0]) / 2,
            (bounds[0][1] + bounds[1][1]) / 2,
        ]
        : DEFAULT_CENTRE;
    const mapKey = bounds ? bounds.flat().join("-") : "empty";
    const functionalZoneColors = useMemo(
        () => functionalZones.map((_, index) => (
            getFunctionalZoneColor(functionalZoneTypeIds[index])
        )),
        [functionalZones, functionalZoneTypeIds],
    );
    const roadColors = useMemo(
        () => roads.map((_, index) => (
            GENPLANNER_ROAD_COLORS_BY_ID[roadTypeIds[index] ?? -1]
            ?? FUNCTIONAL_ZONE_FALLBACK_COLOR
        )),
        [roadTypeIds, roads],
    );
    const functionalZoneFeatures = useMemo(
        () => toFeatureCollection(functionalZones, functionalZoneColors),
        [functionalZoneColors, functionalZones],
    );
    const roadFeatures = useMemo(
        () => toFeatureCollection(roads, roadColors),
        [roadColors, roads],
    );
    const infrastructureColors = useMemo(
        () => infrastructure.map((item) => getInfrastructureColor(item.physicalObjectTypeId)),
        [infrastructure],
    );
    const infrastructureFeatures = useMemo(
        () => toFeatureCollection(infrastructure.map(({ feature }) => feature), infrastructureColors),
        [infrastructure, infrastructureColors],
    );
    const infrastructureLegend = useMemo(() => Array.from(new Set(
        infrastructure.map((item) => item.physicalObjectTypeId),
    )).map((typeId) => ({
        typeId,
        color: getInfrastructureColor(typeId),
        label: physicalObjectTypes.find((type) => type.value === typeId)?.label ?? "Тип не выбран",
    })), [infrastructure, physicalObjectTypes]);

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200 customer-dark:border-ui-border">
            <Map
                key={mapKey}
                initialViewState={{
                    longitude: centre[0],
                    latitude: centre[1],
                    zoom: getZoom(bounds),
                }}
                mapStyle="mapbox://styles/mapbox/light-v11"
                language="ru"
                projection="mercator"
                mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN}
                style={{ height: 350 }}
            >
                <Source id="scenario-import-functional-zones" type="geojson" data={functionalZoneFeatures}>
                    <Layer
                        id="scenario-import-functional-zones-fill"
                        type="fill"
                        paint={{
                            "fill-color": ["get", PREVIEW_COLOR_PROPERTY],
                            "fill-opacity": 0.24,
                        }}
                    />
                    <Layer
                        id="scenario-import-functional-zones-line"
                        type="line"
                        paint={{
                            "line-color": ["get", PREVIEW_COLOR_PROPERTY],
                            "line-width": 2,
                        }}
                    />
                </Source>

                <Source id="scenario-import-infrastructure" type="geojson" data={infrastructureFeatures}>
                    <Layer
                        id="scenario-import-infrastructure-fill"
                        type="fill"
                        paint={{ "fill-color": ["get", PREVIEW_COLOR_PROPERTY], "fill-opacity": 0.55 }}
                    />
                    <Layer
                        id="scenario-import-infrastructure-line"
                        type="line"
                        paint={{ "line-color": ["get", PREVIEW_COLOR_PROPERTY], "line-width": 3 }}
                    />
                    <Layer
                        id="scenario-import-infrastructure-points"
                        type="circle"
                        filter={["==", "$type", "Point"]}
                        paint={{
                            "circle-color": ["get", PREVIEW_COLOR_PROPERTY],
                            "circle-radius": 6,
                            "circle-stroke-color": "#FFFFFF",
                            "circle-stroke-width": 1.5,
                        }}
                    />
                </Source>

                <Source id="scenario-import-roads" type="geojson" data={roadFeatures}>
                    <Layer
                        id="scenario-import-roads-line"
                        type="line"
                        paint={{
                            "line-color": ["get", PREVIEW_COLOR_PROPERTY],
                            "line-width": 3,
                        }}
                    />
                    <Layer
                        id="scenario-import-roads-points"
                        type="circle"
                        filter={["==", "$type", "Point"]}
                        paint={{
                            "circle-color": ["get", PREVIEW_COLOR_PROPERTY],
                            "circle-radius": 5,
                            "circle-stroke-color": "#FFFFFF",
                            "circle-stroke-width": 1.5,
                        }}
                    />
                </Source>
            </Map>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 bg-white px-3 py-2 text-xs text-slate-600 customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-secondary">
                <span className="inline-flex items-center gap-1.5">
                    <i
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ background: getLegendBackground(functionalZoneColors) }}
                    />
                    Функциональные зоны: {functionalZones.length}
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <i
                        className="h-0.5 w-3"
                        style={{ background: getLegendBackground(roadColors) }}
                    />
                    Дорожная сеть: {roads.length}
                </span>
                {infrastructure.length > 0 && (
                    <span className="font-medium">Объекты застройки: {infrastructure.length}</span>
                )}
                {infrastructureLegend.map(({ typeId, color, label }) => (
                    <span key={typeId ?? "unmapped"} className="inline-flex items-center gap-1.5">
                        <i className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
                        {label}
                    </span>
                ))}
            </div>
        </div>
    );
}

export default ScenarioImportPreviewMap;
