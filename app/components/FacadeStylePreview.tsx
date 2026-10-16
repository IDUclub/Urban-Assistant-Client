import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function FacadeStylePreview({ modelUrl }: { modelUrl: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [error, setError] = useState<string>();

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let renderer: any;
        let controls: any;
        let model: any;
        let frame = 0;
        let disposed = false;
        setError(undefined);

        try {
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            renderer.outputEncoding = THREE.sRGBEncoding;
            renderer.domElement.style.display = "block";
            container.appendChild(renderer.domElement);

            scene.add(new THREE.HemisphereLight(0xffffff, 0x9ca3af, 2));
            const sunlight = new THREE.DirectionalLight(0xffffff, 1.4);
            sunlight.position.set(6, 10, 8);
            scene.add(sunlight);

            controls = new OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;

            const resize = () => {
                const width = Math.max(container.clientWidth, 1);
                const height = Math.max(container.clientHeight, 1);
                camera.aspect = width / height;
                camera.updateProjectionMatrix();
                renderer.setSize(width, height);
            };
            const observer = new ResizeObserver(resize);
            observer.observe(container);
            resize();

            const render = () => {
                if (disposed) return;
                controls.update();
                renderer.render(scene, camera);
                frame = requestAnimationFrame(render);
            };
            render();

            new GLTFLoader().load(
                modelUrl,
                (gltf: any) => {
                    if (disposed) return;
                    model = gltf.scene;
                    scene.add(model);
                    const bounds = new THREE.Box3().setFromObject(model);
                    if (bounds.isEmpty()) {
                        setError("Модель не содержит объектов для просмотра.");
                        return;
                    }
                    const center = bounds.getCenter(new THREE.Vector3());
                    const size = bounds.getSize(new THREE.Vector3());
                    const radius = Math.max(size.length() * 0.5, 1);
                    camera.near = Math.max(radius / 100, 0.01);
                    camera.far = radius * 100;
                    camera.position.copy(center).add(
                        new THREE.Vector3(1, 0.75, 1).normalize().multiplyScalar(radius * 2.9),
                    );
                    camera.updateProjectionMatrix();
                    controls.target.copy(center);
                    controls.update();
                },
                undefined,
                () => { if (!disposed) setError("Не удалось открыть 3D-модель стиля."); },
            );

            return () => {
                disposed = true;
                cancelAnimationFrame(frame);
                observer.disconnect();
                controls.dispose();
                if (model) {
                    model.traverse((object: any) => {
                        object.geometry?.dispose();
                        const materials = Array.isArray(object.material) ? object.material : [object.material];
                        materials.forEach((material: any) => material?.dispose());
                    });
                }
                renderer.dispose();
                renderer.forceContextLoss();
                renderer.domElement.remove();
            };
        } catch {
            setError("3D-просмотр недоступен в этом браузере.");
            renderer?.dispose();
            renderer?.domElement.remove();
            controls?.dispose();
        }
    }, [modelUrl]);

    return (
        <div ref={containerRef} className="relative h-full w-full overflow-hidden">
            {error && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/90 px-4 text-center text-sm text-slate-600">
                    {error}
                </div>
            )}
        </div>
    );
}
