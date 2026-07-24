import { useEffect, useRef, useState, type FC } from "react";
import {
  Database,
  Lock,
  Pencil,
  Save,
  Settings as SettingsIcon,
  X,
} from "lucide-react";
import type { SettingsCenterViewModel } from "./SettingsCenterController";
import type { SettingsSectionId } from "../../types/settings";
import { StoreProfileSettingsPanel } from "./StoreProfileSettingsPanel";
import { BranchSettingsPanel } from "./BranchSettingsPanel";
import { StaffRoleSettingsPanel } from "./StaffRoleSettingsPanel";
import { PermissionMatrixPanel } from "./PermissionMatrixPanel";
import { PaymentMethodSettings } from "./PaymentMethodSettings";
import { AttendanceSettingsPanel } from "./AttendanceSettingsPanel";
import { SchedulingSettingsPanel } from "./SchedulingSettingsPanel";
import { PayrollSettingsPanel } from "./PayrollSettingsPanel";
import { PersistenceHealthPanel } from "./PersistenceHealthPanel";
import { ActionFooter } from "../ui/action-footer";
import { ConfirmActionDialog } from "../ui/confirm-action-dialog";
import { SettingsTabTrack, settingsTabButtonClass } from "./SettingsPrimitives";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";

/**
 * Nav grouping is presentation-only — it doesn't touch the section/edit
 * state machine in SettingsCenterController. The 'Data & Backup' entry is a
 * component-local pseudo-tab (see `dataBackupOpen` state below): it has no
 * saved settings value and no Edit/Save cycle, so it's kept out of
 * SettingsSectionId entirely rather than threaded through the controller.
 */

const SECTION_DESCRIPTIONS: Record<SettingsSectionId, string> = {
  "store-profile":
    "Manage business identity, contact details, and defaults.",
  branches:
    "Manage branch details, operating hours, availability, and delivery settings.",
  "payment-methods":
    "Configure payment accounts, customer instructions, and branch availability.",
  "staff-roles":
    "Manage enabled roles, employee access defaults, and base salaries.",
  permissions:
    "Control section access and detailed feature permissions by role.",
  attendance: "Configure location validation and attendance grace periods.",
  scheduling: "Set company schedules and minimum staffing coverage.",
  payroll: "Configure future payroll cycles, deadlines, and point conversion.",
};

const NAV_GROUPS: { label: string; sections: SettingsSectionId[] }[] = [
  {
    label: "Business",
    sections: ["store-profile", "branches", "payment-methods"],
  },
  {
    label: "People & Access",
    sections: ["staff-roles", "permissions", "attendance"],
  },
  { label: "Operations", sections: ["scheduling", "payroll"] },
];

const CATEGORY_ORDER = [...NAV_GROUPS.map((group) => group.label), "Advanced"];
const VIEW_ORDER: Array<SettingsSectionId | "data-backup"> = [
  ...NAV_GROUPS.flatMap((group) => group.sections),
  "data-backup",
];

const scrollActiveHorizontally = (
  container: HTMLElement | null,
  selector: string,
) => {
  const active = container?.querySelector<HTMLElement>(selector);
  if (!container || !active) return;

  const leftEdge = active.offsetLeft;
  const rightEdge = leftEdge + active.offsetWidth;
  const visibleLeft = container.scrollLeft;
  const visibleRight = visibleLeft + container.clientWidth;
  const inset = 12;

  const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const moveTo = (left: number) => {
    if (typeof container.scrollTo === "function") {
      container.scrollTo({
        left,
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });
      return;
    }
    container.scrollLeft = left;
  };

  if (leftEdge < visibleLeft + inset) {
    moveTo(Math.max(0, leftEdge - inset));
  } else if (rightEdge > visibleRight - inset) {
    moveTo(rightEdge - container.clientWidth + inset);
  }
};

export const SettingsCenter: FC<SettingsCenterViewModel> = ({
  isOwner,
  canEditActiveSection,
  navItems,
  activeSection,
  onSectionChange,
  isEditing,
  isDirty,
  leaveConfirmationOpen,
  validationErrors,
  saveFeedback,
  onEdit,
  onCancel,
  onSave,
  onKeepEditing,
  onDiscardAndLeave,
  onSaveAndLeave,
  onRequestLeave,
  saveConfirmationOpen,
  pendingChangeSummary,
  onConfirmSave,
  onCancelSaveConfirmation,
  storeProfile,
  onUpdateStoreProfile,
  branches,
  onAddBranch,
  onUpdateBranch,
  onSetBranchActive,
  branchImpacts,
  attendance,
  onUpdateAttendance,
  scheduling,
  schedulingEffectiveFrom,
  schedulingChangeReason,
  schedulingRevisions,
  schedulingImpact,
  onSchedulingEffectiveFromChange,
  onSchedulingChangeReasonChange,
  onUpdateScheduling,
  payroll,
  payrollEffectiveFrom,
  payrollChangeReason,
  payrollRevisions,
  payrollMinimumEffectiveDate,
  onPayrollEffectiveFromChange,
  onPayrollChangeReasonChange,
  onUpdatePayroll,
  staffRoles,
  onUpdateStaffRoles,
  staffEmployees,
  staffAccountDraft,
  employeeSalaryDrafts,
  onStartStaffAccountDraft,
  onCancelStaffAccountDraft,
  onUpdateStaffAccountDraft,
  onUpdateEmployeeSalaryDraft,
  permissions,
  actionPermissions,
  permissionImpact,
  onUpdateRoleActionPermission,
  onUpdateRoleSectionAccess,
  paymentMethods,
  onUpdateBankAccount,
  onAddBankAccount,
  onRemoveBankAccount,
  onPaymentInstructionsChange,
}) => {
  const [dataBackupOpen, setDataBackupOpen] = useState(false);
  const categoryForSection = (section: SettingsSectionId) =>
    NAV_GROUPS.find((group) => group.sections.includes(section))?.label ??
    "Business";
  const [mobileCategory, setMobileCategory] = useState(() =>
    categoryForSection(activeSection),
  );
  const navRef = useRef<HTMLElement>(null);
  const categoryRef = useRef<HTMLDivElement>(null);
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("left");

  useEffect(() => {
    setMobileCategory(
      dataBackupOpen ? "Advanced" : categoryForSection(activeSection),
    );
  }, [activeSection, dataBackupOpen]);

  useEffect(() => {
    scrollActiveHorizontally(categoryRef.current, '[data-active="true"]');
  }, [mobileCategory]);

  const setDirectionFromOrder = (
    currentIndex: number,
    nextIndex: number,
  ) => {
    if (nextIndex === currentIndex) return;
    setSlideDirection(nextIndex > currentIndex ? "left" : "right");
  };

  const handleCategoryChange = (label: string) => {
    setDirectionFromOrder(
      CATEGORY_ORDER.indexOf(mobileCategory),
      CATEGORY_ORDER.indexOf(label),
    );
    if (label === "Advanced") {
      onRequestLeave(() => {
        setMobileCategory("Advanced");
        setDataBackupOpen(true);
      });
      return;
    }

    const group = NAV_GROUPS.find((item) => item.label === label);
    const firstAccessibleSection = group?.sections.find((section) =>
      navItems.some((item) => item.id === section && item.available),
    );

    if (!firstAccessibleSection) {
      setMobileCategory(label);
      setDataBackupOpen(false);
      return;
    }

    setDataBackupOpen(false);
    onSectionChange(firstAccessibleSection);
  };

  useEffect(() => {
    scrollActiveHorizontally(navRef.current, '[aria-current="page"]');
  }, [activeSection, dataBackupOpen]);

  useEffect(() => {
    const scrollingElement = document.scrollingElement ?? document.documentElement;
    scrollingElement.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    if (typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [activeSection, dataBackupOpen]);

  if (!isOwner) {
    return (
      <section className="flex flex-col items-center justify-center gap-2 rounded-lg bg-muted px-4 py-10 text-center">
        <Lock className="size-5 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Owner access only</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Settings Center controls core business config and is only visible to
          the Owner role.
        </p>
      </section>
    );
  }

  const validationErrorCount = Object.keys(validationErrors).length;
  const activeSectionLabel = dataBackupOpen
    ? "Data & Backup"
    : (navItems.find((item) => item.id === activeSection)?.label ?? "Settings");

  return (
    <section
      className={`min-w-0 overflow-x-clip pb-2 flex flex-col gap-3 ${isEditing ? "mobile-focus-workflow" : ""}`}
    >
      <header className="mb-2 flex items-center gap-3">
        <span className="inline-flex size-9 items-center justify-center rounded-lg bg-card ring-1 ring-border/70">
          <SettingsIcon className="size-[18px] text-muted-foreground" />
        </span>
        <div>
          <h1 className="text-xl font-semibold leading-tight text-foreground">
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage business, people, and operational defaults.
          </p>
        </div>
      </header>
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
        <SettingsTabTrack
          level="primary"
          ariaLabel="Settings categories"
          trackRef={categoryRef}
          className="scroll-px-2"
        >
          {[...NAV_GROUPS.map((group) => group.label), "Advanced"].map(
            (label) => (
              <button
                key={label}
                type="button"
                onClick={() => handleCategoryChange(label)}
                data-active={mobileCategory === label ? "true" : undefined}
                className={settingsTabButtonClass({
                  active: mobileCategory === label,
                  level: "primary",
                  className: "scroll-mx-2",
                })}
              >
                {label}
              </button>
            ),
          )}
        </SettingsTabTrack>
      </div>
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
        <SettingsTabTrack
          as="nav"
          trackRef={navRef}
          ariaLabel="Settings sections"
          level="secondary"
          className="scroll-px-2"
        >
          {NAV_GROUPS.flatMap((group) =>
            navItems
              .filter((item) => group.sections.includes(item.id))
              .map((item) => {
                const isActive = !dataBackupOpen && activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!item.available}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => {
                      const currentView = dataBackupOpen
                        ? "data-backup"
                        : activeSection;
                      setDirectionFromOrder(
                        VIEW_ORDER.indexOf(currentView),
                        VIEW_ORDER.indexOf(item.id),
                      );
                      setDataBackupOpen(false);
                      onSectionChange(item.id);
                    }}
                    className={`${settingsTabButtonClass({ active: isActive, level: "secondary", className: "scroll-mx-2" })} ${mobileCategory === group.label ? "inline-flex" : "hidden"}`}
                  >
                    <span className="flex items-center gap-2">
                      <span>{item.label}</span>
                      {isActive && isDirty && (
                        <span
                          className="size-1.5 rounded-full bg-current"
                          aria-label="Unsaved changes"
                        />
                      )}
                    </span>
                  </button>
                );
              }),
          )}
          <button
            type="button"
            onClick={() => {
              setDirectionFromOrder(
                VIEW_ORDER.indexOf(activeSection),
                VIEW_ORDER.indexOf("data-backup"),
              );
              onRequestLeave(() => setDataBackupOpen(true));
            }}
            aria-current={dataBackupOpen ? "page" : undefined}
            className={`${settingsTabButtonClass({ active: dataBackupOpen, level: "secondary", className: "scroll-mx-2 gap-2" })} ${mobileCategory === "Advanced" ? "inline-flex" : "hidden"}`}
          >
            <Database className="size-4" /> Data &amp; Backup
          </button>
        </SettingsTabTrack>
      </div>

      <div
        className={`mt-2 min-w-0 flex-1 px-0 py-1 sm:px-1 ${
          !dataBackupOpen && isEditing
            ? "rounded-2xl ring-2 ring-primary/25 ring-offset-4 ring-offset-background"
            : ""
        }`}
      >
        <div
          key={dataBackupOpen ? "data-backup" : activeSection}
          className={
            slideDirection === "left"
              ? "settings-content-slide-left"
              : "settings-content-slide-right"
          }
        >
        {dataBackupOpen ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
              <div>
                <p className="font-display text-sm font-semibold text-foreground">
                  Data &amp; Backup
                </p>
                <p className="text-xs text-muted-foreground">
                  Export, restore, or reset locally stored operational data.
                </p>
              </div>
            </div>
            <PersistenceHealthPanel />
          </>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-2 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-2xl font-semibold leading-tight text-foreground">
                    {activeSectionLabel}
                  </h1>
                  {isEditing && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary ring-1 ring-primary/20">
                      <Pencil className="size-3.5" /> Editing
                    </span>
                  )}
                </div>
                <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
                  {SECTION_DESCRIPTIONS[activeSection]}
                </p>
                {isEditing && (
                  <p className="mt-1.5 text-xs font-medium text-muted-foreground">
                    {isDirty ? "Unsaved changes" : "Make a change to enable saving"}
                  </p>
                )}
              </div>
              {!isEditing ? (
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs font-medium text-muted-foreground">Read-only</span>
                  <button
                    type="button"
                    onClick={onEdit}
                    disabled={!canEditActiveSection}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Pencil className="size-4" /> Edit
                  </button>
                </div>
              ) : (
                <div className="hidden shrink-0 items-center gap-2 sm:flex">
                  <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-background px-[18px] text-sm font-medium text-muted-foreground ring-1 ring-border"
                  >
                    <X className="size-4" /> Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={!isDirty}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-[18px] text-sm font-semibold text-primary-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Save className="size-4" /> Save
                  </button>
                </div>
              )}
            </div>

            {saveFeedback && (
              <div
                role="status"
                className="mb-4 rounded-lg bg-success/10 px-3 py-2 text-xs font-medium text-success ring-1 ring-success/20"
              >
                {saveFeedback} Other Settings sections were not changed.
              </div>
            )}

            {validationErrorCount > 0 && (
              <div
                role="alert"
                className="mb-4 rounded-lg bg-destructive/8 px-3 py-2.5 text-xs text-destructive ring-1 ring-destructive/20"
              >
                <p className="font-semibold">
                  Couldn’t save {activeSectionLabel}
                </p>
                <p className="mt-0.5">
                  Fix {validationErrorCount} highlighted{" "}
                  {validationErrorCount === 1 ? "field" : "fields"}, then save
                  again.
                </p>
              </div>
            )}

            <div
              className={`${isEditing ? "settings-panel-edit" : "settings-panel-view"} space-y-5`}
            >
              {activeSection === "store-profile" && (
                <StoreProfileSettingsPanel
                  isEditing={isEditing}
                  profile={storeProfile}
                  onUpdate={onUpdateStoreProfile}
                  validationErrors={validationErrors}
                />
              )}
              {activeSection === "branches" && (
                <BranchSettingsPanel
                  isEditing={isEditing}
                  branches={branches}
                  onAddBranch={onAddBranch}
                  onUpdateBranch={onUpdateBranch}
                  onSetBranchActive={onSetBranchActive}
                  branchImpacts={branchImpacts}
                  validationErrors={validationErrors}
                />
              )}
              {activeSection === "attendance" && (
                <AttendanceSettingsPanel
                  isEditing={isEditing}
                  settings={attendance}
                  onUpdate={onUpdateAttendance}
                  validationErrors={validationErrors}
                />
              )}
              {activeSection === "scheduling" && (
                <SchedulingSettingsPanel
                  isEditing={isEditing}
                  settings={scheduling}
                  onUpdate={onUpdateScheduling}
                  validationErrors={validationErrors}
                  effectiveFrom={schedulingEffectiveFrom}
                  changeReason={schedulingChangeReason}
                  revisions={schedulingRevisions}
                  impact={schedulingImpact}
                  onEffectiveFromChange={onSchedulingEffectiveFromChange}
                  onChangeReasonChange={onSchedulingChangeReasonChange}
                />
              )}
              {activeSection === "payroll" && (
                <PayrollSettingsPanel
                  isEditing={isEditing}
                  settings={payroll}
                  onUpdate={onUpdatePayroll}
                  validationErrors={validationErrors}
                  effectiveFrom={payrollEffectiveFrom}
                  minimumEffectiveDate={payrollMinimumEffectiveDate}
                  changeReason={payrollChangeReason}
                  revisions={payrollRevisions}
                  onEffectiveFromChange={onPayrollEffectiveFromChange}
                  onChangeReasonChange={onPayrollChangeReasonChange}
                />
              )}
              {activeSection === "staff-roles" && (
                <StaffRoleSettingsPanel
                  isEditing={isEditing}
                  staffRoles={staffRoles}
                  onUpdate={onUpdateStaffRoles}
                  validationErrors={validationErrors}
                  employees={staffEmployees}
                  staffAccountDraft={staffAccountDraft}
                  employeeSalaryDrafts={employeeSalaryDrafts}
                  onStartStaffAccountDraft={onStartStaffAccountDraft}
                  onCancelStaffAccountDraft={onCancelStaffAccountDraft}
                  onUpdateStaffAccountDraft={onUpdateStaffAccountDraft}
                  onUpdateEmployeeSalaryDraft={onUpdateEmployeeSalaryDraft}
                />
              )}
              {activeSection === "permissions" && (
                <PermissionMatrixPanel
                  isEditing={isEditing}
                  permissions={permissions}
                  actionPermissions={actionPermissions}
                  roleEmployeeCounts={permissionImpact}
                  roles={staffRoles.roles}
                  onUpdateActionAccess={onUpdateRoleActionPermission}
                  onUpdateAccess={onUpdateRoleSectionAccess}
                  validationErrors={validationErrors}
                />
              )}
              {activeSection === "payment-methods" && (
                <PaymentMethodSettings
                  isEditing={isEditing}
                  settings={paymentMethods}
                  branches={branches}
                  validationErrors={validationErrors}
                  onUpdateBankAccount={onUpdateBankAccount}
                  onAddBankAccount={onAddBankAccount}
                  onRemoveBankAccount={onRemoveBankAccount}
                  onPaymentInstructionsChange={onPaymentInstructionsChange}
                />
              )}
            </div>

            {isEditing && (
              <div className="sticky bottom-2 z-10 mt-6 rounded-xl border sm:hidden border-border/80 bg-surface-footer p-3 shadow-lg">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">
                      Editing {activeSectionLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isDirty
                        ? "You have unsaved changes."
                        : "Make a change to enable saving."}
                    </p>
                  </div>
                  {isDirty && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full bg-warning"
                      aria-label="Unsaved changes"
                    />
                  )}
                </div>
                <ActionFooter className="pt-0">
                  <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex items-center justify-center text-xs font-medium text-muted-foreground ring-1 ring-border hover:bg-muted rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
                  >
                    <X className="size-3.5" /> Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={!isDirty}
                    className="inline-flex items-center justify-center bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/92 disabled:cursor-not-allowed disabled:opacity-50 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
                  >
                    <Save className="size-3.5" /> Save {activeSectionLabel}
                  </button>
                </ActionFooter>
              </div>
            )}
          </>
        )}
        </div>
      </div>

      <AlertDialog
        open={leaveConfirmationOpen}
        onOpenChange={(open) => {
          if (!open) onKeepEditing();
        }}
      >
        <AlertDialogContent className="sm:max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Save or discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You are editing {activeSectionLabel}. Choose what should happen
              before leaving this section.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-xl bg-info/10 px-4 py-3 text-sm text-foreground ring-1 ring-info/30 dark:bg-info/15 dark:ring-info/40">
            Your current draft has not been saved. Closing this dialog keeps you
            in edit mode.
          </div>
          <AlertDialogFooter className="sm:grid sm:grid-cols-3">
            <AlertDialogCancel onClick={onKeepEditing}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                onDiscardAndLeave();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:justify-self-start"
            >
              Discard &amp; leave
            </AlertDialogAction>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                onSaveAndLeave();
              }}
            >
              Save &amp; continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmActionDialog
        open={saveConfirmationOpen}
        onOpenChange={(open) => {
          if (!open) onCancelSaveConfirmation();
        }}
        title={`Save changes to ${activeSectionLabel}?`}
        description={
          pendingChangeSummary.length > 0
            ? "Review what will change before this is saved."
            : "No values changed."
        }
        confirmLabel="Confirm & save"
        cancelLabel="Keep editing"
        onConfirm={onConfirmSave}
      >
        {pendingChangeSummary.length > 0 && (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg bg-muted px-3 py-2.5 text-xs text-foreground">
            {pendingChangeSummary.map((line, index) => (
              <li key={index} className="flex gap-1.5">
                <span className="mt-0.5 text-muted-foreground">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
      </ConfirmActionDialog>
    </section>
  );
};
