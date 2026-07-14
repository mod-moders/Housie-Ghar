/**
 * Maps a staff member's role (and CFO designation) to their profile picture.
 * Source images live in /public/avatars. Returns null for anyone without a
 * role-specific picture (e.g. players), so callers can fall back to the
 * Avatar component's initial-letter rendering.
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
    default:
      return null;
  }
}

/** Direct path to the Bookie avatar, for views that only ever show agents. */
export const BOOKIE_AVATAR = "/avatars/bookie.jpg";
