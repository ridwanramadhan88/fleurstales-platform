import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FC } from "react";
import { CheckCircle2 } from "lucide-react";
import type { OrderStatus } from "../../types/orders";
import { cn } from "../../lib/utils";
import { STATUS_ICONS, STATUS_STAGE_STYLE } from "./orderTableLabels";

interface OrderProgressStepperProps {
  options: { id: OrderStatus; label: string }[];
  currentIndex: number;
  ariaLabel?: string;
  className?: string;
  compact?: boolean;
}

type HiddenEdges = {
  before: boolean;
  after: boolean;
};

export const OrderProgressStepper: FC<OrderProgressStepperProps> = ({
  options,
  currentIndex,
  ariaLabel = "Order progress",
  className,
  compact = false,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [trackOffset, setTrackOffset] = useState(0);
  const [hiddenEdges, setHiddenEdges] = useState<HiddenEdges>({ before: false, after: false });
  const previousIndexRef = useRef(currentIndex);
  const [poppedIndex, setPoppedIndex] = useState<number | null>(null);

  useEffect(() => {
    const previousIndex = previousIndexRef.current;
    previousIndexRef.current = currentIndex;
    if (currentIndex <= previousIndex) return undefined;
    const justCompletedIndex = currentIndex - 1;
    setPoppedIndex(justCompletedIndex);
    const timeout = window.setTimeout(() => setPoppedIndex(null), 250);
    return () => window.clearTimeout(timeout);
  }, [currentIndex]);

  const centerCurrentStage = useCallback(() => {
    if (compact) {
      setTrackOffset(0);
      setHiddenEdges({ before: false, after: false });
      return;
    }

    const viewport = viewportRef.current;
    const track = trackRef.current;
    const currentStage = stageRefs.current[currentIndex];
    if (!viewport || !track || !currentStage) return;

    const targetCenter = currentStage.offsetLeft + currentStage.offsetWidth / 2;
    const trackWidth = Math.max(track.scrollWidth, track.offsetWidth);
    const maxOffset = Math.max(0, trackWidth - viewport.clientWidth);
    const nextOffset = Math.min(
      maxOffset,
      Math.max(0, Math.round(targetCenter - viewport.clientWidth / 2)),
    );

    setTrackOffset(nextOffset);
    setHiddenEdges({
      before: nextOffset > 1,
      after: nextOffset < maxOffset - 1,
    });
  }, [compact, currentIndex]);

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
      data-progress-mode={compact ? "full-track-fit" : "full-track"}
      data-progress-mask-before={hiddenEdges.before ? "true" : "false"}
      data-progress-mask-after={hiddenEdges.after ? "true" : "false"}
      className={cn(
        compact
          ? "relative touch-pan-y"
          : "relative touch-pan-y rounded-2xl bg-surface-card ring-1 ring-border/60",
        className,
      )}
      aria-label={ariaLabel}
    >
      <span className="sr-only">
        Step {currentIndex + 1} of {options.length}
      </span>
      <div
        data-progress-mask
        className={compact ? "overflow-visible" : "overflow-visible [clip-path:inset(-0.75rem_0_-2rem_0)]"}
      >
        <div
          ref={trackRef}
          data-progress-track
          className={cn(
            "grid min-w-0 items-start will-change-transform transition-transform duration-300 ease-out motion-reduce:transition-none",
            compact ? "w-full px-1 py-1.5" : "w-full px-2 py-3.5 sm:px-4",
          )}
          style={{
            gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
            transform: compact ? "translate3d(0, 0, 0)" : `translate3d(-${trackOffset}px, 0, 0)`,
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
            const Icon = state === "done" ? CheckCircle2 : STATUS_ICONS[option.id];
            const justPopped = poppedIndex === index;
            const slowPulse = style.pulse
              ? " animate-[pulse_6s_ease-in-out_infinite] motion-reduce:animate-none"
              : "";
            const nodeClass = compact
              ? state === "current"
                ? `relative z-10 flex size-8 items-center justify-center rounded-full text-white transition-all duration-300 ease-out motion-reduce:transition-none ${style.currentDot}${slowPulse}`
                : state === "done"
                  ? `relative z-10 flex size-8 items-center justify-center rounded-full text-white transition-all duration-300 ease-out motion-reduce:transition-none ${style.doneDot}${justPopped ? " animate-dot-pop motion-reduce:animate-none" : ""}`
                  : "relative z-10 flex size-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-all duration-300 ease-out motion-reduce:transition-none"
              : state === "current"
                ? `relative z-10 flex size-11 items-center justify-center rounded-full text-white transition-all duration-300 ease-out ${style.currentDot}${slowPulse}`
                : state === "done"
                  ? `relative z-10 flex size-11 items-center justify-center rounded-full text-white transition-all duration-300 ease-out ${style.doneDot}${justPopped ? " animate-dot-pop" : ""}`
                  : "relative z-10 flex size-11 items-center justify-center rounded-full border-2 border-border bg-card text-muted-foreground transition-all duration-300 ease-out";
            const labelClass = compact
              ? state === "current"
                ? `mt-1 w-full px-0.5 text-center text-[10px] font-semibold leading-3 sm:text-[11px] ${style.currentText}`
                : state === "done"
                  ? "mt-1 w-full px-0.5 text-center text-[10px] font-medium leading-3 text-foreground sm:text-[11px]"
                  : "mt-1 w-full px-0.5 text-center text-[10px] font-medium leading-3 text-muted-foreground sm:text-[11px]"
              : state === "current"
                ? `mt-2 w-full px-1 text-center text-xs font-semibold leading-4 sm:text-sm ${style.currentText}`
                : state === "done"
                  ? "mt-2 w-full px-1 text-center text-xs font-medium leading-4 text-foreground sm:text-sm"
                  : "mt-2 w-full px-1 text-center text-xs font-medium leading-4 text-muted-foreground sm:text-sm";

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
                    className={compact
                      ? "absolute left-[calc(50%+20px)] top-[15px] h-0.5 w-[calc(100%-40px)] overflow-hidden rounded-full bg-border"
                      : "absolute left-[calc(50%+27px)] top-[21px] h-0.5 w-[calc(100%-54px)] overflow-hidden rounded-full bg-border"}
                  >
                    <span
                      className={`block h-full w-full origin-left rounded-full bg-success/70 transition-transform duration-500 ease-out ${index < currentIndex ? "scale-x-100" : "scale-x-0"}`}
                    />
                  </span>
                )}
                <span className={nodeClass}>
                  <Icon className={compact ? "size-4" : "size-5"} />
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
