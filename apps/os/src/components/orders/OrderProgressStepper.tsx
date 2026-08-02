import { useCallback, useLayoutEffect, useRef, useState, type FC } from "react";
import type { OrderStatus } from "../../types/orders";
import { cn } from "../../lib/utils";
import { STATUS_ICONS, STATUS_STAGE_STYLE } from "./orderTableLabels";

interface OrderProgressStepperProps {
  options: { id: OrderStatus; label: string }[];
  currentIndex: number;
  ariaLabel?: string;
  className?: string;
}

export const OrderProgressStepper: FC<OrderProgressStepperProps> = ({
  options,
  currentIndex,
  ariaLabel = "Order progress",
  className,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [trackOffset, setTrackOffset] = useState(0);

  const centerCurrentStage = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const currentStage = stageRefs.current[currentIndex];
    if (!viewport || !track || !currentStage) return;

    const targetCenter = currentStage.offsetLeft + currentStage.offsetWidth / 2;
    const maxOffset = Math.max(0, track.offsetWidth - viewport.clientWidth);
    setTrackOffset(Math.min(
      maxOffset,
      Math.max(0, Math.round(targetCenter - viewport.clientWidth / 2)),
    ));
  }, [currentIndex]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return undefined;

    const frame = window.requestAnimationFrame(centerCurrentStage);
    const observer = new ResizeObserver(centerCurrentStage);
    observer.observe(viewport);
    observer.observe(track);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [centerCurrentStage, options.length]);

  return (
    <div
      ref={viewportRef}
      className={cn(
        "relative touch-pan-y rounded-xl border border-border bg-card shadow-ios-sm",
        className,
      )}
      aria-label={ariaLabel}
    >
      <div className="overflow-visible [clip-path:inset(-0.75rem_0_-2rem_0)]">
        <div
          ref={trackRef}
          data-progress-track
          className="grid min-w-[30rem] items-start px-5 py-3.5 will-change-transform sm:min-w-0 sm:px-6"
          style={{
            gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
            transform: `translate3d(-${trackOffset}px, 0, 0)`,
          }}
        >
        {options.map((option, index) => {
          const style = STATUS_STAGE_STYLE[option.id];
          const state =
            index < currentIndex
              ? "done"
              : index === currentIndex
                ? "current"
                : "upcoming";
          const Icon = STATUS_ICONS[option.id];
          const nodeClass =
            state === "current"
              ? `relative z-10 flex size-9 items-center justify-center rounded-full text-white ${style.currentDot}${style.pulse ? " animate-pulse" : ""}`
              : state === "done"
                ? `relative z-10 flex size-9 items-center justify-center rounded-full text-white ${style.doneDot}`
                : "relative z-10 flex size-9 items-center justify-center rounded-full border-2 border-border bg-card text-muted-foreground";
          const labelClass =
            state === "current"
              ? `mt-2 w-full px-1 text-center text-xs font-semibold leading-4 ${style.currentText}`
              : state === "done"
                ? "mt-2 w-full px-1 text-center text-xs font-medium leading-4 text-foreground"
                : "mt-2 w-full px-1 text-center text-xs font-medium leading-4 text-muted-foreground";

          return (
            <div
              key={option.id}
              ref={(node) => { stageRefs.current[index] = node }}
              data-stage-index={index}
              aria-current={state === "current" ? "step" : undefined}
              className="relative flex min-w-0 flex-col items-center"
            >
              {index < options.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[calc(50%+22px)] top-[17px] h-0.5 w-[calc(100%-44px)] rounded-full ${index < currentIndex ? "bg-success/70" : "bg-border"}`}
                />
              )}
              <span className={nodeClass}>
                <Icon className="size-4" />
              </span>
              <span className={labelClass}>{option.label}</span>
            </div>
          );
          })}
        </div>
      </div>
    </div>
  );
};
