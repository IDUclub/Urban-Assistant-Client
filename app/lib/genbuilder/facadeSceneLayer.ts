import { MercatorCoordinate, type CustomLayerInterface } from "mapbox-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { MapFacadeScene } from "@lib/MapStore";

type FacadeSceneBounds = [[number, number], [number, number]];

function getModelLngLatBounds(model: any, modelMatrix: any): FacadeSceneBounds | undefined {
    const bounds = new THREE.Box3().setFromObject(model);
    if (bounds.isEmpty()) return undefined;

    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;

    for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
            for (const z of [bounds.min.z, bounds.max.z]) {
                const position = new THREE.Vector3(x, y, z).applyMatrix4(modelMatrix);
                const { lng, lat } = new MercatorCoordinate(position.x, position.y, position.z).toLngLat();
                west = Math.min(west, lng);
                south = Math.min(south, lat);
                east = Math.max(east, lng);
                north = Math.max(north, lat);
            }
        }
    }

    return [west, south, east, north].every(Number.isFinite)
        ? [[west, south], [east, north]]
        : undefined;
}

function disposeModel(model: any) {
    model.traverse((object: any) => {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material: any) => {
            if (!material) return;
            Object.values(material).forEach((value: any) => {
                if (value?.isTexture) value.dispose();
            });
            material.dispose();
        });
    });
}

export function createFacadeSceneLayer(
    facadeScene: MapFacadeScene,
    modelUrl: string,
    onError: () => void,
    onModelBounds: (bounds: FacadeSceneBounds) => void,
    onFirstRender: () => void,
): CustomLayerInterface {
    const coordinate = MercatorCoordinate.fromLngLat(
        [facadeScene.origin.lon, facadeScene.origin.lat],
        0,
    );
    const scale = coordinate.meterInMercatorCoordinateUnits();
    const modelMatrix = new THREE.Matrix4()
        .makeTranslation(coordinate.x, coordinate.y, coordinate.z)
        .scale(new THREE.Vector3(scale, -scale, scale))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    let camera: any;
    let scene: any;
    let renderer: any;
    let model: any;
    let hasRenderedModel = false;
    let loadGeneration = 0;

    return {
        id: `facade-scene-${facadeScene.resultId}`,
        type: "custom",
        renderingMode: "3d",
        onAdd(map, gl) {
            const generation = ++loadGeneration;
            hasRenderedModel = false;
            camera = new THREE.Camera();
            scene = new THREE.Scene();
            scene.add(new THREE.AmbientLight(0xffffff, 1.5));
            const light = new THREE.DirectionalLight(0xffffff, 1.2);
            light.position.set(0, 100, 100);
            scene.add(light);
            renderer = new THREE.WebGLRenderer({
                canvas: map.getCanvas(),
                context: gl,
                antialias: true,
            });
            renderer.autoClear = false;
            renderer.outputEncoding = THREE.sRGBEncoding;

            new GLTFLoader().load(
                modelUrl,
                (gltf: any) => {
                    if (generation !== loadGeneration) {
                        disposeModel(gltf.scene);
                        return;
                    }
                    model = gltf.scene;
                    scene.add(model);
                    const bounds = getModelLngLatBounds(model, modelMatrix);
                    if (bounds) onModelBounds(bounds);
                    map.triggerRepaint();
                },
                undefined,
                () => { if (generation === loadGeneration) onError(); },
            );
        },
        render(_gl, matrix) {
            if (!renderer || !model) return;
            camera.projectionMatrix = new THREE.Matrix4()
                .fromArray(matrix)
                .multiply(modelMatrix);
            renderer.resetState();
            renderer.render(scene, camera);
            if (!hasRenderedModel) {
                hasRenderedModel = true;
                onFirstRender();
            }
        },
        onRemove() {
            loadGeneration += 1;
            hasRenderedModel = false;
            if (model) disposeModel(model);
            model = undefined;
            renderer?.dispose();
            renderer = undefined;
            scene = undefined;
            camera = undefined;
        },
    };
}
