import { useEffect, useRef, useState } from "react";
import { IoChevronDown, IoChevronUp } from "react-icons/io5";
import {
    MdDownload,
    MdDragHandle,
    MdOutlineVisibility,
    MdOutlineVisibilityOff,
} from "react-icons/md";
import type {
    FacadeSceneLoadStatus,
    MapFacadeScene,
    MapLayer,
} from "@lib/MapStore";
import {
    getLayerDisplayName,
    getLayerListDisplayName,
} from "@lib/map/layerMetadata";
import type { LayerRenderingStyle } from "@lib/map/layerColoring";

type MapLayersPanelProps = {
    mapLayers: MapLayer[];
    layerRenderingStyles: globalThis.Map<string, LayerRenderingStyle>;
    activeLayerId?: string;
    isExpanded: boolean;
    facadeScene?: MapFacadeScene;
    facadeSceneLoadStatus?: FacadeSceneLoadStatus;
    facadeSceneError?: string;
    onToggleExpanded: () => void;
    onReorder: (layerIds: string[]) => void;
    onToggleVisibility: (layer: MapLayer) => void;
    onActivate: (layer: MapLayer) => void;
    onDownload: (layer: MapLayer) => void;
    onToggleFacadeVisibility: () => void;
    onActivateFacade: () => void;
};

const MapLayersPanel = ({
    mapLayers,
    layerRenderingStyles,
    activeLayerId,
    isExpanded,
    facadeScene,
    facadeSceneLoadStatus,
    facadeSceneError,
    onToggleExpanded,
    onReorder,
    onToggleVisibility,
    onActivate,
    onDownload,
    onToggleFacadeVisibility,
    onActivateFacade,
}: MapLayersPanelProps) => {
    const [draggedLayerId, setDraggedLayerId] = useState<string>();
    const [dragPreviewLayerIds, setDragPreviewLayerIds] = useState<string[]>();
    const layerRowRefs = useRef(new globalThis.Map<string, HTMLDivElement>());
    const dragPreviewLayerIdsRef = useRef<string[] | undefined>(undefined);
    const dragPointerYRef = useRef<number | undefined>(undefined);
    const dragFrameRef = useRef<number | undefined>(undefined);
    const layerRows = mapLayers.map((layer) => {
        const { categoricalStyle, numericStyle } = layerRenderingStyles.get(layer.id) ?? {};

        return {
            layer,
            legendGradient: numericStyle?.legendGradient ?? categoricalStyle?.legendGradient,
            legendTitle: categoricalStyle?.legendTitle,
        };
    });
    const displayedLayerRows = dragPreviewLayerIds
        ? dragPreviewLayerIds
            .map((layerId) => layerRows.find(({ layer }) => layer.id === layerId))
            .filter((row): row is (typeof layerRows)[number] => Boolean(row))
        : layerRows;

    const updateLayerDragPreview = (clientY: number) => {
        if (!draggedLayerId) return;

        const currentLayerIds = dragPreviewLayerIdsRef.current;
        if (!currentLayerIds) return;

        const targetLayerId = currentLayerIds.reduce<{
            id: string;
            distance: number;
        } | undefined>((closestLayer, layerId) => {
            const row = layerRowRefs.current.get(layerId);
            if (!row) return closestLayer;

            const bounds = row.getBoundingClientRect();
            const distance = Math.abs(clientY - (bounds.top + bounds.bottom) / 2);

            return !closestLayer || distance < closestLayer.distance
                ? { id: layerId, distance }
                : closestLayer;
        }, undefined)?.id;

        if (!targetLayerId || targetLayerId === draggedLayerId) return;

        const sourceIndex = currentLayerIds.indexOf(draggedLayerId);
        const targetIndex = currentLayerIds.indexOf(targetLayerId);
        if (sourceIndex === -1 || targetIndex === -1) return;

        const nextLayerIds = [...currentLayerIds];
        const [movedLayerId] = nextLayerIds.splice(sourceIndex, 1);

        nextLayerIds.splice(targetIndex, 0, movedLayerId);
        dragPreviewLayerIdsRef.current = nextLayerIds;

        setDragPreviewLayerIds(nextLayerIds);
    };

    const finishLayerDrag = (applyOrder: boolean) => {
        if (dragFrameRef.current !== undefined) {
            cancelAnimationFrame(dragFrameRef.current);
            dragFrameRef.current = undefined;
        }

        if (dragPointerYRef.current !== undefined) {
            updateLayerDragPreview(dragPointerYRef.current);
        }

        if (applyOrder && dragPreviewLayerIdsRef.current) {
            onReorder(dragPreviewLayerIdsRef.current);
        }

        setDraggedLayerId(undefined);
        setDragPreviewLayerIds(undefined);
        dragPreviewLayerIdsRef.current = undefined;
        dragPointerYRef.current = undefined;
    };

    useEffect(() => {
        if (!draggedLayerId) return;

        const handlePointerMove = (event: PointerEvent) => {
            event.preventDefault();
            dragPointerYRef.current = event.clientY;

            if (dragFrameRef.current !== undefined) return;

            dragFrameRef.current = requestAnimationFrame(() => {
                dragFrameRef.current = undefined;

                if (dragPointerYRef.current !== undefined) {
                    updateLayerDragPreview(dragPointerYRef.current);
                }
            });
        };
        const handlePointerUp = () => finishLayerDrag(true);
        const handlePointerCancel = () => finishLayerDrag(false);

        window.addEventListener("pointermove", handlePointerMove, { passive: false });
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerCancel);
        window.addEventListener("blur", handlePointerCancel);

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerCancel);
            window.removeEventListener("blur", handlePointerCancel);
        };
    }, [draggedLayerId]);

    return (
        <div className={`pointer-events-auto absolute left-4 top-4 z-10 w-[min(18rem,calc(100%-2rem))] max-w-72 ${isExpanded ? "h-[40%]" : ""}`}>
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white/30 px-4 py-3 shadow-sm backdrop-blur-lg customer-dark:border-ui-border customer-dark:bg-surface-panel/30">
                <button
                    type="button"
                    onClick={onToggleExpanded}
                    aria-expanded={isExpanded}
                    className={`flex shrink-0 cursor-pointer items-center justify-between gap-2 text-left text-gray-500 customer-dark:text-content-muted ${isExpanded ? "mb-3" : ""}`}
                >
                    <span className="text-xs font-semibold uppercase tracking-[0.14em]">
                        Отображаемые слои
                    </span>
                    {isExpanded ? <IoChevronDown size={16} /> : <IoChevronUp size={16} />}
                </button>
                <div className={`min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto ${isExpanded ? "flex" : "hidden"}`}>
                    {displayedLayerRows.map(({ layer, legendGradient, legendTitle }) => {
                        const isActiveLayer = activeLayerId === layer.id;
                        const displayName = getLayerDisplayName(layer.name);
                        const listDisplayName = getLayerListDisplayName(layer.name);

                        return (
                            <div
                                key={layer.id}
                                ref={(element) => {
                                    if (element) {
                                        layerRowRefs.current.set(layer.id, element);
                                    } else {
                                        layerRowRefs.current.delete(layer.id);
                                    }
                                }}
                                className={`
                                    flex items-center gap-2 rounded-2xl text-[13px] transition-colors
                                    ${draggedLayerId === layer.id
                                      ? "-mx-1 bg-gray-200/40 px-1 customer-dark:bg-white/5"
                                      : ""}
                                    ${layer.isVisible
                                      ? "text-gray-700 customer-dark:text-content-secondary"
                                      : "text-gray-400 customer-dark:text-content-muted"}
                                `}
                            >
                                <button
                                    type="button"
                                    className="cursor-pointer text-lg text-gray-500 transition-colors hover:text-[#0788CE] customer:hover:text-brand-primary customer-dark:text-content-muted"
                                    onClick={() => onToggleVisibility(layer)}
                                    aria-label={layer.isVisible ? "Скрыть слой" : "Показать слой"}
                                >
                                    {layer.isVisible ? <MdOutlineVisibility /> : <MdOutlineVisibilityOff />}
                                </button>
                                <span
                                    className="h-4 w-1.5 shrink-0 shadow-sm"
                                    title={legendTitle}
                                    style={legendGradient
                                        ? { background: legendGradient }
                                        : { backgroundColor: layer.style.color }}
                                />
                                <button
                                    type="button"
                                    className={`
                                        min-w-0 flex-1 cursor-pointer truncate text-left transition-colors
                                        hover:text-[#0788CE] customer:hover:text-brand-primary customer-dark:hover:text-[#9A252B]
                                        ${isActiveLayer
                                          ? "font-semibold text-[#0788CE] customer:text-brand-primary customer-dark:text-[#9A252B]"
                                          : ""}
                                    `}
                                    onClick={() => onActivate(layer)}
                                    title={displayName}
                                    aria-pressed={isActiveLayer}
                                >
                                    {listDisplayName}
                                </button>
                                <button
                                    type="button"
                                    className="cursor-pointer text-lg text-gray-500 transition-colors hover:text-[#0788CE] customer:hover:text-brand-primary customer-dark:text-content-muted"
                                    onClick={() => onDownload(layer)}
                                    aria-label="Скачать слой"
                                >
                                    <MdDownload />
                                </button>
                                <span
                                    className={`flex shrink-0 touch-none select-none items-center justify-center text-lg transition-colors ${draggedLayerId === layer.id
                                        ? "cursor-grabbing text-[#0788CE] customer:text-brand-primary"
                                        : "cursor-grab text-gray-500 hover:text-[#0788CE] customer:hover:text-brand-primary customer-dark:text-content-muted"}`}
                                    title="Перетащить слой"
                                    aria-label="Перетащить слой"
                                    onPointerDown={(event) => {
                                        if (event.button !== 0) return;

                                        event.preventDefault();
                                        const initialLayerIds = mapLayers.map((currentLayer) => currentLayer.id);

                                        setDraggedLayerId(layer.id);
                                        setDragPreviewLayerIds(initialLayerIds);
                                        dragPreviewLayerIdsRef.current = initialLayerIds;
                                    }}
                                >
                                    <MdDragHandle />
                                </span>
                            </div>
                        );
                    })}
                    {facadeScene && (
                        <div className={`flex items-center gap-2 rounded-2xl text-[13px] ${facadeScene.isVisible ? "text-gray-700 customer-dark:text-content-secondary" : "text-gray-400 customer-dark:text-content-muted"}`}>
                            <button
                                type="button"
                                className="cursor-pointer text-lg text-gray-500 customer-dark:text-content-muted"
                                onClick={onToggleFacadeVisibility}
                                aria-label={facadeScene.isVisible ? "Скрыть 3D-модель" : "Показать 3D-модель"}
                            >
                                {facadeScene.isVisible ? <MdOutlineVisibility /> : <MdOutlineVisibilityOff />}
                            </button>
                            <span className="h-4 w-1.5 shrink-0 bg-blue-500 shadow-sm" />
                            <button
                                type="button"
                                className="min-w-0 flex-1 cursor-pointer truncate text-left hover:text-[#0788CE] customer:hover:text-brand-primary"
                                onClick={onActivateFacade}
                                title={facadeScene.facadeStyle ? `3D-застройка: ${facadeScene.facadeStyle}` : "3D-застройка"}
                            >
                                3D-застройка{facadeScene.facadeStyle ? ` · ${facadeScene.facadeStyle}` : ""}
                            </button>
                        </div>
                    )}
                    {facadeScene?.isVisible && facadeSceneLoadStatus === "loading" && (
                        <div className="pl-7 text-xs text-gray-500 customer-dark:text-content-muted" role="status">
                            Загружаем 3D-модель...
                        </div>
                    )}
                    {facadeSceneError && (
                        <div className="text-xs text-red-700 customer:text-danger-content">{facadeSceneError}</div>
                    )}
                </div>
            </div>
        </div>
    );
};


export default MapLayersPanel;
