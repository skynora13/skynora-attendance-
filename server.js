const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helpers
function getTodayDate() {
  const now = new Date();
  // Format as YYYY-MM-DD in local timezone
  const offset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
}

// APIs
// Auth
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const users = db.getCollection('users');
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Remove password from response
  const { password: _, ...userSafe } = user;
  res.json({ user: userSafe });
});

// Admin: Create Intern
app.post('/api/admin/create-intern', (req, res) => {
  const { email, password, name, domain } = req.body;
  if (!email || !password || !name || !domain) {
    return res.status(400).json({ error: 'All fields (email, password, name, domain) are required' });
  }

  const users = db.getCollection('users');
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'User with this email already exists' });
  }

  const newIntern = {
    id: `u-${Date.now()}`,
    email: email.toLowerCase(),
    password,
    name,
    role: 'intern',
    domain
  };

  db.insert('users', newIntern);
  const { password: _, ...newInternSafe } = newIntern;
  res.status(201).json({ success: true, user: newInternSafe });
});

// Intern: Status
app.get('/api/intern/status/:userId', (req, res) => {
  const { userId } = req.params;
  const today = getTodayDate();
  const attendanceList = db.getCollection('attendance');
  
  const todayRecord = attendanceList.find(a => a.userId === userId && a.date === today);
  res.json({ todayRecord: todayRecord || null });
});

// Intern: Check-In
app.post('/api/intern/check-in', (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  const today = getTodayDate();
  const attendanceList = db.getCollection('attendance');
  
  // Check if already checked in today
  let todayRecord = attendanceList.find(a => a.userId === userId && a.date === today);
  if (todayRecord) {
    return res.status(400).json({ error: 'Already checked in for today', record: todayRecord });
  }

  const newRecord = {
    id: `att-${Date.now()}`,
    userId,
    date: today,
    checkIn: new Date().toISOString(),
    checkOut: null,
    dailyReport: null,
    totalHours: null
  };

  db.insert('attendance', newRecord);
  res.status(201).json({ success: true, record: newRecord });
});

// Intern: Check-Out + Daily Report
app.post('/api/intern/check-out', (req, res) => {
  const { userId, dailyReport } = req.body;
  if (!userId || !dailyReport) {
    return res.status(400).json({ error: 'User ID and daily report are required' });
  }

  const today = getTodayDate();
  const attendanceList = db.getCollection('attendance');
  const recordIndex = attendanceList.findIndex(a => a.userId === userId && a.date === today);

  if (recordIndex === -1) {
    return res.status(400).json({ error: 'No active check-in found for today. Please check-in first.' });
  }

  const record = attendanceList[recordIndex];
  if (record.checkOut) {
    return res.status(400).json({ error: 'Already checked out for today.' });
  }

  const checkOutTime = new Date();
  const checkInTime = new Date(record.checkIn);
  
  // Calculate total hours
  const diffMs = checkOutTime - checkInTime;
  const hours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));

  const updatedRecord = {
    ...record,
    checkOut: checkOutTime.toISOString(),
    dailyReport,
    totalHours: hours
  };

  attendanceList[recordIndex] = updatedRecord;
  db.saveCollection('attendance', attendanceList);

  res.json({ success: true, record: updatedRecord });
});

// Intern: Leave submission
app.post('/api/intern/leave', (req, res) => {
  const { userId, startDate, endDate, reason } = req.body;
  if (!userId || !startDate || !endDate || !reason) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const newLeave = {
    id: `lv-${Date.now()}`,
    userId,
    startDate,
    endDate,
    reason,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  db.insert('leaves', newLeave);
  res.status(201).json({ success: true, leave: newLeave });
});

// Intern: Get Leaves
app.get('/api/intern/leaves/:userId', (req, res) => {
  const { userId } = req.params;
  const leaves = db.getCollection('leaves');
  const userLeaves = leaves.filter(l => l.userId === userId).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ leaves: userLeaves });
});

// Intern: Get Tasks
app.get('/api/intern/tasks/:userId', (req, res) => {
  const { userId } = req.params;
  const tasks = db.getCollection('tasks');
  const userTasks = tasks.filter(t => t.userId === userId).sort((a,b) => new Date(b.assignedAt) - new Date(a.assignedAt));
  res.json({ tasks: userTasks });
});

// Intern: Update Task Status
app.post('/api/intern/tasks/update', (req, res) => {
  const { taskId, status } = req.body;
  if (!taskId || !status) {
    return res.status(400).json({ error: 'Task ID and status are required' });
  }

  const validStatuses = ['In Progress', 'Completed', 'Requesting More Time'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  const updated = db.update('tasks', taskId, {
    status,
    statusUpdatedAt: new Date().toISOString()
  });

  if (!updated) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json({ success: true, task: updated });
});

// User: Change Password
app.post('/api/user/change-password', (req, res) => {
  const { userId, newPassword } = req.body;
  if (!userId || !newPassword) {
    return res.status(400).json({ error: 'User ID and new password are required' });
  }

  const updated = db.update('users', userId, { password: newPassword });
  if (!updated) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ success: true, message: 'Password updated successfully' });
});

// Admin: Get Interns and their summary
app.get('/api/admin/interns', (req, res) => {
  const users = db.getCollection('users').filter(u => u.role === 'intern');
  const attendanceList = db.getCollection('attendance');
  const tasks = db.getCollection('tasks');

  const internsSummary = users.map(user => {
    const userAttendance = attendanceList.filter(a => a.userId === user.id);
    const totalHours = userAttendance.reduce((sum, curr) => sum + (curr.totalHours || 0), 0);
    const userTasks = tasks.filter(t => t.userId === user.id);
    
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      domain: user.domain,
      totalHours: parseFloat(totalHours.toFixed(2)),
      attendanceCount: userAttendance.length,
      tasksCount: userTasks.length,
      completedTasks: userTasks.filter(t => t.status === 'Completed').length
    };
  });

  res.json({ interns: internsSummary });
});

// Admin: Full Dashboard details
app.get('/api/admin/dashboard', (req, res) => {
  const users = db.getCollection('users');
  const attendance = db.getCollection('attendance');
  const leaves = db.getCollection('leaves');
  const tasks = db.getCollection('tasks');

  const interns = users.filter(u => u.role === 'intern');

  // Active check-ins today
  const today = getTodayDate();
  const activeCheckins = attendance.filter(a => a.date === today && a.checkOut === null).map(a => {
    const intern = interns.find(i => i.id === a.userId);
    return {
      ...a,
      internName: intern ? intern.name : 'Unknown',
      domain: intern ? intern.domain : 'N/A'
    };
  });

  // Recent daily reports
  const recentReports = attendance.filter(a => a.dailyReport !== null).sort((a,b) => new Date(b.checkOut) - new Date(a.checkOut)).slice(0, 10).map(a => {
    const intern = interns.find(i => i.id === a.userId);
    return {
      ...a,
      internName: intern ? intern.name : 'Unknown',
      domain: intern ? intern.domain : 'N/A'
    };
  });

  // All pending leaves
  const pendingLeaves = leaves.filter(l => l.status === 'pending').map(l => {
    const intern = interns.find(i => i.id === l.userId);
    return {
      ...l,
      internName: intern ? intern.name : 'Unknown',
      domain: intern ? intern.domain : 'N/A'
    };
  });

  // All tasks list
  const allTasks = tasks.map(t => {
    const intern = interns.find(i => i.id === t.userId);
    return {
      ...t,
      internName: intern ? intern.name : 'Unknown',
      domain: intern ? intern.domain : 'N/A'
    };
  }).sort((a,b) => new Date(b.assignedAt) - new Date(a.assignedAt));

  res.json({
    activeCheckins,
    recentReports,
    pendingLeaves,
    allTasks,
    internsCount: interns.length
  });
});

// Admin: Assign Task
app.post('/api/admin/tasks/assign', (req, res) => {
  const { userId, title, description } = req.body;
  if (!userId || !title || !description) {
    return res.status(400).json({ error: 'User ID, title, and description are required' });
  }

  const users = db.getCollection('users');
  const intern = users.find(u => u.id === userId && u.role === 'intern');
  if (!intern) {
    return res.status(400).json({ error: 'Valid intern ID is required' });
  }

  const newTask = {
    id: `tsk-${Date.now()}`,
    userId,
    title,
    description,
    status: 'In Progress',
    assignedAt: new Date().toISOString(),
    statusUpdatedAt: new Date().toISOString(),
    notes: null
  };

  db.insert('tasks', newTask);
  res.status(201).json({ success: true, task: newTask });
});

// Admin: Review Leaves
app.post('/api/admin/leaves/review', (req, res) => {
  const { leaveId, status } = req.body;
  if (!leaveId || !status) {
    return res.status(400).json({ error: 'Leave ID and status are required' });
  }

  if (status !== 'approved' && status !== 'rejected') {
    return res.status(400).json({ error: 'Status must be approved or rejected' });
  }

  const updated = db.update('leaves', leaveId, { status });
  if (!updated) {
    return res.status(404).json({ error: 'Leave request not found' });
  }

  res.json({ success: true, leave: updated });
});

// Admin: Monthly Reports
app.get('/api/admin/monthly-reports', (req, res) => {
  const users = db.getCollection('users').filter(u => u.role === 'intern');
  const attendance = db.getCollection('attendance');
  const tasks = db.getCollection('tasks');
  const leaves = db.getCollection('leaves');

  // Aggregate monthly report metrics for each intern
  const reports = users.map(user => {
    const userAttendance = attendance.filter(a => a.userId === user.id);
    const userTasks = tasks.filter(t => t.userId === user.id);
    const userLeaves = leaves.filter(l => l.userId === user.id);

    // Group hours and days worked
    const totalHours = userAttendance.reduce((sum, a) => sum + (a.totalHours || 0), 0);
    const daysCheckedIn = userAttendance.length;

    // Task completions
    const completedTasks = userTasks.filter(t => t.status === 'Completed').length;
    const pendingTasks = userTasks.filter(t => t.status === 'In Progress').length;
    const requestedTimeTasks = userTasks.filter(t => t.status === 'Requesting More Time').length;

    // Leave counts
    const approvedLeaves = userLeaves.filter(l => l.status === 'approved').reduce((sum, l) => {
      const start = new Date(l.startDate);
      const end = new Date(l.endDate);
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      return sum + diffDays;
    }, 0);

    // Score / Stipend Rating recommendation (Mock algorithm based on completed tasks, hours & clean leave records)
    const taskCompletionRate = userTasks.length > 0 ? (completedTasks / userTasks.length) * 100 : 100;
    const hoursTarget = 160; // Standard remote target
    const hoursCompletionRate = Math.min((totalHours / hoursTarget) * 100, 100);
    
    // Performance score out of 100
    let score = Math.round((taskCompletionRate * 0.6) + (hoursCompletionRate * 0.4));
    if (approvedLeaves > 5) score -= (approvedLeaves - 5) * 5; // Penalty for excess leaves
    score = Math.max(Math.min(score, 100), 0);

    // Performance Level
    let level = 'Needs Improvement';
    if (score >= 90) level = 'Outstanding';
    else if (score >= 75) level = 'Exceeds Expectations';
    else if (score >= 50) level = 'Meets Expectations';

    // Stipend Recommendation
    let recommendation = 'Base Stipend';
    if (score >= 90) recommendation = 'Base Stipend + 15% Performance Bonus';
    else if (score >= 75) recommendation = 'Base Stipend + 5% Bonus';
    else if (score < 50) recommendation = 'Base Stipend - Review Attendance';

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      domain: user.domain,
      totalHours: parseFloat(totalHours.toFixed(1)),
      daysCheckedIn,
      completedTasks,
      pendingTasks,
      requestedTimeTasks,
      approvedLeaves,
      performanceScore: score,
      performanceLevel: level,
      recommendation
    };
  });

  res.json({ reports });
});

// Fallback HTML page routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Skynora Attendance Management System is running on http://localhost:${PORT}`);
});
