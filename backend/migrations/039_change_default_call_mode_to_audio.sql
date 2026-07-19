-- Change default call_mode to 'Audio' for Scheduled_Games
ALTER TABLE Scheduled_Games ALTER COLUMN call_mode SET DEFAULT 'Audio';
UPDATE Scheduled_Games SET call_mode = 'Audio' WHERE call_mode IS NULL OR call_mode = 'TTS';
