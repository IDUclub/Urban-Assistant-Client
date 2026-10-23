import { useMemo, useState } from "react";
import { MdCheck } from "react-icons/md";
import { observer } from "mobx-react-lite";
import ChatStore from "@lib/ChatStore";
import FileUpload from "@components/FileUpload";
import Select from "@components/ui/Select";
import {
    PLACEMENT_CLASSES,
    type PlacementSetup,
    type PlacementSummaryMessage,
    type PlacementFileKey,
} from "@lib/placement/types";

const panel =
    "flex w-full flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800 customer-dark:border-ui-border customer-dark:bg-surface-muted customer-dark:text-content-primary";
const button =
    "inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-2xl bg-brand-primary px-4 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-surface-disabled";
const secondary =
    "self-start rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300 customer-dark:border-ui-border-strong customer-dark:bg-surface-raised customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover customer-dark:disabled:text-content-disabled";

const fileSteps: Record<PlacementFileKey, string> = {
    zones: "Загрузите файл с ПЗЗ",
    descriptions: "Загрузите описание зон ПЗЗ",
    cadastre: "Загрузите кадастровые участки с ВРИ",
    objects: "Загрузите фактические объекты",
};

const fileLabels: Record<PlacementFileKey, string> = {
    zones: "Файл с ПЗЗ",
    descriptions: "Описание зон ПЗЗ",
    cadastre: "Кадастровые участки с ВРИ",
    objects: "Фактические объекты",
};

const setupStatusLabels: Record<PlacementSetup["status"], string> = {
    loading: "Загрузка источников",
    ready: "Настройка",
    running: "Выполняется",
    queued: "В очереди",
    waiting_capacity: "Ожидание ресурсов",
    finished: "Завершено",
    error: "Ошибка",
};

const normStatusLabels: Record<string, string> = {
    applied: "Применена",
    not_applied: "Не применена",
    listed: "Приведена для справки",
};

const regulationSourceLabels: Record<string, string> = {
    user: "Файл пользователя",
    normgraph: "База нормативных документов",
    default: "Встроенный справочник",
};

export const PlacementSetupCard = observer(({ setup }: { setup: PlacementSetup }) => {
    const yearOptions = useMemo(
        () =>
            [...new Set(setup.sources.map((item) => item.year))]
                .sort((a, b) => b - a)
                .map((value) => ({ value, label: String(value) })),
        [setup.sources],
    );

    const [chosenYear, setYear] = useState<number | undefined>(setup.year);
    const year = yearOptions.some((item) => item.value === chosenYear)
        ? chosenYear
        : yearOptions[0]?.value;
    const sourceOptions = useMemo(
        () =>
            [
                ...new Set(
                    setup.sources.filter((item) => item.year === year).map((item) => item.source),
                ),
            ].map((value) => ({ value, label: value })),
        [setup.sources, year],
    );

    const [chosenSource, setSource] = useState(setup.source);
    const source = sourceOptions.some((item) => item.value === chosenSource)
        ? chosenSource
        : sourceOptions[0]?.value;
    const ready = setup.status === "ready";
    const step = setup.step === "complete" ? undefined : fileSteps[setup.step];
    const uploadedFiles = (Object.keys(setup.fileNames) as PlacementFileKey[]).map((key) => ({
        key,
        label: `${fileLabels[key]}: ${setup.fileNames[key]}`,
    }));

    const showScenarioSetup = ready && Boolean(setup.scenarioId) && setup.step === "complete";
    const isRunning = ["running", "queued", "waiting_capacity"].includes(setup.status);
    const canSubmit =
        showScenarioSetup &&
        Boolean(setup.request.trim()) &&
        year !== undefined &&
        Boolean(source) &&
        !ChatStore.isStreaming;
    const fileAccept =
        setup.step === "descriptions"
            ? ".json,.csv,.xlsx"
            : ".geojson,.json,.gpkg,.gml,.kml,.geoparquet,.parquet,.zip";

    return (
        <div className={panel}>
            <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-900 customer-dark:text-content-primary">
                    Размещение сервисов
                </span>
                <span
                    aria-live="polite"
                    className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs text-slate-500 customer-dark:bg-surface-raised customer-dark:text-content-muted"
                >
                    {setupStatusLabels[setup.status]}
                </span>
            </div>

            {uploadedFiles.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-2xl bg-white px-3 py-2 text-xs text-slate-500 customer-dark:bg-surface-raised customer-dark:text-content-muted">
                    {uploadedFiles.map((file) => (
                        <li key={file.key} className="min-w-0 truncate" title={file.label}>
                            {file.label}
                        </li>
                    ))}
                </ul>
            )}

            {ready && step && (
                <>
                    <FileUpload
                        disabled={!ready || ChatStore.isStreaming}
                        label={step}
                        fileName={setup.fileNames[setup.step as PlacementFileKey]}
                        accept={fileAccept}
                        onFileSelected={(file) =>
                            ChatStore.setPlacementFile(
                                setup.id,
                                setup.step as PlacementFileKey,
                                file,
                            )
                        }
                    />

                    {setup.step !== "zones" && (
                        <button
                            type="button"
                            disabled={ChatStore.isStreaming}
                            className={secondary}
                            onClick={() =>
                                ChatStore.setPlacementFile(setup.id, setup.step as PlacementFileKey)
                            }
                        >
                            Пропустить
                        </button>
                    )}
                </>
            )}

            {showScenarioSetup && (
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                    <div
                        role="group"
                        aria-label="Год"
                        className="flex min-w-0 flex-col gap-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-500 customer-dark:text-content-muted"
                    >
                        <span>Год</span>
                        <Select
                            block
                            value={year ?? ""}
                            options={yearOptions}
                            onChange={(value) => setYear(Number(value))}
                        />
                    </div>
                    <div
                        role="group"
                        aria-label="Источник"
                        className="flex min-w-0 flex-col gap-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-500 customer-dark:text-content-muted"
                    >
                        <span>Источник</span>
                        <Select
                            block
                            value={source ?? ""}
                            options={sourceOptions}
                            onChange={(value) => setSource(String(value))}
                        />
                    </div>
                    <button
                        type="button"
                        className={button}
                        disabled={!canSubmit}
                        onClick={() => void ChatStore.submitPlacement(setup.id, year, source)}
                    >
                        <MdCheck size={18} />
                        Запустить
                    </button>
                </div>
            )}

            {setup.status === "loading" && (
                <div className="text-xs text-slate-500 customer-dark:text-content-muted">
                    Загрузка источников функциональных зон...
                </div>
            )}

            {setup.status === "finished" && (
                <div className="text-sm text-slate-600 customer-dark:text-content-secondary">
                    Подбор мест размещения завершён.
                </div>
            )}

            {isRunning && (
                <div className="text-sm text-slate-600 customer-dark:text-content-secondary">
                    Подбор мест размещения выполняется...
                </div>
            )}

            {setup.errorText && (
                <div
                    role="alert"
                    className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700 customer:border-danger-border customer:bg-danger-soft customer:text-danger-content"
                >
                    {setup.errorText}
                    <button
                        type="button"
                        className="mt-2 block underline disabled:opacity-50"
                        disabled={ChatStore.isStreaming}
                        onClick={() => ChatStore.restartPlacement(setup.id)}
                    >
                        Повторить подбор
                    </button>
                </div>
            )}
        </div>
    );
});

const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const formatNumber = (value: number | undefined) =>
    typeof value === "number" && Number.isFinite(value) ? numberFormatter.format(value) : "—";

export function PlacementSummaryCard({ message }: { message: PlacementSummaryMessage }) {
    const summary = message.summary;
    const regulations = summary.regulations;
    const regulationSource = regulations?.source ?? "";
    const source = regulationSourceLabels[regulationSource] ?? regulationSource;
    const classRows = PLACEMENT_CLASSES.map(([code, color, label]) => ({
        code,
        color,
        label,
        zones: formatNumber(summary.classes?.[code]?.zones),
        area: formatNumber(summary.classes?.[code]?.ha),
    }));

    const norms = summary.norms?.map((norm) => ({
        ...norm,
        statusLabel: normStatusLabels[norm.status ?? ""],
    }));

    return (
        <div className={panel}>
            <span className="font-medium text-slate-900 customer-dark:text-content-primary">
                Результат подбора: {summary.service_name ?? "размещение сервиса"}
            </span>

            {summary.vri_code && (
                <p>
                    ВРИ {summary.vri_code}
                    {summary.vri_name ? ` — ${summary.vri_name}` : ""}
                </p>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                    <thead>
                        <tr>
                            <th className="py-2">Пригодность</th>
                            <th>Зон / частей</th>
                            <th>Площадь, га</th>
                        </tr>
                    </thead>

                    <tbody>
                        {classRows.map(({ code, color, label, zones, area }) => (
                            <tr
                                key={code}
                                className="border-t border-slate-200 customer-dark:border-ui-border"
                            >
                                <td className="py-2">
                                    <span
                                        className="mr-2 inline-block h-2.5 w-2.5 rounded-full"
                                        style={{ background: color }}
                                    />
                                    {code} — {label}
                                </td>
                                <td>{zones}</td>
                                <td>{area}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <p className="text-xs">
                Всего исходных зон: {formatNumber(summary.zones_total)}. Одна зона может быть
                разделена на части разных классов.
            </p>

            {!!summary.best_zones?.length && (
                <>
                    <strong>Крупнейшие зоны класса A</strong>
                    <ul>
                        {summary.best_zones.map((zone, i) => (
                            <li key={i} className="py-1">
                                {zone.code} — {zone.name}: {formatNumber(zone.ha)} га
                                {zone.limits && <div className="text-xs">{zone.limits}</div>}
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {source && (
                <p className="text-xs">
                    Правила: {source}
                    {regulations?.document && ` — ${regulations.document}`}
                    {regulations?.version && ` (${regulations.version})`}
                </p>
            )}

            {summary.existing_objects_count !== undefined && (
                <p className="text-xs">
                    Найдено существующих объектов этого типа:{" "}
                    {formatNumber(summary.existing_objects_count)}
                </p>
            )}

            {summary.scenario_objects_used && (
                <p className="text-xs">Учтены геометрии объектов сценария.</p>
            )}

            {!!norms?.length && (
                <details>
                    <summary className="cursor-pointer">
                        Нормы и ограничения ({norms.length})
                    </summary>
                    <ul className="mt-2 space-y-2 text-xs">
                        {norms.map((norm, i) => (
                            <li key={i}>
                                {norm.requirement}
                                {norm.document && ` — ${norm.document}`}
                                {norm.clause && `, п. ${norm.clause}`}
                                <div>
                                    {norm.statusLabel}
                                    {norm.note && `: ${norm.note}`}
                                </div>
                            </li>
                        ))}
                    </ul>
                </details>
            )}

            {!!summary.notes?.length && (
                <ul className="space-y-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 customer-dark:bg-surface-raised customer-dark:text-content-secondary">
                    {summary.notes.map((note, i) => (
                        <li key={i}>{note}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}
