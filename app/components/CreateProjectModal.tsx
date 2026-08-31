import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { MdClose } from "react-icons/md";
import CustomSelect, { type SelectOption } from "@components/ui/Select";
import CreateProjectTerritoryMap, {
    type PolygonPoint,
} from "@components/CreateProjectTerritoryMap";
import DataStore, {
    type CreatedProject,
    type CreateProjectPayload,
    type ProjectCreationTerritory,
    type ProjectCreationTerritoryOption,
} from "@lib/DataStore";
import {
    getProjectGeometryCentre,
    parseProjectGeoJson,
    type ProjectBoundaryGeometry,
} from "@lib/ProjectGeoJson";

interface CreateProjectModalProps {
    onClose: () => void;
    onCreated?: (project: CreatedProject) => void | Promise<void>;
}

const MAX_GEOJSON_FILE_SIZE = 10 * 1024 * 1024;

function getPolygonCentre(points: PolygonPoint[]): PolygonPoint {
    let doubleArea = 0;
    let longitudeSum = 0;
    let latitudeSum = 0;

    points.forEach((point, index) => {
        const nextPoint = points[(index + 1) % points.length];
        const cross = point[0] * nextPoint[1] - nextPoint[0] * point[1];

        doubleArea += cross;
        longitudeSum += (point[0] + nextPoint[0]) * cross;
        latitudeSum += (point[1] + nextPoint[1]) * cross;
    });

    if (Math.abs(doubleArea) < Number.EPSILON) {
        return [
            points.reduce((sum, point) => sum + point[0], 0) / points.length,
            points.reduce((sum, point) => sum + point[1], 0) / points.length,
        ];
    }

    return [
        longitudeSum / (3 * doubleArea),
        latitudeSum / (3 * doubleArea),
    ];
}

function getRequestErrorMessage(error: unknown) {
    if (!axios.isAxiosError(error)) {
        return "Не удалось создать проект. Попробуйте ещё раз.";
    }

    const detail = error.response?.data?.detail;

    if (typeof detail === "string" && detail.trim()) {
        return detail;
    }

    if (Array.isArray(detail)) {
        const messages = detail.flatMap((item) => (
            typeof item?.msg === "string" && item.msg.trim()
                ? [item.msg]
                : []
        ));

        if (messages.length) {
            return messages.join(". ");
        }
    }

    return "Не удалось создать проект. Проверьте данные и попробуйте ещё раз.";
}

function CreateProjectModal({
    onClose,
    onCreated,
}: CreateProjectModalProps) {
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const [name, setName] = useState("");
    const [territories, setTerritories] = useState<ProjectCreationTerritoryOption[]>([]);
    const [selectedTerritoryId, setSelectedTerritoryId] = useState<number | null>(null);
    const [selectedTerritory, setSelectedTerritory] = useState<ProjectCreationTerritory | null>(null);
    const [polygonPoints, setPolygonPoints] = useState<PolygonPoint[]>([]);
    const [uploadedGeometry, setUploadedGeometry] = useState<ProjectBoundaryGeometry | null>(null);
    const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
    const [geoJsonError, setGeoJsonError] = useState<string | null>(null);
    const [isTerritoriesLoading, setIsTerritoriesLoading] = useState(true);
    const [isTerritoryLoading, setIsTerritoryLoading] = useState(false);
    const [isGeoJsonLoading, setIsGeoJsonLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorText, setErrorText] = useState<string | null>(null);

    const territoryOptions: SelectOption[] = territories.map((territory) => ({
        label: territory.name,
        value: territory.territory_id,
    }));
    const canSubmit = !!name.trim()
        && selectedTerritoryId !== null
        && !!selectedTerritory
        && (polygonPoints.length >= 3 || !!uploadedGeometry)
        && !isGeoJsonLoading
        && !isSubmitting;

    useEffect(() => {
        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
        };
    }, []);

    useEffect(() => {
        closeButtonRef.current?.focus();

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !isSubmitting) {
                onClose();
            }
        };

        document.addEventListener("keydown", handleEscape);

        return () => {
            document.removeEventListener("keydown", handleEscape);
        };
    }, [isSubmitting, onClose]);

    useEffect(() => {
        let isActive = true;

        setIsTerritoriesLoading(true);
        setErrorText(null);

        void DataStore.getProjectCreationTerritories()
            .then((items) => {
                if (!isActive) return;
                setTerritories(items);
            })
            .catch((error) => {
                if (!isActive) return;
                console.error("Error fetching project creation territories:", error);
                setErrorText("Не удалось загрузить список территорий.");
            })
            .finally(() => {
                if (isActive) {
                    setIsTerritoriesLoading(false);
                }
            });

        return () => {
            isActive = false;
        };
    }, []);

    useEffect(() => {
        let isActive = true;

        setPolygonPoints([]);
        setUploadedGeometry(null);
        setUploadedFileName(null);
        setGeoJsonError(null);
        setSelectedTerritory(null);

        if (selectedTerritoryId === null) {
            setIsTerritoryLoading(false);
            return () => {
                isActive = false;
            };
        }

        setIsTerritoryLoading(true);
        setErrorText(null);

        void DataStore.getProjectCreationTerritory(selectedTerritoryId)
            .then((territory) => {
                if (!isActive) return;
                setSelectedTerritory(territory);
            })
            .catch((error) => {
                if (!isActive) return;
                console.error("Error fetching selected territory:", error);
                setErrorText("Не удалось загрузить геометрию выбранной территории.");
            })
            .finally(() => {
                if (isActive) {
                    setIsTerritoryLoading(false);
                }
            });

        return () => {
            isActive = false;
        };
    }, [selectedTerritoryId]);

    const handlePointsChange = (points: PolygonPoint[]) => {
        setPolygonPoints(points);
        setUploadedGeometry(null);
        setUploadedFileName(null);
        setGeoJsonError(null);
    };

    const handleGeoJsonFileSelect = async (file: File) => {
        setIsGeoJsonLoading(true);
        setGeoJsonError(null);

        try {
            if (!file.size) {
                throw new Error("Выбранный файл пуст.");
            }

            if (file.size > MAX_GEOJSON_FILE_SIZE) {
                throw new Error("Размер GeoJSON-файла не должен превышать 10 МБ.");
            }

            const geometry = parseProjectGeoJson(await file.text());

            setPolygonPoints([]);
            setUploadedGeometry(geometry);
            setUploadedFileName(file.name);
            setErrorText(null);
        } catch (error) {
            setGeoJsonError(
                error instanceof Error
                    ? error.message
                    : "Не удалось прочитать GeoJSON-файл.",
            );
        } finally {
            setIsGeoJsonLoading(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!canSubmit || selectedTerritoryId === null) return;

        const closedPolygon = [...polygonPoints, polygonPoints[0]];
        const geometry: ProjectBoundaryGeometry = uploadedGeometry ?? {
            type: "Polygon",
            coordinates: [closedPolygon],
        };
        const centrePoint = uploadedGeometry
            ? getProjectGeometryCentre(uploadedGeometry)
            : getPolygonCentre(polygonPoints);
        const payload: CreateProjectPayload = {
            name: name.trim(),
            territory_id: selectedTerritoryId,
            public: false,
            territory: {
                geometry,
                centre_point: {
                    type: "Point",
                    coordinates: centrePoint,
                },
                properties: {},
            },
        };

        setIsSubmitting(true);
        setErrorText(null);

        try {
            const project = await DataStore.createProject(payload);

            await onCreated?.(project);
            onClose();
        } catch (error) {
            console.error("Error creating project:", error);
            setErrorText(getRequestErrorMessage(error));
        } finally {
            setIsSubmitting(false);
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-100 flex items-center justify-center overflow-hidden bg-slate-950/40 p-4 backdrop-blur-[2px]"
            onMouseDown={(event) => {
                if (
                    event.target === event.currentTarget
                    && !isSubmitting
                ) {
                    onClose();
                }
            }}
        >
            <div
                className={`
                    flex w-full max-w-6xl flex-col
                    rounded-3xl border border-slate-200 bg-white p-6 text-slate-900
                    shadow-[0_30px_80px_-24px_var(--shadow-popover)]
                    customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-primary
                    ${isTerritoryLoading || selectedTerritory
                        ? "h-[min(52rem,calc(100dvh-2rem))] overflow-hidden"
                        : "overflow-visible"}
                `}
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-project-title"
            >
                <div className="flex shrink-0 items-start justify-between gap-4">
                    <div>
                        <h2 id="create-project-title" className="text-xl font-semibold">
                            Создать проект
                        </h2>
                        <p className="mt-1 text-sm text-slate-500 customer-dark:text-content-muted">
                            Укажите название, территорию и задайте границу проекта
                        </p>
                    </div>
                    <button
                        ref={closeButtonRef}
                        type="button"
                        className="
                            rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900
                            focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40
                            customer:focus-visible:ring-brand-primary/40
                            customer-dark:text-content-muted customer-dark:hover:bg-surface-hover customer-dark:hover:text-content-primary
                        "
                        onClick={onClose}
                        disabled={isSubmitting}
                        aria-label="Закрыть окно создания проекта"
                    >
                        <MdClose size={22} />
                    </button>
                </div>

                <form
                    className="mt-6 flex min-h-0 flex-1 flex-col gap-5"
                    onSubmit={handleSubmit}
                >
                    <div className="grid shrink-0 gap-4 md:grid-cols-2">
                        <label className="block">
                            <span className="mb-2 block text-sm font-medium">
                                Название проекта
                            </span>
                            <input
                                type="text"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="Введите название"
                                className="
                                    w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none
                                    transition-colors placeholder:text-slate-400 focus:border-[#0788CE]
                                    customer:focus:border-brand-primary
                                    customer-dark:border-ui-border customer-dark:bg-surface-panel customer-dark:placeholder:text-content-muted
                                "
                                disabled={isSubmitting}
                                required
                            />
                        </label>

                        <div>
                            <span className="mb-2 block text-sm font-medium">
                                Территория
                            </span>
                            {isTerritoriesLoading ? (
                                <div className="flex min-h-11 items-center rounded-2xl border border-slate-200 px-4 text-sm text-slate-400 customer-dark:border-ui-border customer-dark:text-content-muted">
                                    Загрузка территорий...
                                </div>
                            ) : (
                                <CustomSelect
                                    value={selectedTerritoryId ?? undefined}
                                    options={territoryOptions}
                                    onChange={(value) => {
                                        setSelectedTerritoryId(Number(value));
                                    }}
                                    placeholder="Выберите территорию"
                                    block
                                    compactGlow
                                />
                            )}
                        </div>
                    </div>

                    {isTerritoryLoading && (
                        <div className="flex min-h-48 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm text-slate-500 customer-dark:border-ui-border customer-dark:bg-surface-muted customer-dark:text-content-muted">
                            Загрузка карты территории...
                        </div>
                    )}

                    {selectedTerritory && !isTerritoryLoading && (
                        <CreateProjectTerritoryMap
                            territory={selectedTerritory}
                            points={polygonPoints}
                            uploadedGeometry={uploadedGeometry}
                            uploadedFileName={uploadedFileName}
                            geoJsonError={geoJsonError}
                            isGeoJsonLoading={isGeoJsonLoading}
                            onPointsChange={handlePointsChange}
                            onGeoJsonFileSelect={handleGeoJsonFileSelect}
                        />
                    )}

                    {errorText && (
                        <div
                            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 customer-dark:border-danger-border customer-dark:bg-danger-soft customer-dark:text-danger-content"
                            role="alert"
                        >
                            {errorText}
                        </div>
                    )}

                    <div className="mt-auto flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 pt-5 customer-dark:border-ui-border">
                        <button
                            type="button"
                            className="
                                rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors
                                hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300
                                disabled:cursor-not-allowed disabled:opacity-50
                                customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover
                            "
                            onClick={onClose}
                            disabled={isSubmitting}
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            className="
                                rounded-2xl bg-[#0788CE] px-5 py-2.5 text-sm font-medium text-white
                                transition-colors hover:bg-[#0676B3] focus:outline-none
                                focus-visible:ring-2 focus-visible:ring-[#0788CE]/40 focus-visible:ring-offset-2
                                disabled:cursor-not-allowed disabled:opacity-45
                                customer:bg-brand-primary customer:hover:bg-brand-hover
                                customer:focus-visible:ring-brand-primary/40 customer-dark:ring-offset-surface-raised
                            "
                            disabled={!canSubmit}
                        >
                            {isSubmitting ? "Создание..." : "Создать"}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body,
    );
}

export default CreateProjectModal;
