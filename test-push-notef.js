#!/usr/bin/env node
require('dotenv').config();
const pushService = require('./server/pushService');
const { supabaseAdmin } = require('./server/supabaseClient');

(async () => {
  try {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('email', 'notef@neighbor.gg')
      .single();

    if (!user) {
      console.log('User not found');
      return;
    }

    console.log('Sending to user:', user.id);

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, title')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (project) {
      console.log('Using project:', project.title, project.id);
      const result = await pushService.sendPushToUser(user.id, {
        title: 'Test Notification',
        body: 'Android navigation test - tap to open project',
        url: '/project/' + project.id,
        projectId: project.id,
        type: 'project'
      });
      console.log('Result:', JSON.stringify(result, null, 2));
    } else {
      console.log('No project found, sending to notifications page');
      const result = await pushService.sendPushToUser(user.id, {
        title: 'Test Notification',
        body: 'Android test - tap to open notifications',
        url: '/notifications',
        type: 'system'
      });
      console.log('Result:', JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  process.exit(0);
})();
