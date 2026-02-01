const { createClient } = require('@supabase/supabase-js');

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
  const userId = auth.user.id;
  console.log('Authenticated as:', userId);
  
  // Find existing project with game files
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (!projects || projects.length === 0) {
    console.log('No projects found. Run test-modal-generate.js first.');
    process.exit(1);
  }
  
  // Try to find a project with index.html
  let projectId = null;
  const fs = require('fs');
  const path = require('path');
  
  for (const p of projects) {
    const indexPath = path.join(__dirname, 'users', userId, 'projects', p.id, 'index.html');
    if (fs.existsSync(indexPath)) {
      projectId = p.id;
      console.log('Using project:', p.name, '(', p.id, ')');
      break;
    }
  }
  
  if (!projectId) {
    console.log('No project with game files found. Creating one...');
    // Use the first project and we'll test what happens
    projectId = projects[0].id;
    console.log('Using project without files:', projects[0].name);
  }
  
  console.log('\n--- Test 1: generate-publish-info ---');
  try {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/generate-publish-info`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    console.log('Status:', res.status);
    if (res.ok && data.title) {
      console.log('[PASS] Title:', data.title);
      console.log('       Description:', (data.description || '').substring(0, 80) + '...');
      console.log('       Tags:', (data.tags || []).join(', '));
    } else {
      console.log('[RESULT]', data.error || JSON.stringify(data));
    }
  } catch (e) {
    console.log('[ERROR]', e.message);
  }
  
  console.log('\n--- Test 2: generate-thumbnail ---');
  try {
    const res = await fetch(`${API_BASE}/api/projects/${projectId}/generate-thumbnail`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Game' })
    });
    const data = await res.json();
    console.log('Status:', res.status);
    if (res.ok && data.thumbnailUrl) {
      console.log('[PASS] Thumbnail URL:', data.thumbnailUrl.substring(0, 80) + '...');
    } else {
      console.log('[RESULT]', data.error || JSON.stringify(data));
    }
  } catch (e) {
    console.log('[ERROR]', e.message);
  }
  
  console.log('\nDone.');
}

test().catch(console.error);
