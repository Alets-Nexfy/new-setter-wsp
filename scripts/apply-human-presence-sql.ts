import { SupabaseService } from '../src/core/services/SupabaseService'
import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'

dotenv.config()

async function applyHumanPresenceSQL() {
  console.log('🔧 Applying Human Presence System SQL to Supabase...\n')
  
  const supabaseService = SupabaseService.getInstance()
  await supabaseService.initialize()
  
  const client = supabaseService.getAdminClient()
  
  try {
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, '..', 'sql', '08_add_human_presence_system.sql')
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8')
    
    // Split SQL into individual statements
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'))
    
    console.log(`📝 Found ${statements.length} SQL statements to execute\n`)
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      
      if (statement.includes('SELECT') && statement.includes('UNION ALL')) {
        // Skip verification queries
        console.log(`⏭️  Skipping verification query ${i + 1}`)
        continue
      }
      
      console.log(`🔄 Executing statement ${i + 1}/${statements.length}...`)
      
      try {
        const { error } = await client.rpc('exec_sql', { sql: statement })
        
        if (error) {
          if (error.message.includes('already exists') || error.message.includes('duplicate')) {
            console.log(`⚠️  Statement ${i + 1}: Already exists (OK)`)
          } else {
            console.error(`❌ Statement ${i + 1} failed:`, error.message)
          }
        } else {
          console.log(`✅ Statement ${i + 1}: Success`)
        }
      } catch (err: any) {
        if (err.message?.includes('already exists')) {
          console.log(`⚠️  Statement ${i + 1}: Already exists (OK)`)
        } else {
          console.error(`❌ Statement ${i + 1} error:`, err.message)
        }
      }
    }
    
    console.log('\n🎉 Human Presence System SQL application completed!')
    
  } catch (error) {
    console.error('💥 Failed to apply SQL:', error)
  }
}

applyHumanPresenceSQL().catch(console.error)