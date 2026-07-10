-- Migration: Add password_hash column to Players table
ALTER TABLE Players ADD COLUMN password_hash VARCHAR(255) DEFAULT NULL;
