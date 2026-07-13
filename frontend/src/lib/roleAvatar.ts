/**
 * Maps a staff member's role (and CFO designation) to their profile picture.
 * Source images live in /public/avatars (optimised from HG Personnel Logo).
 * Returns null for anyone without a role-specific picture (e.g. players),
 * so callers can fall back to the initial-letter avatar.
 */
export interface RoleAvatarInput {
  role_name?: string | null;
  is_cfo?: boolean | null;
}

export function roleAvatar(u: RoleAvatarInput | null | undefined): string | null {
  if (!u) return null;
  switch (u.role_name) {
    case "Superadmin":
      return "/avatars/superadmin.jpg";
    case "Admin":
      return u.is_cfo ? "/avatars/financial-officer.jpg" : "/avatars/admin.jpg";
    case "Operator":
      return "/avatars/operator.jpg";
    case "Agent": // "Bookie" in the UI
      return "/avatars/bookie.jpg";
    case "Promoter":
      return "/avatars/promoter.jpg";
    default:
      return null;
  }
}

/** Direct path to the Bookie avatar, for views that only ever show agents. */
export const BOOKIE_AVATAR = "/avatars/bookie.jpg";
