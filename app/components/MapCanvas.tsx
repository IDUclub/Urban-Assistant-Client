import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import Map, { type MapProps, type MapRef } from "react-map-gl/mapbox";

const CAMERA_FIELDS = ["longitude", "latitude", "zoom", "bearing", "pitch"] as const;
const PADDING_SIDES = ["top", "bottom", "left", "right"] as const;

type MapCanvasProps = Omit<MapProps, "viewState"> & {
    mapRef: RefObject<MapRef | null>;
};

export default function MapCanvas({ mapRef, ...props }: MapCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [viewState, setViewState] = useState<MapProps["viewState"]>();

    const updateSize = useCallback(() => {
        const map = mapRef.current;
        const container = containerRef.current;
        if (!map || !container) {
            return;
        }

        const { width, height } = map.getContainer().getBoundingClientRect();
        if (!width || !height) {
            return;
        }

        const center = map.getCenter();
        flushSync(() => {
            setViewState((current) => {
                if (current?.width === width && current.height === height) {
                    return current;
                }

                return {
                    longitude: center.lng,
                    latitude: center.lat,
                    zoom: map.getZoom(),
                    bearing: map.getBearing(),
                    pitch: map.getPitch(),
                    padding: map.getPadding(),
                    width,
                    height,
                };
            });
        });
    }, [mapRef]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(container);

        return () => resizeObserver.disconnect();
    }, [updateSize]);

    const handleMapLoad: MapProps["onLoad"] = (event) => {
        updateSize();
        props.onLoad?.(event);
    };

    const handleMapMove: MapProps["onMove"] = (event) => {
        setViewState((current) => {
            if (!current) {
                return current;
            }

            const next = event.viewState;
            const cameraUnchanged = CAMERA_FIELDS.every((key) => current[key] === next[key]);

            const paddingUnchanged = PADDING_SIDES.every((side) => current.padding[side] === next.padding[side]);

            if (cameraUnchanged && paddingUnchanged) {
                return current;
            }

            return {
                ...next,
                width: current.width,
                height: current.height,
            };
        });
        props.onMove?.(event);
    };

    return (
        <div ref={containerRef} className="h-full w-full">
            <Map
                {...props}
                ref={mapRef}
                viewState={viewState}
                onLoad={handleMapLoad}
                onMove={handleMapMove}
            />
        </div>
    );
}
