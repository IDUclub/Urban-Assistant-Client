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

function getRandomColor() {
    const red = 40 + Math.floor(Math.random() * 180);
    const green = 40 + Math.floor(Math.random() * 180);
    const blue = 40 + Math.floor(Math.random() * 180);

    return `rgb(${red}, ${green}, ${blue})`;
}

class MapDataStore {
    _idSeed: number = 0;
    mapLayers: MapLayer[] = [];

    getIdSeed() {
        return this._idSeed++;
    }

    private getLayerId() {
        return `map-layer-${this.getIdSeed()}`
    }

    get isMapLayersAvailable() {
        return !!this.mapLayers.length;
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

    toggleLayerVisibility(id: string) {
        this.mapLayers = this.mapLayers.map((layer) =>
            layer.id === id
                ? { ...layer, isVisible: !layer.isVisible }
                : layer
        );
    }

    clearMapLayers() {
        this.mapLayers = [];
    }

    constructor() {
        makeAutoObservable(this);
    }
}

const MapStore = new MapDataStore();

export default MapStore;
