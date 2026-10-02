import {
  IoAlertCircleOutline,
  IoCheckmarkCircleOutline,
  IoTimeOutline,
} from "react-icons/io5";

export default function MasBfmProjectStatus({ status }: { status?: string }) {
  if (!status) {
    return null;
  }

  const normalizedStatus = status.trim().toLowerCase();
  const isCompleted = normalizedStatus === "completed";
  const isFailed = normalizedStatus === "failed";
  const isCancelled = normalizedStatus === "cancelled";
  const isWaiting = normalizedStatus === "waiting_approval_timeout";
  const label = isCompleted
    ? "Завершено"
    : isFailed
      ? "Ошибка выполнения"
      : isCancelled
        ? "Остановлено"
        : isWaiting
          ? "Ожидает подтверждения"
          : "Выполняется";
  const Icon = isCompleted
    ? IoCheckmarkCircleOutline
    : isFailed
      ? IoAlertCircleOutline
      : IoTimeOutline;

  return (
    <div
      role="status"
      className={`flex items-center gap-1.5 text-xs font-medium ${
        isFailed
          ? "text-red-600 customer-dark:text-red-300"
          : isCompleted
            ? "text-emerald-600 customer-dark:text-emerald-300"
            : "text-content-muted"
      }`}
    >
      <Icon
        size={15}
        aria-hidden="true"
        className={
          !isCompleted && !isFailed && !isCancelled && !isWaiting
            ? "animate-pulse"
            : undefined
        }
      />
      <span>{label}</span>
    </div>
  );
}
