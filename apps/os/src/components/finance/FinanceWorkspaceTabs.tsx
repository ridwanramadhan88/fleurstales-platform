import type { FC } from "react";
import {
  BadgeDollarSign,
  ClipboardCheck,
  Landmark,
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
  order_verification: {
    label: "Order Reconciliation",
    description: "Final-check Admin-confirmed payments",
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
    description: "Read-only financial history",
    icon: ReceiptText,
  },
  balance: {
    label: "Balance",
    description: "Accounts and cash flow",
    icon: Landmark,
  },
};

export const FinanceWorkspaceTabs: FC<FinanceWorkspaceTabsProps> = ({
  modules,
  activeModule,
  onChange,
}) => {
  const navRef = useActiveItemScroll<HTMLElement>(activeModule, '[aria-current="page"]')

  if (modules.length <= 1) {
    const item = ITEMS[modules[0] ?? "order_verification"];
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
      className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 py-1 scroll-px-4 sm:mx-0 sm:w-fit sm:max-w-full sm:rounded-xl sm:bg-muted/55 sm:p-1"
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
              "scroll-mx-4 inline-flex min-h-10 min-w-fit shrink-0 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
              active
                ? "bg-primary text-primary-foreground shadow-ios-sm"
                : "text-muted-foreground hover:bg-card hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="whitespace-nowrap">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
