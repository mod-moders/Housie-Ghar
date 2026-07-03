/**
 * Prize Settlement HTTP handlers (Financial Officer only).
 */

import { Response } from 'express';
import pool from '../../db';
import { AuthenticatedRequest } from '../../middleware/auth';
import {
  listSettlements,
  listAgentSettlements,
  settleSettlement,
} from '../../services/settlements.service';
import { findFinanceContact } from '../../services/financeContact';
import { logAuditEvent } from '../../services/audit.service';
import { buildWaLink } from '../../utils/waLink';
import { buildClaimMessage, buildSettleNoticeMessage } from './payoutMessages';
import { logger } from '../../utils/logger';

/** GET /api/settlements?game_id=&status= */
export async function getSettlements(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const gameId = typeof req.query.game_id === 'string' ? req.query.game_id : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const rows = await listSettlements(pool, { gameId, status });
    res.json(
      rows.map((r) => {
        const amount = Number(r.amount);
        // Let the FO jump into the bookie's WhatsApp to coordinate the payout.
        const agent_wa_link = r.agent_phone
          ? buildWaLink(
              r.agent_phone,
              buildSettleNoticeMessage(r.agent_name, r.pattern_name, amount, r.ticket_number, r.winner_housie_name)
            )
          : null;
        return { ...r, amount, agent_wa_link };
      })
    );
  } catch (error) {
    logger.error({ err: error }, 'error listing settlements');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * GET /api/settlements/mine — the authenticated Bookie's own prize ledger.
 * Owed rows come with a prefilled WhatsApp claim link to the Financial
 * Officer, mirroring how wallet recharges are requested.
 */
export async function getMySettlements(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const rows = await listAgentSettlements(pool, req.user!.userId);
    const settlements = rows.map((r) => ({ ...r, amount: Number(r.amount) }));
    const owed = settlements.filter((s) => s.status === 'Owed');
    const total_owed = owed.reduce((sum, s) => sum + s.amount, 0);

    let claim_wa_link: string | null = null;
    if (owed.length > 0) {
      const contact = await findFinanceContact(pool);
      if (contact) {
        claim_wa_link = buildWaLink(contact.phone, buildClaimMessage(req.user!.fullName, owed));
      }
    }

    res.json({ settlements, total_owed, claim_wa_link });
  } catch (error) {
    logger.error({ err: error }, 'error listing agent settlements');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/** GET /api/settlements/pending/count */
export async function getPendingCount(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS count FROM Prize_Settlements WHERE status = 'Owed'`
    );
    res.json({ count: r.rows[0].count });
  } catch (error) {
    logger.error({ err: error }, 'error counting pending settlements');
    res.status(500).json({ message: 'Internal server error' });
  }
}

/** POST /api/settlements/:id/settle */
export async function postSettle(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = String(req.params.id);
  try {
    const result = await settleSettlement(pool, id, req.user!.userId);

    if (result.status === 'not_found') {
      res.status(404).json({ message: 'Settlement not found' });
      return;
    }
    if (result.status === 'already_paid') {
      res.status(409).json({ message: 'Settlement is already paid', settlement: result.settlement });
      return;
    }

    await logAuditEvent({
      userId: req.user!.userId,
      userName: req.user!.fullName,
      userRole: req.user!.roleName,
      action: 'SETTLE_PRIZE',
      targetType: 'Prize_Settlement',
      targetId: id,
      targetDescription: `Paid ${result.settlement.pattern_name} prize of ${result.settlement.amount} to agent ${result.settlement.agent_id}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      message: 'Settlement marked paid and agent credited.',
      settlement: { ...result.settlement, amount: Number(result.settlement.amount) },
      new_balance: result.newBalance,
    });
  } catch (error) {
    logger.error({ err: error }, 'error settling prize');
    res.status(500).json({ message: 'Internal server error' });
  }
}
