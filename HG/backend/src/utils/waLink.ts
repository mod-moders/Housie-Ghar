/**
 * Build a wa.me deep link. Strips formatting from the phone (keeps digits and +),
 * URL-encodes the prefilled message. Callers compose their own message.
 */
export function buildWaLink(phone: string, message: string): string {
  const formattedPhone = phone.replace(/[^0-9+]/g, '');
  return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
}
