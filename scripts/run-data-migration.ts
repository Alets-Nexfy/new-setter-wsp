import { DataMigrator } from './data-migrator'
import * as path from 'path'
import * as fs from 'fs'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

async function main() {
  console.log('🚀 Starting Firebase to Supabase Data Migration...')
  
  // Get backup directory from command line or use default
  const backupDate = process.argv[2] || new Date().toISOString().split('T')[0]
  const backupDir = path.join(process.cwd(), 'backups', `firebase-backup-${backupDate}`)
  
  console.log(`📁 Using backup directory: ${backupDir}`)
  
  // Verify backup directory exists
  if (!fs.existsSync(backupDir)) {
    console.error(`❌ Backup directory not found: ${backupDir}`)
    console.log('\n💡 Available backups:')
    
    const backupsDir = path.join(process.cwd(), 'backups')
    if (fs.existsSync(backupsDir)) {
      const availableBackups = fs.readdirSync(backupsDir)
        .filter(dir => dir.startsWith('firebase-backup-'))
        .sort()
        .reverse()
      
      if (availableBackups.length > 0) {
        availableBackups.forEach(backup => {
          console.log(`   - ${backup}`)
        })
        console.log(`\n📝 Usage: npm run migrate:data ${availableBackups[0].replace('firebase-backup-', '')}`)
      } else {
        console.log('   No backups found. Run backup first.')
      }
    }
    
    process.exit(1)
  }
  
  // Verify required environment variables
  const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName])
  
  if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`)
    console.log('Please configure Supabase environment variables before running migration.')
    process.exit(1)
  }
  
  console.log('✅ Environment variables verified')
  
  // Check if backup has metadata
  const metadataPath = path.join(backupDir, 'metadata.json')
  if (fs.existsSync(metadataPath)) {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
    console.log(`📊 Backup metadata:`)
    console.log(`   - Date: ${metadata.backupDate}`)
    console.log(`   - Collections: ${metadata.totalCollections}`)
    console.log(`   - Documents: ${metadata.totalDocuments}`)
    console.log(`   - Duration: ${Math.round(metadata.backupDuration / 1000)}s`)
  }
  
  // Confirm migration
  console.log('\n⚠️  WARNING: This will migrate all data to Supabase.')
  console.log('   Make sure you have:')
  console.log('   ✅ Created Supabase project')
  console.log('   ✅ Executed SQL schema files')
  console.log('   ✅ Configured environment variables')
  console.log('   ✅ Tested Supabase connection')
  
  // In a real scenario, you might want to add a confirmation prompt
  // For automation, we'll proceed directly
  
  try {
    const migrator = new DataMigrator(backupDir)
    await migrator.initialize()
    
    console.log('\n🔄 Starting migration process...')
    await migrator.startMigration()
    
    console.log('\n🎉 Data migration completed successfully!')
    console.log('📊 Check DATA_MIGRATION_REPORT.md for detailed results')
    
  } catch (error) {
    console.error('\n💥 Data migration failed:', error)
    
    // Log detailed error for debugging
    const errorLog = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      backupDir,
      environment: {
        hasSupabaseUrl: !!process.env.SUPABASE_URL,
        hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        nodeVersion: process.version
      }
    }
    
    const errorPath = path.join(process.cwd(), 'migration-error.json')
    fs.writeFileSync(errorPath, JSON.stringify(errorLog, null, 2))
    
    console.log(`📝 Error details saved to: migration-error.json`)
    process.exit(1)
  }
}

// Handle process interruption
process.on('SIGINT', () => {
  console.log('\n⚠️  Migration interrupted by user')
  process.exit(1)
})

process.on('uncaughtException', (error) => {
  console.error('\n💥 Uncaught exception during migration:', error)
  process.exit(1)
})

// Run migration
main().catch(console.error)