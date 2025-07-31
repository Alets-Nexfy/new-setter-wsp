import * as fs from 'fs'
import * as path from 'path'

interface BackupValidationResult {
  isValid: boolean
  totalFiles: number
  totalSize: number
  missingCollections: string[]
  corruptedFiles: string[]
  warnings: string[]
  errors: string[]
}

class BackupValidator {
  private backupDir: string
  private expectedCollections: string[]

  constructor(backupDir: string) {
    this.backupDir = backupDir
    this.expectedCollections = [
      'users',
      'sessions',
      'messages', 
      'kanban_boards',
      'kanban_columns',
      'kanban_cards',
      'notifications',
      'firebaseFunctions'
    ]
  }

  async validateBackup(): Promise<BackupValidationResult> {
    console.log('🔍 Starting backup validation...')
    
    const result: BackupValidationResult = {
      isValid: true,
      totalFiles: 0,
      totalSize: 0,
      missingCollections: [],
      corruptedFiles: [],
      warnings: [],
      errors: []
    }

    try {
      // Check if backup directory exists
      if (!fs.existsSync(this.backupDir)) {
        result.errors.push(`Backup directory does not exist: ${this.backupDir}`)
        result.isValid = false
        return result
      }

      // Get all files in backup directory
      const files = fs.readdirSync(this.backupDir)
      result.totalFiles = files.length

      // Calculate total size
      let totalSize = 0
      for (const file of files) {
        const filePath = path.join(this.backupDir, file)
        const stats = fs.statSync(filePath)
        totalSize += stats.size
      }
      result.totalSize = totalSize

      // Check for metadata file
      if (!files.includes('metadata.json')) {
        result.warnings.push('metadata.json file is missing')
      } else {
        await this.validateMetadata(result)
      }

      // Check for expected collections
      for (const collection of this.expectedCollections) {
        const fileName = `${collection}.json`
        if (!files.includes(fileName)) {
          result.missingCollections.push(collection)
          result.warnings.push(`Missing collection backup: ${collection}`)
        }
      }

      // Validate JSON files
      const jsonFiles = files.filter(file => file.endsWith('.json'))
      for (const jsonFile of jsonFiles) {
        await this.validateJSONFile(jsonFile, result)
      }

      // Check for errors log
      if (files.includes('errors.json')) {
        result.warnings.push('Backup contains errors.json - some collections may have failed')
        await this.analyzeErrors(result)
      }

      // Validate user subcollections
      await this.validateUserSubcollections(files, result)

      // Overall validation
      if (result.errors.length > 0) {
        result.isValid = false
      }

      console.log('✅ Backup validation completed')
      return result

    } catch (error) {
      result.errors.push(`Validation failed: ${error.message}`)
      result.isValid = false
      return result
    }
  }

  private async validateMetadata(result: BackupValidationResult) {
    try {
      const metadataPath = path.join(this.backupDir, 'metadata.json')
      const metadataContent = fs.readFileSync(metadataPath, 'utf8')
      const metadata = JSON.parse(metadataContent)

      // Check required fields
      const requiredFields = ['backupDate', 'totalCollections', 'totalDocuments']
      for (const field of requiredFields) {
        if (!metadata[field]) {
          result.warnings.push(`Metadata missing field: ${field}`)
        }
      }

      // Validate backup date
      if (metadata.backupDate) {
        const backupDate = new Date(metadata.backupDate)
        const now = new Date()
        const daysDiff = (now.getTime() - backupDate.getTime()) / (1000 * 60 * 60 * 24)
        
        if (daysDiff > 7) {
          result.warnings.push(`Backup is ${Math.round(daysDiff)} days old`)
        }
      }

    } catch (error) {
      result.errors.push(`Failed to validate metadata: ${error.message}`)
    }
  }

  private async validateJSONFile(fileName: string, result: BackupValidationResult) {
    try {
      const filePath = path.join(this.backupDir, fileName)
      const content = fs.readFileSync(filePath, 'utf8')
      
      // Try to parse JSON
      const data = JSON.parse(content)
      
      // Check if it's an array (expected format)
      if (!Array.isArray(data)) {
        result.warnings.push(`File ${fileName} is not in expected array format`)
        return
      }

      // Validate document structure
      for (let i = 0; i < Math.min(data.length, 5); i++) { // Check first 5 documents
        const doc = data[i]
        if (!doc.id || !doc.data || !doc.path) {
          result.warnings.push(`File ${fileName} has invalid document structure at index ${i}`)
          break
        }
      }

      console.log(`✅ ${fileName}: ${data.length} documents`)

    } catch (error) {
      result.corruptedFiles.push(fileName)
      result.errors.push(`Corrupted JSON file: ${fileName} - ${error.message}`)
    }
  }

  private async analyzeErrors(result: BackupValidationResult) {
    try {
      const errorsPath = path.join(this.backupDir, 'errors.json')
      const errorsContent = fs.readFileSync(errorsPath, 'utf8')
      const errors = JSON.parse(errorsContent)

      result.warnings.push(`Found ${errors.length} backup errors`)
      
      // Add first few errors to result
      for (let i = 0; i < Math.min(errors.length, 3); i++) {
        result.errors.push(`Backup error: ${errors[i].collection} - ${errors[i].error}`)
      }

    } catch (error) {
      result.warnings.push('Could not analyze errors.json file')
    }
  }

  private async validateUserSubcollections(files: string[], result: BackupValidationResult) {
    // Count user-related files
    const userFiles = files.filter(file => file.startsWith('user_'))
    
    if (userFiles.length === 0) {
      result.warnings.push('No user subcollection backups found')
      return
    }

    console.log(`Found ${userFiles.length} user subcollection files`)

    // Check for common subcollections
    const expectedSubcollections = ['chats', 'agents', 'rules', 'action_flows']
    const foundSubcollections = new Set()

    for (const file of userFiles) {
      for (const subcol of expectedSubcollections) {
        if (file.includes(`_${subcol}.json`)) {
          foundSubcollections.add(subcol)
        }
      }
    }

    for (const subcol of expectedSubcollections) {
      if (!foundSubcollections.has(subcol)) {
        result.warnings.push(`No ${subcol} subcollection backups found`)
      }
    }
  }

  generateValidationReport(result: BackupValidationResult): string {
    const report = `
# 🔍 FIREBASE BACKUP VALIDATION REPORT

## 📊 Summary
- **Status**: ${result.isValid ? '✅ VALID' : '❌ INVALID'}
- **Total Files**: ${result.totalFiles}
- **Total Size**: ${(result.totalSize / 1024 / 1024).toFixed(2)} MB
- **Missing Collections**: ${result.missingCollections.length}
- **Corrupted Files**: ${result.corruptedFiles.length}
- **Warnings**: ${result.warnings.length}
- **Errors**: ${result.errors.length}

## 📁 Backup Location
${this.backupDir}

${result.missingCollections.length > 0 ? `
## ⚠️ Missing Collections
${result.missingCollections.map(col => `- ${col}`).join('\n')}
` : ''}

${result.corruptedFiles.length > 0 ? `
## 💥 Corrupted Files
${result.corruptedFiles.map(file => `- ${file}`).join('\n')}
` : ''}

${result.warnings.length > 0 ? `
## ⚠️ Warnings
${result.warnings.map(warning => `- ${warning}`).join('\n')}
` : ''}

${result.errors.length > 0 ? `
## ❌ Errors
${result.errors.map(error => `- ${error}`).join('\n')}
` : ''}

## 🎯 Recommendation
${result.isValid ? 
  '✅ Backup is valid and ready for migration to Supabase.' : 
  '❌ Backup has issues that should be resolved before migration.'}

---
Validation completed on: ${new Date().toISOString()}
`

    return report
  }
}

// Main execution
async function main() {
  const backupDate = process.argv[2] || new Date().toISOString().split('T')[0]
  const backupDir = path.join(process.cwd(), 'backups', `firebase-backup-${backupDate}`)
  
  console.log(`🔍 Validating backup: ${backupDir}`)
  
  const validator = new BackupValidator(backupDir)
  const result = await validator.validateBackup()
  
  // Generate and save report
  const report = validator.generateValidationReport(result)
  const reportPath = path.join(backupDir, 'VALIDATION_REPORT.md')
  fs.writeFileSync(reportPath, report)
  
  console.log(report)
  
  if (!result.isValid) {
    console.error('❌ Backup validation failed!')
    process.exit(1)
  } else {
    console.log('✅ Backup validation successful!')
  }
}

// Run validation if called directly
if (require.main === module) {
  main().catch(console.error)
}

export { BackupValidator }