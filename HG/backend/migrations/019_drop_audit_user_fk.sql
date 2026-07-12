-- Migration 019: let staff deletion coexist with the immutable audit trail.
--
-- Audit_Log.user_id referenced Users(user_id), so deleting a staff account was
-- blocked the moment that person had performed any audited action (even just
-- changing their own temp password). ON DELETE SET NULL is not an option:
-- Audit_Log rows are immutable (the no_audit_update trigger raises on any
-- UPDATE or DELETE), so the cascade itself would fail. The log already stores
-- user_name and user_role as plain text, so dropping the FK preserves the
-- trail verbatim while letting history-free accounts be removed.

ALTER TABLE Audit_Log DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey;
