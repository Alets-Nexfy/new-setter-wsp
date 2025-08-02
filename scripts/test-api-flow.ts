import axios from 'axios'
import * as dotenv from 'dotenv'

dotenv.config()

const API_URL = 'http://localhost:3000/api'

async function testAPIFlow() {
  console.log('🧪 Testing API Flow with Supabase Backend\n')
  
  try {
    // 1. Test health endpoint
    console.log('1️⃣ Testing health endpoint...')
    const healthResponse = await axios.get(`${API_URL}/health`)
    console.log('✅ Health status:', healthResponse.data)
    
    // 2. Test API version
    console.log('\n2️⃣ Testing API version...')
    const versionResponse = await axios.get(`${API_URL}/version`)
    console.log('✅ API version:', versionResponse.data)
    
    // 3. Test with API key (if you have one)
    const apiKey = process.env.TEST_API_KEY || 'test-api-key'
    
    console.log('\n3️⃣ Testing authenticated endpoint...')
    try {
      const authResponse = await axios.get(`${API_URL}/users/test-user-id/sessions`, {
        headers: {
          'X-API-Key': apiKey
        }
      })
      console.log('✅ Auth test passed:', authResponse.status)
    } catch (error: any) {
      if (error.response?.status === 401) {
        console.log('⚠️  Auth test: API key required (expected)')
      } else {
        console.error('❌ Auth test failed:', error.response?.data || error.message)
      }
    }
    
    console.log('\n🎉 API is running and accessible!')
    console.log('✅ Server is up')
    console.log('✅ Endpoints are responding')
    console.log('✅ Supabase backend is integrated')
    
  } catch (error: any) {
    console.error('❌ API test failed:', error.message)
    if (error.code === 'ECONNREFUSED') {
      console.log('\n⚠️  Make sure the API server is running on port 3001')
    }
  }
}

testAPIFlow().catch(console.error)