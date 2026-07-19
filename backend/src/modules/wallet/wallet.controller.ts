/**
 * Wallet Controller
 * Agent wallet balances and top-up request lifecycle.
 */

import { Response } from 'express';
import pool from '../../db';
import { io } from '../../server';
import { AuthenticatedRequest } from '../../middleware/auth';
import { logAuditEvent } from '../../services/audit.service';
import { buildWaLink } from '../../utils/waLink';
import { buildRechargeMessage } from './rechargeContact';
import { validateAdjust, computeBalanceAfter } from './walletAdjust';
import { deriveTrust } from '../../utils/trust';

/**
 * Get the authenticated Agent's own wallet ledger (Agent)
 */
export async function getMyLedger(req: AuthenticatedRequest, res: Response): Promise<void> {
  const agentId = req.user!.userId;

  try {
    const result = await pool.query(
      `SELECT entry_id, transaction_type, amount, balance_after, description, created_at
       FROM Wallet_Ledger
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [agentId]
    );

    res.json(
      result.rows.map((row) => ({
        entry_id: row.entry_id,
        transaction_type: row.transaction_type,
        amount: parseFloat(row.amount),
        balance_after: parseFloat(row.balance_after),
        notes: row.description,
        created_at: row.created_at,
      }))
    );
  } catch (error) {
    console.error('Error fetching wallet ledger:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * List all pending top-up requests across agents (Admin+)
 */
export async function listPendingTopUps(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT * FROM (
        (
          SELECT t.request_id, t.agent_id, t.requested_amount, t.payment_reference, t.payment_method,
                 t.request_status, t.requested_at, t.reviewed_at, u.full_name AS agent_name, 1 AS sort_order
          FROM TopUp_Requests t
          JOIN Users u ON t.agent_id = u.user_id
          WHERE t.request_status = 'Pending'
         )
         UNION ALL
         (
          SELECT t.request_id, t.agent_id, t.requested_amount, t.payment_reference, t.payment_method,
                 t.request_status, t.requested_at, t.reviewed_at, u.full_name AS agent_name, 2 AS sort_order
          FROM TopUp_Requests t
          JOIN Users u ON t.agent_id = u.user_id
          WHERE t.request_status IN ('Approved', 'Rejected')
          ORDER BY t.reviewed_at DESC
          LIMIT 10
         )
       ) AS combined
       ORDER BY sort_order ASC, COALESCE(requested_at, reviewed_at) DESC`
    );

    res.json(
      result.rows.map((row) => ({
        request_id: row.request_id,
        agent_id: row.agent_id,
        agent_name: row.agent_name,
        amount: parseFloat(row.requested_amount),
        requested_amount: parseFloat(row.requested_amount),
        payment_reference: row.payment_reference,
        payment_method: row.payment_method,
        status: row.request_status,
        request_status: row.request_status,
        requested_at: row.requested_at,
        reviewed_at: row.reviewed_at,
      }))
    );
  } catch (error) {
    console.error('Error listing pending top-ups:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * List all agent wallet balances with any pending top-up requests (Admin+)
 */
export async function listAgentWallets(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const agentsRes = await pool.query(
      `SELECT u.user_id, u.full_name, u.email, u.phone, u.town, u.current_balance, u.status,
              COUNT(b.booking_id) FILTER (WHERE b.booking_status = 'Sold')::INTEGER AS sold_count
       FROM Users u
       LEFT JOIN Bookings b ON b.assigned_agent_id = u.user_id
       WHERE u.role_id = 4
       GROUP BY u.user_id
       ORDER BY u.full_name ASC`
    );

    const pendingRes = await pool.query(
      `SELECT request_id, agent_id, requested_amount, payment_reference, payment_method, requested_at
       FROM TopUp_Requests
       WHERE request_status = 'Pending'
       ORDER BY requested_at ASC`
    );

    const pendingByAgent: Record<string, any[]> = {};
    for (const r of pendingRes.rows) {
      (pendingByAgent[r.agent_id] ||= []).push({
        request_id: r.request_id,
        requested_amount: parseFloat(r.requested_amount),
        payment_reference: r.payment_reference,
        payment_method: r.payment_method,
        requested_at: r.requested_at,
      });
    }

    res.json(
      agentsRes.rows.map((a) => ({
        agent_id: a.user_id,
        full_name: a.full_name,
        email: a.email,
        phone: a.phone,
        town: a.town,
        status: a.status,
        current_balance: parseFloat(a.current_balance),
        trust: deriveTrust(a.sold_count),
        pending_requests: pendingByAgent[a.user_id] || [],
      }))
    );
  } catch (error) {
    console.error('Error listing agent wallets:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Agent submits a wallet top-up request (Agent)
 */
export async function requestTopUp(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { requested_amount, payment_reference, payment_method, proof_screenshot_url } = req.body;
  const agent = req.user!;

  const amount = parseFloat(requested_amount);
  if (!amount || isNaN(amount) || amount <= 0) {
    res.status(400).json({ message: 'requested_amount must be a positive number' });
    return;
  }
  const ref = (payment_reference && String(payment_reference).trim()) ? String(payment_reference).trim() : 'Requested UPI ID';

  try {
    const result = await pool.query(
      `INSERT INTO TopUp_Requests (agent_id, requested_amount, payment_reference, payment_method, proof_screenshot_url, request_status)
       VALUES ($1, $2, $3, $4, $5, 'Pending')
       RETURNING request_id, requested_at`,
      [agent.userId, amount, ref, payment_method || null, proof_screenshot_url || null]
    );

    const request = result.rows[0];

    // Resolve the recharge contact: the Active Admin designated CFO, else an
    // Active Superadmin. Used to redirect the Bookie to that person's WhatsApp.
    const contactRes = await pool.query(
      `SELECT full_name, phone
       FROM Users
       WHERE status = 'Active' AND phone IS NOT NULL AND role_id = 2
       LIMIT 1`
    );
    const configRes = await pool.query(
      `SELECT config_value FROM Platform_Config WHERE config_key = 'bookie_commission_per_ticket'`
    );
    const commPerTicket = parseFloat(configRes.rows[0]?.config_value ?? '10');
    const commission = amount * (commPerTicket / 100);
    const payableAmount = amount - commission;

    let recharge_wa_link: string | null = null;
    if (contactRes.rowCount && contactRes.rows[0].phone) {
      const msg = buildRechargeMessage(agent.fullName, amount, payableAmount, commPerTicket);
      recharge_wa_link = buildWaLink(contactRes.rows[0].phone, msg);
    }

    // Notify staff dashboards (admins listening on socket)
    io.emit('topup_request_received', {
      request_id: request.request_id,
      agent_name: agent.fullName,
      amount,
    });
    io.emit('wallet_update');

    res.status(201).json({
      request_id: request.request_id,
      message: 'Top-up request submitted for approval',
      recharge_wa_link,
    });
  } catch (error) {
    console.error('Error creating top-up request:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Approve a top-up request: credit the agent wallet and record a ledger entry (Admin+)
 */
export async function approveTopUp(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { reviewer_notes } = req.body ?? {};
  const actor = req.user!;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock the request row
    const requestRes = await client.query(
      `SELECT request_id, agent_id, requested_amount, request_status
       FROM TopUp_Requests
       WHERE request_id = $1
       FOR UPDATE`,
      [id]
    );

    if (requestRes.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Top-up request not found' });
      return;
    }

    const request = requestRes.rows[0];
    if (request.request_status !== 'Pending') {
      await client.query('ROLLBACK');
      res.status(400).json({ message: `Request already ${request.request_status}` });
      return;
    }

    const amount = parseFloat(request.requested_amount);

    // 2. Lock and credit the agent's balance
    const agentRes = await client.query(
      `SELECT current_balance FROM Users WHERE user_id = $1 FOR UPDATE`,
      [request.agent_id]
    );
    const newBalance = parseFloat(agentRes.rows[0].current_balance) + amount;

    await client.query(`UPDATE Users SET current_balance = $1 WHERE user_id = $2`, [
      newBalance,
      request.agent_id,
    ]);

    // 3. Record the ledger entry (Credit)
    await client.query(
      `INSERT INTO Wallet_Ledger (agent_id, transaction_type, amount, balance_after, reference_type, reference_id, description, performed_by)
       VALUES ($1, 'Credit', $2, $3, 'TopUp', $4, $5, $6)`,
      [
        request.agent_id,
        amount,
        newBalance,
        request.request_id,
        `Top-up approved by ${actor.fullName}`,
        actor.userId,
      ]
    );

    // 4. Mark the request approved
    await client.query(
      `UPDATE TopUp_Requests
       SET request_status = 'Approved', reviewed_by = $1, reviewed_at = NOW(), reviewer_notes = $2
       WHERE request_id = $3`,
      [actor.userId, reviewer_notes || null, id]
    );

    await client.query('COMMIT');

    // 5. Push wallet update to the agent and staff dashboards in real time
    io.to(`agent-${request.agent_id}`).emit('wallet_credited', {
      new_balance: newBalance,
      amount,
    });
    io.emit('topup_approved', { request_id: id });
    io.emit('wallet_update');

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'APPROVE_TOPUP',
      targetType: 'TopUp_Request',
      targetId: String(id),
      targetDescription: `Credited ₹${amount} to agent ${request.agent_id}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Top-up approved', new_balance: newBalance });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error approving top-up:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * Manual ledger adjustment by the Financial Officer (credit or debit with a
 * mandatory reason). ACID; debits cannot drive the balance negative.
 */
export async function manualAdjust(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { agentId } = req.params;
  const actor = req.user!;

  const v = validateAdjust(req.body ?? {});
  if (!v.ok) {
    res.status(400).json({ message: v.error });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const agentRes = await client.query(
      `SELECT current_balance, role_id FROM Users WHERE user_id = $1 FOR UPDATE`,
      [agentId]
    );
    if ((agentRes.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'Agent not found' });
      return;
    }
    if (agentRes.rows[0].role_id !== 4) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Manual adjustments apply only to Bookie wallets' });
      return;
    }

    const current = parseFloat(agentRes.rows[0].current_balance);
    const calc = computeBalanceAfter(current, v.type!, v.amount!);
    if (!calc.ok) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: calc.error });
      return;
    }

    await client.query(`UPDATE Users SET current_balance = $1 WHERE user_id = $2`, [
      calc.balance_after,
      agentId,
    ]);

    await client.query(
      `INSERT INTO Wallet_Ledger (agent_id, transaction_type, amount, balance_after, reference_type, description, performed_by)
       VALUES ($1, $2, $3, $4, 'Manual', $5, $6)`,
      [agentId, v.type, v.amount, calc.balance_after, v.reason, actor.userId]
    );

    await client.query('COMMIT');

    io.to(`agent-${agentId}`).emit(v.type === 'Credit' ? 'wallet_credited' : 'wallet_debited', {
      new_balance: calc.balance_after,
      amount: v.amount,
    });

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'MANUAL_ADJUST',
      targetType: 'User',
      targetId: String(agentId),
      targetDescription: `${v.type} ₹${v.amount} — ${v.reason}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Adjustment applied', new_balance: calc.balance_after });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error applying manual adjustment:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * Financial HUD aggregates for the FO ribbon.
 */
export async function getFinancialHud(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const [overallCol, overallPay, todayCol, todayPay, monthCol, monthPay, pendingRes] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(total_amount), 0) AS total FROM Bookings WHERE booking_status = 'Sold'`),
      pool.query(`SELECT COALESCE(SUM(prize_amount), 0) AS total FROM Prize_Pool WHERE claimed = TRUE`),
      pool.query(`SELECT COALESCE(SUM(total_amount), 0) AS total FROM Bookings WHERE booking_status = 'Sold' AND confirmed_at >= date_trunc('day', NOW())`),
      pool.query(`SELECT COALESCE(SUM(prize_amount), 0) AS total FROM Prize_Pool WHERE claimed = TRUE AND claimed_at >= date_trunc('day', NOW())`),
      pool.query(`SELECT COALESCE(SUM(total_amount), 0) AS total FROM Bookings WHERE booking_status = 'Sold' AND confirmed_at >= date_trunc('month', NOW())`),
      pool.query(`SELECT COALESCE(SUM(prize_amount), 0) AS total FROM Prize_Pool WHERE claimed = TRUE AND claimed_at >= date_trunc('month', NOW())`),
      pool.query(`SELECT COUNT(*)::INTEGER AS count FROM TopUp_Requests WHERE request_status = 'Pending'`),
    ]);

    const overallProfit = parseFloat(overallCol.rows[0].total) - parseFloat(overallPay.rows[0].total);
    const todayCollection = parseFloat(todayCol.rows[0].total);
    const todayProfit = todayCollection - parseFloat(todayPay.rows[0].total);
    const monthlyProfit = parseFloat(monthCol.rows[0].total) - parseFloat(monthPay.rows[0].total);

    res.json({
      overall_profit: Math.max(0, overallProfit),
      today_collection: todayCollection,
      today_profit: Math.max(0, todayProfit),
      monthly_profit: Math.max(0, monthlyProfit),
      pending_topups: pendingRes.rows[0].count,
    });
  } catch (error) {
    console.error('Error building financial HUD:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Master Bookie Ledger: every bookie with balance, lifetime top-ups, last
 * recharge timestamp, and any pending recharge requests.
 */
export async function getMasterLedger(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const agentsRes = await pool.query(
      `SELECT u.user_id, u.full_name, u.phone, u.town, u.status, u.current_balance,
              COALESCE(SUM(CASE WHEN w.transaction_type = 'Credit' AND w.reference_type = 'TopUp' THEN w.amount END), 0) AS lifetime_topups,
              MAX(CASE WHEN w.transaction_type = 'Credit' AND w.reference_type = 'TopUp' THEN w.created_at END) AS last_recharge_at,
              (SELECT COUNT(*) FROM Bookings b
               WHERE b.assigned_agent_id = u.user_id AND b.booking_status = 'Sold')::INTEGER AS sold_count
       FROM Users u
       LEFT JOIN Wallet_Ledger w ON w.agent_id = u.user_id
       WHERE u.role_id = 4
       GROUP BY u.user_id
       ORDER BY u.full_name ASC`
    );

    const pendingRes = await pool.query(
      `SELECT * FROM (
        (
          SELECT request_id, agent_id, requested_amount, payment_reference, request_status, requested_at, reviewed_at, 1 AS sort_order
          FROM TopUp_Requests
          WHERE request_status = 'Pending'
         )
         UNION ALL
         (
          SELECT request_id, agent_id, requested_amount, payment_reference, request_status, requested_at, reviewed_at, 2 AS sort_order
          FROM TopUp_Requests
          WHERE request_status IN ('Approved', 'Rejected')
          ORDER BY reviewed_at DESC
          LIMIT 10
         )
       ) AS combined
       ORDER BY sort_order ASC, COALESCE(requested_at, reviewed_at) DESC`
    );
    const pendingByAgent: Record<string, any[]> = {};
    for (const r of pendingRes.rows) {
      (pendingByAgent[r.agent_id] ||= []).push({
        request_id: r.request_id,
        requested_amount: parseFloat(r.requested_amount),
        payment_reference: r.payment_reference,
        request_status: r.request_status,
        requested_at: r.requested_at,
        reviewed_at: r.reviewed_at,
      });
    }

    res.json(
      agentsRes.rows.map((a) => ({
        agent_id: a.user_id,
        full_name: a.full_name,
        phone: a.phone,
        town: a.town,
        status: a.status,
        current_balance: parseFloat(a.current_balance),
        lifetime_topups: parseFloat(a.lifetime_topups),
        last_recharge_at: a.last_recharge_at,
        trust: deriveTrust(a.sold_count),
        pending_requests: pendingByAgent[a.user_id] || [],
      }))
    );
  } catch (error) {
    console.error('Error building master ledger:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Reject a top-up request (Admin+)
 */
export async function rejectTopUp(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { reviewer_notes } = req.body ?? {};
  const actor = req.user!;

  try {
    const result = await pool.query(
      `UPDATE TopUp_Requests
       SET request_status = 'Rejected', reviewed_by = $1, reviewed_at = NOW(), reviewer_notes = $2
       WHERE request_id = $3 AND request_status = 'Pending'
       RETURNING request_id, agent_id`,
      [actor.userId, reviewer_notes || null, id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Pending top-up request not found' });
      return;
    }

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'REJECT_TOPUP',
      targetType: 'TopUp_Request',
      targetId: String(id),
      targetDescription: reviewer_notes || 'Top-up request rejected',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    io.emit('topup_rejected', { request_id: id });
    io.emit('wallet_update');

    res.json({ message: 'Top-up request rejected' });
  } catch (error) {
    console.error('Error rejecting top-up:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
