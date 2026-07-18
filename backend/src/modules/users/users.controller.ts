/**
 * Users Controller
 * Staff account management (Admin + Superadmin)
 */

import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import pool from '../../db';
import { AuthenticatedRequest } from '../../middleware/auth';
import { logAuditEvent } from '../../services/audit.service';
import { deriveTrust } from '../../utils/trust';

const VALID_ROLE_IDS = new Set([1, 2, 3, 4]);

/**
 * List all staff users with assigned game counts (Admin+)
 */
export async function listUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.full_name, u.email, u.username, u.phone, u.upi_id, u.town, u.status,
              u.current_balance, u.last_login, u.role_id, u.is_cfo, r.role_name,
              (SELECT COUNT(*) FROM Scheduled_Games g WHERE g.operator_id = u.user_id) AS assigned_games_count,
              (SELECT COUNT(*) FROM Bookings b
               WHERE b.assigned_agent_id = u.user_id AND b.booking_status = 'Sold')::INTEGER AS sold_count
       FROM Users u
       JOIN Roles r ON u.role_id = r.role_id
       WHERE u.status <> 'Deleted'
       ORDER BY u.role_id ASC, u.created_at ASC`
    );

    res.json(
      result.rows.map((row) => ({
        user_id: row.user_id,
        full_name: row.full_name,
        role_name: row.role_name,
        role_id: row.role_id,
        is_cfo: row.is_cfo === true,
        email: row.email,
        username: row.username,
        phone: row.phone,
        upi_id: row.upi_id,
        town: row.town,
        status: row.status,
        current_balance: parseFloat(row.current_balance),
        assigned_games_count: parseInt(row.assigned_games_count, 10),
        trust: row.role_id === 4 ? deriveTrust(row.sold_count) : null,
        last_login: row.last_login,
      }))
    );
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Create a new staff account (Financial Admin+)
 * Financial Admins may create Operators and Bookies; only a Superadmin may create Financial Admins.
 */
export async function createUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { full_name, username, email, phone, upi_id, town, role_id, password } = req.body;
  const actor = req.user!;

  const targetUsername = (username || email || '').toLowerCase().trim();
  const targetEmail = email && email.includes('@') ? email.toLowerCase().trim() : null;

  if (!targetUsername || !role_id || !password) {
    res.status(400).json({ message: 'username, role_id and password are required' });
    return;
  }

  if (!VALID_ROLE_IDS.has(Number(role_id))) {
    res.status(400).json({ message: 'Invalid role_id' });
    return;
  }

  // Only a Superadmin may create Financial Admins or other Superadmins
  if (Number(role_id) <= 2 && actor.roleName !== 'Superadmin') {
    res.status(403).json({ message: 'Only a Superadmin can create Financial Admin or Superadmin accounts' });
    return;
  }

  if (typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ message: 'Password must be at least 6 characters' });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO Users (role_id, full_name, username, email, phone, upi_id, town, password_hash, temp_password_required, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, 'Active', $9)
       RETURNING user_id, full_name, username, email, role_id, status`,
      [
        Number(role_id),
        full_name ? full_name.trim() : targetUsername,
        targetUsername,
        targetEmail,
        phone || null,
        upi_id || null,
        town || null,
        passwordHash,
        actor.userId,
      ]
    );

    const created = result.rows[0];

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'CREATE_USER',
      targetType: 'User',
      targetId: created.user_id,
      targetDescription: `Created ${full_name} (role_id ${role_id})`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ user_id: created.user_id, message: 'User created successfully' });
  } catch (error: any) {
    if (error.code === '23505') {
      const detail = error.detail || '';
      if (detail.includes('username')) {
        res.status(409).json({ message: 'A user with this username already exists' });
      } else if (detail.includes('email')) {
        res.status(409).json({ message: 'A user with this email already exists' });
      } else {
        res.status(409).json({ message: 'A user with this phone already exists' });
      }
      return;
    }
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Admin-initiated password reset (Financial Admin or Superadmin).
 *
 * Recovers a staff account whose stored hash no longer matches any known
 * password — e.g. an account locked out after the legacy auth backdoor was
 * removed and its stale/malformed hash now correctly fails closed at login.
 * Sets a fresh bcrypt hash and forces a change on next login. `updateUser`
 * deliberately never touches passwords, so this is the only admin reset path.
 *
 * Guard rails:
 *   - A Financial Admin may NOT reset a Superadmin's password (privilege
 *     escalation); only a Superadmin can reset another Superadmin.
 *   - Deleted accounts cannot be reset.
 *   - The plaintext is never returned in the response body.
 */
export async function resetUserPassword(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { new_password } = req.body;
  const actor = req.user!;

  if (typeof new_password !== 'string' || new_password.length < 6) {
    res.status(400).json({ message: 'New password must be at least 6 characters' });
    return;
  }

  try {
    const targetRes = await pool.query(
      `SELECT u.user_id, u.full_name, u.status, u.role_id, r.role_name
       FROM Users u JOIN Roles r ON u.role_id = r.role_id
       WHERE u.user_id = $1`,
      [id]
    );

    if (targetRes.rowCount === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const target = targetRes.rows[0];

    if (target.status === 'Deleted') {
      res.status(400).json({ message: 'Cannot reset the password of a deleted account' });
      return;
    }

    // Privilege-escalation guard: only a Superadmin may reset a Superadmin.
    if (target.role_name === 'Superadmin' && actor.roleName !== 'Superadmin') {
      res.status(403).json({ message: 'Only a Superadmin can reset a Superadmin password' });
      return;
    }

    const newHash = await bcrypt.hash(new_password, 12);
    await pool.query(
      `UPDATE Users
       SET password_hash = $1, temp_password_required = TRUE
       WHERE user_id = $2`,
      [newHash, id]
    );

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'RESET_USER_PASSWORD',
      targetType: 'User',
      targetId: String(id),
      targetDescription: `Reset password for ${target.full_name}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting user password:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Update / suspend / reactivate a staff account (Admin+)
 */
export async function updateUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { full_name, phone, upi_id, town, status } = req.body;
  const actor = req.user!;

  if (status && !['Active', 'Suspended'].includes(status)) {
    res.status(400).json({ message: "status must be 'Active' or 'Suspended'" });
    return;
  }

  // Guard: a user cannot suspend their own account
  if (status === 'Suspended' && id === actor.userId) {
    res.status(400).json({ message: 'You cannot suspend your own account' });
    return;
  }

  try {
    const existing = await pool.query(
      `SELECT u.user_id, u.full_name, u.role_id, r.role_name
       FROM Users u JOIN Roles r ON u.role_id = r.role_id
       WHERE u.user_id = $1`,
      [id]
    );

    if (existing.rowCount === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const target = existing.rows[0];

    // A Financial Admin may not modify a Superadmin or another Financial Admin
    if (actor.roleName === 'Financial Admin' && target.role_id <= 2) {
      res.status(403).json({ message: 'Financial Admins cannot modify Financial Admin or Superadmin accounts' });
      return;
    }

    const result = await pool.query(
      `UPDATE Users
       SET full_name = COALESCE($1, full_name),
           phone     = COALESCE($2, phone),
           upi_id    = COALESCE($3, upi_id),
           town      = COALESCE($4, town),
           status    = COALESCE($5, status)
       WHERE user_id = $6
       RETURNING user_id, full_name, status`,
      [full_name ?? null, phone ?? null, upi_id ?? null, town ?? null, status ?? null, id]
    );

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: status ? `SET_USER_STATUS_${status.toUpperCase()}` : 'UPDATE_USER',
      targetType: 'User',
      targetId: String(id),
      targetDescription: `Updated ${target.full_name}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ user: result.rows[0], message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Delete a staff account (Superadmin only).
 * Superadmin cannot delete themselves or other Superadmins.
 */
export async function deleteUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const actor = req.user!;

  try {
    const existing = await pool.query(
      `SELECT u.user_id, u.full_name, u.role_id, r.role_name, u.username, u.email, u.phone
       FROM Users u JOIN Roles r ON u.role_id = r.role_id
       WHERE u.user_id = $1`,
      [id]
    );

    if (existing.rowCount === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const target = existing.rows[0];

    // Superadmin cannot delete themselves
    if (id === actor.userId) {
      res.status(400).json({ message: 'You cannot delete your own account' });
      return;
    }

    // Financial Admin can only delete Operator and Bookie accounts
    if (actor.roleName === 'Financial Admin') {
      if (target.role_id <= 2) {
        res.status(403).json({ message: 'Financial Admin can only delete Operator and Bookie accounts' });
        return;
      }
    }

    // Cannot delete Superadmins
    if (target.role_id === 1) {
      res.status(403).json({ message: 'Cannot delete Superadmin accounts' });
      return;
    }

    // Try hard delete first
    try {
      await pool.query(`DELETE FROM Users WHERE user_id = $1`, [id]);
    } catch (dbError: any) {
      // If we got foreign key violation (err code 23503), do a clean soft delete!
      if (dbError.code === '23503') {
        const newUsername = `${target.username.substring(0, 200)}_deleted_${id}`;

        await pool.query(
          `UPDATE Users 
           SET status = 'Deleted', 
               username = $1, 
               email = NULL, 
               phone = NULL,
               password_hash = 'DELETED_ACCOUNT_DISABLED_HASH'
           WHERE user_id = $2`,
          [newUsername, id]
        );
      } else {
        throw dbError; // Rethrow other database errors
      }
    }

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: 'DELETE_USER',
      targetType: 'User',
      targetId: String(id),
      targetDescription: `Deleted ${target.full_name} (role_id ${target.role_id})`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Designate (or revoke) an Admin as the Financial Officer (Superadmin only).
 * Single-FO model: designating one Admin clears the flag from every other.
 */
export async function designateCfo(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const actor = req.user!;
  const makeCfo = req.body?.is_cfo !== false; // default: designate

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const target = await client.query(
      `SELECT user_id, full_name, role_id FROM Users WHERE user_id = $1 FOR UPDATE`,
      [id]
    );
    if (target.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ message: 'User not found' });
      return;
    }
    if (target.rows[0].role_id !== 2) {
      await client.query('ROLLBACK');
      res.status(400).json({ message: 'Only a Financial Admin can be designated as Financial Officer' });
      return;
    }

    if (makeCfo) {
      await client.query(`UPDATE Users SET is_cfo = FALSE WHERE is_cfo = TRUE AND user_id <> $1`, [id]);
      await client.query(`UPDATE Users SET is_cfo = TRUE WHERE user_id = $1`, [id]);
    } else {
      await client.query(`UPDATE Users SET is_cfo = FALSE WHERE user_id = $1`, [id]);
    }

    await client.query('COMMIT');

    await logAuditEvent({
      userId: actor.userId,
      userName: actor.fullName,
      userRole: actor.roleName,
      action: makeCfo ? 'DESIGNATE_CFO' : 'REVOKE_CFO',
      targetType: 'User',
      targetId: String(id),
      targetDescription: `${makeCfo ? 'Designated' : 'Revoked'} ${target.rows[0].full_name} as Financial Officer`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      message: makeCfo
        ? `${target.rows[0].full_name} is now the Financial Officer`
        : `${target.rows[0].full_name} is no longer the Financial Officer`,
      is_cfo: makeCfo,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error designating CFO:', error);
    res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * Get active staff for overflow queue settings (Superadmin only)
 */
export async function getOverflowSettings(req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.full_name, u.receive_overflow, r.role_name
       FROM Users u JOIN Roles r ON u.role_id = r.role_id
       WHERE u.role_id IN (1, 2, 3) AND u.status = 'Active'
       ORDER BY u.role_id ASC, u.full_name ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching overflow settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Update staff overflow setting (Superadmin only)
 */
export async function updateOverflowSettings(req: Request, res: Response): Promise<void> {
  const { user_id } = req.params;
  const { receive_overflow } = req.body;

  if (typeof receive_overflow !== 'boolean') {
    res.status(400).json({ message: 'receive_overflow must be a boolean' });
    return;
  }

  try {
    const target = await pool.query(`SELECT user_id, full_name FROM Users WHERE user_id = $1`, [user_id]);
    if (target.rowCount === 0) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    await pool.query(
      `UPDATE Users SET receive_overflow = $1 WHERE user_id = $2`,
      [receive_overflow, user_id]
    );

    res.json({ message: 'Overflow setting updated successfully' });
  } catch (error) {
    console.error('Error updating overflow setting:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Submit a Bookie Application (Public)
 */
export async function createBookieApplication(req: Request, res: Response): Promise<void> {
  const { full_name, nationality, date_of_birth, gender, phone, email, occupation } = req.body;

  if (!full_name || !nationality || !date_of_birth || !gender || !phone || !email || !occupation) {
    res.status(400).json({ message: 'All fields are required' });
    return;
  }

  try {
    await pool.query(
      `INSERT INTO Bookie_Applications (full_name, nationality, date_of_birth, gender, phone, email, occupation)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        full_name.trim(),
        nationality.trim(),
        date_of_birth,
        gender.trim(),
        phone.trim(),
        email.trim().toLowerCase(),
        occupation.trim()
      ]
    );

    res.json({ message: 'Application submitted successfully! Our team will contact you on WhatsApp shortly.' });
  } catch (error: any) {
    console.error('Error submitting bookie application:', error);
    res.status(500).json({ message: 'Failed to submit application. Please try again.' });
  }
}

/**
 * Get all Bookies with Stats and Wallet Info (Superadmin only)
 */
export async function listBookiesStats(req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT 
         u.user_id, u.full_name, u.phone, u.email, u.upi_id, u.town, u.status, u.current_balance, u.receive_overflow, u.temp_password_required,
         (SELECT COUNT(*)::int FROM Bookings b WHERE b.assigned_agent_id = u.user_id AND b.booking_status = 'Sold') as confirmed_bookings,
         (SELECT COUNT(*)::int FROM Bookings b WHERE b.assigned_agent_id = u.user_id AND b.booking_status = 'Cancelled') as cancelled_bookings,
         (SELECT COUNT(*)::int FROM Wallet_Ledger l WHERE l.agent_id = u.user_id AND l.transaction_type = 'Credit') as credit_transactions_count,
         (SELECT COALESCE(SUM(amount), 0)::float FROM Wallet_Ledger l WHERE l.agent_id = u.user_id AND l.transaction_type = 'Credit') as credit_transactions_amount
       FROM Users u
       WHERE u.role_id = 4 AND u.status <> 'Deleted'
       ORDER BY u.full_name ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bookies stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Toggle bookie game bookings routing (Superadmin only)
 */
export async function updateBookieReceiveBookings(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { receive_overflow } = req.body;

  if (typeof receive_overflow !== 'boolean') {
    res.status(400).json({ message: 'receive_overflow must be a boolean' });
    return;
  }

  try {
    await pool.query(
      `UPDATE Users SET receive_overflow = $1 WHERE user_id = $2 AND role_id = 4`,
      [receive_overflow, id]
    );
    res.json({ message: 'Bookie routing status updated successfully' });
  } catch (error) {
    console.error('Error updating bookie receive bookings setting:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Get all Bookie Applications (Superadmin only)
 */
export async function getBookieApplications(req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT application_id, full_name, nationality, date_of_birth, gender, phone, email, occupation, status, created_at
       FROM Bookie_Applications
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bookie applications:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Update Bookie Application Status (Superadmin only)
 */
export async function updateBookieApplicationStatus(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !['Pending', 'Approved', 'Rejected'].includes(status)) {
    res.status(400).json({ message: "Status must be 'Pending', 'Approved', or 'Rejected'" });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE Bookie_Applications SET status = $1 WHERE application_id = $2 RETURNING *`,
      [status, id]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ message: 'Application not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating application status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

/**
 * Get personal stats for authenticated Bookie
 */
export async function getBookiePersonalStats(req: any, res: Response): Promise<void> {
  const agentId = req.user.userId;

  try {
    // 1. Total recharged sum
    const rechargedRes = await pool.query(
      `SELECT COALESCE(SUM(amount), 0)::float as total_recharged
       FROM Wallet_Ledger
       WHERE agent_id = $1 AND transaction_type = 'Credit'`,
      [agentId]
    );
    const totalRecharged = rechargedRes.rows[0].total_recharged;

    // 2. Recent recharge
    const recentRes = await pool.query(
      `SELECT amount::float, created_at
       FROM Wallet_Ledger
       WHERE agent_id = $1 AND transaction_type = 'Credit'
       ORDER BY created_at DESC
       LIMIT 1`,
      [agentId]
    );
    const recentRechargeAmount = recentRes.rows[0]?.amount ?? 0;
    const recentRechargeDate = recentRes.rows[0]?.created_at ?? null;

    // 3. Total tickets sold and overall sales volume
    const salesRes = await pool.query(
      `SELECT COALESCE(SUM(cardinality(ticket_ids)), 0)::int as total_tickets_sold,
              COALESCE(SUM(total_amount), 0)::float as total_sales_volume
       FROM Bookings
       WHERE assigned_agent_id = $1 AND booking_status = 'Sold'`,
      [agentId]
    );
    const totalTicketsSold = salesRes.rows[0].total_tickets_sold;
    const totalSalesVolume = salesRes.rows[0].total_sales_volume;

    // 4. Player wins facilitated
    const winsRes = await pool.query(
      `SELECT COUNT(*)::int as total_wins
       FROM Prize_Pool pp
       JOIN Tickets t ON pp.winner_ticket_id = t.ticket_id
       JOIN Bookings b ON t.locked_by_booking = b.booking_id
       WHERE b.assigned_agent_id = $1 AND pp.claimed = TRUE`,
      [agentId]
    );
    const totalWins = winsRes.rows[0].total_wins;

    // 5. Daily, Weekly, Monthly sales volume
    const todayRes = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0)::float as today_sales
       FROM Bookings
       WHERE assigned_agent_id = $1 AND booking_status = 'Sold' AND confirmed_at >= NOW() - INTERVAL '1 day'`,
      [agentId]
    );
    const weeklyRes = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0)::float as weekly_sales
       FROM Bookings
       WHERE assigned_agent_id = $1 AND booking_status = 'Sold' AND confirmed_at >= NOW() - INTERVAL '7 days'`,
      [agentId]
    );
    const monthlyRes = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0)::float as monthly_sales
       FROM Bookings
       WHERE assigned_agent_id = $1 AND booking_status = 'Sold' AND confirmed_at >= NOW() - INTERVAL '30 days'`,
      [agentId]
    );

    const todaySales = todayRes.rows[0].today_sales;
    const weeklySales = weeklyRes.rows[0].weekly_sales;
    const monthlySales = monthlyRes.rows[0].monthly_sales;

    res.json({
      total_recharged: totalRecharged,
      recent_recharge_amount: recentRechargeAmount,
      recent_recharge_date: recentRechargeDate,
      total_tickets_sold: totalTicketsSold,
      total_sales_volume: totalSalesVolume,
      total_wins: totalWins,
      profit_overall: totalSalesVolume * 0.10,
      profit_today: todaySales * 0.10,
      profit_weekly: weeklySales * 0.10,
      profit_monthly: monthlySales * 0.10
    });
  } catch (error) {
    console.error('Error fetching bookie personal stats:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}
