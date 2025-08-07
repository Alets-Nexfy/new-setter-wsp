require('dotenv').config();
const { Pool } = require('pg');

// Parse DATABASE_URL to get connection details
// Use the direct PostgreSQL connection string format for Supabase
const connectionString = process.env.SUPABASE_DB_URL || 
  `postgresql://postgres:[password]@db.bqitfhvaejxcyvjszfom.supabase.co:5432/postgres`;

// If still no connection string, construct from Supabase URL
if (!connectionString.startsWith('postgresql://')) {
  console.log('Using Supabase REST API instead...');
  process.exit(0);
}

if (!connectionString) {
  console.error('No database connection string found');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function checkColumns() {
  try {
    // Check table structure
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'qr_codes' 
      ORDER BY ordinal_position
    `);
    
    console.log('QR Codes table columns:');
    result.rows.forEach(row => {
      console.log(`- ${row.column_name}: ${row.data_type}`);
    });
    
    // Check if functions exist
    const funcs = await pool.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_name IN ('insert_qr_code', 'get_latest_qr_code')
    `);
    
    console.log('\nExisting functions:');
    funcs.rows.forEach(row => {
      console.log(`- ${row.routine_name}`);
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

checkColumns();