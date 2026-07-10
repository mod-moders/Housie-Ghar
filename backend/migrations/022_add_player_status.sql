-- Migration 022: Add status to Players table
ALTER TABLE Players ADD COLUMN status VARCHAR(20) DEFAULT 'Active';
