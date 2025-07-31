import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as path from 'path'
import { DatabaseService } from '../src/core/services/DatabaseService'

interface BackupProgress {
  totalCollections: number
  completedCollections: number
  totalDocuments: number
  completedDocuments: number
  currentCollection: string
  startTime: Date
}

class FirebaseBackupService {
  private db: admin.firestore.Firestore
  private backupDir: string
  private progress: BackupProgress

  constructor() {
    this.backupDir = path.join(process.cwd(), 'backups', `firebase-backup-${new Date().toISOString().split('T')[0]}`)
    this.progress = {
      totalCollections: 0,
      completedCollections: 0,
      totalDocuments: 0,
      completedDocuments: 0,
      currentCollection: '',
      startTime: new Date()
    }
  }

  async initialize() {
    console.log('🔧 Initializing Firebase backup service...')
    
    const dbService = DatabaseService.getInstance()
    await dbService.initialize()
    this.db = dbService.getFirestore()
    
    // Create backup directory
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true })
    }
    
    console.log(`📁 Backup directory: ${this.backupDir}`)
  }

  async startCompleteBackup() {
    console.log('🚀 Starting complete Firebase backup...')
    
    try {
      // 1. Backup main collections
      await this.backupMainCollections()
      
      // 2. Backup user subcollections
      await this.backupUserSubcollections()
      
      // 3. Create backup metadata
      await this.createBackupMetadata()
      
      // 4. Generate backup report
      await this.generateBackupReport()
      
      console.log('✅ Complete Firebase backup finished successfully!')
      
    } catch (error) {
      console.error('❌ Backup failed:', error)
      throw error
    }
  }

  private async backupMainCollections() {
    console.log('📦 Backing up main collections...')
    
    const mainCollections = [
      'users',
      'sessions', 
      'messages',
      'kanban_boards',
      'kanban_columns',
      'kanban_cards',
      'notifications',
      'firebaseFunctions'
    ]

    for (const collectionName of mainCollections) {
      await this.backupCollection(collectionName)
    }
  }

  private async backupUserSubcollections() {
    console.log('👥 Backing up user subcollections...')
    
    // Get all users first
    const usersSnapshot = await this.db.collection('users').get()
    console.log(`Found ${usersSnapshot.size} users to backup subcollections`)

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id
      console.log(`📋 Backing up subcollections for user: ${userId}`)
      
      const subcollections = [
        'chats',
        'agents', 
        'rules',
        'action_flows',
        'initial_triggers',
        'gemini_starters',
        'status',
        'rule_executions',
        'flow_executions',
        'ai_responses',
        'instagram_chats'
      ]

      for (const subcollectionName of subcollections) {
        const subcollectionPath = `users/${userId}/${subcollectionName}`
        await this.backupCollection(subcollectionPath, `user_${userId}_${subcollectionName}`)
        
        // Backup chat messages if it's a chats subcollection
        if (subcollectionName === 'chats') {
          await this.backupChatMessages(userId)
        }
      }
    }
  }

  private async backupChatMessages(userId: string) {
    console.log(`💬 Backing up chat messages for user: ${userId}`)
    
    const chatsSnapshot = await this.db.collection(`users/${userId}/chats`).get()
    
    for (const chatDoc of chatsSnapshot.docs) {
      const chatId = chatDoc.id
      
      const messageCollections = [
        'messages',
        'messages_contact', 
        'messages_all',
        'messages_human',
        'messages_bot'
      ]

      for (const messageCollection of messageCollections) {
        const messagePath = `users/${userId}/chats/${chatId}/${messageCollection}`
        const backupFileName = `user_${userId}_chat_${chatId}_${messageCollection}`
        await this.backupCollection(messagePath, backupFileName)
      }
    }
  }

  private async backupCollection(collectionPath: string, backupFileName?: string) {
    this.progress.currentCollection = collectionPath
    const fileName = backupFileName || collectionPath.replace(/\//g, '_')
    
    try {
      console.log(`📄 Backing up collection: ${collectionPath}`)
      
      const snapshot = await this.db.collection(collectionPath).get()
      
      if (snapshot.empty) {
        console.log(`⚠️  Collection ${collectionPath} is empty, skipping...`)
        return
      }

      const documents = []
      let docCount = 0

      for (const doc of snapshot.docs) {
        const data = doc.data()
        
        // Convert Firestore Timestamps to ISO strings
        const convertedData = this.convertFirestoreData(data)
        
        documents.push({
          id: doc.id,
          data: convertedData,
          path: collectionPath
        })
        
        docCount++
        this.progress.completedDocuments++
      }

      // Save to JSON file
      const backupPath = path.join(this.backupDir, `${fileName}.json`)
      fs.writeFileSync(backupPath, JSON.stringify(documents, null, 2))
      
      console.log(`✅ Backed up ${docCount} documents from ${collectionPath}`)
      this.progress.completedCollections++
      
    } catch (error) {
      console.error(`❌ Failed to backup collection ${collectionPath}:`, error)
      
      // Create error log
      const errorLog = {
        collection: collectionPath,
        error: error.message,
        timestamp: new Date().toISOString()
      }
      
      const errorPath = path.join(this.backupDir, 'errors.json')
      let errors = []
      
      if (fs.existsSync(errorPath)) {
        errors = JSON.parse(fs.readFileSync(errorPath, 'utf8'))
      }
      
      errors.push(errorLog)
      fs.writeFileSync(errorPath, JSON.stringify(errors, null, 2))
    }
  }

  private convertFirestoreData(data: any): any {
    if (data === null || data === undefined) {
      return data
    }

    if (data instanceof admin.firestore.Timestamp) {
      return data.toDate().toISOString()
    }

    if (data instanceof admin.firestore.GeoPoint) {
      return {
        _type: 'GeoPoint',
        latitude: data.latitude,
        longitude: data.longitude
      }
    }

    if (data instanceof admin.firestore.DocumentReference) {
      return {
        _type: 'DocumentReference', 
        path: data.path
      }
    }

    if (Array.isArray(data)) {
      return data.map(item => this.convertFirestoreData(item))
    }

    if (typeof data === 'object') {
      const converted = {}
      for (const [key, value] of Object.entries(data)) {
        converted[key] = this.convertFirestoreData(value)
      }
      return converted
    }

    return data
  }

  private async createBackupMetadata() {
    console.log('📋 Creating backup metadata...')
    
    const metadata = {
      backupDate: new Date().toISOString(),
      backupVersion: '1.0.0',
      firebaseProject: process.env.FIREBASE_PROJECT_ID,
      totalCollections: this.progress.completedCollections,
      totalDocuments: this.progress.completedDocuments,
      backupDuration: Date.now() - this.progress.startTime.getTime(),
      collections: fs.readdirSync(this.backupDir)
        .filter(file => file.endsWith('.json') && file !== 'metadata.json')
        .map(file => ({
          name: file.replace('.json', ''),
          size: fs.statSync(path.join(this.backupDir, file)).size
        }))
    }
    
    const metadataPath = path.join(this.backupDir, 'metadata.json')
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
    
    console.log('✅ Backup metadata created')
  }

  private async generateBackupReport() {
    console.log('📊 Generating backup report...')
    
    const endTime = new Date()
    const duration = endTime.getTime() - this.progress.startTime.getTime()
    
    const report = `
# 🔥➡️🟢 FIREBASE BACKUP REPORT

## 📊 Backup Summary
- **Start Time**: ${this.progress.startTime.toISOString()}
- **End Time**: ${endTime.toISOString()}
- **Duration**: ${Math.round(duration / 1000)} seconds
- **Total Collections**: ${this.progress.completedCollections}
- **Total Documents**: ${this.progress.completedDocuments}

## 📁 Backup Location
${this.backupDir}

## 📋 Files Created
${fs.readdirSync(this.backupDir)
  .map(file => `- ${file} (${Math.round(fs.statSync(path.join(this.backupDir, file)).size / 1024)} KB)`)
  .join('\n')}

## ✅ Backup Status
${fs.existsSync(path.join(this.backupDir, 'errors.json')) ? 
  '⚠️ Some errors occurred during backup. Check errors.json for details.' : 
  '✅ Backup completed successfully without errors.'}

## 🚀 Next Steps
1. Verify backup integrity
2. Test restore process
3. Proceed with Supabase migration
4. Keep this backup until migration is complete and verified

---
Generated on: ${new Date().toISOString()}
`
    
    const reportPath = path.join(this.backupDir, 'BACKUP_REPORT.md')
    fs.writeFileSync(reportPath, report)
    
    console.log('📊 Backup report generated')
    console.log(report)
  }

  printProgress() {
    const duration = Date.now() - this.progress.startTime.getTime()
    const rate = this.progress.completedDocuments / (duration / 1000)
    
    console.log(`
📈 Backup Progress:
- Collections: ${this.progress.completedCollections}/${this.progress.totalCollections}
- Documents: ${this.progress.completedDocuments}
- Current: ${this.progress.currentCollection}
- Rate: ${rate.toFixed(2)} docs/sec
- Duration: ${Math.round(duration / 1000)}s
    `)
  }
}

// Main execution
async function main() {
  const backupService = new FirebaseBackupService()
  
  try {
    await backupService.initialize()
    await backupService.startCompleteBackup()
  } catch (error) {
    console.error('💥 Backup process failed:', error)
    process.exit(1)
  }
}

// Run backup if called directly
if (require.main === module) {
  main().catch(console.error)
}

export { FirebaseBackupService }