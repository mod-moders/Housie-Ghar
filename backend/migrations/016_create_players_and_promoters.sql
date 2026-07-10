-- Migration 016: Create Players and Promoter Tables

CREATE TABLE IF NOT EXISTS Players (
    player_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(100) NOT NULL,
    housie_name VARCHAR(100) UNIQUE NOT NULL,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Promoter_Referrals (
    referral_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promoter_id UUID NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES Players(player_id) ON DELETE CASCADE,
    referred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(promoter_id, player_id)
);

CREATE TABLE IF NOT EXISTS Promoter_Commissions (
    commission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promoter_id UUID NOT NULL REFERENCES Users(user_id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES Scheduled_Games(game_id) ON DELETE CASCADE,
    booking_id VARCHAR(50) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
