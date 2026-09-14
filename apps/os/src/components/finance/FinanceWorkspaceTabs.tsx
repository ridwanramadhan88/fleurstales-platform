import { useEffect, useMemo, type FC } from 'react'
import {
  BadgeDollarSign,
  ClipboardCheck,
  Landmark,
  ReceiptText,
} from 'lucide-react'
import type { FinanceWorkspaceModule } from '../../domain/financeWorkspaceDomain'
import { useActiveItemScroll } from '../../hooks/useActiveItemScroll'
import { useFinanceStore } from '../../store/financeStore'
import { useOrdersStore } from '../../store/ordersStore'
import { cn } from '../../lib/utils'
import { subscribeFinanceWorkspaceNavigation } from './financeWorkspaceNavigation'

interface FinanceWorkspaceTabsProps {
  modules: FinanceWorkspaceModule[]
  activeModule: FinanceWorkspaceModule
  onChange: (module: FinanceWorkspaceModule) => void
}

type FinanceWorkspaceGroup = 'overview' | 'reconciliation' | 'transactions' | 'payroll'

const GROUP_ITEMS: Record<
  FinanceWorkspaceGroup,
  { label: string; description: string; icon: typeof ClipboardCheck }
> = {
  overview: {
    label: 'Overview',
    description: 'Cash position, account balances, and Finance workload',
    icon: Landmark,
  },
  reconciliation: {
    label: 'Reconciliation',
    description: 'Review received order payments and manage refunds',
    icon: ClipboardCheck,
  },
  transactions: {
    label: 'Transactions',
    description: 'Ledger history and audited manual entries',
    icon: ReceiptText,
  },
  payroll: {
    label: 'Payroll',
    description: 'Review proposals and record final payroll payments',
    icon: BadgeDollarSign,
  },
}

const GROUP_ORDER: FinanceWorkspaceGroup[] = ['overview', 'reconciliation', 'transactions', 'payroll']

const groupForModule = (module: FinanceWorkspaceModule): FinanceWorkspaceGroup => {
  if (module === 'balance') return 'overview'
  if (module === 'order_verification' || module === 'refunds') return 'reconciliation'
  if (module === 'ledger') return 'transactions'
  return 'payroll'
}

const hasGroup = (modules: FinanceWorkspaceModule[], group: FinanceWorkspaceGroup): boolean => {
  if (group === 'overview') return modules.includes('balance')
  if (group === 'reconciliation') return modules.includes('order_verification') || modules.includes('refunds')
  if (group === 'transactions') return modules.includes('ledger')
  return modules.includes('payroll')
}

const targetForGroup = (
  modules: FinanceWorkspaceModule[],
  group: FinanceWorkspaceGroup,
  activeModule: FinanceWorkspaceModule,
): FinanceWorkspaceModule | null => {
  if (group === 'overview') return modules.includes('balance') ? 'balance' : null
  if (group === 'transactions') return modules.includes('ledger') ? 'ledger' : null
  if (group === 'payroll') return modules.includes('payroll') ? 'payroll' : null
  if ((activeModule === 'order_verification' || activeModule === 'refunds') && modules.includes(activeModule)) {
    return activeModule
  }
  if (modules.includes('order_verification')) return 'order_verification'
  if (modules.includes('refunds')) return 'refunds'
  return null
}

const ReconciliationTabs: FC<{
  modules: FinanceWorkspaceModule[]
  activeModule: FinanceWorkspaceModule
  onChange: (module: FinanceWorkspaceModule) => void
}> = ({ modules, activeModule, onChange }) => {
  const orders = useOrdersStore((state) => state.orders)
  const transactions = useFinanceStore((state) => state.transactions)
  const reconciliationModules = (['order_verification', 'refunds'] as FinanceWorkspaceModule[])
    .filter((module) => modules.includes(module))

  const counts = useMemo(() => {
    const postedOrderNumbers = new Set(
      transactions
        .filter((transaction) => transaction.status === 'verified' && transaction.source === 'order_payment' && transaction.orderNumber)
        .map((transaction) => transaction.orderNumber as string),
    )
    return {
      orders: orders.filter((order) => postedOrderNumbers.has(order.orderNumber) && !order.financeVerified).length,
      refunds: orders.filter((order) => order.paymentStatus === 'refund_pending').length,
    }
  }, [orders, transactions])

  if (reconciliationModules.length <= 1) return null

  return (
    <nav
      aria-label="Reconciliation views"
      className="flex w-fit items-center gap-1 rounded-xl bg-muted/45 p-1 ring-1 ring-border/50"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeModule === 'order_verification'}
        onClick={() => onChange('order_verification')}
        className={cn(
          'h-8 rounded-lg px-3 text-xs font-semibold transition-colors',
          activeModule === 'order_verification'
            ? 'bg-card text-foreground shadow-ios-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Orders <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 tabular-nums text-[10px] text-muted-foreground">{counts.orders}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeModule === 'refunds'}
        onClick={() => onChange('refunds')}
        className={cn(
          'h-8 rounded-lg px-3 text-xs font-semibold transition-colors',
          activeModule === 'refunds'
            ? 'bg-card text-foreground shadow-ios-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Refunds <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 tabular-nums text-[10px] text-muted-foreground">{counts.refunds}</span>
      </button>
    </nav>
  )
}

const getSingleModuleHeader = (
  activeModule: FinanceWorkspaceModule,
  activeGroup: FinanceWorkspaceGroup,
) => {
  if (activeModule === 'order_verification') {
    return {
      label: 'Order Reconciliation',
      description: 'Review received order payments and their evidence.',
    }
  }
  if (activeModule === 'refunds') {
    return {
      label: 'Refunds',
      description: 'Review pending refunds and complete actual money movement.',
    }
  }
  return GROUP_ITEMS[activeGroup]
}

export const FinanceWorkspaceTabs: FC<FinanceWorkspaceTabsProps> = ({
  modules,
  activeModule,
  onChange,
}) => {
  const activeGroup = groupForModule(activeModule)
  const groups = GROUP_ORDER.filter((group) => hasGroup(modules, group))
  const navRef = useActiveItemScroll<HTMLElement>(activeGroup, '[aria-current="page"]')

  useEffect(() => subscribeFinanceWorkspaceNavigation((module) => {
    if (modules.includes(module)) onChange(module)
  }), [modules, onChange])

  if (groups.length <= 1) {
    const item = getSingleModuleHeader(activeModule, groups[0] ?? activeGroup)
    return (
      <div className="space-y-3">
        <header className="space-y-1">
          <h1 className="font-display text-2xl font-semibold leading-tight">{item.label}</h1>
          <p className="text-sm leading-5 text-muted-foreground">{item.description}</p>
        </header>
        {activeGroup === 'reconciliation' && (
          <ReconciliationTabs modules={modules} activeModule={activeModule} onChange={onChange} />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <nav
        ref={navRef}
        aria-label="Finance modules"
        className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 py-1 scroll-px-4 sm:mx-0 sm:w-fit sm:max-w-full sm:rounded-xl sm:bg-muted/55 sm:p-1"
      >
        {groups.map((group) => {
          const item = GROUP_ITEMS[group]
          const Icon = item.icon
          const active = activeGroup === group
          return (
            <button
              key={group}
              type="button"
              onClick={() => {
                const target = targetForGroup(modules, group, activeModule)
                if (target) onChange(target)
              }}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'scroll-mx-4 inline-flex min-h-10 min-w-fit shrink-0 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35',
                active
                  ? 'bg-primary text-primary-foreground shadow-ios-sm'
                  : 'text-muted-foreground hover:bg-card hover:text-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="whitespace-nowrap">{item.label}</span>
            </button>
          )
        })}
      </nav>

      {activeGroup === 'reconciliation' && (
        <ReconciliationTabs modules={modules} activeModule={activeModule} onChange={onChange} />
      )}
    </div>
  )
}
