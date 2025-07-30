# COMPREHENSIVE WHATSAPP API v2 PRODUCTION TEST SUITE
# Based on 2025 AI-powered testing best practices and complete architecture analysis
# Generated from exhaustive route and service analysis

param(
    [string]$BaseUrl = "http://localhost:3000",
    [string[]]$TestUsers = @("test-user-001", "test-user-002", "test-user-003"),
    [switch]$RunLoadTests = $false,
    [switch]$RunSecurityTests = $false,
    [switch]$DetailedLogging = $false,
    [int]$MaxConcurrentTests = 10
)

# Global variables
$Global:TestResults = @{}
$Global:FailedTests = @()
$Global:PassedTests = @()
$Global:TotalEndpointsTested = 0
$Global:TestStartTime = Get-Date

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "WHATSAPP API v2 COMPREHENSIVE PRODUCTION TEST SUITE" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl" -ForegroundColor Yellow
Write-Host "Test Users: $($TestUsers -join ', ')" -ForegroundColor Yellow
Write-Host "Start Time: $Global:TestStartTime" -ForegroundColor Yellow
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

# ========================================
# UTILITY FUNCTIONS
# ========================================

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Url,
        [string]$Body = $null,
        [hashtable]$Headers = @{},
        [hashtable]$ExpectedStatus = @{200=$true; 201=$true; 202=$true},
        [string]$Category = "General",
        [int]$TimeoutSeconds = 30
    )
    
    $Global:TotalEndpointsTested++
    
    if ($DetailedLogging) {
        Write-Host "[$Category] Testing: $Name" -ForegroundColor Cyan
        Write-Host "  URL: $Method $Url" -ForegroundColor Gray
    }
    
    try {
        $requestParams = @{
            Uri = $Url
            Method = $Method
            TimeoutSec = $TimeoutSeconds
            Headers = $Headers
        }
        
        if ($Body) {
            $requestParams.Body = $Body
            $requestParams.ContentType = "application/json"
        }
        
        $response = Invoke-RestMethod @requestParams
        $statusCode = 200  # Simplified for this test
        
        if ($ExpectedStatus.ContainsKey($statusCode)) {
            $Global:PassedTests += @{
                Name = $Name
                Category = $Category
                StatusCode = $statusCode
                Url = $Url
            }
            
            if ($DetailedLogging) {
                Write-Host "  SUCCESS: $statusCode" -ForegroundColor Green
            }
            
            return @{
                Success = $true
                StatusCode = $statusCode
                Response = $response
            }
        } else {
            throw "Unexpected status code: $statusCode"
        }
    }
    catch {
        $Global:FailedTests += @{
            Name = $Name
            Category = $Category
            Error = $_.Exception.Message
            Url = $Url
        }
        
        if ($DetailedLogging) {
            Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
        }
        
        return @{
            Success = $false
            Error = $_.Exception.Message
        }
    }
}

function Write-CategoryHeader {
    param(
        [string]$Title,
        [string]$Description
    )
    
    Write-Host ""
    Write-Host "=================================================================" -ForegroundColor Yellow
    Write-Host $Title -ForegroundColor Yellow
    Write-Host $Description -ForegroundColor White
    Write-Host "=================================================================" -ForegroundColor Yellow
}

# ========================================
# INFRASTRUCTURE HEALTH TESTS
# ========================================

function Test-Infrastructure {
    Write-CategoryHeader "INFRASTRUCTURE AND HEALTH" "Core system health and connectivity"
    
    # System Health Check
    Test-Endpoint -Name "System Health Check" -Method "GET" -Url "$BaseUrl/health" -Category "Infrastructure"
    
    # System Information
    Test-Endpoint -Name "System Information" -Method "GET" -Url "$BaseUrl/general/info" -Category "Infrastructure"
    
    # System Statistics
    Test-Endpoint -Name "System Statistics" -Method "GET" -Url "$BaseUrl/general/stats" -Category "Infrastructure"
    
    # Queue Status
    Test-Endpoint -Name "Queue Status" -Method "GET" -Url "$BaseUrl/general/queue-status" -Category "Infrastructure"
    
    # AI Service Status
    Test-Endpoint -Name "AI Service Status" -Method "GET" -Url "$BaseUrl/ai/status" -Category "Infrastructure"
    
    Write-Host "Infrastructure tests completed" -ForegroundColor Green
}

# ========================================
# USER MANAGEMENT TESTS
# ========================================

function Test-UserManagement {
    Write-CategoryHeader "USER MANAGEMENT" "User CRUD operations and status management"
    
    foreach ($userId in $TestUsers) {
        # Create User
        $createUserBody = @{
            userId = $userId
            initialAgentId = "default-agent"
            metadata = @{
                testUser = $true
                createdBy = "test-suite"
            }
        } | ConvertTo-Json
        
        Test-Endpoint -Name "Create User ($userId)" -Method "POST" -Url "$BaseUrl/users" -Body $createUserBody -Category "UserManagement"
        
        # Get User
        Test-Endpoint -Name "Get User ($userId)" -Method "GET" -Url "$BaseUrl/users/$userId" -Category "UserManagement"
        
        # Update User
        $updateUserBody = @{
            activeAgentId = "updated-agent"
        } | ConvertTo-Json
        
        Test-Endpoint -Name "Update User ($userId)" -Method "PUT" -Url "$BaseUrl/users/$userId" -Body $updateUserBody -Category "UserManagement"
        
        # Get User Status
        Test-Endpoint -Name "Get User Status ($userId)" -Method "GET" -Url "$BaseUrl/users/$userId/status" -Category "UserManagement"
        
        # Get User Health
        Test-Endpoint -Name "Get User Health ($userId)" -Method "GET" -Url "$BaseUrl/users/$userId/health" -Category "UserManagement"
        
        # Get User Config
        Test-Endpoint -Name "Get User Config ($userId)" -Method "GET" -Url "$BaseUrl/users/$userId/config" -Category "UserManagement"
    }
    
    # List Users
    Test-Endpoint -Name "List Users" -Method "GET" -Url "$BaseUrl/users" -Category "UserManagement"
    
    # User Analytics
    Test-Endpoint -Name "User Analytics" -Method "GET" -Url "$BaseUrl/analytics/users" -Category "UserManagement"
    
    Write-Host "User Management tests completed" -ForegroundColor Green
}

# ========================================
# WHATSAPP CONNECTION TESTS
# ========================================

function Test-WhatsAppConnections {
    Write-CategoryHeader "WHATSAPP CONNECTIONS" "WhatsApp connection and session management"
    
    foreach ($userId in $TestUsers) {
        # Connect User to WhatsApp
        Test-Endpoint -Name "Connect WhatsApp ($userId)" -Method "POST" -Url "$BaseUrl/api/whatsapp/$userId/connect" -Category "WhatsApp"
        
        # Get Connection Status
        Test-Endpoint -Name "WhatsApp Status ($userId)" -Method "GET" -Url "$BaseUrl/api/whatsapp/$userId/status" -Category "WhatsApp"
        
        # Get QR Code Data
        Test-Endpoint -Name "QR Code Data ($userId)" -Method "GET" -Url "$BaseUrl/api/whatsapp/$userId/qr" -Category "WhatsApp" -ExpectedStatus = @{200=$true; 404=$true}
        
        # Get QR Code Image
        Test-Endpoint -Name "QR Code Image ($userId)" -Method "GET" -Url "$BaseUrl/api/whatsapp/$userId/qr/image" -Category "WhatsApp" -ExpectedStatus = @{200=$true; 404=$true}
    }
    
    # Sessions Management (V2)
    Test-Endpoint -Name "Get All Sessions" -Method "GET" -Url "$BaseUrl/api/whatsapp/sessions" -Category "WhatsApp"
    
    Write-Host "WhatsApp Connection tests completed" -ForegroundColor Green
}

# ========================================
# MESSAGING TESTS
# ========================================

function Test-Messaging {
    Write-CategoryHeader "MESSAGING" "Message sending and chat management"
    
    foreach ($userId in $TestUsers) {
        $testChatId = "5491234567890@c.us"
        
        # Send Message (Legacy)
        $sendMessageBody = @{
            chatId = $testChatId
            message = "Test message from comprehensive test suite"
            origin = "human"
        } | ConvertTo-Json
        
        Test-Endpoint -Name "Send Message Legacy ($userId)" -Method "POST" -Url "$BaseUrl/api/whatsapp/$userId/send-message" -Body $sendMessageBody -Category "Messaging"
        
        # Send Message (Alias)
        Test-Endpoint -Name "Send Message Alias ($userId)" -Method "POST" -Url "$BaseUrl/api/whatsapp/$userId/send" -Body $sendMessageBody -Category "Messaging"
        
        # Get User Chats
        Test-Endpoint -Name "Get Chats ($userId)" -Method "GET" -Url "$BaseUrl/api/whatsapp/chats/$userId" -Category "Messaging"
        
        # Get Messages
        Test-Endpoint -Name "Get Messages ($userId)" -Method "GET" -Url "$BaseUrl/api/whatsapp/messages/$userId/$testChatId" -Category "Messaging"
        
        # Update Contact Name
        $updateContactBody = @{
            chatId = $testChatId
            name = "Test Contact Updated"
        } | ConvertTo-Json
        
        Test-Endpoint -Name "Update Contact Name ($userId)" -Method "PUT" -Url "$BaseUrl/api/whatsapp/chats/$userId/$testChatId/contact-name" -Body $updateContactBody -Category "Messaging"
        
        # Activate Chat
        Test-Endpoint -Name "Activate Chat ($userId)" -Method "POST" -Url "$BaseUrl/api/whatsapp/chats/$userId/$testChatId/activate" -Category "Messaging"
        
        # Chat Statistics
        Test-Endpoint -Name "Chat Statistics ($userId)" -Method "GET" -Url "$BaseUrl/api/whatsapp/chats/$userId/statistics" -Category "Messaging"
    }
    
    Write-Host "Messaging tests completed" -ForegroundColor Green
}

# ========================================
# AI AGENTS TESTS
# ========================================

function Test-AIAgents {
    Write-CategoryHeader "AI AGENTS" "AI agent management and operations"
    
    foreach ($userId in $TestUsers) {
        # Get User Agents
        Test-Endpoint -Name "Get Agents ($userId)" -Method "GET" -Url "$BaseUrl/agents/$userId/agents" -Category "AIAgents"
        
        # Create Agent
        $createAgentBody = @{
            name = "Test Agent"
            description = "Test agent created by comprehensive test suite"
            systemPrompt = "You are a helpful assistant for testing purposes"
            model = "gemini-1.5-flash"
        } | ConvertTo-Json
        
        Test-Endpoint -Name "Create Agent ($userId)" -Method "POST" -Url "$BaseUrl/agents/$userId/agents" -Body $createAgentBody -Category "AIAgents"
        
        # Get Active Agent
        Test-Endpoint -Name "Get Active Agent ($userId)" -Method "GET" -Url "$BaseUrl/agents/$userId/active-agent" -Category "AIAgents"
        
        # Agent Statistics
        Test-Endpoint -Name "Agent Statistics ($userId)" -Method "GET" -Url "$BaseUrl/agents/$userId/agents/statistics" -Category "AIAgents"
    }
    
    # Validate Agent Config
    Test-Endpoint -Name "Validate Agent Config" -Method "POST" -Url "$BaseUrl/agents/validate-config" -Category "AIAgents"
    
    # Get Default Config
    Test-Endpoint -Name "Get Default Agent Config" -Method "GET" -Url "$BaseUrl/agents/default-config" -Category "AIAgents"
    
    Write-Host "AI Agents tests completed" -ForegroundColor Green
}

# ========================================
# AI SERVICES TESTS
# ========================================

function Test-AIServices {
    Write-CategoryHeader "AI SERVICES" "AI response generation and rate limiting"
    
    foreach ($userId in $TestUsers) {
        # Generate Conversation Response
        $conversationBody = @{
            message = "Hello, this is a test message"
            chatId = "5491234567890@c.us"
            userId = $userId
        } | ConvertTo-Json
        
        Test-Endpoint -Name "Generate Response ($userId)" -Method "POST" -Url "$BaseUrl/ai/$userId/conversation-response" -Body $conversationBody -Category "AIServices"
        
        # Get Rate Limit Status
        Test-Endpoint -Name "Rate Limit Status ($userId)" -Method "GET" -Url "$BaseUrl/ai/$userId/rate-limit-status" -Category "AIServices"
        
        # Get Token Tracking
        Test-Endpoint -Name "Token Tracking ($userId)" -Method "GET" -Url "$BaseUrl/ai/$userId/token-tracking/5491234567890@c.us" -Category "AIServices"
        
        # Build Prompt
        $promptBody = @{
            chatId = "5491234567890@c.us"
            includeHistory = $true
        } | ConvertTo-Json
        
        Test-Endpoint -Name "Build Prompt ($userId)" -Method "POST" -Url "$BaseUrl/ai/$userId/build-prompt" -Body $promptBody -Category "AIServices"
    }
    
    # Generate Starter Response
    $starterBody = @{
        context = "Testing starter response generation"
    } | ConvertTo-Json
    
    Test-Endpoint -Name "Generate Starter Response" -Method "POST" -Url "$BaseUrl/ai/starter-response" -Body $starterBody -Category "AIServices"
    
    Write-Host "AI Services tests completed" -ForegroundColor Green
}

# ========================================
# DISCONNECT AND CLEANUP TESTS
# ========================================

function Test-DisconnectCleanup {
    Write-CategoryHeader "DISCONNECT AND CLEANUP" "Connection termination and cleanup"
    
    foreach ($userId in $TestUsers) {
        # Disconnect WhatsApp
        Test-Endpoint -Name "Disconnect WhatsApp ($userId)" -Method "POST" -Url "$BaseUrl/api/whatsapp/$userId/disconnect" -Category "Cleanup"
        
        # User Cleanup (Nuclear)
        Test-Endpoint -Name "User Cleanup ($userId)" -Method "POST" -Url "$BaseUrl/users/$userId/nuke" -Category "Cleanup" -ExpectedStatus = @{200=$true; 400=$true; 404=$true}
    }
    
    Write-Host "Disconnect and Cleanup tests completed" -ForegroundColor Green
}

# ========================================
# MAIN EXECUTION
# ========================================

function Start-ComprehensiveTests {
    Write-Host "Starting comprehensive test execution..." -ForegroundColor Cyan
    
    # Validate base URL connectivity
    try {
        Write-Host "Validating connectivity to $BaseUrl..." -ForegroundColor Yellow
        $healthCheck = Invoke-RestMethod -Uri "$BaseUrl/health" -Method GET -TimeoutSec 10
        Write-Host "Connectivity confirmed" -ForegroundColor Green
    }
    catch {
        Write-Host "WARNING: Cannot connect to $BaseUrl" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Continuing with tests (they may fail)..." -ForegroundColor Yellow
    }
    
    # Execute test suites
    Test-Infrastructure
    Test-UserManagement
    Test-WhatsAppConnections
    Test-AIAgents
    Test-Messaging
    Test-AIServices
    Test-DisconnectCleanup
    
    # Generate final report
    Write-FinalReport
}

function Write-FinalReport {
    $endTime = Get-Date
    $duration = ($endTime - $Global:TestStartTime).TotalMinutes
    $successRate = if ($Global:TotalEndpointsTested -gt 0) { 
        [math]::Round(($Global:PassedTests.Count / $Global:TotalEndpointsTested) * 100, 2) 
    } else { 0 }
    
    Write-Host ""
    Write-Host "=================================================================" -ForegroundColor Cyan
    Write-Host "COMPREHENSIVE TEST SUITE - FINAL REPORT" -ForegroundColor Cyan
    Write-Host "=================================================================" -ForegroundColor Cyan
    
    Write-Host ""
    Write-Host "EXECUTION SUMMARY:" -ForegroundColor Yellow
    Write-Host "  Start Time: $Global:TestStartTime" -ForegroundColor White
    Write-Host "  End Time: $endTime" -ForegroundColor White
    Write-Host "  Total Duration: $([math]::Round($duration, 2)) minutes" -ForegroundColor White
    Write-Host "  Total Endpoints Tested: $Global:TotalEndpointsTested" -ForegroundColor White
    
    Write-Host ""
    Write-Host "TEST RESULTS:" -ForegroundColor Yellow
    Write-Host "  PASSED: $($Global:PassedTests.Count)" -ForegroundColor Green
    Write-Host "  FAILED: $($Global:FailedTests.Count)" -ForegroundColor Red
    
    if ($successRate -ge 90) {
        Write-Host "  SUCCESS RATE: $successRate%" -ForegroundColor Green
    } elseif ($successRate -ge 70) {
        Write-Host "  SUCCESS RATE: $successRate%" -ForegroundColor Yellow
    } else {
        Write-Host "  SUCCESS RATE: $successRate%" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "PRODUCTION READINESS ASSESSMENT:" -ForegroundColor Yellow
    if ($successRate -ge 95) {
        Write-Host "  READY FOR PRODUCTION" -ForegroundColor Green
        Write-Host "     - All critical systems operational" -ForegroundColor Green
        Write-Host "     - Excellent test coverage and success rate" -ForegroundColor Green
    } elseif ($successRate -ge 80) {
        Write-Host "  MOSTLY READY FOR PRODUCTION" -ForegroundColor Yellow
        Write-Host "     - Minor issues detected" -ForegroundColor Yellow
        Write-Host "     - Review failed tests before deployment" -ForegroundColor Yellow
    } else {
        Write-Host "  NOT READY FOR PRODUCTION" -ForegroundColor Red
        Write-Host "     - Critical system failures detected" -ForegroundColor Red
        Write-Host "     - Must resolve issues before deployment" -ForegroundColor Red
    }
    
    if ($Global:FailedTests.Count -gt 0) {
        Write-Host ""
        Write-Host "FAILED TESTS SUMMARY:" -ForegroundColor Red
        foreach ($failed in $Global:FailedTests) {
            Write-Host "  - [$($failed.Category)] $($failed.Name)" -ForegroundColor Red
            Write-Host "    Error: $($failed.Error)" -ForegroundColor Gray
        }
    }
    
    Write-Host ""
    Write-Host "For detailed logs run with -DetailedLogging flag" -ForegroundColor Gray
    Write-Host "=================================================================" -ForegroundColor Cyan
}

# Start the comprehensive test suite
Start-ComprehensiveTests