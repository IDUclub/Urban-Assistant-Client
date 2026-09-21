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

export type ScenarioPropertyOption = {
    value: number;
    label: string;
    aliases?: string[];
};

type ScenarioGeoJsonEditorModalProps = {
    kind: ScenarioGeoJsonKind;
    initialSource: string;
    initialPropertyName: string;
    initialValues: Array<number | undefined>;
    options: ScenarioPropertyOption[];
    fallbackValue?: number;
    onClose: () => void;
    onSave: (value: {
        source: string;
        features: ScenarioImportedGeometry[];
        propertyName: string;
        values: number[];
    }) => void;
};

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

function getPropertyNames(features: ScenarioImportedGeometry[]) {
    return Array.from(new Set(
        features.flatMap((feature) => Object.keys(feature.properties)),
    )).sort((left, right) => left.localeCompare(right, "ru"));
}

function getLineNumbers(source: string) {
    return Array.from(
        { length: Math.max(1, source.split("\n").length) },
        (_, index) => index + 1,
    ).join("\n");
}

function ScenarioGeoJsonEditorModal({
    kind,
    initialSource,
    initialPropertyName,
    initialValues,
    options,
    fallbackValue,
    onClose,
    onSave,
}: ScenarioGeoJsonEditorModalProps) {
    const [source, setSource] = useState(initialSource);
    const [propertyName, setPropertyName] = useState(initialPropertyName);
    const [values, setValues] = useState<number[]>([]);
    const gutterRef = useRef<HTMLPreElement | null>(null);
    const parsed = useMemo(() => {
        try {
            return {
                features: parseScenarioGeoJson(source, kind),
                error: null,
            };
        } catch (error) {
            return {
                features: [] as ScenarioImportedGeometry[],
                error: error instanceof Error ? error.message : "Не удалось разобрать GeoJSON.",
            };
        }
    }, [kind, source]);
    const propertyNames = useMemo(
        () => getPropertyNames(parsed.features),
        [parsed.features],
    );

    useEffect(() => {
        if (parsed.error || propertyNames.includes(propertyName)) {
            return;
        }

        setPropertyName(propertyNames[0] ?? "");
    }, [parsed.error, propertyName, propertyNames]);

    useEffect(() => {
        if (!parsed.features.length) {
            setValues([]);
            return;
        }

        setValues(parsed.features.map((feature, index) => (
            getOptionValue(feature.properties[propertyName], options)
            ?? initialValues[index]
            ?? fallbackValue
            ?? options[0]?.value
        )).filter((value): value is number => value !== undefined));
    }, [fallbackValue, initialValues, options, parsed.features, propertyName]);

    const handleSourceChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
        setSource(event.target.value);
    };

    const canSave = !parsed.error
        && parsed.features.length > 0
        && values.length === parsed.features.length
        && values.every((value) => options.some((option) => option.value === value));
    const title = kind === "functionalZones"
        ? "Редактирование файла функциональных зон"
        : "Редактирование файла дорожной сети";
    const propertyLabel = kind === "functionalZones"
        ? "Свойство с типом функциональной зоны"
        : "Свойство с типом дороги";

    return createPortal(
        <div
            className="fixed inset-0 z-300 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
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
                        onClick={onClose}
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
                                                    {options.map((option) => (
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
                    </div>
                </div>

                <div className="mt-5 flex justify-end gap-3 border-t border-slate-100 pt-5 customer-dark:border-ui-border">
                    <button
                        type="button"
                        className="rounded-2xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover"
                        onClick={onClose}
                    >
                        Отмена
                    </button>
                    <button
                        type="button"
                        className="rounded-2xl bg-[#0788CE] px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-45 customer:bg-brand-primary"
                        disabled={!canSave}
                        onClick={() => {
                            onSave({
                                source: formatScenarioGeoJson(source),
                                features: parsed.features,
                                propertyName,
                                values,
                            });
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
