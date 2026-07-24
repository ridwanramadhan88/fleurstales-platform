import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useUserStore } from "../../store/userStore";
import { useSettingsStore } from "../../store/settingsStore";
import { getBranchFilterOptions } from "../../domain/settings/settingsSelectors";
import type { BranchFilter } from "../../types/orders";
import type { TopBarProps } from "./TopBar";

const getRoleLabel = (
  role: ReturnType<typeof useUserStore.getState>["role"],
) =>
  role === "owner"
    ? "Owner"
    : role === "admin"
      ? "Admin"
      : role === "finance"
        ? "Finance"
        : role === "hr"
          ? "HR"
          : role === "florist"
            ? "Florist"
            : "Florist";

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export interface TopBarViewModel extends TopBarProps {
  activeBranch: BranchFilter;
  showSearch: boolean;
  searchQuery: string;
  searchPlaceholder: string;
  searchEnabled: boolean;
  today: string;
  branches: readonly BranchFilter[];
  userName: string;
  roleLabel: string;
  initials: string;
  canSwitchBranch: boolean;
  branchDisplayLabel: string;
  branchMenuOpen: boolean;
  profileMenuOpen: boolean;
  branchMenuRef: RefObject<HTMLDivElement | null>;
  branchMenuPanelRef: RefObject<HTMLDivElement | null>;
  mobileBranchTriggerRef: RefObject<HTMLButtonElement | null>;
  desktopBranchTriggerRef: RefObject<HTMLButtonElement | null>;
  profileMenuRef: RefObject<HTMLDivElement | null>;
  onToggleBranchMenu: () => void;
  onSelectBranch: (branch: BranchFilter) => void;
  onToggleProfileMenu: () => void;
  onSignOutFromProfile: () => void;
}

export const useTopBarController = ({
  activeBranch = "Kedamaian",
  onBranchChange,
  onSignOut,
  showSearch = false,
  searchQuery = "",
  onSearchQueryChange,
  searchPlaceholder = "Search…",
  ...props
}: TopBarProps): TopBarViewModel => {
  const userName = useUserStore((state) => state.name);
  const userRole = useUserStore((state) => state.role);
  const settingsBranches = useSettingsStore((state) => state.branches);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const branchMenuRef = useRef<HTMLDivElement | null>(null);
  const branchMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const mobileBranchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const desktopBranchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const canSwitchBranch = true;
  const branchDisplayLabel =
    activeBranch === "All" && (userRole === "admin" || userRole === "florist")
      ? "Select branch"
      : activeBranch;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  useEffect(() => {
    if (!branchMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        branchMenuRef.current &&
        !branchMenuRef.current.contains(event.target as Node) &&
        !branchMenuPanelRef.current?.contains(event.target as Node)
      ) {
        setBranchMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setBranchMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [branchMenuOpen]);

  useEffect(() => {
    if (!profileMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileMenuOpen]);

  return {
    ...props,
    activeBranch,
    onBranchChange,
    onSignOut,
    showSearch,
    searchQuery,
    onSearchQueryChange,
    searchPlaceholder,
    searchEnabled: showSearch && Boolean(onSearchQueryChange),
    today,
    branches: getBranchFilterOptions({ branches: settingsBranches }).filter(
      (branch) =>
        userRole === "admin" || userRole === "florist"
          ? branch !== "All"
          : true,
    ),
    userName,
    roleLabel: getRoleLabel(userRole),
    initials: getInitials(userName),
    canSwitchBranch,
    branchDisplayLabel,
    branchMenuOpen,
    profileMenuOpen,
    branchMenuRef,
    branchMenuPanelRef,
    mobileBranchTriggerRef,
    desktopBranchTriggerRef,
    profileMenuRef,
    onToggleBranchMenu: () => setBranchMenuOpen((open) => !open),
    onSelectBranch: (branch) => {
      onBranchChange?.(branch);
      setBranchMenuOpen(false);
    },
    onToggleProfileMenu: () => setProfileMenuOpen((open) => !open),
    onSignOutFromProfile: () => {
      setProfileMenuOpen(false);
      onSignOut?.();
    },
  };
};
