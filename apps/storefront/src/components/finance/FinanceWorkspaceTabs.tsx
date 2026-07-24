import type { FC } from "react";
import {
  BadgeDollarSign,
  ClipboardCheck,
  ReceiptText,
  RotateCcw,
} from "lucide-react";
import type { FinanceWorkspaceModule } from "../../domain/financeWorkspaceDomain";
import { useActiveItemScroll } from "../../hooks/useActiveItemScroll";
import { cn } from "../../lib/utils";

interface FinanceWorkspaceTabsProps {
  modules: FinanceWorkspaceModule[];
  activeModule: FinanceWorkspaceModule;
  onChange: (module: FinanceWorkspaceModule) => void;
}

const ITEMS: Record<
  FinanceWorkspaceModule,
  { label: string; description: string; icon: typeof ClipboardCheck }
> = {
  collect_orders: {
    label: "Payment Verification",
    description: "Verify completed customer orders",
    icon: ClipboardCheck,
  },
  payroll: {
    label: "Payroll",
    description: "Review monthly payroll proposals",
    icon: BadgeDollarSign,
  },
  refunds: {
    label: "Refunds",
    description: "Review pending and completed refunds",
    icon: RotateCcw,
  },
  ledger: {
    label: "Transactions",
    description: "Money In and Money Out records",
    icon: ReceiptText,
  },
};

export const FinanceWorkspaceTabs: FC<FinanceWorkspaceTabsProps> = ({
  modules,
  activeModule,
  onChange,
}) => {
  const navRef = useActiveItemScroll<HTMLElement>(activeModule, '[aria-current="page"]')

  if (modules.length <= 1) {
    const item = ITEMS[modules[0] ?? "collect_orders"];
    return (
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold leading-tight">
          {item.label}
        </h1>
        <p className="text-sm leading-5 text-muted-foreground">{item.description}</p>
      </header>
    );
  }

  return (
    <nav
      ref={navRef}
      aria-label="Finance modules"
      className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scroll-px-4 [mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-1rem),transparent)] sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-3 sm:overflow-visible sm:p-0 sm:[mask-image:none]"
    >
      {modules.map((module) => {
        const item = ITEMS[module];
        const Icon = item.icon;
        const active = activeModule === module;
        return (
          <button
            key={module}
            type="button"
            onClick={() => onChange(module)}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "scroll-mx-4 flex min-h-[4.75rem] min-w-[10.5rem] shrink-0 items-center gap-3 overflow-hidden rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-w-0",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/70 bg-card text-foreground hover:bg-muted/60",
            )}
          >
            <Icon className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 overflow-hidden">
              <span className="block truncate text-sm font-semibold leading-tight sm:text-base">
                {item.label}
              </span>
              <span
                className={`mt-1 block truncate whitespace-nowrap text-xs leading-snug ${active ? "text-primary-foreground/75" : "text-muted-foreground"}`}
              >
                {item.description}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
};
