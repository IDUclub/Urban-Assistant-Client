import { makeAutoObservable, observable } from "mobx";

type MapLayer = {
    id: string;
    name: string;
    layer: any;
    isVisible: boolean;
    style: {
        color: string;  
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

        this.mapLayers.push({
            ...layer,
            id: this.getLayerId(),
            isVisible: true,
            style: {
                color: getRandomColor(),
            },
        });
    }

    addOrUpdateLayerToMap(layer: {name: string; layer: any}) {
        const existingLayerIndex = this.mapLayers.findIndex(
            (currentLayer) => currentLayer.name === layer.name,
        );

        if (existingLayerIndex < 0) {
            this.addLayerToMap(layer);
            return;
        }

        this.mapLayers[existingLayerIndex] = {
            ...this.mapLayers[existingLayerIndex],
            layer: layer.layer,
        };
    }

    setMapLayers(layers: {name: string; layer: any}[]) {
        this.mapLayers = layers.map(layer => ({
            ...layer,
            id: this.getLayerId(),
            isVisible: true,
            style: {
                color: getRandomColor(),
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

    clearMapLayers() {
        this.mapLayers = [];
        this.facadeScene = undefined;
        this.facadeSceneLoadStatus = undefined;
    }

    constructor() {
        makeAutoObservable(this);
    }
}

const MapStore = new MapDataStore();

export default MapStore;
