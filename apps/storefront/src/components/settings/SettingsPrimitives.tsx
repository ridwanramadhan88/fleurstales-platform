import type { FC, ReactNode, RefObject } from "react";
import type { LucideIcon } from "lucide-react";
import { surfaceCardClass } from "../ui/card";
import { cn } from "../../lib/utils";

export const SettingsSectionHeader: FC<{
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "primary" | "neutral";
}> = ({ icon: Icon, title, description, action, tone = "primary" }) => (
  <header className="flex items-start justify-between gap-3">
    <div className="flex min-w-0 items-start gap-3">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ${
          tone === "primary"
            ? "bg-primary/10 text-primary ring-primary/15"
            : "bg-muted text-foreground ring-border/70"
        }`}
      >
        <Icon className="size-4" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <h2 className="font-display text-base font-semibold leading-5 text-foreground">
          {title}
        </h2>
        <p className="mt-0.5 max-w-2xl text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </header>
);

export const SettingsCard: FC<{
  children: ReactNode;
  className?: string;
  emphasis?: "primary" | "secondary";
}> = ({ children, className = "", emphasis = "secondary" }) => (
  <section
    className={surfaceCardClass(
      "standard",
      `${emphasis === "primary" ? "border border-border ring-black/[0.02]" : "border border-border/70"} ${className}`,
    )}
  >
    {children}
  </section>
);

export const compactSettingCardClass = (error = false) =>
  cn(
    "rounded-xl border bg-surface-panel p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]",
    error ? "border-destructive/60" : "border-border/70",
  );

export const compactValueRowClass = (error = false) =>
  cn(
    "rounded-xl border bg-surface-panel px-3.5 py-3",
    error ? "border-destructive/60" : "border-border/65",
  );

export const SettingsReadRow: FC<{
  label: string;
  value: ReactNode;
  description?: string;
}> = ({ label, value, description }) => (
  <div className="flex min-h-14 items-center justify-between gap-4 border-b border-border/60 py-3 last:border-b-0">
    <div className="min-w-0">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      {description && (
        <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
          {description}
        </p>
      )}
    </div>
    <div className="shrink-0 text-right text-sm font-semibold text-foreground">
      {value}
    </div>
  </div>
);

export const SettingsSubsectionTitle: FC<{
  title: string;
  description?: string;
  action?: ReactNode;
}> = ({ title, description, action }) => (
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0">
      <h3 className="font-display text-base font-semibold text-foreground">
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          {description}
        </p>
      )}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const settingsTabTrackClass = ({
  level,
  className,
}: {
  level: "primary" | "secondary";
  className?: string;
}) =>
  cn(
    "no-scrollbar flex w-full min-w-0 items-center overflow-x-auto overscroll-x-contain scroll-smooth",
    "touch-pan-x snap-x snap-proximity",
    level === "primary"
      ? "gap-7 border-b border-border/70 bg-transparent px-0 py-0 sm:gap-9"
      : "gap-1.5 rounded-[1.25rem] bg-muted/55 p-1.5 sm:gap-2",
    className,
  );

export const settingsTabButtonClass = ({
  active,
  level,
  className,
}: {
  active: boolean;
  level: "primary" | "secondary";
  className?: string;
}) =>
  cn(
    "inline-flex shrink-0 snap-start items-center justify-center whitespace-nowrap font-medium",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-45",
    level === "primary"
      ? "relative h-11 rounded-none border-0 px-1 text-sm after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:origin-center after:bg-current after:transition-transform"
      : "h-9 rounded-full border px-3.5 text-sm",
    level === "primary"
      ? active
        ? "text-foreground after:scale-x-100"
        : "text-muted-foreground after:scale-x-0 hover:text-foreground"
      : active
        ? "border-primary bg-primary text-primary-foreground shadow-ios-sm"
        : "border-border/80 bg-card text-muted-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-border hover:bg-accent/60 hover:text-foreground",
    className,
  );

export const SettingsTabTrack: FC<{
  level: "primary" | "secondary";
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  trackRef?: RefObject<HTMLDivElement | HTMLElement | null>;
  as?: "div" | "nav";
}> = ({ level, ariaLabel, children, className, trackRef, as = "div" }) => {
  const Comp = as;
  return (
    <Comp
      ref={trackRef as never}
      aria-label={ariaLabel}
      className={settingsTabTrackClass({ level, className })}
    >
      {children}
    </Comp>
  );
};
