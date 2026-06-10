-- 013: Add town to Users (staff/agent locality, shown in booking routing and workforce views)
ALTER TABLE Users ADD COLUMN IF NOT EXISTS town VARCHAR(100);
