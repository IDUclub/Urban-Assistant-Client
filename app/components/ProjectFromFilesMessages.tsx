import { useEffect, useState, type ChangeEvent, type PropsWithChildren } from "react";
import { observer } from "mobx-react-lite";
import { MdAdd, MdCheck, MdClose, MdDeleteOutline, MdKeyboardArrowDown, MdOutlineUploadFile } from "react-icons/md";
import { IoAlertCircleOutline, IoInformationCircleOutline } from "react-icons/io5";
import ChatStore from "@lib/ChatStore";
import DataStore from "@lib/DataStore";
import { FUNCTIONAL_ZONE_TYPE_OPTIONS, getFunctionalZoneName } from "@lib/functionalZones";
import Select from "@components/ui/Select";
import type {
    ProjectFileRole,
    ProjectFileMappingProposal,
    ProjectFromFilesSetupMessage,
} from "@lib/projectFromFiles/types";

const ACCEPTED_PROJECT_FILES = ".geojson,.json,.zip,.gpkg,application/geo+json,application/json,application/zip";
const ROLE_OPTIONS = [
    { value: "project", label: "Объекты проекта" },
    { value: "border", label: "Граница проекта" },
    { value: "context", label: "Контекст (не создавать)" },
] as const;
const SKIP_MAPPING_VALUE = "__skip_mapping__";
const MAPPING_HEADER_CLASSES = {
    recognized: "bg-emerald-50 customer-dark:bg-emerald-950/30",
    clarification: "bg-amber-50 customer-dark:bg-amber-950/30",
    unrecognized: "bg-red-50 customer:bg-danger-soft customer-dark:bg-red-950/30",
};
const MAPPING_ARROW_CLASSES = {
    recognized: "customer-dark:text-emerald-300",
    clarification: "customer-dark:text-amber-300",
    unrecognized: "customer-dark:text-red-300",
};

type MappingEntityType = "physical_object" | "service" | "functional_zone";
type MappingOption = { value: string; label: string };
type MappingTypeOptions = Partial<Record<MappingEntityType, MappingOption[]>>;

function MappingGroup({
    title,
    count,
    tone,
    isOpen,
    onToggle,
    children,
}: PropsWithChildren<{
    title: string;
    count: number;
    tone: keyof typeof MAPPING_HEADER_CLASSES;
    isOpen: boolean;
    onToggle: () => void;
}>) {
    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200 customer-dark:border-ui-border">
            <button
                type="button"
                aria-expanded={isOpen}
                onClick={onToggle}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-slate-900 transition-colors hover:brightness-[0.98] customer-dark:text-content-primary ${MAPPING_HEADER_CLASSES[tone]}`}
            >
                <span className="ml-[2px] text-xs font-medium">{title}: {count}</span>
                <MdKeyboardArrowDown
                    size={18}
                    aria-hidden="true"
                    className={`shrink-0 text-slate-500 transition-transform ${MAPPING_ARROW_CLASSES[tone]} ${isOpen ? "rotate-180" : ""}`}
                />
            </button>
            {isOpen && (
                <div className="document-library-scroll max-h-56 overflow-x-hidden overflow-y-auto overscroll-contain">
                    {children}
                </div>
            )}
        </div>
    );
}

const MappingSource = observer(({ item, fileNames }: {
    item: ProjectFileMappingProposal;
    fileNames: string[];
}) => {
    return (
        <div className="mt-1 text-xs text-slate-500 customer-dark:text-content-muted">
            Объектов: {item.count}
            {item.layers.length > 0
                ? ` · ${item.layers.length === 1 ? "Файл" : "Файлы"}: ${formatMappingFileNames(item.layers, fileNames)}`
                : ""}
        </div>
    );
});

const MappingRow = observer(({ item, fileNames, children }: PropsWithChildren<{
    item: ProjectFileMappingProposal;
    fileNames: string[];
}>) => {
    return (
        <div className="min-h-16 border-t border-slate-200 bg-white px-4 py-2.5 first:border-t-0 customer-dark:border-ui-border customer-dark:bg-surface-raised">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_320px] md:items-center">
                <div className="min-w-0">
                    <div className="truncate font-medium" title={item.label}>{item.label}</div>
                    <MappingSource item={item} fileNames={fileNames} />
                </div>
                <div className="min-w-0">{children}</div>
            </div>
        </div>
    );
});

function getWarningText(warning: string) {
    const [code, count] = warning.split(":");
    if (warning === "crs_missing_assumed:msk47_zone1") {
        return "Система координат не указана — определена МСК-47, зона 1.";
    }
    if (warning === "crs_missing_assumed:msk47_zone2") {
        return "Система координат не указана — определена МСК-47, зона 2.";
    }
    if (warning === "crs_missing_assumed:msk47_zone3") {
        return "Система координат не указана — определена МСК-47, зона 3.";
    }
    if (warning === "crs_missing_assumed:epsg3857") {
        return "Система координат не указана — использована Web Mercator.";
    }
    switch (code) {
        case "crs_missing_assumed_wgs84":
            return "Система координат не указана — использована WGS 84.";
        case "features_without_geometry":
            return `Объекты без геометрии пропущены: ${count ?? "—"}.`;
        case "invalid_geometry_skipped":
            return `Объекты с некорректной геометрией пропущены: ${count ?? "—"}.`;
        case "invalid_geometry_repaired":
            return `Некорректные геометрии исправлены: ${count ?? "—"}.`;
        default:
            return warning;
    }
}

function formatFileSize(size: number) {
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} КБ`;
    return `${(size / 1024 / 1024).toFixed(1)} МБ`;
}

function getLayerSourceFileName(layerName: string, fileNames: string[]) {
    return fileNames.find((fileName) => (
        fileName.replace(/\.(?:geojson|json|gpkg|zip)$/i, "") === layerName
    ));
}

function getLayerFileName(layerName: string, fileNames: string[]) {
    return getLayerSourceFileName(layerName, fileNames) ?? layerName;
}

function formatMappingFileNames(layerNames: string[], fileNames: string[]) {
    return layerNames.map((layerName) => getLayerFileName(layerName, fileNames)).join(", ");
}

function getMappingEntityType(label: string, entityType?: string | null): MappingEntityType | null {
    if (/(?:^|,\s*)type=block(?:,|$)|(?:^|,\s*)blockType=/i.test(label)) {
        return "functional_zone";
    }

    if (entityType === "physical_object" || entityType === "service" || entityType === "functional_zone") {
        return entityType;
    }

    return null;
}

function getEntityTypeLabel(entityType?: MappingEntityType | null) {
    switch (entityType) {
        case "functional_zone": return "Функциональная зона";
        case "physical_object": return "Физический объект";
        case "service": return "Сервис";
        default: return "Категория не определена";
    }
}

function getEntityDisplayLabel(entity: string, entityType?: MappingEntityType | null) {
    if (entityType !== "functional_zone") return entity;

    return FUNCTIONAL_ZONE_TYPE_OPTIONS.find((option) => option.value === entity)?.label
        ?? getFunctionalZoneName(entity)
        ?? entity;
}

function isUsefulMappingOption(option: MappingOption) {
    const value = option.value.trim();
    const label = option.label.trim();
    return !!value
        && !!label
        && !/^[-–—]+$/u.test(value)
        && !/^[-–—]+$/u.test(label);
}

function getUniqueMappingOptions(options: MappingOption[]) {
    const seenLabels = new Set<string>();

    return options.filter((option) => {
        if (!isUsefulMappingOption(option)) return false;

        const normalizedLabel = option.label.trim().toLocaleLowerCase("ru-RU");
        if (seenLabels.has(normalizedLabel)) return false;
        seenLabels.add(normalizedLabel);
        return true;
    });
}

function formatClarificationOptionLabel(label: string) {
    const normalized = label.trim();
    if (!normalized) return normalized;

    const sentence = `${normalized.charAt(0).toLocaleUpperCase("ru-RU")}${normalized.slice(1)}`;
    return `${sentence.replace(/[.!?…]+$/u, "")}.`;
}

export const ProjectFromFilesSetupCard = observer(({
    setup,
}: {
    setup: ProjectFromFilesSetupMessage;
}) => {
    const [files, setFiles] = useState<File[]>([]);
    const [projectName, setProjectName] = useState(setup.projectName ?? "");
    const [scenarioName, setScenarioName] = useState(setup.scenarioName ?? "Проектное решение из файлов");
    const [clarificationAnswer, setClarificationAnswer] = useState("");
    const [mappingTypeOptions, setMappingTypeOptions] = useState<MappingTypeOptions>({});
    const [mappingSelections, setMappingSelections] = useState<Record<number, string>>({});
    const [mappingTypesError, setMappingTypesError] = useState<string>();
    const hasObjectMappingStage = !!setup.userFiles;
    const hasDataClarificationStage = setup.status === "clarification"
        && !!setup.clarification
        && setup.clarification.kind !== "entity_mapping";
    const hasCompletedStage = setup.status === "success" || setup.status === "stayed";
    const [isUploadedFilesOpen, setIsUploadedFilesOpen] = useState(!hasObjectMappingStage);
    const [isRecognizedOpen, setIsRecognizedOpen] = useState(!hasDataClarificationStage && !hasCompletedStage);
    const [isClarificationOpen, setIsClarificationOpen] = useState(true);
    const [isUnrecognizedOpen, setIsUnrecognizedOpen] = useState(!hasDataClarificationStage && !hasCompletedStage);
    const totalFileSize = files.reduce((sum, file) => sum + file.size, 0);
    const isBusy = setup.status === "uploading"
        || setup.status === "updating_role"
        || setup.status === "creating";
    const canUpload = files.length > 0 && !isBusy;
    const canCreate = !!setup.upload
        && !!projectName.trim()
        && !ChatStore.isStreaming
        && (setup.status === "ready" || setup.status === "error");
    const showProjectDetails = setup.status === "ready"
        || setup.status === "error"
        || setup.status === "uploading"
        || setup.status === "updating_role";

    useEffect(() => {
        if (!hasObjectMappingStage) return;

        setIsUploadedFilesOpen(false);
        setIsRecognizedOpen(true);
        setIsClarificationOpen(true);
        setIsUnrecognizedOpen(true);
    }, [hasObjectMappingStage]);

    useEffect(() => {
        if (!hasDataClarificationStage) return;

        setIsRecognizedOpen(false);
        setIsUnrecognizedOpen(false);
    }, [hasDataClarificationStage]);

    useEffect(() => {
        if (!hasCompletedStage) return;

        setIsUploadedFilesOpen(false);
        setIsRecognizedOpen(false);
        setIsClarificationOpen(false);
        setIsUnrecognizedOpen(false);
    }, [hasCompletedStage]);

    const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
        setFiles(Array.from(event.target.files ?? []));
        event.currentTarget.value = "";
    };

    const handleAdditionalFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(event.target.files ?? []);
        event.currentTarget.value = "";
        if (!selectedFiles.length) return;

        const nextFiles = [...files];
        selectedFiles.forEach((selectedFile) => {
            const existingIndex = nextFiles.findIndex((file) => file.name === selectedFile.name);
            if (existingIndex >= 0) {
                nextFiles[existingIndex] = selectedFile;
            } else {
                nextFiles.push(selectedFile);
            }
        });
        if (await ChatStore.uploadFilesForProject(setup.id, nextFiles)) {
            setFiles(nextFiles);
        }
    };

    const removeFile = (index: number) => {
        setFiles((currentFiles) => currentFiles.filter((_, fileIndex) => fileIndex !== index));
    };

    const removeUploadedFile = async (layerName: string) => {
        const sourceFileName = setup.upload
            ? getLayerSourceFileName(layerName, setup.upload.files)
            : undefined;
        if (!sourceFileName) return;

        const remainingFiles = files.filter((file) => file.name !== sourceFileName);
        if (remainingFiles.length > 0) {
            if (await ChatStore.uploadFilesForProject(setup.id, remainingFiles)) {
                setFiles(remainingFiles);
            }
        } else {
            setFiles([]);
            ChatStore.resetProjectFilesSetup(setup.id);
        }
    };

    const failedTotal = typeof setup.summary?.failed_total === "number"
        ? setup.summary.failed_total
        : 0;
    const objects = setup.summary?.objects && typeof setup.summary.objects === "object"
        ? setup.summary.objects as Record<string, unknown>
        : undefined;
    const pendingSignatures = new Set(setup.userFiles?.pending ?? []);
    const recognizedMappings = setup.userFiles?.mapping.filter((item) => (
        !!item.entity && !pendingSignatures.has(item.signature)
    )) ?? [];
    const clarificationMappings = setup.userFiles?.mapping.filter((item) => (
        pendingSignatures.has(item.signature)
    )) ?? [];
    const unrecognizedMappings = setup.userFiles?.mapping.filter((item) => (
        !item.entity && !pendingSignatures.has(item.signature)
    )) ?? [];
    const isEntityMappingClarification = setup.clarification?.kind === "entity_mapping";
    const mappingClarificationOptions = isEntityMappingClarification
        ? setup.clarification?.options ?? []
        : [];

    useEffect(() => {
        if (!isEntityMappingClarification || !setup.clarification?.options?.length) return;

        const initialSelections = Object.fromEntries(
            setup.clarification.options.map((option, index) => [
                option.number ?? index + 1,
                typeof option.value === "string" && option.value.trim()
                    ? option.value.trim()
                    : SKIP_MAPPING_VALUE,
            ]),
        );
        setMappingSelections(initialSelections);
        setMappingTypesError(undefined);

        let isActive = true;
        const requestedEntityTypes = Array.from(new Set(
            setup.clarification.options.flatMap((option) => {
                const entityType = getMappingEntityType(option.label, option.entity_type);
                return entityType ? [entityType] : [];
            }),
        ));

        void Promise.all(requestedEntityTypes.map(async (entityType) => {
            if (entityType === "functional_zone") {
                const types = await DataStore.getFunctionalZoneTypes();
                const apiOptions = types.map((type) => ({
                    value: type.name,
                    label: type.description
                        ?? type.zoneNickname
                        ?? getFunctionalZoneName(type.id)
                        ?? type.name,
                }));
                const options = apiOptions.length > 0
                    ? apiOptions
                    : FUNCTIONAL_ZONE_TYPE_OPTIONS.map((option) => ({ ...option }));
                return [entityType, options] as const;
            }
            if (entityType === "service") {
                const types = await DataStore.getServiceTypes();
                return [entityType, types.map((type) => ({ value: type.label, label: type.label }))] as const;
            }
            const types = await DataStore.getPhysicalObjectTypes();
            return [entityType, types.map((type) => ({ value: type.label, label: type.label }))] as const;
        }))
            .then((typeGroups) => {
                if (!isActive) return;

                const optionsByType: MappingTypeOptions = {};
                typeGroups.forEach(([entityType, typeOptions]) => {
                    const proposedValues = setup.clarification?.options?.flatMap((option) => (
                        getMappingEntityType(option.label, option.entity_type) === entityType
                            && typeof option.value === "string"
                            && option.value.trim()
                            ? [option.value.trim()]
                            : []
                    )) ?? [];
                    const options = getUniqueMappingOptions(typeOptions);
                    proposedValues.forEach((value) => {
                        if (options.some((option) => option.value === value)) return;
                        options.push({
                            value,
                            label: entityType === "functional_zone"
                                ? FUNCTIONAL_ZONE_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value
                                : value,
                        });
                    });
                    const uniqueOptions = getUniqueMappingOptions(options);
                    uniqueOptions.sort((left, right) => left.label.localeCompare(right.label, "ru"));
                    optionsByType[entityType] = [
                        ...uniqueOptions,
                        { value: SKIP_MAPPING_VALUE, label: "Не загружать эту группу" },
                    ];
                });
                setMappingTypeOptions(optionsByType);
            })
            .catch((error) => {
                console.error("Error fetching object types for file mapping:", error);
                if (!isActive) return;

                const fallbackOptions: MappingTypeOptions = {};
                setup.clarification?.options?.forEach((option) => {
                    const entityType = getMappingEntityType(option.label, option.entity_type);
                    if (!entityType) return;
                    const proposedValue = typeof option.value === "string" ? option.value.trim() : "";
                    const current = fallbackOptions[entityType] ?? [];
                    fallbackOptions[entityType] = [
                        ...(proposedValue && !current.some(({ value }) => value === proposedValue)
                            ? [...current, {
                                value: proposedValue,
                                label: getEntityDisplayLabel(proposedValue, entityType),
                            }]
                            : current),
                        ...(!current.some(({ value }) => value === SKIP_MAPPING_VALUE)
                            ? [{ value: SKIP_MAPPING_VALUE, label: "Не загружать эту группу" }]
                            : []),
                    ];
                });
                setMappingTypeOptions(fallbackOptions);
                setMappingTypesError("Не удалось загрузить полный список типов. Можно выбрать предложенный тип или не загружать группу.");
            });

        return () => {
            isActive = false;
        };
    }, [isEntityMappingClarification, setup.clarification]);

    const submitEntityMappings = () => {
        const options = setup.clarification?.options;
        if (!options?.length || options.some((option, index) => !mappingSelections[option.number ?? index + 1])) return;

        const answer = options.map((option, index) => {
            const number = option.number ?? index + 1;
            const selectedValue = mappingSelections[number];
            return `${number} — ${selectedValue === SKIP_MAPPING_VALUE ? "нет" : selectedValue}`;
        }).join("; ");
        const displayAnswer = options.map((option, index) => {
            const number = option.number ?? index + 1;
            const selectedValue = mappingSelections[number];
            const entityType = getMappingEntityType(option.label, option.entity_type);
            const selectedLabel = selectedValue === SKIP_MAPPING_VALUE
                ? "Не загружать эту группу"
                : entityType
                    ? mappingTypeOptions[entityType]?.find(({ value }) => value === selectedValue)?.label
                    : undefined;

            return `${number} — ${selectedLabel ?? getEntityDisplayLabel(selectedValue, entityType)}`;
        }).join("; ");
        ChatStore.answerProjectFromFilesClarification(setup.id, answer, displayAnswer);
    };

    return (
        <div className="flex w-full flex-col gap-3 rounded-[2rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 customer-dark:border-ui-border customer-dark:bg-surface-muted customer-dark:text-content-primary">
            <div className="border-l-4 border-brand-primary pl-3 text-lg font-semibold text-slate-900 customer-dark:text-content-primary">
                Создание проекта из файлов
            </div>

            {!setup.upload && setup.status !== "clarification" && (
                <div className="flex flex-col gap-3">
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-3 text-blue-950 customer:border-brand-border customer:bg-brand-soft customer:text-brand-contrast">
                        <div className="flex items-start gap-2">
                            <IoInformationCircleOutline className="mt-0.5 shrink-0" size={18} />
                            <div>
                                <div className="font-medium">Подготовьте атрибуты объектов</div>
                                <div className="mt-1 text-xs leading-5">
                                    Для автоматического распознавания у объектов должны быть заполнены классифицирующие атрибуты.
                                </div>
                            </div>
                        </div>
                    </div>
                    <label className={`rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 customer-dark:border-ui-border-strong customer-dark:bg-surface-raised ${isBusy ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                        <span className="flex items-center gap-2 text-sm text-slate-600 customer-dark:text-content-secondary">
                            <MdOutlineUploadFile size={20} className="shrink-0" />
                            GeoJSON, JSON, GeoPackage или ZIP с GeoJSON/Shapefile
                        </span>
                        <span className="mt-3 inline-flex rounded-xl bg-brand-primary px-3 py-2 text-sm font-medium text-white">
                            Выбрать файлы
                        </span>
                        <span className="mt-2 block text-xs text-slate-500 customer-dark:text-content-muted">
                            Общий размер — до 50 МБ
                        </span>
                        <input
                            type="file"
                            multiple
                            accept={ACCEPTED_PROJECT_FILES}
                            className="sr-only"
                            disabled={isBusy}
                            onChange={handleFilesSelected}
                        />
                    </label>

                    {files.length > 0 && (
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white customer-dark:border-ui-border customer-dark:bg-surface-raised">
                            <div className="document-library-scroll max-h-[9.625rem] overflow-x-hidden overflow-y-auto overscroll-contain">
                                {files.map((file, index) => (
                                    <div key={`${file.name}-${file.size}-${index}`} className="flex h-11 min-w-0 items-center justify-between gap-3 border-b border-slate-100 px-3 customer-dark:border-ui-border">
                                        <span className="min-w-0 truncate">{file.name}</span>
                                        <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500 customer-dark:text-content-muted">
                                            {formatFileSize(file.size)}
                                            <button
                                                type="button"
                                                aria-label={`Удалить ${file.name}`}
                                                className="rounded-full p-1 transition-colors hover:bg-slate-100 customer-dark:hover:bg-surface-hover"
                                                disabled={isBusy}
                                                onClick={() => removeFile(index)}
                                            >
                                                <MdClose size={16} />
                                            </button>
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="bg-slate-50 px-3 py-2 text-xs text-slate-500 customer-dark:bg-surface-muted customer-dark:text-content-muted">
                                Всего: {formatFileSize(totalFileSize)}
                            </div>
                        </div>
                    )}

                    <button
                        type="button"
                        className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-45"
                        disabled={!canUpload}
                        onClick={() => void ChatStore.uploadFilesForProject(setup.id, files)}
                    >
                        <MdOutlineUploadFile size={18} />
                        {setup.status === "uploading" ? "Загружаем…" : setup.status === "error" ? "Повторить загрузку" : "Загрузить и проверить"}
                    </button>
                </div>
            )}

            {setup.upload && (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-3">
                            <button
                                type="button"
                                aria-expanded={isUploadedFilesOpen}
                                onClick={() => setIsUploadedFilesOpen((current) => !current)}
                                className="ml-[4px] flex items-center gap-1 text-slate-900 transition-colors hover:text-brand-primary customer-dark:text-content-primary"
                            >
                                <span className="font-medium">Загруженные файлы</span>
                                <MdKeyboardArrowDown
                                    size={18}
                                    aria-hidden="true"
                                    className={`shrink-0 text-slate-400 transition-transform customer-dark:text-content-muted ${isUploadedFilesOpen ? "rotate-180" : ""}`}
                                />
                            </button>
                            {showProjectDetails && (
                                <label className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-primary transition-colors ${isBusy ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-brand-soft"}`}>
                                    <MdAdd size={17} />
                                    Добавить файлы
                                    <input
                                        type="file"
                                        multiple
                                        accept={ACCEPTED_PROJECT_FILES}
                                        className="sr-only"
                                        disabled={isBusy}
                                        onChange={handleAdditionalFilesSelected}
                                    />
                                </label>
                            )}
                        </div>
                        {isUploadedFilesOpen && (
                            <div className="document-library-scroll max-h-[13.6875rem] overflow-x-hidden overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white customer-dark:border-ui-border customer-dark:bg-surface-raised">
                                {setup.upload.layers.map((layer, layerIndex) => {
                                    const sourceFileName = getLayerSourceFileName(layer.name, setup.upload!.files);
                                    return (
                                        <div key={layer.name} className={`${layerIndex > 0 ? "border-t border-slate-200 customer-dark:border-ui-border" : ""} flex min-h-16 flex-col justify-center px-4 py-2`}>
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="min-w-0">
                                                    <div className="truncate font-medium" title={getLayerFileName(layer.name, setup.upload!.files)}>
                                                        {getLayerFileName(layer.name, setup.upload!.files)}
                                                    </div>
                                                    <div className="mt-1 text-xs text-slate-500 customer-dark:text-content-muted">
                                                        Объектов: {layer.feature_count} · Тип геометрии: {layer.geometry_types.join(", ") || "не определён"}
                                                    </div>
                                                </div>
                                                <div className="flex w-full items-center gap-2 sm:w-auto">
                                                    <div className={`min-w-0 flex-1 transition-opacity sm:w-80 sm:flex-none ${setup.status !== "ready" ? "opacity-50" : ""}`}>
                                                        <Select
                                                            value={layer.role}
                                                            options={[...ROLE_OPTIONS]}
                                                            onChange={(value) => void ChatStore.changeProjectFileLayerRole(
                                                                setup.id,
                                                                layer.name,
                                                                value as ProjectFileRole,
                                                            )}
                                                            block
                                                            compact
                                                            ariaLabel={`Назначение файла ${getLayerFileName(layer.name, setup.upload!.files)}`}
                                                            disabled={setup.status !== "ready"}
                                                            showChevronWhenDisabled
                                                        />
                                                    </div>
                                                    {sourceFileName && showProjectDetails && (
                                                        <button
                                                            type="button"
                                                            aria-label={`Удалить ${sourceFileName}`}
                                                            title={`Удалить ${sourceFileName}`}
                                                            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                                            disabled={isBusy}
                                                            onClick={() => void removeUploadedFile(layer.name)}
                                                        >
                                                            <MdDeleteOutline size={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            {layer.warnings.map((warning) => (
                                                <div key={warning} className="mt-2 flex items-start gap-2 text-xs text-amber-800 customer-dark:text-amber-300">
                                                    <IoAlertCircleOutline className="mt-0.5 shrink-0" size={16} />
                                                    {getWarningText(warning)}
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {setup.userFiles && (
                        <div className="flex flex-col gap-3">
                            <div className="ml-[4px]">
                                <div className="font-medium">Объекты из файлов</div>
                                <div className="mt-1 text-xs text-slate-500 customer-dark:text-content-muted">
                                    Объекты сгруппированы по атрибутам. Справа указаны их категория и конкретный тип.
                                </div>
                            </div>

                            {recognizedMappings.length > 0 && (
                                <MappingGroup
                                    title="Распознано"
                                    count={recognizedMappings.length}
                                    tone="recognized"
                                    isOpen={isRecognizedOpen}
                                    onToggle={() => setIsRecognizedOpen((current) => !current)}
                                >
                                    {recognizedMappings.map((item, index) => {
                                        const entityType = getMappingEntityType(item.label, item.entity_type);

                                        return (
                                            <MappingRow key={`${item.signature}-recognized-${index}`} item={item} fileNames={setup.upload!.files}>
                                                <div className="mb-1 text-[11px] font-medium leading-4 text-slate-500 customer-dark:text-content-muted">
                                                    {getEntityTypeLabel(entityType)}
                                                </div>
                                                <Select
                                                    value={item.entity ?? ""}
                                                    options={[{
                                                        value: item.entity ?? "",
                                                        label: getEntityDisplayLabel(item.entity ?? "Тип не выбран", entityType),
                                                    }]}
                                                    onChange={() => undefined}
                                                    block
                                                    compact
                                                    disabled
                                                    ariaLabel={`Тип группы ${item.label}`}
                                                />
                                            </MappingRow>
                                        );
                                    })}
                                </MappingGroup>
                            )}

                            {clarificationMappings.length > 0 && (
                                <MappingGroup
                                    title="Требует уточнения"
                                    count={clarificationMappings.length}
                                    tone="clarification"
                                    isOpen={isClarificationOpen}
                                    onToggle={() => setIsClarificationOpen((current) => !current)}
                                >
                                    {clarificationMappings.map((item, index) => {
                                        const clarificationIndex = mappingClarificationOptions.findIndex((option) => option.label === item.label);
                                        const clarificationOption = mappingClarificationOptions[clarificationIndex];
                                        const optionNumber = clarificationOption?.number
                                            ?? (clarificationIndex >= 0 ? clarificationIndex + 1 : undefined);
                                        const entityType = getMappingEntityType(
                                            item.label,
                                            clarificationOption?.entity_type ?? item.entity_type,
                                        );
                                        const selectOptions = entityType
                                            ? mappingTypeOptions[entityType] ?? []
                                            : [];
                                        const fallbackSelectOptions = [
                                            ...(item.entity ? [{
                                                value: item.entity,
                                                label: getEntityDisplayLabel(item.entity, entityType),
                                            }] : []),
                                            { value: SKIP_MAPPING_VALUE, label: "Не загружать эту группу" },
                                        ];

                                        return (
                                            <MappingRow key={`${item.signature}-clarification-${index}`} item={item} fileNames={setup.upload!.files}>
                                                <div className="mb-1 text-[11px] font-medium leading-4 text-slate-500 customer-dark:text-content-muted">
                                                    {getEntityTypeLabel(entityType)}
                                                </div>
                                                {optionNumber !== undefined && isEntityMappingClarification ? (
                                                    <Select
                                                        value={mappingSelections[optionNumber] ?? SKIP_MAPPING_VALUE}
                                                        options={selectOptions.length > 0 ? selectOptions : fallbackSelectOptions}
                                                        onChange={(value) => setMappingSelections((current) => ({
                                                            ...current,
                                                            [optionNumber]: String(value),
                                                        }))}
                                                        block
                                                        compact
                                                        ariaLabel={`Тип группы ${item.label}`}
                                                    />
                                                ) : (
                                                    <Select
                                                        value={item.entity ?? ""}
                                                        options={[{
                                                            value: item.entity ?? "",
                                                            label: getEntityDisplayLabel(item.entity ?? "Тип не выбран", entityType),
                                                        }]}
                                                        onChange={() => undefined}
                                                        block
                                                        compact
                                                        disabled
                                                        ariaLabel={`Тип группы ${item.label}`}
                                                    />
                                                )}
                                            </MappingRow>
                                        );
                                    })}
                                </MappingGroup>
                            )}

                            {unrecognizedMappings.length > 0 && (
                                <MappingGroup
                                    title="Не распознано"
                                    count={unrecognizedMappings.length}
                                    tone="unrecognized"
                                    isOpen={isUnrecognizedOpen}
                                    onToggle={() => setIsUnrecognizedOpen((current) => !current)}
                                >
                                    {unrecognizedMappings.map((item, index) => (
                                        <div key={`${item.signature}-unrecognized-${index}`} className={`${index > 0 ? "border-t border-slate-200 customer-dark:border-ui-border" : ""} min-h-16 bg-white px-4 py-2.5 customer-dark:bg-surface-raised`}>
                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                                <div className="min-w-0 truncate font-medium" title={item.label}>{item.label}</div>
                                                <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 customer:bg-danger-soft customer:text-danger-content customer-dark:bg-red-950/40 customer-dark:text-red-300">
                                                    Категория и тип не определены
                                                </span>
                                            </div>
                                            <MappingSource item={item} fileNames={setup.upload!.files} />
                                            {item.reason && (
                                                <div className="mt-1 text-xs text-red-700 customer-dark:text-red-300">Причина: {item.reason}</div>
                                            )}
                                        </div>
                                    ))}
                                </MappingGroup>
                            )}

                            {setup.userFiles.mapping.length === 0 && (
                                <div className="text-xs text-slate-500 customer-dark:text-content-muted">
                                    В файлах не найдено групп объектов для распознавания.
                                </div>
                            )}

                            {isEntityMappingClarification && mappingClarificationOptions.length > 0 && (
                                <div className="flex flex-col items-start gap-2 border-t border-slate-100 pt-3 customer-dark:border-ui-border">
                                    {mappingTypesError && (
                                        <div className="text-xs text-amber-800 customer-dark:text-amber-300">{mappingTypesError}</div>
                                    )}
                                    <button
                                        type="button"
                                        className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-45"
                                        disabled={mappingClarificationOptions.some((option, optionIndex) => (
                                            !mappingSelections[option.number ?? optionIndex + 1]
                                        ))}
                                        onClick={submitEntityMappings}
                                    >
                                        Применить выбранные типы
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {showProjectDetails && (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="flex flex-col gap-2">
                                <span className="text-sm font-medium text-slate-900 customer-dark:text-content-primary">
                                    Название проекта
                                </span>
                                <input
                                    value={projectName}
                                    maxLength={200}
                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-primary customer-dark:border-ui-border customer-dark:bg-surface-panel customer-dark:placeholder:text-content-muted"
                                    placeholder="Например, Новый квартал"
                                    disabled={isBusy}
                                    onChange={(event) => setProjectName(event.target.value)}
                                />
                            </label>
                            <label className="flex flex-col gap-2">
                                <span className="text-sm font-medium text-slate-900 customer-dark:text-content-primary">
                                    Название сценария
                                </span>
                                <input
                                    value={scenarioName}
                                    maxLength={200}
                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-primary customer-dark:border-ui-border customer-dark:bg-surface-panel customer-dark:placeholder:text-content-muted"
                                    disabled={isBusy}
                                    onChange={(event) => setScenarioName(event.target.value)}
                                />
                            </label>
                        </div>
                    )}

                    {showProjectDetails && (
                        <div className="flex justify-end border-t border-slate-200 pt-3 customer-dark:border-ui-border">
                            <button
                                type="button"
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                                disabled={!canCreate}
                                onClick={() => ChatStore.createProjectFromFiles(setup.id, projectName, scenarioName)}
                            >
                                <MdCheck size={18} />
                                {setup.status === "uploading"
                                    ? "Проверяем файлы…"
                                    : setup.status === "updating_role"
                                        ? "Сохраняем изменения…"
                                        : setup.status === "error"
                                            ? "Повторить создание"
                                            : "Создать проект"}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {setup.status === "creating" && (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-3 py-3 text-blue-900 customer:border-brand-border customer:bg-brand-soft customer:text-brand-contrast">
                    Создаём проект. Это может занять около минуты.
                </div>
            )}

            {setup.status === "clarification" && setup.clarification && !isEntityMappingClarification && (
                <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-3 text-blue-950 customer:border-brand-border customer:bg-brand-soft customer:text-brand-contrast">
                    <div className="font-medium">Нужно уточнить данные</div>
                    <div className="whitespace-pre-wrap leading-6">{setup.clarification.question}</div>
                    {!!setup.clarification.options?.length && (
                        <div className="flex flex-col gap-2">
                            {setup.clarification.options.map((option, index) => (
                                <button
                                    type="button"
                                    key={`${option.label}-${index}`}
                                    className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-left transition-colors hover:border-brand-primary customer:border-brand-border customer-dark:bg-surface-raised"
                                    onClick={() => ChatStore.answerProjectFromFilesClarification(
                                        setup.id,
                                        String(option.number ?? index + 1),
                                        formatClarificationOptionLabel(option.label),
                                    )}
                                >
                                    {formatClarificationOptionLabel(option.label)}
                                </button>
                            ))}
                        </div>
                    )}
                    {!setup.clarification.options?.length && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                                value={clarificationAnswer}
                                className="min-h-11 min-w-0 flex-1 rounded-2xl border border-blue-200 bg-white px-3 outline-none focus:border-brand-primary customer:border-brand-border customer-dark:bg-surface-raised"
                                placeholder="Введите ответ"
                                onChange={(event) => setClarificationAnswer(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" && clarificationAnswer.trim()) {
                                        ChatStore.answerProjectFromFilesClarification(setup.id, clarificationAnswer);
                                        setClarificationAnswer("");
                                    }
                                }}
                            />
                            <button
                                type="button"
                                className="min-h-11 rounded-2xl bg-brand-primary px-4 font-medium text-white disabled:cursor-not-allowed disabled:bg-surface-disabled"
                                disabled={!clarificationAnswer.trim()}
                                onClick={() => {
                                    ChatStore.answerProjectFromFilesClarification(setup.id, clarificationAnswer);
                                    setClarificationAnswer("");
                                }}
                            >
                                Ответить
                            </button>
                        </div>
                    )}
                </div>
            )}

            {(setup.status === "success" || setup.status === "stayed") && (
                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-slate-800 customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-primary">
                    <div className="flex items-center gap-2 font-semibold text-emerald-700">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
                            <MdCheck size={16} />
                        </span>
                        Проект успешно создан
                    </div>
                    <div>
                        {setup.projectName ?? `Проект #${setup.projectId}`}
                        {setup.scenarioName ? ` · ${setup.scenarioName}` : ""}
                    </div>
                    {objects && (
                        <div className="text-xs text-slate-500 customer-dark:text-content-muted">
                            Сохранено объектов: {String(objects.saved ?? "—")} из {String(objects.total ?? "—")}
                            {failedTotal > 0 ? ` · Не удалось сохранить: ${failedTotal}` : ""}
                        </div>
                    )}
                    {setup.status === "success" ? (
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
                                onClick={() => void ChatStore.enterCreatedProject(setup.id)}
                            >
                                Перейти в проект
                            </button>
                            <button
                                type="button"
                                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 customer-dark:border-ui-border customer-dark:bg-surface-panel customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover"
                                onClick={() => ChatStore.stayOutsideCreatedProject(setup.id)}
                            >
                                Остаться в этом чате
                            </button>
                        </div>
                    ) : (
                        <div className="text-xs text-slate-500 customer-dark:text-content-muted">
                            Вы остались в текущем чате. Проект доступен в списке проектов.
                        </div>
                    )}
                </div>
            )}

            {setup.errorText && (
                <div className="rounded-2xl border border-danger-border bg-danger-soft px-3 py-2 text-danger-content">
                    {setup.errorText}
                </div>
            )}
        </div>
    );
});
