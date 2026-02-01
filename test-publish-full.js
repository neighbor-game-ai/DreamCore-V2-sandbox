const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const SUPABASE_URL = 'https://tcynrijrovktirsvwiqb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjeW5yaWpyb3ZrdGlyc3Z3aXFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMjY5OTAsImV4cCI6MjA4NDYwMjk5MH0.y-_E-vuQg84t8BGISdPL18oaYcayS8ip1OLJsZwM3hI';
const API_BASE = 'http://localhost:3000';

async function collectUntilGameUpdated(ws, timeout = 180000) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const timer = setTimeout(() => {
      console.log('  Timeout, got', messages.length, 'messages');
      resolve({ messages, success: false });
    }, timeout);

    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      messages.push(msg);
      
      if (msg.type === 'jobStarted') console.log('  Job started');
      if (msg.type === 'gameUpdated') {
        clearTimeout(timer);
        ws.removeListener('message', handler);
        resolve({ messages, success: true, projectId: msg.projectId });
      }
      if (msg.type === 'error') {
        clearTimeout(timer);
        ws.removeListener('message', handler);
        resolve({ messages, success: false, error: msg.message });
      }
    };
    ws.on('message', handler);
  });
}

async function test() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: 'project-owner-1769066267048@test.local',
    password: 'TestPassword123!'
  });
  
  if (authError) {
    console.error('Auth failed:', authError.message);
    process.exit(1);
  }
  
  const token = auth.session.access_token;
  console.log('Authenticated');
  
  // Step 1: Create project and generate game
  console.log('\n=== Step 1: Create project and generate game ===');
  const ws = new WebSocket('ws://localhost:3000');
  
  let projectId = await new Promise((resolve, reject) => {
    ws.on('open', async () => {
      // Init
      ws.send(JSON.stringify({ type: 'init', access_token: token, sessionId: 'publish-test-' + Date.now() }));
    });
    
    ws.on('message', async (data) => {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'init') {
        ws.send(JSON.stringify({ type: 'createProject', name: 'Publish Test ' + Date.now() }));
      }
      
      if (msg.type === 'projectCreated') {
        console.log('Project created:', msg.project.id);
        ws.send(JSON.stringify({ type: 'selectProject', projectId: msg.project.id }));
        // Use a clear game generation prompt
        ws.send(JSON.stringify({ 
          type: 'message', 
          content: 'タップするとスコアが1増えるシンプルなクリッカーゲームを作成してください。Canvas 2Dを使用。',
          skipStyleSelection: true,
          forceGeneration: true
        }));
        console.log('Generating game...');
        
        const result = await collectUntilGameUpdated(ws);
        if (result.success) {
          resolve(result.projectId);
        } else {
          reject(new Error(result.error || 'Game generation failed'));
        }
      }
    });
    
    ws.on('error', reject);
  });
  
  console.log('Game generated successfully:', projectId);
  ws.close();
  
  // Step 2: Test generate-publish-info
  console.log('\n=== Step 2: Test generate-publish-info ===');
  try {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/generate-publish-info`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    console.log('Status:', res.status);
    if (res.ok && data.title) {
      console.log('[PASS] Title:', data.title);
      console.log('       Description:', (data.description || '').substring(0, 80));
      console.log('       Tags:', (data.tags || []).join(', '));
    } else {
      console.log('[FAIL]', data.error || JSON.stringify(data).substring(0, 200));
    }
  } catch (e) {
    console.log('[ERROR]', e.message);
  }
  
  // Step 3: Test generate-thumbnail
  console.log('\n=== Step 3: Test generate-thumbnail ===');
  try {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/generate-thumbnail`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Clicker Game' })
    });
    const data = await res.json();
    console.log('Status:', res.status);
    if (res.ok && data.thumbnailUrl) {
      console.log('[PASS] Thumbnail generated:', data.thumbnailUrl.substring(0, 80));
    } else {
      console.log('[FAIL]', data.error || JSON.stringify(data).substring(0, 200));
    }
  } catch (e) {
    console.log('[ERROR]', e.message);
  }
  
  // Cleanup
  console.log('\n=== Cleanup ===');
  const ws2 = new WebSocket('ws://localhost:3000');
  await new Promise((resolve) => {
    ws2.on('open', () => {
      ws2.send(JSON.stringify({ type: 'init', access_token: token, sessionId: 'cleanup' }));
    });
    ws2.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'init') {
        ws2.send(JSON.stringify({ type: 'deleteProject', projectId }));
      }
      if (msg.type === 'projectDeleted') {
        console.log('Project deleted');
        ws2.close();
        resolve();
      }
    });
    setTimeout(resolve, 5000);
  });
  
  console.log('\nDone.');
}

test().catch(e => {
  console.error('Test failed:', e.message);
  process.exit(1);
});
