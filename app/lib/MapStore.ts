import { makeAutoObservable, observable } from "mobx";

class MapDataStore {
    mapLayers: any[] = [];

    addLayerToMap(layer: any) {
        this.mapLayers.push(layer);
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