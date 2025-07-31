import { SupabaseService } from '../src/core/services/SupabaseService'
import * as fs from 'fs'
import * as path from 'path'

interface MigrationProgress {
  totalCollections: number
  completedCollections: number
  totalDocuments: number
  completedDocuments: number
  failedDocuments: number
  currentCollection: string
  startTime: Date
  errors: Array<{
    collection: string
    document: string
    error: string
    timestamp: Date
  }>
}

interface FirebaseDocument {
  id: string
  data: any
  path: string
}

class DataMigrator {
  private supabaseService: SupabaseService
  private backupDir: string
  private progress: MigrationProgress

  constructor(backupDir: string) {
    this.supabaseService = SupabaseService.getInstance()
    this.backupDir = backupDir
    this.progress = {
      totalCollections: 0,
      completedCollections: 0,
      totalDocuments: 0,
      completedDocuments: 0,
      failedDocuments: 0,
      currentCollection: '',
      startTime: new Date(),
      errors: []
    }
  }

  async initialize() {
    console.log('🔧 Initializing Data Migrator...')
    await this.supabaseService.initialize()
    
    // Verify backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      throw new Error(`Backup directory not found: ${this.backupDir}`)
    }
    
    console.log(`📁 Using backup: ${this.backupDir}`)
  }

  async startMigration() {
    console.log('🚀 Starting data migration from Firebase to Supabase...')
    
    try {
      // 1. Get backup file list
      const backupFiles = this.getBackupFiles()
      this.progress.totalCollections = backupFiles.length
      
      console.log(`📊 Found ${backupFiles.length} collections to migrate`)
      
      // 2. Migrate main collections first
      await this.migrateMainCollections(backupFiles)
      
      // 3. Migrate user subcollections
      await this.migrateUserSubcollections(backupFiles)
      
      // 4. Generate migration report
      await this.generateMigrationReport()
      
      console.log('🎉 Data migration completed!')
      
    } catch (error) {
      console.error('❌ Data migration failed:', error)
      throw error
    }
  }

  private getBackupFiles(): string[] {
    const files = fs.readdirSync(this.backupDir)
    return files.filter(file => 
      file.endsWith('.json') && 
      !['metadata.json', 'errors.json'].includes(file)
    )
  }

  private async migrateMainCollections(backupFiles: string[]) {
    console.log('📦 Migrating main collections...')
    
    const mainCollections = [
      { file: 'users.json', table: 'users', transformer: this.transformUser },
      { file: 'sessions.json', table: 'sessions', transformer: this.transformSession },
      { file: 'messages.json', table: 'messages', transformer: this.transformMessage },
      { file: 'kanban_boards.json', table: 'kanban_boards', transformer: this.transformKanbanBoard },
      { file: 'kanban_columns.json', table: 'kanban_columns', transformer: this.transformKanbanColumn },
      { file: 'kanban_cards.json', table: 'kanban_cards', transformer: this.transformKanbanCard },
      { file: 'notifications.json', table: 'notifications', transformer: this.transformNotification },
      { file: 'firebaseFunctions.json', table: 'firebase_functions', transformer: this.transformFirebaseFunction }
    ]

    for (const collection of mainCollections) {
      if (backupFiles.includes(collection.file)) {
        await this.migrateCollection(collection.file, collection.table, collection.transformer.bind(this))
      } else {
        console.log(`⚠️  Backup file not found: ${collection.file}`)
      }
    }
  }

  private async migrateUserSubcollections(backupFiles: string[]) {
    console.log('👥 Migrating user subcollections...')
    
    const userFiles = backupFiles.filter(file => file.startsWith('user_'))
    
    for (const userFile of userFiles) {
      await this.migrateUserSubcollection(userFile)
    }
  }

  private async migrateUserSubcollection(fileName: string) {
    // Parse filename to determine collection type
    // Format: user_[userId]_[subcollection].json
    const parts = fileName.replace('.json', '').split('_')
    
    if (parts.length < 3) {
      console.log(`⚠️  Skipping invalid user file: ${fileName}`)
      return
    }

    const userId = parts[1]
    const subcollection = parts.slice(2).join('_')
    
    let targetTable: string
    let transformer: (doc: FirebaseDocument, userId?: string) => any

    switch (subcollection) {
      case 'chats':
        targetTable = 'chats'
        transformer = this.transformChat
        break
      case 'agents':
        targetTable = 'agents'
        transformer = this.transformAgent
        break
      case 'rules':
        targetTable = 'automation_rules'
        transformer = this.transformAutomationRule
        break
      case 'action_flows':
        targetTable = 'action_flows'
        transformer = this.transformActionFlow
        break
      default:
        if (subcollection.includes('messages')) {
          targetTable = 'messages'
          transformer = this.transformChatMessage
        } else {
          console.log(`⚠️  Unknown subcollection: ${subcollection}`)
          return
        }
    }

    await this.migrateCollection(fileName, targetTable, transformer.bind(this), userId)
  }

  private async migrateCollection(
    fileName: string, 
    targetTable: string, 
    transformer: (doc: FirebaseDocument, userId?: string) => any,
    userId?: string
  ) {
    this.progress.currentCollection = `${fileName} → ${targetTable}`
    console.log(`📄 Migrating: ${this.progress.currentCollection}`)
    
    try {
      const filePath = path.join(this.backupDir, fileName)
      const fileContent = fs.readFileSync(filePath, 'utf8')
      const documents: FirebaseDocument[] = JSON.parse(fileContent)
      
      if (documents.length === 0) {
        console.log(`   ⚠️  No documents to migrate`)
        return
      }

      console.log(`   📊 ${documents.length} documents to migrate`)
      
      // Process in batches of 100
      const batchSize = 100
      const batches = Math.ceil(documents.length / batchSize)
      
      for (let i = 0; i < batches; i++) {
        const start = i * batchSize
        const end = Math.min(start + batchSize, documents.length)
        const batch = documents.slice(start, end)
        
        await this.migrateBatch(batch, targetTable, transformer, userId)
        
        console.log(`   ✅ Batch ${i + 1}/${batches} completed (${end}/${documents.length})`)
      }
      
      this.progress.completedCollections++
      console.log(`✅ Collection migrated: ${fileName}`)
      
    } catch (error) {
      console.error(`❌ Failed to migrate collection ${fileName}:`, error)
      this.progress.errors.push({
        collection: fileName,
        document: 'N/A',
        error: error.message,
        timestamp: new Date()
      })
    }
  }

  private async migrateBatch(
    documents: FirebaseDocument[],
    targetTable: string,
    transformer: (doc: FirebaseDocument, userId?: string) => any,
    userId?: string
  ) {
    const transformedDocs = []
    
    for (const doc of documents) {
      try {
        const transformed = transformer(doc, userId)
        if (transformed) {
          transformedDocs.push(transformed)
        }
      } catch (error) {
        console.log(`   ⚠️  Failed to transform document ${doc.id}: ${error.message}`)
        this.progress.failedDocuments++
        this.progress.errors.push({
          collection: targetTable,
          document: doc.id,
          error: error.message,
          timestamp: new Date()
        })
      }
    }

    if (transformedDocs.length === 0) {
      return
    }

    // Insert into Supabase
    try {
      const { error } = await this.supabaseService.adminFrom(targetTable)
        .insert(transformedDocs)

      if (error) {
        throw error
      }

      this.progress.completedDocuments += transformedDocs.length

    } catch (error) {
      console.log(`   ❌ Failed to insert batch into ${targetTable}: ${error.message}`)
      this.progress.failedDocuments += transformedDocs.length
      
      // Try individual inserts for this batch
      await this.insertIndividually(transformedDocs, targetTable)
    }
  }

  private async insertIndividually(documents: any[], targetTable: string) {
    console.log(`   🔄 Attempting individual inserts for ${documents.length} documents...`)
    
    for (const doc of documents) {
      try {
        const { error } = await this.supabaseService.adminFrom(targetTable).insert(doc)
        
        if (error) {
          throw error
        }
        
        this.progress.completedDocuments++
        
      } catch (error) {
        this.progress.failedDocuments++
        this.progress.errors.push({
          collection: targetTable,
          document: doc.id || 'unknown',
          error: error.message,
          timestamp: new Date()
        })
      }
    }
  }

  // Transformation functions
  private transformUser(doc: FirebaseDocument): any {
    const data = doc.data
    return {
      id: doc.id,
      email: data.email || `user_${doc.id}@temp.com`,
      name: data.name || 'Unknown User',
      tier: data.tier || 'standard',
      status: data.status || 'active',
      created_at: this.convertTimestamp(data.createdAt),
      updated_at: this.convertTimestamp(data.updatedAt),
      last_activity: this.convertTimestamp(data.lastActivity),
      settings: data.settings || {},
      b2b_info: data.b2bInfo || null
    }
  }

  private transformSession(doc: FirebaseDocument): any {
    const data = doc.data
    return {
      id: doc.id,
      user_id: data.userId,
      platform: data.platform || 'whatsapp',
      status: data.status || 'disconnected',
      qr_code: data.qrCode || null,
      session_data: data.sessionData || {},
      created_at: this.convertTimestamp(data.createdAt),
      updated_at: this.convertTimestamp(data.updatedAt),
      last_activity: this.convertTimestamp(data.lastActivity),
      metadata: data.metadata || {}
    }
  }

  private transformMessage(doc: FirebaseDocument): any {
    const data = doc.data
    return {
      id: doc.id,
      session_id: data.sessionId,
      user_id: data.userId,
      chat_id: data.chatId,
      platform: data.platform || 'whatsapp',
      from_contact: data.from || data.fromContact || 'unknown',
      to_contact: data.to || data.toContact || 'unknown',
      message_type: data.type || data.messageType || 'text',
      content: data.content || data.body || '',
      timestamp: this.convertTimestamp(data.timestamp),
      status: data.status || 'sent',
      metadata: data.metadata || {}
    }
  }

  private transformChat(doc: FirebaseDocument, userId: string): any {
    const data = doc.data
    return {
      id: doc.id,
      user_id: userId,
      platform: data.platform || 'whatsapp',
      contact_id: data.contactId || doc.id,
      contact_name: data.contactName || data.name || 'Unknown Contact',
      last_message: data.lastMessage,
      last_message_time: this.convertTimestamp(data.lastMessageTime),
      is_active: data.isActive !== false,
      is_archived: data.isArchived || false,
      labels: data.labels || [],
      assigned_agent: data.assignedAgent,
      current_flow: data.currentFlow,
      created_at: this.convertTimestamp(data.createdAt),
      updated_at: this.convertTimestamp(data.updatedAt),
      metadata: data.metadata || {}
    }
  }

  private transformAgent(doc: FirebaseDocument, userId: string): any {
    const data = doc.data
    return {
      id: doc.id,
      user_id: userId,
      name: data.name || 'Unknown Agent',
      agent_type: data.type || data.agentType || 'custom',
      config: data.config || {},
      is_active: data.isActive !== false,
      is_default: data.isDefault || false,
      performance: data.performance || {},
      created_at: this.convertTimestamp(data.createdAt),
      updated_at: this.convertTimestamp(data.updatedAt)
    }
  }

  private transformKanbanBoard(doc: FirebaseDocument): any {
    const data = doc.data
    return {
      id: doc.id,
      user_id: data.userId,
      name: data.name || 'Untitled Board',
      description: data.description,
      is_default: data.isDefault || false,
      created_at: this.convertTimestamp(data.createdAt),
      updated_at: this.convertTimestamp(data.updatedAt)
    }
  }

  private transformKanbanColumn(doc: FirebaseDocument): any {
    const data = doc.data
    return {
      id: doc.id,
      board_id: data.boardId,
      user_id: data.userId,
      name: data.name || 'Untitled Column',
      position: data.position || 0,
      color: data.color,
      card_limit: data.limit || data.cardLimit,
      created_at: this.convertTimestamp(data.createdAt),
      updated_at: this.convertTimestamp(data.updatedAt)
    }
  }

  private transformKanbanCard(doc: FirebaseDocument): any {
    const data = doc.data
    return {
      id: doc.id,
      column_id: data.columnId,
      board_id: data.boardId,
      user_id: data.userId,
      chat_id: data.chatId,
      contact_name: data.contactName || 'Unknown Contact',
      title: data.title || 'Untitled Card',
      description: data.description,
      position: data.position || 0,
      labels: data.labels || [],
      due_date: this.convertTimestamp(data.dueDate),
      assignee: data.assignee,
      priority: data.priority || 'medium',
      created_at: this.convertTimestamp(data.createdAt),
      updated_at: this.convertTimestamp(data.updatedAt)
    }
  }

  private transformNotification(doc: FirebaseDocument): any {
    const data = doc.data
    return {
      id: doc.id,
      user_id: data.userId,
      notification_type: data.type || data.notificationType || 'info',
      title: data.title || 'Notification',
      message: data.message || '',
      is_read: data.isRead || false,
      priority: data.priority || 'medium',
      action_url: data.actionUrl,
      created_at: this.convertTimestamp(data.createdAt),
      expires_at: this.convertTimestamp(data.expiresAt),
      read_at: this.convertTimestamp(data.readAt),
      metadata: data.metadata || {}
    }
  }

  private transformAutomationRule(doc: FirebaseDocument, userId: string): any {
    const data = doc.data
    return {
      id: doc.id,
      user_id: userId,
      name: data.name || 'Untitled Rule',
      description: data.description,
      trigger_config: data.triggerConfig || data.trigger || {},
      action_config: data.actionConfig || data.action || {},
      is_active: data.isActive !== false,
      execution_count: data.executionCount || 0,
      last_execution: this.convertTimestamp(data.lastExecution),
      created_at: this.convertTimestamp(data.createdAt),
      updated_at: this.convertTimestamp(data.updatedAt)
    }
  }

  private transformActionFlow(doc: FirebaseDocument, userId: string): any {
    const data = doc.data
    return {
      id: doc.id,
      user_id: userId,
      name: data.name || 'Untitled Flow',
      description: data.description,
      flow_config: data.flowConfig || data.config || {},
      is_active: data.isActive !== false,
      execution_count: data.executionCount || 0,
      last_execution: this.convertTimestamp(data.lastExecution),
      created_at: this.convertTimestamp(data.createdAt),
      updated_at: this.convertTimestamp(data.updatedAt)
    }
  }

  private transformFirebaseFunction(doc: FirebaseDocument): any {
    const data = doc.data
    return {
      id: doc.id,
      user_id: data.userId,
      name: data.name || 'Untitled Function',
      description: data.description,
      code: data.code || '',
      runtime: data.runtime || 'nodejs18',
      memory: data.memory || 256,
      timeout: data.timeout || 60,
      trigger_config: data.triggerConfig || data.trigger || {},
      environment_variables: data.environmentVariables || {},
      is_active: data.isActive !== false,
      version: data.version || 1,
      deployment_status: data.deploymentStatus || 'pending',
      last_deployment: this.convertTimestamp(data.lastDeployment),
      created_at: this.convertTimestamp(data.createdAt),
      updated_at: this.convertTimestamp(data.updatedAt)
    }
  }

  private transformChatMessage(doc: FirebaseDocument, userId: string): any {
    const data = doc.data
    
    // Extract chat ID from path if available
    let chatId = data.chatId
    if (!chatId && doc.path.includes('/chats/')) {
      const pathParts = doc.path.split('/')
      const chatIndex = pathParts.indexOf('chats')
      if (chatIndex >= 0 && pathParts.length > chatIndex + 1) {
        chatId = pathParts[chatIndex + 1]
      }
    }
    
    return {
      id: doc.id,
      session_id: data.sessionId,
      user_id: userId,
      chat_id: chatId,
      platform: data.platform || 'whatsapp',
      from_contact: data.from || data.fromContact || 'unknown',
      to_contact: data.to || data.toContact || 'unknown',
      message_type: data.type || data.messageType || 'text',
      content: data.content || data.body || data.message || '',
      timestamp: this.convertTimestamp(data.timestamp),
      status: data.status || 'sent',
      metadata: data.metadata || {}
    }
  }

  private convertTimestamp(timestamp: any): string | null {
    if (!timestamp) return null
    
    // If it's already a string (ISO format), return as is
    if (typeof timestamp === 'string') {
      return timestamp
    }
    
    // If it's a number (Unix timestamp)
    if (typeof timestamp === 'number') {
      return new Date(timestamp).toISOString()
    }
    
    // If it's a Firebase Timestamp object
    if (timestamp._seconds !== undefined) {
      return new Date(timestamp._seconds * 1000).toISOString()
    }
    
    // If it's a Date object
    if (timestamp instanceof Date) {
      return timestamp.toISOString()
    }
    
    return null
  }

  private async generateMigrationReport() {
    console.log('📊 Generating migration report...')
    
    const endTime = new Date()
    const duration = endTime.getTime() - this.progress.startTime.getTime()
    
    const report = `
# 📊 DATA MIGRATION REPORT

## Migration Summary
- **Start Time**: ${this.progress.startTime.toISOString()}
- **End Time**: ${endTime.toISOString()}
- **Duration**: ${Math.round(duration / 1000)} seconds
- **Collections Processed**: ${this.progress.completedCollections}/${this.progress.totalCollections}
- **Documents Migrated**: ${this.progress.completedDocuments}
- **Failed Documents**: ${this.progress.failedDocuments}
- **Success Rate**: ${((this.progress.completedDocuments / (this.progress.completedDocuments + this.progress.failedDocuments)) * 100).toFixed(2)}%

## Migration Status
${this.progress.failedDocuments === 0 ? '✅ Migration completed successfully!' : '⚠️  Migration completed with some errors.'}

## Backup Source
${this.backupDir}

${this.progress.errors.length > 0 ? `
## Errors (First 10)
${this.progress.errors.slice(0, 10).map(error => 
  `- **${error.collection}** (${error.document}): ${error.error}`
).join('\n')}

${this.progress.errors.length > 10 ? `... and ${this.progress.errors.length - 10} more errors` : ''}
` : ''}

## Next Steps
1. ✅ Data migration completed
2. ⏳ Update application code to use Supabase
3. ⏳ Run comprehensive tests
4. ⏳ Deploy and monitor

---
Generated on: ${new Date().toISOString()}
`

    const reportPath = path.join(process.cwd(), 'DATA_MIGRATION_REPORT.md')
    fs.writeFileSync(reportPath, report)
    
    // Save detailed errors if any
    if (this.progress.errors.length > 0) {
      const errorsPath = path.join(process.cwd(), 'migration-errors.json')
      fs.writeFileSync(errorsPath, JSON.stringify(this.progress.errors, null, 2))
    }
    
    console.log(report)
  }

  printProgress() {
    const duration = Date.now() - this.progress.startTime.getTime()
    const rate = this.progress.completedDocuments / (duration / 1000)
    
    console.log(`
📈 Migration Progress:
- Collections: ${this.progress.completedCollections}/${this.progress.totalCollections}
- Documents: ${this.progress.completedDocuments} ✅ | ${this.progress.failedDocuments} ❌
- Current: ${this.progress.currentCollection}
- Rate: ${rate.toFixed(2)} docs/sec
- Duration: ${Math.round(duration / 1000)}s
    `)
  }
}

export { DataMigrator }