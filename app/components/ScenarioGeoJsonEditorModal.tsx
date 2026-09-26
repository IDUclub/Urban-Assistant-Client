import {
    type ChangeEvent,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { MdClose } from "react-icons/md";
import {
    formatScenarioGeoJson,
    parseScenarioGeoJson,
    type ScenarioGeoJsonKind,
    type ScenarioImportedGeometry,
} from "@lib/ScenarioGeoJson";
import {
    getInfrastructurePropertyNames,
    isInfrastructureItemMapped,
    mapInfrastructureItems,
    type InfrastructureImportItem,
    type InfrastructureTypeOption,
} from "@lib/ScenarioInfrastructure";

export type ScenarioPropertyOption = {
    value: number;
    label: string;
    aliases?: string[];
};

type BaseProps = {
    initialSource: string;
    onClose: () => void;
};

type StandardEditorProps = BaseProps & {
    kind: Exclude<ScenarioGeoJsonKind, "infrastructure">;
    initialPropertyName: string;
    initialValues: Array<number | undefined>;
    options: ScenarioPropertyOption[];
    fallbackValue?: number;
    onSave: (value: {
        source: string;
        features: ScenarioImportedGeometry[];
        propertyName: string;
        values: number[];
    }) => void;
};

type InfrastructurePropertyMapping = {
    type: string;
    service: string;
    capacity: string;
};

type InfrastructureEditorProps = BaseProps & {
    kind: "infrastructure";
    initialMapping: InfrastructurePropertyMapping;
    initialItems: InfrastructureImportItem[];
    physicalObjectTypes: InfrastructureTypeOption[];
    serviceTypes: InfrastructureTypeOption[];
    onSave: (value: {
        source: string;
        mapping: InfrastructurePropertyMapping;
        items: InfrastructureImportItem[];
    }) => void;
};

type ScenarioGeoJsonEditorModalProps = StandardEditorProps | InfrastructureEditorProps;

function normalizeValue(value: unknown) {
    return typeof value === "string"
        ? value.trim().toLocaleLowerCase("ru")
        : value;
}

function getOptionValue(value: unknown, options: ScenarioPropertyOption[]) {
    const normalizedValue = normalizeValue(value);

    return options.find((option) => (
        option.value === value ||
        option.value === Number(value) ||
        [option.label, ...(option.aliases ?? [])].some((label) => (
            normalizeValue(label) === normalizedValue
        ))
    ))?.value;
}

function getLineNumbers(source: string) {
    return Array.from(
        { length: Math.max(1, source.split("\n").length) },
        (_, index) => index + 1,
    ).join("\n");
}

function InfrastructureFields({
    propertyNames,
    mapping,
    onMappingChange,
    items,
    onItemChange,
    physicalObjectTypes,
    serviceTypes,
}: {
    propertyNames: string[];
    mapping: InfrastructurePropertyMapping;
    onMappingChange: (field: keyof InfrastructurePropertyMapping, value: string) => void;
    items: InfrastructureImportItem[];
    onItemChange: (index: number, update: (item: InfrastructureImportItem) => InfrastructureImportItem) => void;
    physicalObjectTypes: InfrastructureTypeOption[];
    serviceTypes: InfrastructureTypeOption[];
}) {
    return (
        <>
            <div className="space-y-3 rounded-2xl border border-slate-200 p-4 customer-dark:border-ui-border">
                {([
                    ["type", "Тип физического объекта"],
                    ["service", "Сервис (необязательно)"],
                    ["capacity", "Вместимость сервиса (необязательно)"],
                ] as const).map(([field, label]) => (
                    <label key={field} className="block text-sm font-medium">
                        {label}
                        <select
                            value={mapping[field]}
                            onChange={(event) => onMappingChange(field, event.target.value)}
                            disabled={!propertyNames.length}
                            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0788CE] customer-dark:border-ui-border customer-dark:bg-surface-panel"
                        >
                            {!propertyNames.length && <option value="">Свойства не найдены</option>}
                            {propertyNames.length > 0 && field !== "type" && <option value="">Выберите свойство</option>}
                            {propertyNames.map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                    </label>
                ))}
            </div>

            <div>
                <div className="mb-2 text-sm font-medium">Объекты ({items.length})</div>
                <div className="max-h-112 space-y-2 overflow-y-auto pr-1">
                    {items.map((item, index) => (
                        <details key={`${index}-${item.feature.geometry.type}`}
                            className="rounded-xl border border-slate-200 bg-white customer-dark:border-ui-border customer-dark:bg-surface-panel">
                            <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">
                                Объект {index + 1} · {item.feature.geometry.type}
                                {!isInfrastructureItemMapped(item) && <span className="ml-2 text-red-600">Требуется сопоставление</span>}
                            </summary>
                            <div className="space-y-3 border-t border-slate-100 p-3 customer-dark:border-ui-border">
                                <label className="block text-xs font-medium">
                                    Тип физического объекта
                                    <select value={item.physicalObjectTypeId ?? ""}
                                        onChange={(event) => onItemChange(index, (current) => ({
                                            ...current, physicalObjectTypeId: Number(event.target.value),
                                        }))}
                                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm customer-dark:border-ui-border customer-dark:bg-surface-raised">
                                        <option value="" disabled>Выберите тип</option>
                                        {physicalObjectTypes.map((option) => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </label>
                                {!item.services.length && (
                                    <div className="text-xs text-slate-500 customer-dark:text-content-muted">Сервисы не добавлены.</div>
                                )}
                                {item.services.map((service, serviceIndex) => (
                                    <div key={serviceIndex} className="grid gap-2 rounded-xl bg-slate-50 p-2 customer-dark:bg-surface-raised">
                                        <div className="flex items-center justify-between text-xs font-medium">
                                            <span>Сервис {serviceIndex + 1}</span>
                                            <button type="button" onClick={() => onItemChange(index, (current) => ({
                                                ...current,
                                                services: current.services.filter((_, row) => row !== serviceIndex),
                                            }))} className="text-red-600 hover:underline">Удалить</button>
                                        </div>
                                        <select aria-label={`Тип сервиса ${serviceIndex + 1} объекта ${index + 1}`}
                                            value={service.serviceTypeId ?? ""}
                                            onChange={(event) => onItemChange(index, (current) => ({
                                                ...current,
                                                services: current.services.map((row, rowIndex) => rowIndex === serviceIndex
                                                    ? { ...row, serviceTypeId: Number(event.target.value) } : row),
                                            }))}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm customer-dark:border-ui-border customer-dark:bg-surface-panel">
                                            <option value="" disabled>Выберите сервис</option>
                                            {serviceTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                        </select>
                                        <input type="number" min="0" step="any" value={service.capacity ?? ""}
                                            aria-label={`Вместимость сервиса ${serviceIndex + 1} объекта ${index + 1}`}
                                            placeholder="Вместимость"
                                            onChange={(event) => onItemChange(index, (current) => ({
                                                ...current,
                                                services: current.services.map((row, rowIndex) => rowIndex === serviceIndex
                                                    ? { ...row, capacity: event.target.value === "" ? undefined : Number(event.target.value) } : row),
                                            }))}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm customer-dark:border-ui-border customer-dark:bg-surface-panel" />
                                    </div>
                                ))}
                                <button type="button" onClick={() => onItemChange(index, (current) => ({
                                    ...current, services: [...current.services, {}],
                                }))} className="text-sm font-medium text-[#0788CE] hover:underline">
                                    Добавить сервис
                                </button>
                            </div>
                        </details>
                    ))}
                </div>
            </div>
        </>
    );
}

function ScenarioGeoJsonEditorModal(props: ScenarioGeoJsonEditorModalProps) {
    const standardProps = props.kind === "infrastructure" ? null : props;
    const infrastructureProps = props.kind === "infrastructure" ? props : null;
    const initialInfrastructureRef = useRef(infrastructureProps);
    const [source, setSource] = useState(props.initialSource);
    const [propertyName, setPropertyName] = useState(
        props.kind === "infrastructure" ? "" : props.initialPropertyName,
    );
    const [values, setValues] = useState<number[]>([]);
    const [mapping, setMapping] = useState<InfrastructurePropertyMapping>(
        props.kind === "infrastructure" ? props.initialMapping : { type: "", service: "", capacity: "" },
    );
    const [items, setItems] = useState<InfrastructureImportItem[]>(
        props.kind === "infrastructure" ? props.initialItems : [],
    );
    const gutterRef = useRef<HTMLPreElement | null>(null);
    const parsed = useMemo(() => {
        try {
            return {
                features: parseScenarioGeoJson(source, props.kind),
                error: null,
            };
        } catch (error) {
            return {
                features: [] as ScenarioImportedGeometry[],
                error: error instanceof Error ? error.message : "Не удалось разобрать GeoJSON.",
            };
        }
    }, [props.kind, source]);
    const propertyNames = useMemo(
        () => getInfrastructurePropertyNames(parsed.features),
        [parsed.features],
    );

    useEffect(() => {
        if (props.kind === "infrastructure") return;
        if (parsed.error || propertyNames.includes(propertyName)) {
            return;
        }

        setPropertyName(propertyNames[0] ?? "");
    }, [props.kind, parsed.error, propertyName, propertyNames]);

    useEffect(() => {
        if (!standardProps) return;
        if (!parsed.features.length) {
            setValues([]);
            return;
        }

        setValues(parsed.features.map((feature, index) => (
            getOptionValue(feature.properties[propertyName], standardProps.options)
            ?? standardProps.initialValues[index]
            ?? standardProps.fallbackValue
            ?? standardProps.options[0]?.value
        )).filter((value): value is number => value !== undefined));
    }, [props.kind, standardProps?.options, standardProps?.initialValues, standardProps?.fallbackValue, parsed.features, propertyName]);

    useEffect(() => {
        if (props.kind !== "infrastructure" || parsed.error) return;
        setMapping((current) => ({
            type: propertyNames.includes(current.type) ? current.type : propertyNames[0] ?? "",
            service: propertyNames.includes(current.service) ? current.service : "",
            capacity: propertyNames.includes(current.capacity) ? current.capacity : "",
        }));
    }, [props.kind, parsed.error, propertyNames]);

    useEffect(() => {
        if (!infrastructureProps || !initialInfrastructureRef.current) return;
        if (parsed.error) {
            setItems([]);
            return;
        }
        const initial = initialInfrastructureRef.current;
        if (source === initial.initialSource
            && mapping.type === initial.initialMapping.type
            && mapping.service === initial.initialMapping.service
            && mapping.capacity === initial.initialMapping.capacity) {
            setItems(initial.initialItems);
            return;
        }
        setItems(mapInfrastructureItems(
            parsed.features,
            mapping.type,
            mapping.service,
            mapping.capacity,
            infrastructureProps.physicalObjectTypes,
            infrastructureProps.serviceTypes,
        ));
    }, [props.kind, infrastructureProps?.physicalObjectTypes, infrastructureProps?.serviceTypes, source, mapping, parsed]);

    const updateItem = (index: number, update: (item: InfrastructureImportItem) => InfrastructureImportItem) => {
        setItems((current) => current.map((item, currentIndex) => (
            currentIndex === index ? update(item) : item
        )));
    };

    const handleSourceChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
        setSource(event.target.value);
    };

    const canSave = !parsed.error && parsed.features.length > 0 && (
        props.kind === "infrastructure"
            ? items.length === parsed.features.length && items.every(isInfrastructureItemMapped)
            : values.length === parsed.features.length
                && values.every((value) => props.options.some((option) => option.value === value))
    );
    const title = props.kind === "functionalZones"
        ? "Редактирование файла функциональных зон"
        : props.kind === "roads"
            ? "Редактирование файла дорожной сети"
            : "Редактирование объектов застройки";
    const propertyLabel = props.kind === "functionalZones"
        ? "Свойство с типом функциональной зоны"
        : "Свойство с типом дороги";

    return createPortal(
        <div
            className="fixed inset-0 z-300 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    props.onClose();
                }
            }}
        >
            <div
                className="max-h-[calc(100vh-2rem)] w-full max-w-6xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-[0_30px_80px_-24px_var(--shadow-popover)] customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-primary"
                role="dialog"
                aria-modal="true"
                aria-labelledby="scenario-geojson-editor-title"
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 id="scenario-geojson-editor-title" className="text-xl font-semibold">
                            {title}
                        </h2>
                    </div>
                    <button
                        type="button"
                        className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 customer-dark:text-content-muted customer-dark:hover:bg-surface-hover customer-dark:hover:text-content-primary"
                        onClick={props.onClose}
                        aria-label="Закрыть редактор GeoJSON"
                    >
                        <MdClose size={22} />
                    </button>
                </div>

                <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
                    <div>
                        <div className="mb-2 text-sm font-medium">GeoJSON</div>
                        <div className="grid h-136 grid-cols-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 font-mono text-sm customer-dark:border-ui-border">
                            <pre
                                ref={gutterRef}
                                aria-hidden="true"
                                className="m-0 overflow-hidden border-r border-slate-700 bg-slate-900 px-3 py-4 text-right leading-6 text-slate-500 select-none"
                            >
                                {getLineNumbers(source)}
                            </pre>
                            <textarea
                                value={source}
                                onChange={handleSourceChange}
                                onScroll={(event) => {
                                    if (gutterRef.current) {
                                        gutterRef.current.scrollTop = event.currentTarget.scrollTop;
                                    }
                                }}
                                spellCheck={false}
                                className="min-h-0 w-full resize-none bg-slate-950 px-4 py-4 leading-6 text-slate-100 outline-none"
                                aria-label="GeoJSON editor"
                            />
                        </div>
                        {parsed.error && (
                            <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 customer-dark:border-danger-border customer-dark:bg-danger-soft customer-dark:text-danger-content">
                                {parsed.error}
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        {props.kind === "infrastructure" ? (
                            <InfrastructureFields
                                propertyNames={propertyNames}
                                mapping={mapping}
                                onMappingChange={(field, value) => setMapping((current) => ({ ...current, [field]: value }))}
                                items={items}
                                onItemChange={updateItem}
                                physicalObjectTypes={props.physicalObjectTypes}
                                serviceTypes={props.serviceTypes}
                            />
                        ) : (
                        <>
                        <div className="rounded-2xl border border-slate-200 p-4 customer-dark:border-ui-border">
                            <label className="block text-sm font-medium">
                                {propertyLabel}
                                <select
                                    value={propertyName}
                                    onChange={(event) => setPropertyName(event.target.value)}
                                    disabled={propertyNames.length === 0}
                                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0788CE] customer:focus:border-brand-primary customer-dark:border-ui-border customer-dark:bg-surface-panel"
                                >
                                    {propertyNames.length === 0 && (
                                        <option value="">Свойства не найдены</option>
                                    )}
                                    {propertyNames.map((name) => (
                                        <option key={name} value={name}>
                                            {name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <div>
                            <div className="mb-2 text-sm font-medium">
                                Объекты ({parsed.features.length})
                            </div>
                            <div className="max-h-112 space-y-2 overflow-y-auto pr-1">
                                {parsed.features.map((feature, index) => (
                                    <details
                                        key={`${index}-${feature.geometry.type}`}
                                        className="rounded-xl border border-slate-200 bg-white customer-dark:border-ui-border customer-dark:bg-surface-panel"
                                    >
                                        <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">
                                            Объект {index + 1} · {feature.geometry.type}
                                        </summary>
                                        <div className="space-y-3 border-t border-slate-100 p-3 customer-dark:border-ui-border">
                                            <div className="text-xs text-slate-500 customer-dark:text-content-muted">
                                                Значение «{propertyName || "свойство не выбрано"}»: {String(feature.properties[propertyName] ?? "—")}
                                            </div>
                                            <label className="block">
                                                <select
                                                    value={values[index] ?? ""}
                                                    onChange={(event) => {
                                                        const value = Number(event.target.value);
                                                        setValues((currentValues) => currentValues.map(
                                                            (currentValue, currentIndex) => (
                                                                currentIndex === index ? value : currentValue
                                                            ),
                                                        ));
                                                    }}
                                                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0788CE] customer:focus:border-brand-primary customer-dark:border-ui-border customer-dark:bg-surface-raised"
                                                >
                                                    {props.options.map((option) => (
                                                        <option key={option.value} value={option.value}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        </div>
                                    </details>
                                ))}
                            </div>
                        </div>
                        </>
                        )}
                    </div>
                </div>

                <div className="mt-5 flex justify-end gap-3 border-t border-slate-100 pt-5 customer-dark:border-ui-border">
                    <button
                        type="button"
                        className="rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover"
                        onClick={props.onClose}
                    >
                        Отмена
                    </button>
                    <button
                        type="button"
                        className="rounded-2xl bg-[#0788CE] px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45 customer:bg-brand-primary"
                        disabled={!canSave}
                        onClick={() => {
                            if (props.kind === "infrastructure") {
                                props.onSave({ source: formatScenarioGeoJson(source), mapping, items });
                            } else {
                                props.onSave({
                                    source: formatScenarioGeoJson(source),
                                    features: parsed.features,
                                    propertyName,
                                    values,
                                });
                            }
                        }}
                    >
                        Применить изменения
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

export default ScenarioGeoJsonEditorModal;
