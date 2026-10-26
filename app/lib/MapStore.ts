import { makeAutoObservable, observable } from "mobx";

export type MapColorMode = "category" | "scale";

export type MapLayer = {
    id: string;
    name: string;
    layer: any;
    isVisible: boolean;
    style: {
        color: string;
        colorByProperty?: string;
        colorMode?: MapColorMode;
        colorPalette?: string;
        colorPaletteSelection?: "auto" | "user";
        colorPaletteAutoVersion?: number;
    };
};

export type MapFacadeScene = {
    resultId: string;
    glbUrl: string;
    origin: { lon: number; lat: number };
    facadeStyle?: string;
    isVisible: boolean;
};

export type FacadeSceneLoadStatus = "loading" | "ready" | "error";

function getRandomColor() {
    const red = 40 + Math.floor(Math.random() * 180);
    const green = 40 + Math.floor(Math.random() * 180);
    const blue = 40 + Math.floor(Math.random() * 180);

    return `rgb(${red}, ${green}, ${blue})`;
}

function getDefaultLayerOrder(name: string) {
    const normalizedName = name.trim().toLowerCase();

    if (normalizedName.includes("граница территории")) return 0;
    if (normalizedName.includes("результат") && normalizedName.includes("сервис")) return 1;
    if (normalizedName.includes("функциональн") && normalizedName.includes("зон")) return 2;
    if (normalizedName.includes("результат") && normalizedName.includes("здани")) return 3;

    return Number.POSITIVE_INFINITY;
}

const PZZ_LAYER_COLORS: Record<string, string> = {
    "Подбор мест — СЗЗ производственных объектов": "#a855f7",
    "Подбор мест — буферы строгих норм": "#f97316",
    "Подбор мест — зона доступности жилья": "#38bdf8",
    "Подбор мест — существующие объекты этого типа": "#2563eb",
    "Фактические объекты": "#475569",
    "Наложения": "#a855f7",
    "Исходные здания и сервисы": "#477f31",
    "Результат — сервисы": "#3b82f6",
    "Результат — здания": "#94847b",
    "Зоны ПЗЗ": "#cb5b32",
    "Исходные участки": "#359b72",
    "Границы муниципальных образований": "#288c2e",
};

class MapDataStore {
    _idSeed: number = 0;
    mapLayers: MapLayer[] = [];
    facadeScene?: MapFacadeScene;
    facadeSceneLoadStatus?: FacadeSceneLoadStatus;

    getIdSeed() {
        return this._idSeed++;
    }

    private getLayerId() {
        return `map-layer-${this.getIdSeed()}`
    }

    get isMapLayersAvailable() {
        return !!this.mapLayers.length || !!this.facadeScene;
    }

    setFacadeScene(scene: Omit<MapFacadeScene, "isVisible">) {
        this.facadeScene = { ...scene, isVisible: true };
        this.facadeSceneLoadStatus = "loading";
    }

    setFacadeSceneLoadStatus(resultId: string, status: FacadeSceneLoadStatus) {
        if (this.facadeScene?.resultId === resultId) {
            this.facadeSceneLoadStatus = status;
        }
    }

    toggleFacadeSceneVisibility() {
        if (this.facadeScene) {
            this.facadeScene.isVisible = !this.facadeScene.isVisible;
            if (this.facadeScene.isVisible) this.facadeSceneLoadStatus = "loading";
        }
    }

    private getLayerSignature(layer: {name: string; layer: any}) {
        try {
            return JSON.stringify({
                name: layer.name,
                layer: layer.layer,
            });
        } catch {
            return `${layer.name}`;
        }
    }

    addLayerToMap(layer: {name: string; layer: any}) {
        const nextLayerSignature = this.getLayerSignature(layer);
        const hasSameLayer = this.mapLayers.some(
            (currentLayer) => this.getLayerSignature(currentLayer) === nextLayerSignature
        );

        if (hasSameLayer) return;

        const mapLayer: MapLayer = {
            ...layer,
            id: this.getLayerId(),
            isVisible: true,
            style: {
                color: PZZ_LAYER_COLORS[layer.name] ?? getRandomColor(),
            },
        };
        const layerOrder = getDefaultLayerOrder(mapLayer.name);
        const insertIndex = this.mapLayers.findIndex(
            (currentLayer) => getDefaultLayerOrder(currentLayer.name) > layerOrder,
        );

        if (insertIndex < 0) {
            this.mapLayers = [...this.mapLayers, mapLayer];
        } else {
            this.mapLayers = [
                ...this.mapLayers.slice(0, insertIndex),
                mapLayer,
                ...this.mapLayers.slice(insertIndex),
            ];
        }
    }

    addOrUpdateLayerToMap(layer: {name: string; layer: any}) {
        const existingLayerIndex = this.mapLayers.findIndex(
            (currentLayer) => currentLayer.name === layer.name,
        );

        if (existingLayerIndex < 0) {
            this.addLayerToMap(layer);
            return;
        }

        this.mapLayers = this.mapLayers.map((currentLayer, index) =>
            index === existingLayerIndex
                ? { ...currentLayer, layer: layer.layer }
                : currentLayer
        );
    }

    setMapLayers(layers: {name: string; layer: any}[]) {
        this.mapLayers = layers.map(layer => ({
            ...layer,
            id: this.getLayerId(),
            isVisible: true,
            style: {
                color: PZZ_LAYER_COLORS[layer.name] ?? getRandomColor(),
            },
        }));
    }

    restoreMapLayers(layers: MapLayer[]) {
        this.mapLayers = layers;
    }

    toggleLayerVisibility(id: string) {
        this.mapLayers = this.mapLayers.map((layer) =>
            layer.id === id
                ? { ...layer, isVisible: !layer.isVisible }
                : layer
        );
    }

    setLayerOrder(layerIds: string[]) {
        if (layerIds.length !== this.mapLayers.length) return;

        const layersById = new Map(this.mapLayers.map((layer) => [layer.id, layer]));
        const orderedLayers = layerIds
            .map((layerId) => layersById.get(layerId))
            .filter((layer): layer is MapLayer => Boolean(layer));

        if (orderedLayers.length !== this.mapLayers.length) return;

        this.mapLayers = orderedLayers;
    }

    setLayerColorSettings(
        id: string,
        settings: {
            propertyName?: string;
            mode?: MapColorMode;
            palette?: string;
            paletteSelection?: "auto" | "user";
            paletteAutoVersion?: number;
        },
    ) {
        this.mapLayers = this.mapLayers.map((layer) =>
            layer.id === id
                ? {
                    ...layer,
                    style: {
                        ...layer.style,
                        colorByProperty: settings.propertyName ?? layer.style.colorByProperty,
                        colorMode: settings.mode ?? layer.style.colorMode,
                        colorPalette: settings.palette ?? layer.style.colorPalette,
                        colorPaletteSelection: settings.paletteSelection ?? layer.style.colorPaletteSelection,
                        colorPaletteAutoVersion: settings.paletteAutoVersion ?? layer.style.colorPaletteAutoVersion,
                    },
                }
                : layer
        );
    }

    clearMapLayers() {
        this.mapLayers = [];
        this.facadeScene = undefined;
        this.facadeSceneLoadStatus = undefined;
    }

    removeLayerByName(name: string) {
        this.mapLayers = this.mapLayers.filter((layer) => layer.name !== name);
    }

    constructor() {
        makeAutoObservable(this);
    }
}

const MapStore = new MapDataStore();

export default MapStore;
