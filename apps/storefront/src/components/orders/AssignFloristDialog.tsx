import { useMemo, useState, type FC } from "react";
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  UserRoundCheck,
  Users,
} from "lucide-react";
import type { OrderTableRow } from "../../types/orders";
import { useHrStore } from "../../store/hrStore";
import { useOrdersStore } from "../../store/ordersStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useUserStore } from "../../store/userStore";
import {
  getFloristAssignmentOptionsForOrder,
  resolveFloristAssignmentMoment,
  type FloristAssignmentOption,
  type FloristScheduleStatus,
} from "../../domain/floristAssignmentDomain";
import { toast } from "../../hooks/use-toast";
import { AppDialog } from "../ui/app-dialog";
import { ConfirmActionDialog } from "../ui/confirm-action-dialog";

const STATUS_LABELS: Record<FloristScheduleStatus, string> = {
  scheduled: "Scheduled",
  different_branch: "Different branch",
  outside_shift: "Outside shift",
  off: "OFF",
  wfh: "WFH",
  unassigned: "Not assigned",
};

const statusClasses = (option: FloristAssignmentOption): string => {
  if (option.isRecommended) return "bg-success/10 text-success ring-success/25";
  if (
    option.scheduleStatus === "different_branch" ||
    option.scheduleStatus === "outside_shift"
  ) {
    return "bg-warning/10 text-warning ring-warning/30";
  }
  return "bg-muted text-muted-foreground ring-border";
};

export const AssignFloristDialog: FC<{
  order: OrderTableRow;
  onCancel: () => void;
  onAssigned: (order: OrderTableRow) => void;
  mode?: "assign-and-process" | "reassign";
}> = ({ order, onCancel, onAssigned, mode = "assign-and-process" }) => {
  const employees = useHrStore((state) => state.employees);
  const user = useUserStore();
  const actor = {
    employeeId: user.employeeId,
    name: user.name,
    role: user.role,
    branchId: user.branchId,
  };
  const defaults = useHrStore((state) => state.employeeDefaultSchedules);
  const overrides = useHrStore((state) => state.scheduleOverrides);
  const orders = useOrdersStore((state) => state.orders);
  const assignAndProcess = useOrdersStore((state) => state.assignFloristAndStartProcessing);
  const reassignFlorist = useOrdersStore((state) => state.reassignFlorist);
  const scheduling = useSettingsStore(
    (state) => state.getSchedulingSettingsForDate,
  );
  const branches = useSettingsStore((state) => state.branches);
  const moment = resolveFloristAssignmentMoment(order);
  const [selectedId, setSelectedId] = useState(order.floristAssignedEmployeeId ?? "");
  const [showAll, setShowAll] = useState(false);
  const [pendingOverride, setPendingOverride] =
    useState<FloristAssignmentOption | null>(null);

  const options = useMemo(
    () =>
      getFloristAssignmentOptionsForOrder({
        order,
        employees,
        defaults,
        overrides,
        orders,
        settings: { scheduling: scheduling(moment.date), branches },
      }),
    [
      order,
      employees,
      defaults,
      overrides,
      orders,
      scheduling,
      branches,
      moment.date,
    ],
  );

  const scheduled = options.filter((item) => item.isRecommended);
  const visible = showAll
    ? options
    : options.filter(
        (item) =>
          item.isRecommended ||
          (mode === "reassign" && item.employeeId === order.floristAssignedEmployeeId),
      );
  const selected = options.find((item) => item.employeeId === selectedId);

  const assign = (allowScheduleOverride: boolean) => {
    if (!selectedId) return;
    const command = mode === "reassign" ? reassignFlorist : assignAndProcess;
    const result = command({
      orderNumber: order.orderNumber,
      expectedRevision: order.revision ?? 1,
      floristEmployeeId: selectedId,
      allowScheduleOverride,
      actor,
    });
    if (!result.allowed) {
      toast({
        title: "Florist was not assigned",
        description: result.reason,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: mode === "reassign" ? "Assigned florist updated" : `${result.order.orderNumber} moved to Processing`,
      description: allowScheduleOverride
        ? `Assigned to ${result.order.florist} with a schedule override.`
        : `Assigned to ${result.order.florist}.`,
    });
    onAssigned(result.order);
  };

  const confirm = () => {
    if (!selected) return;
    if (!selected.isRecommended) {
      setPendingOverride(selected);
      return;
    }
    assign(false);
  };

  const branchName =
    branches.find((branch) => branch.id === order.branch)?.name ?? order.branch;
  const timing = moment.time
    ? `${moment.date} · ${moment.time}`
    : `${moment.date} · scheduled day`;

  return (
    <>
      <AppDialog
        open
        onOpenChange={(open) => {
          if (!open) onCancel();
        }}
        title={mode === "reassign" ? "Change assigned florist" : "Assign florist"}
        description={mode === "reassign" ? "Choose who should continue handling this order. The current status will not change." : "Scheduled florists are recommended first. Use Show all florists only when an operational exception is necessary."}
        className="shrink-0 border-b border-border/70 px-5 pb-4 pt-5 sm:px-6 sm:pt-6"
        contentClassName="flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[calc(100dvh-3rem)] sm:max-w-lg sm:p-0"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 space-y-4 px-5 py-4 sm:px-6">
            <div className="flex items-start gap-3 rounded-xl bg-surface-panel p-3 ring-1 ring-border/60">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CalendarClock className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold leading-5">
                  {order.orderNumber} · {branchName}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Availability for {timing}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-5">
                  {showAll ? "All active florists" : "Scheduled florists"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {scheduled.length} recommended · {options.length} active
                </p>
              </div>
              {options.length > scheduled.length && (
                <button
                  type="button"
                  onClick={() => setShowAll((value) => !value)}
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-border px-[18px] text-sm font-semibold hover:bg-muted"
                >
                  <Users className="size-4" />
                  {showAll ? "Show scheduled" : "Show all florists"}
                  <ChevronDown
                    className={`size-4 transition ${showAll ? "rotate-180" : ""}`}
                  />
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 sm:px-6">
            {visible.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-5 text-center">
                <UserRoundCheck className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-semibold">
                  No scheduled florist available
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use Show all florists to make a confirmed schedule override, or ask
                  HR/Owner to update the schedule.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {visible.map((florist) => (
                  <label
                    key={florist.employeeId}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl p-3 ring-1 transition ${selectedId === florist.employeeId ? "bg-surface-track text-foreground ring-primary/40" : "bg-surface-card ring-border/70 hover:bg-surface-panel"}`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <input
                        type="radio"
                        name="florist"
                        value={florist.employeeId}
                        checked={selectedId === florist.employeeId}
                        onChange={() => setSelectedId(florist.employeeId)}
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-semibold">
                            {florist.name}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${statusClasses(florist)}`}
                          >
                            {STATUS_LABELS[florist.scheduleStatus]}
                          </span>
                          {mode === "reassign" && florist.employeeId === order.floristAssignedEmployeeId && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-primary/20">
                              Current
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {florist.shiftStart && florist.shiftEnd
                            ? `${florist.branchId} · ${florist.shiftStart}-${florist.shiftEnd}`
                            : florist.scheduleReason}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-surface-neutral px-2.5 py-1 text-xs font-medium text-foreground ring-1 ring-border/80">
                      {florist.assignedProcessingOrders} active
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {selected && !selected.isRecommended && (
            <div className="mx-5 mb-3 flex shrink-0 items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning ring-1 ring-warning/25 sm:mx-6">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>{selected.scheduleReason} Confirmation will be required.</p>
            </div>
          )}

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface-footer px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-5">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-border text-sm font-medium rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedId || (mode === "reassign" && selectedId === order.floristAssignedEmployeeId)}
              onClick={confirm}
              className="rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
            >
              {mode === "reassign" ? "Save florist" : "Assign & start Processing"}
            </button>
          </div>
        </div>
      </AppDialog>

      <ConfirmActionDialog
        open={Boolean(pendingOverride)}
        onOpenChange={(open) => {
          if (!open) setPendingOverride(null);
        }}
        title="Assign outside the schedule?"
        description={
          pendingOverride
            ? `${pendingOverride.name} is not scheduled at this branch and order time. ${pendingOverride.scheduleReason}`
            : ""
        }
        confirmLabel="Assign anyway"
        onConfirm={() => {
          setPendingOverride(null);
          assign(true);
        }}
      />
    </>
  );
};
