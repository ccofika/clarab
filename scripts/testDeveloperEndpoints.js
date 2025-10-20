require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:5000';

// Test credentials for developer account
const DEVELOPER_EMAIL = 'andrijatrosic@mebit.io';
const DEVELOPER_PASSWORD = 'Mebit2024!Dev';

let authToken = null;

// Login function
async function login() {
  try {
    console.log('\n🔐 Logging in as developer...');
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: DEVELOPER_EMAIL,
      password: DEVELOPER_PASSWORD
    });

    authToken = response.data.token;
    console.log('✅ Login successful!');
    console.log('   Role:', response.data.role);
    console.log('   Token:', authToken.substring(0, 20) + '...');
    return true;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    return false;
  }
}

// Test metrics endpoint
async function testMetrics() {
  try {
    console.log('\n📊 Testing /api/developer/metrics...');
    const response = await axios.get(`${BASE_URL}/api/developer/metrics`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    console.log('✅ Metrics endpoint working!');
    console.log('   Total Users:', response.data.database.users.total);
    console.log('   Total Workspaces:', response.data.database.workspaces.total);
    console.log('   Server Uptime:', response.data.system.uptime);
    console.log('   Memory Used:', response.data.process.memoryUsageMB.heapUsed + ' MB');
  } catch (error) {
    console.error('❌ Metrics test failed:', error.response?.data || error.message);
  }
}

// Test health check endpoint
async function testHealth() {
  try {
    console.log('\n🏥 Testing /api/developer/health...');
    const response = await axios.get(`${BASE_URL}/api/developer/health`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    console.log('✅ Health check endpoint working!');
    console.log('   Status:', response.data.status);
    console.log('   Database:', response.data.database.status);
    console.log('   DB Response Time:', response.data.database.responseTime);
  } catch (error) {
    console.error('❌ Health check test failed:', error.response?.data || error.message);
  }
}

// Test users endpoint
async function testUsers() {
  try {
    console.log('\n👥 Testing /api/developer/users...');
    const response = await axios.get(`${BASE_URL}/api/developer/users`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    console.log('✅ Users endpoint working!');
    console.log('   Total Users:', response.data.count);
    console.log('   First User:', response.data.users[0]?.name, '-', response.data.users[0]?.email);
  } catch (error) {
    console.error('❌ Users test failed:', error.response?.data || error.message);
  }
}

// Test workspaces endpoint
async function testWorkspaces() {
  try {
    console.log('\n📁 Testing /api/developer/workspaces...');
    const response = await axios.get(`${BASE_URL}/api/developer/workspaces`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    console.log('✅ Workspaces endpoint working!');
    console.log('   Total Workspaces:', response.data.count);
    if (response.data.workspaces[0]) {
      console.log('   First Workspace:', response.data.workspaces[0].name);
      console.log('   Type:', response.data.workspaces[0].type);
      console.log('   Members:', response.data.workspaces[0].stats.memberCount);
    }
  } catch (error) {
    console.error('❌ Workspaces test failed:', error.response?.data || error.message);
  }
}

// Test database stats endpoint
async function testDatabaseStats() {
  try {
    console.log('\n💾 Testing /api/developer/database-stats...');
    const response = await axios.get(`${BASE_URL}/api/developer/database-stats`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    console.log('✅ Database stats endpoint working!');
    console.log('   Database Name:', response.data.database.name);
    console.log('   Collections:', response.data.database.collections);
    console.log('   Data Size:', response.data.database.dataSize);
    console.log('   Total Size:', response.data.database.totalSize);
  } catch (error) {
    console.error('❌ Database stats test failed:', error.response?.data || error.message);
  }
}

// Test logs endpoint
async function testLogs() {
  try {
    console.log('\n📋 Testing /api/developer/logs...');
    const response = await axios.get(`${BASE_URL}/api/developer/logs`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    console.log('✅ Logs endpoint working!');
    console.log('   Log Count:', response.data.count);
    console.log('   Note:', response.data.note);
  } catch (error) {
    console.error('❌ Logs test failed:', error.response?.data || error.message);
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Testing Developer Endpoints');
  console.log('================================\n');

  // Login first
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.error('\n❌ Cannot proceed without login. Exiting...');
    process.exit(1);
  }

  // Run all tests
  await testMetrics();
  await testHealth();
  await testUsers();
  await testWorkspaces();
  await testDatabaseStats();
  await testLogs();

  console.log('\n✨ All tests completed!');
  console.log('================================\n');
  process.exit(0);
}

// Run tests
runTests();
