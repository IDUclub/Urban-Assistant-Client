import { useState, type KeyboardEvent, type PointerEvent } from "react";

const MIN_MAP_HEIGHT_VH = 20;
const MAX_MAP_HEIGHT_VH = 80;

export default function useResizableMap() {
  const [mapHeightVh, setMapHeightVh] = useState(25);
  const isMapExpanded = mapHeightVh >= 50;

  const resizeHandlers = {
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    },

    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        return;
      }

      const container = event.currentTarget.parentElement;
      if (!container) {
        return;
      }

      const bottom = container.getBoundingClientRect().bottom;
      const nextHeightVh = (bottom - event.clientY) / window.innerHeight * 100;
      setMapHeightVh(
        Math.min(MAX_MAP_HEIGHT_VH, Math.max(MIN_MAP_HEIGHT_VH, nextHeightVh)),
      );
    },

    onPointerUp(event: PointerEvent<HTMLDivElement>) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },

    onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        const heightChange = event.key === "ArrowUp" ? 5 : -5;
        setMapHeightVh((height) =>
          Math.min(MAX_MAP_HEIGHT_VH, Math.max(MIN_MAP_HEIGHT_VH, height + heightChange)),
        );
      }
    },
  };

  return {
    mapHeight: `${mapHeightVh}vh`,
    isMapExpanded,
    toggleMapExpanded: () => setMapHeightVh(isMapExpanded ? 25 : 50),
    resizeHandleProps: {
      ...resizeHandlers,
      role: "slider",
      tabIndex: 0,
      "aria-label": "Высота карты",
      "aria-valuemin": MIN_MAP_HEIGHT_VH,
      "aria-valuemax": MAX_MAP_HEIGHT_VH,
      "aria-valuenow": Math.round(mapHeightVh),
      "aria-orientation": "vertical" as const,
      className: "absolute inset-x-8 top-0 z-20 flex h-4 touch-none cursor-ns-resize items-center justify-center focus-visible:outline-2 focus-visible:outline-brand-primary",
      children: <span className="h-1 w-12 rounded-full bg-slate-400" />,
    },
  };
}
