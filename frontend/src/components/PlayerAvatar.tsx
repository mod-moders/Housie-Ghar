"use client";

/**
 * Renders whatever `Players.avatar_url` happens to hold. The column is a single
 * free-form string with three distinct shapes, so every surface that draws a
 * player has to branch the same way:
 *   - a `data:` URI  — an image the player uploaded from their device
 *   - any other text — one of the AVATAR_PRESETS emoji
 *   - empty/null     — no avatar chosen; fall back to the first letter of the name
 * It lived inline on the profile page only, which is why the nav bar kept
 * showing an initial after a picture was set. One component, one branch.
 */

const IMAGE_URL = /^(data:|https?:\/\/|\/)/i;

export function PlayerAvatar({
  avatar,
  name,
  className,
}: {
  avatar?: string | null;
  name?: string | null;
  className?: string;
}) {
  const value = (avatar ?? "").trim();

  if (IMAGE_URL.test(value)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={value} alt="" className={className ? `${className} hg-avatar-img` : "hg-avatar-img"} />
    );
  }

  if (value) {
    return <span className={className ? `${className} hg-avatar-emoji` : "hg-avatar-emoji"}>{value}</span>;
  }

  // Array.from, not [0]: a name starting with an astral character (an emoji
  // housie name) would otherwise be sliced into half a surrogate pair.
  const initial = Array.from((name ?? "").trim())[0] ?? "?";
  return (
    <span className={className ? `${className} hg-avatar-initial` : "hg-avatar-initial"}>{initial}</span>
  );
}
