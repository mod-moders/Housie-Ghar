// Single source of truth for staff "doors": which backend role maps to which
// login page, dashboard panel, display label, and dropdown icon. Used by the
// TopNav lock dropdown, the per-role login pages, the panel shell, and the proxy.

export type StaffRoleName = "Superadmin" | "Admin" | "Operator" | "Agent";

// The three roles that have a front-door login screen.
export type DoorRole = "Superadmin" | "Admin" | "Agent";

export const STAFF_DOORS: Record<
  StaffRoleName,
  { panel: string; login: string; label: string; icon: string }
> = {
  Superadmin: { panel: "/staff/superadmin", login: "/staff/superadmin/login", label: "Super Admin", icon: "shield" },
  Admin:      { panel: "/staff/admin",      login: "/staff/admin/login",      label: "Admin",       icon: "users" },
  Agent:      { panel: "/staff/bookie",     login: "/staff/bookie/login",     label: "Bookie",      icon: "wallet" },
  Operator:   { panel: "/staff",            login: "/staff/login",            label: "Operator",    icon: "play" },
};

// Order of doors shown in the TopNav lock dropdown (Operator intentionally excluded).
export const DROPDOWN_DOORS: DoorRole[] = ["Superadmin", "Admin", "Agent"];
