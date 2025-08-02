#!/bin/bash

echo "🔧 Adding tier column to users table via PostgreSQL direct connection..."

# Use PostgreSQL client directly if available
if command -v psql &> /dev/null; then
    echo "✅ Using psql client"
    PGPASSWORD="bqitfhvaejxcyvjszfom" psql -h db.bqitfhvaejxcyvjszfom.supabase.co -p 5432 -U postgres -d postgres -c "
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS tier VARCHAR(50) NOT NULL DEFAULT 'enterprise_b2b' 
    CHECK (tier IN ('standard', 'professional', 'enterprise', 'enterprise_b2b'));
    
    UPDATE users SET tier = 'enterprise_b2b' WHERE tier IS NULL OR tier = '';
    
    SELECT COUNT(*) as user_count, tier FROM users GROUP BY tier;
    "
else
    echo "❌ psql not available"
    echo "📝 Manual SQL to execute in Supabase SQL Editor:"
    echo ""
    echo "ALTER TABLE users"
    echo "ADD COLUMN IF NOT EXISTS tier VARCHAR(50) NOT NULL DEFAULT 'enterprise_b2b'"
    echo "CHECK (tier IN ('standard', 'professional', 'enterprise', 'enterprise_b2b'));"
    echo ""
    echo "UPDATE users SET tier = 'enterprise_b2b' WHERE tier IS NULL OR tier = '';"
    echo ""
    echo "SELECT COUNT(*) as user_count, tier FROM users GROUP BY tier;"
fi