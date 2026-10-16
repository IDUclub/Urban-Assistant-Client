import { useEffect, useMemo, useState } from "react";
import { MdCheck, MdClose } from "react-icons/md";
import ZoneAdjacencyMatrixCell from "@components/ZoneAdjacencyMatrixCell";
import {
    getPairsFromMatrix,
    updateMatrixCell,
    ZONE_TYPES,
} from "@lib/genplanner/zoneAdjacencyMatrix";
import type {
    MatrixCellValue,
    ZoneAdjacencyMatrixState,
    ZonePair,
} from "@lib/genplanner/zoneAdjacencyMatrix";

type ZoneAdjacencyMatrixModalProps = {
    initialMatrix: ZoneAdjacencyMatrixState;
    isSubmitting?: boolean;
    onClose: () => void;
    onSubmit: (value: {
        neighbourPairs: ZonePair[];
        forbiddenPairs: ZonePair[];
    }) => void;
};

export default function ZoneAdjacencyMatrixModal({
    initialMatrix,
    isSubmitting = false,
    onClose,
    onSubmit,
}: ZoneAdjacencyMatrixModalProps) {
    const [matrix, setMatrix] = useState<ZoneAdjacencyMatrixState>(
        () => initialMatrix,
    );

    const selectedPairs = useMemo(
        () => getPairsFromMatrix(matrix),
        [matrix],
    );

    useEffect(() => {
        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;

        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";

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

    const handleCellChange = (
        rowZoneId: number,
        columnZoneId: number,
        value: MatrixCellValue,
    ) => {
        setMatrix((currentMatrix) =>
            updateMatrixCell(
                currentMatrix,
                rowZoneId,
                columnZoneId,
                value,
            )
        );
    };

    const handleSubmit = () => {
        onSubmit(selectedPairs);
    };

    return (
        <div
            className="fixed inset-0 z-300 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[2px]"
            onMouseDown={(event) => {
                if (
                    event.target === event.currentTarget &&
                    !isSubmitting
                ) {
                    onClose();
                }
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="zone-adjacency-matrix-title"
                className="flex max-h-[90vh] w-full max-w-[1400px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl customer-dark:bg-surface-raised"
            >
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 customer-dark:border-ui-border">
                    <div>
                        <h2
                            id="zone-adjacency-matrix-title"
                            className="text-lg font-semibold text-slate-950 customer-dark:text-content-primary"
                        >
                            Матрица соседства зон
                        </h2>

                        <p className="mt-1 text-sm text-slate-500 customer-dark:text-content-muted">
                            Нажимайте на ячейку несколько раз:
                            пусто → галочка → крестик → пусто.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 customer-dark:border-ui-border customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover"
                        onClick={onClose}
                        disabled={isSubmitting}
                        aria-label="Закрыть матрицу соседства зон"
                    >
                        <MdClose size={22} aria-hidden="true" />
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-5 border-b border-slate-200 px-6 py-3 text-sm customer-dark:border-ui-border">
                    <span className="inline-flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700">
                            <MdCheck size={18} aria-hidden="true" />
                        </span>
                        Соседство обязательно
                    </span>

                    <span className="inline-flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-300 bg-red-50 text-red-600">
                            <MdClose size={18} aria-hidden="true" />
                        </span>
                        Соседство запрещено
                    </span>
                </div>

                <div className="min-h-0 flex-1 overflow-auto">
                    <table className="min-w-max border-separate border-spacing-0 text-sm">
                        <thead>
                            <tr>
                                <th className="sticky left-0 top-0 z-30 min-w-64 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left font-semibold text-slate-900 customer-dark:border-ui-border customer-dark:bg-surface-muted customer-dark:text-content-primary">
                                    Типы зон
                                </th>

                                {ZONE_TYPES.map((zone) => (
                                    <th
                                        key={zone.value}
                                        className="sticky top-0 z-20 min-w-40 max-w-40 border-b border-r border-slate-200 bg-slate-50 px-3 py-3 text-center font-medium text-slate-700 customer-dark:border-ui-border customer-dark:bg-surface-muted customer-dark:text-content-secondary"
                                    >
                                        {zone.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody>
                            {ZONE_TYPES.map((rowZone) => (
                                <tr key={rowZone.value}>
                                    <th className="sticky left-0 z-10 min-w-64 border-b border-r border-slate-200 bg-white px-4 py-3 text-left font-medium text-slate-800 customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-primary">
                                        {rowZone.label}
                                    </th>

                                    {ZONE_TYPES.map((columnZone) => {
                                        const isDiagonal =
                                            rowZone.value === columnZone.value;

                                        return (
                                            <td
                                                key={columnZone.value}
                                                className="border-b border-r border-slate-200 px-3 py-2 text-center customer-dark:border-ui-border"
                                            >
                                                <ZoneAdjacencyMatrixCell
                                                    value={
                                                        matrix[rowZone.value]?.[
                                                            columnZone.value
                                                        ] ?? null
                                                    }
                                                    rowZoneLabel={rowZone.label}
                                                    columnZoneLabel={
                                                        columnZone.label
                                                    }
                                                    disabled={isDiagonal}
                                                    onChange={(value) =>
                                                        handleCellChange(
                                                            rowZone.value,
                                                            columnZone.value,
                                                            value,
                                                        )
                                                    }
                                                />
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 px-6 py-4 customer-dark:border-ui-border">
                    <div className="text-sm text-slate-500 customer-dark:text-content-muted">
                        Обязательных пар:{" "}
                        {selectedPairs.neighbourPairs.length}.
                        Запрещённых пар:{" "}
                        {selectedPairs.forbiddenPairs.length}.
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 customer-dark:border-ui-border customer-dark:bg-surface-raised customer-dark:text-content-secondary customer-dark:hover:bg-surface-hover"
                            onClick={onClose}
                            disabled={isSubmitting}
                        >
                            Отмена
                        </button>

                        <button
                            type="button"
                            className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-surface-disabled"
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                        >
                            {isSubmitting
                                ? "Запускаем..."
                                : "Применить и запустить"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}