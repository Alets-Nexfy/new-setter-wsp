#!/bin/bash

# 🔥➡️🟢 FIREBASE BACKUP SCRIPT
echo "🚀 Starting Firebase Backup Process..."

# Check if required environment variables are set
if [ -z "$GOOGLE_APPLICATION_CREDENTIALS" ] && [ -z "$FIREBASE_PROJECT_ID" ]; then
    echo "❌ Error: Firebase environment variables not set"
    echo "Please set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_PROJECT_ID"
    exit 1
fi

# Create backups directory if it doesn't exist
mkdir -p backups

# Get current date for backup folder
BACKUP_DATE=$(date +%Y-%m-%d)
echo "📅 Backup date: $BACKUP_DATE"

# Check if Node.js and npm are available
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed"
    exit 1
fi

# Install dependencies if needed
echo "📦 Checking dependencies..."
npm list firebase-admin > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "⚠️  Installing Firebase Admin SDK..."
    npm install firebase-admin
fi

# Run TypeScript compilation if needed
echo "🔨 Compiling TypeScript..."
npx tsc --project tsconfig.json --skipLibCheck

# Check if backup script exists
if [ ! -f "scripts/firebase-backup.ts" ]; then
    echo "❌ Error: Backup script not found at scripts/firebase-backup.ts"
    exit 1
fi

# Run the backup
echo "🏃 Running Firebase backup..."
npx ts-node scripts/firebase-backup.ts

# Check if backup was successful
if [ $? -eq 0 ]; then
    echo "✅ Firebase backup completed successfully!"
    
    # Show backup directory contents
    BACKUP_DIR="backups/firebase-backup-$BACKUP_DATE"
    if [ -d "$BACKUP_DIR" ]; then
        echo ""
        echo "📁 Backup contents:"
        ls -la "$BACKUP_DIR"
        
        echo ""
        echo "📊 Backup size:"
        du -sh "$BACKUP_DIR"
        
        # Show backup report if it exists
        if [ -f "$BACKUP_DIR/BACKUP_REPORT.md" ]; then
            echo ""
            echo "📋 Backup Report:"
            cat "$BACKUP_DIR/BACKUP_REPORT.md"
        fi
    fi
    
    echo ""
    echo "🎉 Backup process completed!"
    echo "💡 Next step: Run Supabase migration with these backed up data"
    
else
    echo "❌ Firebase backup failed!"
    exit 1
fi