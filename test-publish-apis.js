const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const SUPABASE_URL = 'https://tcynrijrovktirsvwiqb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjeW5yaWpyb3ZrdGlyc3Z3aXFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMjY5OTAsImV4cCI6MjA4NDYwMjk5MH0.y-_E-vuQg84t8BGISdPL18oaYcayS8ip1OLJsZwM3hI';
const API_BASE = 'http://localhost:3000';

async function test() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Login
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
  
  // Create test project and generate game
  const ws = new WebSocket('ws://localhost:3000');
  
  const projectId = await new Promise((resolve, reject) => {
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'init', access_token: token, sessionId: 'test-publish' }));
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'init') {
        ws.send(JSON.stringify({ type: 'createProject', name: 'Publish API Test ' + Date.now() }));
      } else if (msg.type === 'projectCreated') {
        ws.send(JSON.stringify({ type: 'selectProject', projectId: msg.project.id }));
        ws.send(JSON.stringify({ 
          type: 'message', 
          content: '画面をタップするとスコアが増えるシンプルなゲーム',
          skipStyleSelection: true 
        }));
        console.log('Project created:', msg.project.id);
        console.log('Generating game content (this may take a minute)...');
      } else if (msg.type === 'gameUpdated') {
        resolve(msg.projectId);
        ws.close();
      } else if (msg.type === 'error') {
        reject(new Error(msg.message));
      }
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('Timeout')), 180000);
  });
  
  console.log('Game generated successfully\n');
  
  console.log('--- Test 1: generate-publish-info ---');
  try {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/generate-publish-info`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    if (res.ok && data.title) {
      console.log('[PASS] Title:', data.title);
      console.log('       Description:', (data.description || '').substring(0, 60) + '...');
      console.log('       Tags:', (data.tags || []).join(', '));
    } else {
      console.log('[FAIL]', res.status, data.error || 'No title returned');
    }
  } catch (e) {
    console.log('[FAIL]', e.message);
  }
  
  console.log('\n--- Test 2: generate-thumbnail ---');
  try {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/generate-thumbnail`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Game' })
    });
    const data = await res.json();
    if (res.ok && data.thumbnailUrl) {
      console.log('[PASS] Thumbnail URL:', data.thumbnailUrl.substring(0, 70) + '...');
    } else {
      console.log('[FAIL]', res.status, data.error || 'No thumbnail returned');
    }
  } catch (e) {
    console.log('[FAIL]', e.message);
  }
  
  // Cleanup
  console.log('\nCleaning up...');
  const ws2 = new WebSocket('ws://localhost:3000');
  await new Promise((resolve) => {
    ws2.on('open', () => {
      ws2.send(JSON.stringify({ type: 'init', access_token: token, sessionId: 'cleanup' }));
    });
    ws2.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'init') {
        ws2.send(JSON.stringify({ type: 'deleteProject', projectId }));
      } else if (msg.type === 'projectDeleted') {
        console.log('Project deleted');
        ws2.close();
        resolve();
      }
    });
  });
  
  console.log('\nDone.');
}

test().catch(console.error);
