/**
 * WhatsApp Signup OTP — pending-signup storage + delivery.
 *
 * A signup is a two-step handshake: `startSignup` stashes the not-yet-created
 * account (housie name, phone, referral code, a bcrypt-hashed OTP) in Redis
 * under the phone number with a short TTL, then sends the code over WhatsApp.
 * `verifySignupOtp` in player.controller.ts reads it back, and only creates
 * the real Players row once the code matches — so an abandoned signup never
 * squats a Housie Name or burns a player_code, and expiry is just Redis TTL.
 *
 * Delivery is pluggable: real sending needs a Meta WhatsApp Cloud API access
 * token + phone number ID (see env.ts) and a pre-approved "Authentication"
 * message template in Meta Business Manager — neither exists yet, so this
 * currently always falls back to MOCK mode (the code is logged server-side
 * and returned in the API response outside production). Once real
 * credentials are set, sendOtpWhatsApp() switches to actually calling the
 * Graph API with no other code changes required.
 */

import bcrypt from 'bcrypt';
import { redisClient } from '../db/redis';
import { env } from '../config/env';

const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
const RESEND_COOLDOWN_SECONDS = 30;
const MAX_VERIFY_ATTEMPTS = 5;

export interface PendingSignup {
  housieName: string;
  fullName: string | null;
  referralCode: string | null;
  refPromoterId: string | null;
  otpHash: string;
  attempts: number;
  createdAt: number; // epoch ms — used for the resend cooldown
}

function redisKey(phone: string): string {
  return `otp:signup:${phone}`;
}

export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits, never leading-zero-truncated
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

/**
 * Sends the OTP over WhatsApp when real credentials are configured; otherwise
 * logs it server-side as a mock stand-in. Never throws — a delivery failure
 * must not be indistinguishable from "the pending signup was never stored";
 * callers decide whether to surface the dev_otp fallback.
 */
export async function sendOtpWhatsApp(phone: string, otp: string): Promise<{ delivered: boolean }> {
  if (!isWhatsAppConfigured()) {
    console.log(`📲 [MOCK WhatsApp OTP] +91${phone} -> ${otp} (no WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID configured)`);
    return { delivered: false };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: `91${phone}`,
        type: 'template',
        template: {
          name: env.WHATSAPP_OTP_TEMPLATE_NAME,
          language: { code: 'en_US' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: otp }] }],
        },
      }),
    });
    if (!res.ok) {
      console.error('WhatsApp OTP send failed:', res.status, await res.text().catch(() => ''));
      return { delivered: false };
    }
    return { delivered: true };
  } catch (err) {
    console.error('WhatsApp OTP send error:', err);
    return { delivered: false };
  }
}

/**
 * Stores a fresh pending signup for `phone`, replacing any prior attempt.
 * Returns the plaintext OTP (caller sends it, then discards it — only the
 * hash is persisted) or `null` if the caller must wait out the resend
 * cooldown from a still-live previous attempt.
 */
export async function startPendingSignup(
  phone: string,
  data: { housieName: string; fullName: string | null; referralCode: string | null; refPromoterId: string | null }
): Promise<{ otp: string; cooldownSecondsLeft: null } | { otp: null; cooldownSecondsLeft: number }> {
  const existingRaw = await redisClient.get(redisKey(phone));
  if (existingRaw) {
    const existing = JSON.parse(existingRaw) as PendingSignup;
    const elapsed = (Date.now() - existing.createdAt) / 1000;
    if (elapsed < RESEND_COOLDOWN_SECONDS) {
      return { otp: null, cooldownSecondsLeft: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed) };
    }
  }

  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  const pending: PendingSignup = {
    housieName: data.housieName,
    fullName: data.fullName,
    referralCode: data.referralCode,
    refPromoterId: data.refPromoterId,
    otpHash,
    attempts: 0,
    createdAt: Date.now(),
  };
  await redisClient.set(redisKey(phone), JSON.stringify(pending), { EX: OTP_TTL_SECONDS });
  return { otp, cooldownSecondsLeft: null };
}

export async function getPendingSignup(phone: string): Promise<PendingSignup | null> {
  const raw = await redisClient.get(redisKey(phone));
  return raw ? (JSON.parse(raw) as PendingSignup) : null;
}

export async function recordFailedAttempt(phone: string, pending: PendingSignup): Promise<{ attemptsLeft: number }> {
  const attempts = pending.attempts + 1;
  if (attempts >= MAX_VERIFY_ATTEMPTS) {
    await redisClient.del(redisKey(phone));
    return { attemptsLeft: 0 };
  }
  const ttl = await redisClient.ttl(redisKey(phone));
  await redisClient.set(
    redisKey(phone),
    JSON.stringify({ ...pending, attempts } satisfies PendingSignup),
    { EX: ttl > 0 ? ttl : OTP_TTL_SECONDS }
  );
  return { attemptsLeft: MAX_VERIFY_ATTEMPTS - attempts };
}

export async function clearPendingSignup(phone: string): Promise<void> {
  await redisClient.del(redisKey(phone));
}

export { OTP_TTL_SECONDS, MAX_VERIFY_ATTEMPTS };
