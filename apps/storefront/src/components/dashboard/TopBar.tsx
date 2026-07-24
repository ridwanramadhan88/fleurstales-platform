/**
 * @file TopBar.tsx
 * @description Compact responsive app header with mobile brand/branch context,
 * notifications, profile utilities, and optional contextual search.
 */

import { useLayoutEffect, useState, type FC, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  Bell,
  ChevronDown,
  Flower2,
  LogOut,
  Search,
  Store,
  X,
} from "lucide-react";
import type { BranchFilter } from "../../types/orders";
import type { Theme } from "../../hooks/useTheme";
import { ThemeToggle } from "../ui/theme-toggle";
import { LanguageToggle } from "../ui/language-toggle";
import type { TopBarViewModel } from "./TopBarController";

export interface TopBarProps {
  activeBranch?: BranchFilter;
  onBranchChange?: (branch: BranchFilter) => void;
  onOpenNotifications?: () => void;
  onSignOut?: () => void;
  theme?: Theme;
  onToggleTheme?: () => void;
  showSearch?: boolean;
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
  searchPlaceholder?: string;
  tabletSearchPlaceholder?: string;
  notificationCount?: number;
}


const TopBarSearch: FC<{
  value: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  className?: string;
}> = ({ value, placeholder, onChange, className = "" }) => (
  <div className={`relative min-w-0 ${className}`}>
    <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    <input
      type="search"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      placeholder={placeholder}
      className="h-10 w-full rounded-full border border-border/80 bg-card pl-11 pr-11 text-sm text-foreground outline-none transition placeholder:text-muted-foreground hover:border-border focus:border-foreground/25 focus:ring-2 focus:ring-foreground/10"
    />
    {value.length > 0 && (
      <button
        type="button"
        onClick={() => onChange?.("")}
        aria-label="Clear search"
        className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <X className="size-3.5" />
      </button>
    )}
  </div>
);

export const TopBar: FC<TopBarViewModel> = ({
  activeBranch,
  onOpenNotifications,
  onSignOut,
  theme = "light",
  onToggleTheme,
  searchQuery,
  onSearchQueryChange,
  searchPlaceholder,
  tabletSearchPlaceholder,
  searchEnabled,
  notificationCount = 0,
  today,
  branches,
  userName,
  roleLabel,
  initials,
  canSwitchBranch,
  branchDisplayLabel,
  branchMenuOpen,
  profileMenuOpen,
  branchMenuRef,
  branchMenuPanelRef,
  mobileBranchTriggerRef,
  desktopBranchTriggerRef,
  profileMenuRef,
  onToggleBranchMenu,
  onSelectBranch,
  onToggleProfileMenu,
  onSignOutFromProfile,
}) => (
  <header className="sticky top-0 z-30 border-b border-border/50 bg-background/95 px-4 backdrop-blur-xl sm:px-6 lg:px-6 xl:px-8">
    <div className="grid min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-[minmax(8.5rem,auto)_minmax(12rem,24rem)_auto] md:gap-2 lg:grid-cols-[minmax(9.5rem,auto)_minmax(14rem,28rem)_auto] xl:grid-cols-[minmax(0,1fr)_minmax(20rem,42rem)_minmax(0,1fr)] xl:gap-3">
      <div ref={branchMenuRef} className="flex min-w-0 items-center">
        <div className="flex min-w-0 items-center gap-2.5 md:hidden">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
            <Flower2 className="size-[18px]" strokeWidth={2.35} />
          </div>

          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold leading-tight text-foreground">
              Fleurstales OS
            </p>
            <button
              ref={mobileBranchTriggerRef}
              type="button"
              onClick={onToggleBranchMenu}
              disabled={!canSwitchBranch}
              className={`mt-0.5 flex max-w-[11rem] items-center gap-1 text-left text-xs text-muted-foreground transition ${
                canSwitchBranch ? "hover:text-foreground" : "cursor-default"
              }`}
              aria-haspopup="listbox"
              aria-expanded={branchMenuOpen}
              aria-label={`Branch: ${branchDisplayLabel}`}
            >
              <Store className="size-3.5 shrink-0" />
              <span className="truncate font-medium">{branchDisplayLabel}</span>
              {canSwitchBranch && <ChevronDown className="size-3.5 shrink-0" />}
            </button>
          </div>
        </div>

        <div className="hidden min-w-0 items-center gap-1 md:flex xl:gap-2">
          <span className="shrink-0 text-xs font-medium text-muted-foreground lg:text-sm">{today}</span>
          <button
            ref={desktopBranchTriggerRef}
            type="button"
            onClick={onToggleBranchMenu}
            disabled={!canSwitchBranch}
            className={`inline-flex h-10 min-w-0 items-center gap-1.5 rounded-full px-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 xl:gap-2 xl:px-3 ${
              canSwitchBranch ? "hover:bg-muted/70" : "cursor-default opacity-70"
            }`}
            aria-haspopup="listbox"
            aria-expanded={branchMenuOpen}
          >
            <Store className="size-4 shrink-0" />
            <span className="max-w-20 truncate lg:max-w-28 xl:max-w-40">{branchDisplayLabel}</span>
            {canSwitchBranch && <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />}
          </button>
        </div>
      </div>

      {searchEnabled ? (
        <>
          <TopBarSearch
            value={searchQuery}
            placeholder={tabletSearchPlaceholder ?? searchPlaceholder}
            onChange={onSearchQueryChange}
            className="hidden w-full md:block xl:hidden"
          />
          <TopBarSearch
            value={searchQuery}
            placeholder={searchPlaceholder}
            onChange={onSearchQueryChange}
            className="hidden w-full xl:block"
          />
        </>
      ) : (
        <div className="hidden md:block" aria-hidden="true" />
      )}

      <div className="flex shrink-0 items-center justify-self-end gap-1.5">
        <button
          type="button"
          aria-label={
            notificationCount > 0
              ? `Notifications, ${notificationCount} unread`
              : "Notifications"
          }
          onClick={() => onOpenNotifications?.()}
          className="relative flex size-10 items-center justify-center rounded-full bg-transparent text-foreground transition hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 active:bg-muted"
        >
          <Bell className="size-[18px]" strokeWidth={2.15} />
          {notificationCount > 0 && (
            <span className="absolute right-0 top-0 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-bold text-background ring-2 ring-background">
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          )}
        </button>

        <div className="relative" ref={profileMenuRef}>
          <button
            type="button"
            onClick={onToggleProfileMenu}
            aria-haspopup="menu"
            aria-expanded={profileMenuOpen}
            className="flex h-10 items-center gap-1 rounded-full bg-transparent px-1 transition hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
              {initials}
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>

          {profileMenuOpen && (
            <div className="animate-pop-in absolute right-0 z-40 mt-2 w-52 max-w-[82vw] rounded-xl border border-border/50 bg-surface-popover p-1.5 text-sm text-foreground shadow-lg">
              <div className="px-2.5 py-2">
                <p className="truncate font-semibold">{userName}</p>
                <p className="text-xs text-muted-foreground">{roleLabel}</p>
              </div>
              <div className="mx-2 my-0.5 border-t border-border/50" />
              <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-2.5 py-1.5">
                <span className="text-xs font-medium text-muted-foreground">Language</span>
                <LanguageToggle />
              </div>
              {onToggleTheme && (
                <div className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-2.5 py-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Appearance</span>
                  <ThemeToggle theme={theme} onToggle={onToggleTheme} />
                </div>
              )}
              {onSignOut && (
                <>
                  <div className="mx-2 my-0.5 border-t border-border/50" />
                  <button
                    type="button"
                    onClick={onSignOutFromProfile}
                    className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-destructive transition hover:bg-destructive/8"
                  >
                    <LogOut className="size-4" />
                    Switch role / sign out
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    <BranchMenuPortal
      open={canSwitchBranch && branchMenuOpen}
      activeBranch={activeBranch}
      branches={branches}
      mobileAnchorRef={mobileBranchTriggerRef}
      desktopAnchorRef={desktopBranchTriggerRef}
      panelRef={branchMenuPanelRef}
      onSelectBranch={onSelectBranch}
    />

    {searchEnabled && (
      <TopBarSearch
        value={searchQuery}
        placeholder={searchPlaceholder}
        onChange={onSearchQueryChange}
        className="pb-2 md:hidden"
      />
    )}
  </header>
);

interface BranchMenuPortalProps {
  open: boolean;
  activeBranch: BranchFilter;
  branches: readonly BranchFilter[];
  mobileAnchorRef: RefObject<HTMLButtonElement | null>;
  desktopAnchorRef: RefObject<HTMLButtonElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  onSelectBranch: (branch: BranchFilter) => void;
}

const BranchMenuPortal: FC<BranchMenuPortalProps> = ({
  open,
  activeBranch,
  branches,
  mobileAnchorRef,
  desktopAnchorRef,
  panelRef,
  onSelectBranch,
}) => {
  const [position, setPosition] = useState({ left: 16, top: 64, width: 208 });

  useLayoutEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const mobileAnchor = mobileAnchorRef.current;
      const desktopAnchor = desktopAnchorRef.current;
      const anchor = desktopAnchor?.offsetParent ? desktopAnchor : mobileAnchor;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const width = desktopAnchor?.offsetParent
        ? 208
        : Math.min(208, window.innerWidth - 32);
      const left = Math.min(
        Math.max(16, rect.left),
        Math.max(16, window.innerWidth - width - 16),
      );
      setPosition({ left, top: rect.bottom + 8, width });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [desktopAnchorRef, mobileAnchorRef, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role="listbox"
      aria-label="Branch"
      className="animate-pop-in fixed z-[120] rounded-xl border border-border/60 bg-surface-popover p-1 text-sm text-popover-foreground shadow-lg"
      style={position}
    >
      <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Branch
      </p>
      {branches.map((branch) => (
        <button
          key={branch}
          type="button"
          role="option"
          aria-selected={branch === activeBranch}
          onClick={() => onSelectBranch(branch)}
          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition hover:bg-accent ${
            branch === activeBranch ? "font-semibold text-foreground" : ""
          }`}
        >
          <span className="truncate">{branch}</span>
          {branch === activeBranch && (
            <span className="size-1.5 rounded-full bg-primary" />
          )}
        </button>
      ))}
    </div>,
    document.body,
  );
};

export default TopBar;
