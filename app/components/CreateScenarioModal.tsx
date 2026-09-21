import {
    type SubmitEvent,
    useEffect,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { MdCheck, MdClose, MdEdit } from "react-icons/md";
import CustomSelect, { type SelectOption } from "@components/ui/Select";
import FileUpload from "@components/FileUpload";
import ScenarioImportPreviewMap from "@components/ScenarioImportPreviewMap";
import ScenarioGeoJsonEditorModal, {
    type ScenarioPropertyOption,
} from "@components/ScenarioGeoJsonEditorModal";
import DataStore, {
    type FunctionalZoneType,
    type ProjectScenario,
} from "@lib/DataStore";
import {
    readScenarioGeoJsonFile,
    type ScenarioImportedGeometry,
    type ScenarioGeoJsonKind,
} from "@lib/ScenarioGeoJson";

type EditingImport = "functionalZones" | "roads";

const ROAD_TYPE_OPTIONS: ScenarioPropertyOption[] = [
    { value: 50, label: "Федеральная дорога", aliases: ["федеральная", "federal road"] },
    { value: 51, label: "Региональная дорога", aliases: ["региональная", "regional road"] },
    { value: 52, label: "Местная дорога", aliases: ["местная", "local road"] },
];

interface CreateScenarioModalProps {
    projectId: number;
    projectName: string;
    baseScenarioId: number;
    onClose: () => void;
    onCreated: (scenario: ProjectScenario) => void | Promise<void>;
}

const EXCLUDED_FUNCTIONAL_ZONE_TYPE_IDS = new Set([8, 14, 15]);

function getScenarioErrorMessage(error: unknown) {
    if (!axios.isAxiosError(error)) {
        return "Не удалось создать сценарий. Попробуйте ещё раз.";
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

    return "Не удалось создать сценарий. Проверьте данные и попробуйте ещё раз.";
}

function getZoneTypeLabel(zoneType: FunctionalZoneType) {
    return zoneType.description ?? zoneType.name;
}

function getUploadErrorMessage(error: unknown) {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }

    return "Не удалось сохранить добавленные объекты.";
}

function getInitialPropertyName(
    features: ScenarioImportedGeometry[],
    candidates: string[],
) {
    const propertyNames = Array.from(new Set(
        features.flatMap((feature) => Object.keys(feature.properties)),
    ));

    return candidates.find((candidate) => propertyNames.includes(candidate))
        ?? propertyNames[0]
        ?? "";
}

function getMappedOptionValue(
    value: unknown,
    options: ScenarioPropertyOption[],
) {
    const normalizedValue = typeof value === "string"
        ? value.trim().toLocaleLowerCase("ru")
        : value;

    return options.find((option) => (
        option.value === value ||
        option.value === Number(value) ||
        [option.label, ...(option.aliases ?? [])].some((label) => (
            label.trim().toLocaleLowerCase("ru") === normalizedValue
        ))
    ))?.value;
}

function CreateScenarioModal({
    projectId,
    projectName,
    baseScenarioId,
    onClose,
    onCreated,
}: CreateScenarioModalProps) {
    const nameInputRef = useRef<HTMLInputElement | null>(null);
    const [name, setName] = useState("");
    const [functionalZoneTypeId, setFunctionalZoneTypeId] = useState<number | null>(null);
    const [functionalZoneTypes, setFunctionalZoneTypes] = useState<FunctionalZoneType[]>(
        () => DataStore.functionalZoneTypes ?? [],
    );
    const [isZoneTypesLoading, setIsZoneTypesLoading] = useState(
        DataStore.functionalZoneTypes === null,
    );
    const [shouldAddObjects, setShouldAddObjects] = useState(false);
    const [functionalZoneGeometries, setFunctionalZoneGeometries] = useState<ScenarioImportedGeometry[]>([]);
    const [roadGeometries, setRoadGeometries] = useState<ScenarioImportedGeometry[]>([]);
    const [pendingRoadGeometries, setPendingRoadGeometries] = useState<ScenarioImportedGeometry[]>([]);
    const [functionalZonesSource, setFunctionalZonesSource] = useState<string | null>(null);
    const [roadsSource, setRoadsSource] = useState<string | null>(null);
    const [functionalZonePropertyName, setFunctionalZonePropertyName] = useState("functional_zone_type_id");
    const [roadPropertyName, setRoadPropertyName] = useState("physical_object_type_id");
    const [functionalZoneTypeIds, setFunctionalZoneTypeIds] = useState<Array<number | undefined>>([]);
    const [roadTypeIds, setRoadTypeIds] = useState<Array<number | undefined>>([]);
    const [editingImport, setEditingImport] = useState<EditingImport | null>(null);
    const [functionalZonesFileName, setFunctionalZonesFileName] = useState<string | null>(null);
    const [roadsFileName, setRoadsFileName] = useState<string | null>(null);
    const [loadingFileKind, setLoadingFileKind] = useState<ScenarioGeoJsonKind | null>(null);
    const [fileErrorText, setFileErrorText] = useState<string | null>(null);
    const [createdScenario, setCreatedScenario] = useState<ProjectScenario | null>(null);
    const [areFunctionalZonesUploaded, setAreFunctionalZonesUploaded] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorText, setErrorText] = useState<string | null>(null);
    const zoneTypeOptions: SelectOption[] = functionalZoneTypes
        .filter((zoneType) => !EXCLUDED_FUNCTIONAL_ZONE_TYPE_IDS.has(zoneType.id))
        .map((zoneType) => ({
            label: getZoneTypeLabel(zoneType),
            value: zoneType.id,
    }));
    const functionalZonePropertyOptions: ScenarioPropertyOption[] = functionalZoneTypes
        .filter((zoneType) => !EXCLUDED_FUNCTIONAL_ZONE_TYPE_IDS.has(zoneType.id))
        .map((zoneType) => ({
            value: zoneType.id,
            label: zoneType.zoneNickname ?? getZoneTypeLabel(zoneType),
            aliases: [zoneType.name, zoneType.description, zoneType.zoneNickname]
                .flatMap((value) => typeof value === "string" && value.trim() ? [value] : []),
        }));
    const hasImportedObjects = functionalZoneGeometries.length > 0 && roadGeometries.length > 0;
    const canSubmit = !isSubmitting
        && (!shouldAddObjects || hasImportedObjects)
        && (
            createdScenario !== null || (
                !!name.trim()
                && functionalZoneTypeId !== null
                && !isZoneTypesLoading
            )
        );

    useEffect(() => {
        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
        nameInputRef.current?.focus();

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !isSubmitting) {
                onClose();
            }
        };

        document.addEventListener("keydown", handleEscape);

        return () => {
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
            document.removeEventListener("keydown", handleEscape);
        };
    }, [isSubmitting, onClose]);

    useEffect(() => {
        let isActive = true;

        if (DataStore.functionalZoneTypes !== null) {
            setFunctionalZoneTypes(DataStore.functionalZoneTypes);
            setIsZoneTypesLoading(false);
            return () => {
                isActive = false;
            };
        }

        setIsZoneTypesLoading(true);
        setErrorText(null);

        void DataStore.getFunctionalZoneTypes()
            .then((zoneTypes) => {
                if (!isActive) {
                    return;
                }

                setFunctionalZoneTypes(zoneTypes);
            })
            .catch((error) => {
                if (!isActive) {
                    return;
                }

                console.error("Error fetching functional zone types:", error);
                setErrorText("Не удалось загрузить типы профиля.");
            })
            .finally(() => {
                if (isActive) {
                    setIsZoneTypesLoading(false);
                }
            });

        return () => {
            isActive = false;
        };
    }, []);

    const handleGeoJsonFileSelect = async (
        kind: ScenarioGeoJsonKind,
        file: File,
    ) => {
        setLoadingFileKind(kind);
        setFileErrorText(null);

        try {
            const { source, features } = await readScenarioGeoJsonFile(file, kind);

            if (kind === "functionalZones") {
                const propertyName = getInitialPropertyName(features, [
                    "functional_zone_type_id",
                    "functional_zone_type",
                    "zone_type",
                    "type",
                ]);
                setFunctionalZoneGeometries(features);
                setFunctionalZonesSource(source);
                setFunctionalZonePropertyName(propertyName);
                setFunctionalZoneTypeIds(features.map((feature) => (
                    getMappedOptionValue(
                        feature.properties[propertyName],
                        functionalZonePropertyOptions,
                    ) ?? functionalZoneTypeId ?? undefined
                )));
                setFunctionalZonesFileName(file.name);
                setAreFunctionalZonesUploaded(false);
                return;
            }

            const propertyName = getInitialPropertyName(features, [
                "physical_object_type_id",
                "road_type",
                "road_lvl",
                "type",
            ]);
            setRoadGeometries(features);
            setPendingRoadGeometries(features);
            setRoadsSource(source);
            setRoadPropertyName(propertyName);
            setRoadTypeIds(features.map((feature) => (
                getMappedOptionValue(feature.properties[propertyName], ROAD_TYPE_OPTIONS) ?? 52
            )));
            setRoadsFileName(file.name);
        } catch (error) {
            setFileErrorText(getUploadErrorMessage(error));
        } finally {
            setLoadingFileKind(null);
        }
    };

    const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!canSubmit || (createdScenario === null && functionalZoneTypeId === null)) {
            return;
        }

        setIsSubmitting(true);
        setErrorText(null);

        let scenario = createdScenario;

        try {
            if (!scenario) {
                if (functionalZoneTypeId === null) {
                    return;
                }

                scenario = await DataStore.createProjectScenario(baseScenarioId, {
                    project_id: projectId,
                    functional_zone_type_id: functionalZoneTypeId,
                    name: name.trim(),
                    properties: {},
                });
                setCreatedScenario(scenario);
                await onCreated(scenario);
            }

            if (shouldAddObjects) {
                if (!areFunctionalZonesUploaded) {
                    if (functionalZoneTypeId === null) {
                        throw new Error("Не выбран тип профиля для функциональных зон.");
                    }

                    await DataStore.addScenarioFunctionalZones(
                        scenario.id,
                        functionalZoneGeometries,
                        functionalZoneTypeId,
                        functionalZoneTypeIds,
                    );
                    setAreFunctionalZonesUploaded(true);
                }

                if (pendingRoadGeometries.length) {
                    const territoryId = await DataStore.getProjectTerritoryId(projectId);
                    const failedRoadGeometries = await DataStore.addScenarioPhysicalObjects(
                        scenario.id,
                        territoryId,
                        pendingRoadGeometries,
                        pendingRoadGeometries.map((feature) => {
                            const originalIndex = roadGeometries.indexOf(feature);
                            return originalIndex === -1 ? 52 : roadTypeIds[originalIndex];
                        }),
                    );
                    setPendingRoadGeometries(failedRoadGeometries);

                    if (failedRoadGeometries.length) {
                        throw new Error(
                            `Не удалось сохранить ${failedRoadGeometries.length} из ${pendingRoadGeometries.length} объектов дорожной сети.`,
                        );
                    }
                }
            }

            onClose();
        } catch (error) {
            console.error("Error creating project scenario:", error);
            setErrorText(
                scenario
                    ? `Сценарий создан, но часть добавленных объектов не сохранена. ${getUploadErrorMessage(error)}`
                    : getScenarioErrorMessage(error),
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-100 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-[2px]"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !isSubmitting) {
                    onClose();
                }
            }}
        >
            <div
                className="max-h-[calc(100vh-2rem)] w-full max-w-7xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-[0_30px_80px_-24px_var(--shadow-popover)] customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-primary"
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-scenario-title"
            >
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h2 id="create-scenario-title" className="text-xl font-semibold">
                            Создать сценарий
                        </h2>
                        <p className="mt-1 truncate text-sm text-slate-500 customer-dark:text-content-muted" title={projectName}>
                            Проект: {projectName}
                        </p>
                    </div>
                    <button
                        type="button"
                        className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40 customer:focus-visible:ring-brand-primary/40 customer-dark:text-content-muted customer-dark:hover:bg-surface-hover customer-dark:hover:text-content-primary"
                        onClick={onClose}
                        disabled={isSubmitting}
                        aria-label="Закрыть окно создания сценария"
                    >
                        <MdClose size={22} />
                    </button>
                </div>

                <form className="mt-6 grid gap-5 md:grid-cols-2" onSubmit={handleSubmit}>
                    <label className="block">
                        <span className="mb-2 block text-sm font-medium">
                            Название сценария
                        </span>
                        <input
                            ref={nameInputRef}
                            type="text"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Введите название"
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-[#0788CE] customer:focus:border-brand-primary customer-dark:border-ui-border customer-dark:bg-surface-panel customer-dark:placeholder:text-content-muted"
                            disabled={isSubmitting}
                            required
                        />
                    </label>

                    <div>
                        <span className="mb-2 block text-sm font-medium">
                            Тип профиля
                        </span>
                        {isZoneTypesLoading ? (
                            <div className="flex min-h-11 items-center rounded-2xl border border-slate-200 px-4 text-sm text-slate-400 customer-dark:border-ui-border customer-dark:text-content-muted">
                                Загрузка типов профиля...
                            </div>
                        ) : zoneTypeOptions.length ? (
                            <CustomSelect
                                value={functionalZoneTypeId ?? undefined}
                                options={zoneTypeOptions}
                                onChange={(value) => setFunctionalZoneTypeId(Number(value))}
                                placeholder="Выберите тип профиля"
                                block
                                compactGlow
                            />
                        ) : (
                            <div className="flex min-h-11 items-center rounded-2xl border border-slate-200 px-4 text-sm text-slate-400 customer-dark:border-ui-border customer-dark:text-content-muted">
                                Типы профиля не найдены
                            </div>
                        )}
                    </div>

                    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[#D8ECF7] bg-[#F5FAFD] px-4 py-3 text-sm font-medium transition-colors hover:border-[#B7DDF1] hover:bg-[#EFF8FC] md:col-span-2 customer:border-brand-primary/15 customer:bg-brand-soft/60 customer:hover:border-brand-primary/30 customer:hover:bg-brand-soft customer-dark:border-ui-border customer-dark:bg-surface-panel customer-dark:hover:bg-surface-hover">
                        <input
                            type="checkbox"
                            checked={shouldAddObjects}
                            onChange={(event) => setShouldAddObjects(event.target.checked)}
                            disabled={isSubmitting || createdScenario !== null}
                            className="peer sr-only"
                        />
                        <span
                            aria-hidden="true"
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[#93C9E5] bg-white text-[#429BC9] shadow-sm transition-colors peer-checked:border-[#86BEDB] peer-checked:bg-[#CFEAF7] peer-focus-visible:ring-2 peer-focus-visible:ring-[#C9E9F8] peer-focus-visible:ring-offset-2 peer-disabled:opacity-50 customer:border-[#D99BA0] customer:bg-white customer:text-brand-primary customer:peer-checked:border-[#CE858C] customer:peer-checked:bg-[#F3DADD] customer:peer-focus-visible:ring-brand-primary/20"
                        >
                            <MdCheck
                                size={16}
                                className={shouldAddObjects ? "opacity-100" : "opacity-0"}
                            />
                        </span>
                        Добавить объекты в сценарий
                    </label>

                    {shouldAddObjects && (
                        <div className="space-y-4 rounded-2xl border border-slate-200 p-4 md:col-span-2 customer-dark:border-ui-border">
                            <div>
                                <h3 className="text-sm font-semibold">Объекты сценария</h3>
                                <p className="mt-1 text-xs text-slate-500 customer-dark:text-content-muted">
                                    Загрузите GeoJSON-файлы функциональных зон и дорожно-транспортной сети.
                                </p>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <FileUpload
                                    label="Функциональные зоны"
                                    fileName={loadingFileKind === "functionalZones"
                                        ? "Чтение файла..."
                                        : functionalZonesFileName ?? undefined}
                                    disabled={isSubmitting || createdScenario !== null || loadingFileKind !== null}
                                    accept=".geojson,application/geo+json"
                                    onFileSelected={(file) => void handleGeoJsonFileSelect("functionalZones", file)}
                                    trailingAction={functionalZonesSource === null ? undefined : {
                                        icon: <MdEdit aria-hidden="true" size={20} />,
                                        label: "Редактировать GeoJSON функциональных зон",
                                        title: "Редактировать GeoJSON и свойства",
                                        disabled: isSubmitting || createdScenario !== null || isZoneTypesLoading,
                                        onClick: () => setEditingImport("functionalZones"),
                                    }}
                                />
                                <FileUpload
                                    label="Дорожно-транспортная сеть"
                                    fileName={loadingFileKind === "roads"
                                        ? "Чтение файла..."
                                        : roadsFileName ?? undefined}
                                    disabled={isSubmitting || createdScenario !== null || loadingFileKind !== null}
                                    accept=".geojson,application/geo+json"
                                    onFileSelected={(file) => void handleGeoJsonFileSelect("roads", file)}
                                    trailingAction={roadsSource === null ? undefined : {
                                        icon: <MdEdit aria-hidden="true" size={20} />,
                                        label: "Редактировать GeoJSON дорожной сети",
                                        title: "Редактировать GeoJSON и свойства",
                                        disabled: isSubmitting || createdScenario !== null,
                                        onClick: () => setEditingImport("roads"),
                                    }}
                                />
                            </div>

                            {fileErrorText && (
                                <div
                                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 customer-dark:border-danger-border customer-dark:bg-danger-soft customer-dark:text-danger-content"
                                    role="alert"
                                >
                                    {fileErrorText}
                                </div>
                            )}

                            <div>
                                <div className="mb-2 text-sm font-medium">Предпросмотр объектов</div>
                                <ScenarioImportPreviewMap
                                    functionalZones={functionalZoneGeometries}
                                    functionalZoneTypeIds={functionalZoneTypeIds}
                                    roads={roadGeometries}
                                    roadTypeIds={roadTypeIds}
                                />
                            </div>
                        </div>
                    )}

                    {errorText && (
                        <div
                            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 md:col-span-2 customer-dark:border-danger-border customer-dark:bg-danger-soft customer-dark:text-danger-content"
                            role="alert"
                        >
                            {errorText}
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5 md:col-span-2 customer-dark:border-ui-border">
                        <button
                            type="button"
                            className="rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50 customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover"
                            onClick={onClose}
                            disabled={isSubmitting}
                        >
                            Отмена
                        </button>
                        <button
                            type="submit"
                            className="rounded-2xl bg-[#0788CE] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0676B3] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0788CE]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 customer:bg-brand-primary customer:hover:bg-brand-hover customer:focus-visible:ring-brand-primary/40 customer-dark:ring-offset-surface-raised"
                            disabled={!canSubmit}
                        >
                            {isSubmitting
                                ? createdScenario
                                    ? "Загрузка объектов..."
                                    : "Создание..."
                                : createdScenario
                                    ? "Повторить загрузку"
                                    : "Создать"}
                        </button>
                    </div>
                </form>

                {editingImport === "functionalZones" && functionalZonesSource !== null && (
                    <ScenarioGeoJsonEditorModal
                        kind="functionalZones"
                        initialSource={functionalZonesSource}
                        initialPropertyName={functionalZonePropertyName}
                        initialValues={functionalZoneTypeIds}
                        options={functionalZonePropertyOptions}
                        fallbackValue={functionalZoneTypeId ?? undefined}
                        onClose={() => setEditingImport(null)}
                        onSave={({ source, features, propertyName, values }) => {
                            setFunctionalZonesSource(source);
                            setFunctionalZoneGeometries(features);
                            setFunctionalZonePropertyName(propertyName);
                            setFunctionalZoneTypeIds(values);
                            setAreFunctionalZonesUploaded(false);
                            setEditingImport(null);
                        }}
                    />
                )}

                {editingImport === "roads" && roadsSource !== null && (
                    <ScenarioGeoJsonEditorModal
                        kind="roads"
                        initialSource={roadsSource}
                        initialPropertyName={roadPropertyName}
                        initialValues={roadTypeIds}
                        options={ROAD_TYPE_OPTIONS}
                        fallbackValue={52}
                        onClose={() => setEditingImport(null)}
                        onSave={({ source, features, propertyName, values }) => {
                            setRoadsSource(source);
                            setRoadGeometries(features);
                            setPendingRoadGeometries(features);
                            setRoadPropertyName(propertyName);
                            setRoadTypeIds(values);
                            setEditingImport(null);
                        }}
                    />
                )}
            </div>
        </div>,
        document.body,
    );
}

export default CreateScenarioModal;
