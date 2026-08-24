const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
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
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const users = await db.getCollection('users');
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Remove password from response
  const { password: _, ...userSafe } = user;
  res.json({ user: userSafe });
});

// Admin: Create Intern
app.post('/api/admin/create-intern', async (req, res) => {
  const { email, password, name, domain } = req.body;
  if (!email || !password || !name || !domain) {
    return res.status(400).json({ error: 'All fields (email, password, name, domain) are required' });
  }

  const users = await db.getCollection('users');
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

  await db.insert('users', newIntern);
  const { password: _, ...newInternSafe } = newIntern;
  res.status(201).json({ success: true, user: newInternSafe });
});

// Intern: Status
app.get('/api/intern/status/:userId', async (req, res) => {
  const { userId } = req.params;
  const users = await db.getCollection('users');
  const user = users.find(u => {
    const uId1 = u.id;
    const uId2 = u._id ? u._id.toString() : null;
    return uId1 === userId || uId2 === userId;
  });
  
  if (!user) {
    return res.json({ todayRecord: null });
  }
  
  const uId1 = user.id;
  const uId2 = user._id ? user._id.toString() : null;
  const today = getTodayDate();
  const attendanceList = await db.getCollection('attendance');
  
  const todayRecord = attendanceList.find(a => (a.userId === uId1 || a.userId === uId2) && a.date === today);
  res.json({ todayRecord: todayRecord || null });
});

// Intern: Check-In
app.post('/api/intern/check-in', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  const today = getTodayDate();
  const attendanceList = await db.getCollection('attendance');
  
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

  await db.insert('attendance', newRecord);
  res.status(201).json({ success: true, record: newRecord });
});

// Intern: Check-Out + Daily Report
app.post('/api/intern/check-out', async (req, res) => {
  const { userId, dailyReport } = req.body;
  if (!userId || !dailyReport) {
    return res.status(400).json({ error: 'User ID and daily report are required' });
  }

  const today = getTodayDate();
  const attendanceList = await db.getCollection('attendance');
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
  await db.saveCollection('attendance', attendanceList);

  res.json({ success: true, record: updatedRecord });
});

// Intern: Leave submission
app.post('/api/intern/leave', async (req, res) => {
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

  await db.insert('leaves', newLeave);
  res.status(201).json({ success: true, leave: newLeave });
});

// Intern: Get Leaves
app.get('/api/intern/leaves/:userId', async (req, res) => {
  const { userId } = req.params;
  const users = await db.getCollection('users');
  const user = users.find(u => {
    const uId1 = u.id;
    const uId2 = u._id ? u._id.toString() : null;
    return uId1 === userId || uId2 === userId;
  });
  if (!user) return res.json({ leaves: [] });

  const uId1 = user.id;
  const uId2 = user._id ? user._id.toString() : null;
  const leaves = await db.getCollection('leaves');
  const userLeaves = leaves.filter(l => l.userId === uId1 || l.userId === uId2).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ leaves: userLeaves });
});

// Intern: Get Attendance History
app.get('/api/intern/attendance/:userId', async (req, res) => {
  const { userId } = req.params;
  const users = await db.getCollection('users');
  const user = users.find(u => {
    const uId1 = u.id;
    const uId2 = u._id ? u._id.toString() : null;
    return uId1 === userId || uId2 === userId;
  });
  if (!user) return res.json({ attendance: [] });

  const uId1 = user.id;
  const uId2 = user._id ? user._id.toString() : null;
  const attendance = await db.getCollection('attendance');
  const userAttendance = attendance.filter(a => a.userId === uId1 || a.userId === uId2);
  res.json({ attendance: userAttendance });
});

// Intern: Get Tasks
app.get('/api/intern/tasks/:userId', async (req, res) => {
  const { userId } = req.params;
  const users = await db.getCollection('users');
  const user = users.find(u => {
    const uId1 = u.id;
    const uId2 = u._id ? u._id.toString() : null;
    return uId1 === userId || uId2 === userId;
  });
  if (!user) return res.json({ tasks: [] });

  const uId1 = user.id;
  const uId2 = user._id ? user._id.toString() : null;
  const tasks = await db.getCollection('tasks');
  const userTasks = tasks.filter(t => t.userId === uId1 || t.userId === uId2).sort((a,b) => new Date(b.assignedAt) - new Date(a.assignedAt));
  res.json({ tasks: userTasks });
});

// Intern: Update Task Status
app.post('/api/intern/tasks/update', async (req, res) => {
  const { taskId, status } = req.body;
  if (!taskId || !status) {
    return res.status(400).json({ error: 'Task ID and status are required' });
  }

  const validStatuses = ['In Progress', 'Completed', 'Requesting More Time'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  const updated = await db.update('tasks', taskId, {
    status,
    statusUpdatedAt: new Date().toISOString()
  });

  if (!updated) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json({ success: true, task: updated });
});

// User: Change Password
app.post('/api/user/change-password', async (req, res) => {
  const { userId, newPassword } = req.body;
  if (!userId || !newPassword) {
    return res.status(400).json({ error: 'User ID and new password are required' });
  }

  const updated = await db.update('users', userId, { password: newPassword });
  if (!updated) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ success: true, message: 'Password updated successfully' });
});

// Admin: Get Interns and their summary
app.get('/api/admin/interns', async (req, res) => {
  const users = (await db.getCollection('users')).filter(u => u.role === 'intern');
  const attendanceList = await db.getCollection('attendance');
  const tasks = await db.getCollection('tasks');

  const internsSummary = users.map(user => {
    const uId = user._id ? user._id.toString() : user.id;
    const userAttendance = attendanceList.filter(a => a.userId === uId);
    const totalHours = userAttendance.reduce((sum, curr) => sum + (curr.totalHours || 0), 0);
    const userTasks = tasks.filter(t => t.userId === uId);
    
    return {
      id: uId,
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
app.get('/api/admin/dashboard', async (req, res) => {
  const users = await db.getCollection('users');
  const attendance = await db.getCollection('attendance');
  const leaves = await db.getCollection('leaves');
  const tasks = await db.getCollection('tasks');

  const interns = users.filter(u => u.role === 'intern');

  // All check-ins today (including completed and active sessions)
  const today = getTodayDate();
  const todaySessions = attendance.filter(a => a.date === today).map(a => {
    const intern = users.find(i => {
      const uId1 = i.id;
      const uId2 = i._id ? i._id.toString() : null;
      return uId1 === a.userId || uId2 === a.userId;
    });
    return {
      ...a,
      internName: intern ? intern.name : 'Unknown',
      domain: intern ? intern.domain : 'N/A'
    };
  });

  const activeCount = attendance.filter(a => a.date === today && a.checkOut === null).length;

  const targetDate = req.query.date;

  // Recent daily reports
  let filteredReports = attendance.filter(a => a.dailyReport && a.dailyReport.trim() !== '');
  if (targetDate) {
    filteredReports = filteredReports.filter(a => a.date === targetDate);
  }

  const sortedReports = filteredReports.sort((a,b) => {
    const timeA = a.checkOut ? new Date(a.checkOut) : new Date(a.checkIn);
    const timeB = b.checkOut ? new Date(b.checkOut) : new Date(b.checkIn);
    return timeB - timeA;
  });

  const recentReportsSlice = targetDate ? sortedReports : sortedReports.slice(0, 10);

  const recentReports = recentReportsSlice.map(a => {
    const intern = users.find(i => {
      const uId1 = i.id;
      const uId2 = i._id ? i._id.toString() : null;
      return uId1 === a.userId || uId2 === a.userId;
    });
    return {
      ...a,
      internName: intern ? intern.name : 'Unknown',
      domain: intern ? intern.domain : 'N/A'
    };
  });

  // All pending leaves
  const pendingLeaves = leaves.filter(l => l.status === 'pending').map(l => {
    const intern = users.find(i => {
      const uId1 = i.id;
      const uId2 = i._id ? i._id.toString() : null;
      return uId1 === l.userId || uId2 === l.userId;
    });
    return {
      ...l,
      internName: intern ? intern.name : 'Unknown',
      domain: intern ? intern.domain : 'N/A'
    };
  });

  // All tasks list
  const allTasks = tasks.map(t => {
    const intern = users.find(i => {
      const uId1 = i.id;
      const uId2 = i._id ? i._id.toString() : null;
      return uId1 === t.userId || uId2 === t.userId;
    });
    return {
      ...t,
      internName: intern ? intern.name : 'Unknown',
      domain: intern ? intern.domain : 'N/A'
    };
  }).sort((a,b) => new Date(b.assignedAt) - new Date(a.assignedAt));

  res.json({
    activeCheckins: todaySessions, // keep property name for frontend compatibility
    activeCount,
    recentReports,
    pendingLeaves,
    allTasks,
    internsCount: interns.length
  });
});

// Admin: Assign Task
app.post('/api/admin/tasks/assign', async (req, res) => {
  const { userId, title, description } = req.body;
  if (!userId || !title || !description) {
    return res.status(400).json({ error: 'User ID, title, and description are required' });
  }

  const users = await db.getCollection('users');
  const intern = users.find(u => {
    const uId1 = u.id;
    const uId2 = u._id ? u._id.toString() : null;
    return (uId1 === userId || uId2 === userId) && u.role === 'intern';
  });
  if (!intern) {
    return res.status(400).json({ error: 'Valid intern ID is required' });
  }

  const internIdToSave = intern.id ? intern.id : (intern._id ? intern._id.toString() : userId);

  const newTask = {
    id: `tsk-${Date.now()}`,
    userId: internIdToSave,
    title,
    description,
    status: 'In Progress',
    assignedAt: new Date().toISOString(),
    statusUpdatedAt: new Date().toISOString(),
    notes: null
  };

  await db.insert('tasks', newTask);
  res.status(201).json({ success: true, task: newTask });
});

// Admin: Review Leaves
app.post('/api/admin/leaves/review', async (req, res) => {
  const { leaveId, status } = req.body;
  if (!leaveId || !status) {
    return res.status(400).json({ error: 'Leave ID and status are required' });
  }

  if (status !== 'approved' && status !== 'rejected') {
    return res.status(400).json({ error: 'Status must be approved or rejected' });
  }

  const updated = await db.update('leaves', leaveId, { status });
  if (!updated) {
    return res.status(404).json({ error: 'Leave request not found' });
  }

  res.json({ success: true, leave: updated });
});

// Admin: Monthly Reports
app.get('/api/admin/monthly-reports', async (req, res) => {
  const users = (await db.getCollection('users')).filter(u => u.role === 'intern');
  const attendance = await db.getCollection('attendance');
  const tasks = await db.getCollection('tasks');
  const leaves = await db.getCollection('leaves');

  // Aggregate monthly report metrics for each intern
  const reports = users.map(user => {
    const uId = user._id ? user._id.toString() : user.id;
    const uId1 = user.id;
    const uId2 = user._id ? user._id.toString() : null;

    const userAttendance = attendance.filter(a => a.userId === uId1 || a.userId === uId2);
    const userTasks = tasks.filter(t => t.userId === uId1 || t.userId === uId2);
    const userLeaves = leaves.filter(l => l.userId === uId1 || l.userId === uId2);

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
      userId: uId,
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

// Admin: Delete Intern
app.delete('/api/admin/delete-intern/:id', async (req, res) => {
  const internId = req.params.id;
  
  // 1. Delete user
  const users = await db.getCollection('users');
  const userExists = users.some(u => {
    const uId = u._id ? u._id.toString() : u.id;
    return uId === internId && u.role === 'intern';
  });
  if (!userExists) {
    return res.status(404).json({ error: 'Intern not found' });
  }
  const updatedUsers = users.filter(u => {
    const uId = u._id ? u._id.toString() : u.id;
    return uId !== internId;
  });
  await db.saveCollection('users', updatedUsers);

  // 2. Delete attendance records
  const attendance = await db.getCollection('attendance');
  const updatedAttendance = attendance.filter(a => a.userId !== internId);
  await db.saveCollection('attendance', updatedAttendance);

  // 3. Delete tasks
  const tasks = await db.getCollection('tasks');
  const updatedTasks = tasks.filter(t => t.userId !== internId);
  await db.saveCollection('tasks', updatedTasks);

  // 4. Delete leaves
  const leaves = await db.getCollection('leaves');
  const updatedLeaves = leaves.filter(l => l.userId !== internId);
  await db.saveCollection('leaves', updatedLeaves);

  res.json({ success: true, message: 'Intern deleted successfully' });
});

// Admin: Delete Specific Attendance Record
app.delete('/api/admin/attendance/:id', async (req, res) => {
  try {
    const attendance = await db.getCollection('attendance');
    const index = attendance.findIndex(a => {
      const aId = a._id ? a._id.toString() : a.id;
      return aId === req.params.id;
    });
    
    if (index === -1) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }
    
    attendance.splice(index, 1);
    await db.saveCollection('attendance', attendance);
    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get Detailed Monthly Timesheet for an Intern
app.get('/api/admin/timesheet/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { year, month } = req.query; // month is 0-indexed (e.g. '0' for Jan, '7' for Aug)
    
    if (!userId || !year || !month) {
      return res.status(400).json({ error: 'User ID, year, and month are required' });
    }
    
    const users = await db.getCollection('users');
    const user = users.find(u => {
      const uId = u._id ? u._id.toString() : u.id;
      return uId === userId;
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const attendance = await db.getCollection('attendance');
    
    // Filter user attendance for the target month and year
    const targetMonthStr = String(Number(month) + 1).padStart(2, '0');
    const prefix = `${year}-${targetMonthStr}`;
    
    const uId1 = user.id;
    const uId2 = user._id ? user._id.toString() : null;
    
    const logs = attendance
      .filter(a => (a.userId === uId1 || a.userId === uId2) && a.date.startsWith(prefix))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
      
    res.json({
      intern: {
        name: user.name,
        email: user.email,
        domain: user.domain
      },
      logs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get Complete Work History for an Intern (Across all months)
app.get('/api/admin/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    
    const users = await db.getCollection('users');
    const user = users.find(u => {
      const uId = u._id ? u._id.toString() : u.id;
      return uId === userId;
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const attendance = await db.getCollection('attendance');
    const uId1 = user.id;
    const uId2 = user._id ? user._id.toString() : null;
    
    const logs = attendance
      .filter(a => a.userId === uId1 || a.userId === uId2)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
      
    res.json({
      intern: {
        name: user.name,
        email: user.email,
        domain: user.domain
      },
      logs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: Delete Assigned Task
app.delete('/api/admin/tasks/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tasks = await db.getCollection('tasks');
    const index = tasks.findIndex(t => {
      const tId = t._id ? t._id.toString() : t.id;
      return tId === id;
    });
    
    if (index === -1) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    tasks.splice(index, 1);
    await db.saveCollection('tasks', tasks);
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// DAILY INFORMATION FEATURE APIs
// ==========================================

async function getOrGenerateSchedule(daysCount = 14) {
  const users = await db.getCollection('users');
  const interns = users.filter(u => u.role === 'intern').sort((a, b) => {
    const aId = a._id ? a._id.toString() : a.id;
    const bId = b._id ? b._id.toString() : b.id;
    return aId.localeCompare(bId);
  });
  
  if (interns.length === 0) return { schedule: [], interns: [] };

  const daily_info_schedule = await db.getCollection('daily_info_schedule') || [];
  const schedule = [];
  const now = new Date();
  let scheduleModified = false;

  for (let i = 0; i < daysCount; i++) {
    const d = new Date(now.getTime() + (i * 24 * 60 * 60 * 1000));
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - (offset * 60 * 1000));
    const dateStr = localDate.toISOString().split('T')[0];

    let existing = daily_info_schedule.find(s => s.date === dateStr);
    if (!existing) {
      // Find the last assigned date prior to this date
      const sortedPrevSchedules = daily_info_schedule
        .filter(s => s.date < dateStr)
        .sort((a, b) => b.date.localeCompare(a.date));

      let nextInternIndex = 0;
      if (sortedPrevSchedules.length > 0) {
        const lastAssignedUserId = sortedPrevSchedules[0].userId;
        const lastInternIndex = interns.findIndex(it => (it._id ? it._id.toString() : it.id) === lastAssignedUserId);
        if (lastInternIndex !== -1) {
          nextInternIndex = (lastInternIndex + 1) % interns.length;
        }
      } else {
        const justAdded = schedule.filter(s => s.date < dateStr).sort((a, b) => b.date.localeCompare(a.date));
        if (justAdded.length > 0) {
          const lastAssignedUserId = justAdded[0].userId;
          const lastInternIndex = interns.findIndex(it => (it._id ? it._id.toString() : it.id) === lastAssignedUserId);
          if (lastInternIndex !== -1) {
            nextInternIndex = (lastInternIndex + 1) % interns.length;
          }
        }
      }

      const assignedIntern = interns[nextInternIndex];
      existing = {
        id: `sch-${dateStr}`,
        date: dateStr,
        userId: assignedIntern._id ? assignedIntern._id.toString() : assignedIntern.id
      };
      daily_info_schedule.push(existing);
      scheduleModified = true;
    }
    
    // Resolve intern details for display
    const internUser = interns.find(it => (it._id ? it._id.toString() : it.id) === existing.userId);
    schedule.push({
      ...existing,
      internName: internUser ? internUser.name : 'Unknown Intern',
      internDomain: internUser ? internUser.domain : 'N/A'
    });
  }

  if (scheduleModified) {
    await db.saveCollection('daily_info_schedule', daily_info_schedule);
  }

  return {
    schedule,
    interns: interns.map(it => ({
      id: it._id ? it._id.toString() : it.id,
      name: it.name,
      domain: it.domain
    }))
  };
}

// Get Schedule
app.get('/api/daily-info/schedule', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 14;
    const data = await getOrGenerateSchedule(days);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit Schedule (Admin only) - with Swap feature to prevent duplicate assignments
app.post('/api/daily-info/schedule/edit', async (req, res) => {
  try {
    const { date, userId } = req.body;
    if (!date || !userId) {
      return res.status(400).json({ error: 'Date and User ID are required.' });
    }
    
    const daily_info_schedule = await db.getCollection('daily_info_schedule') || [];
    const index = daily_info_schedule.findIndex(s => s.date === date);
    
    if (index !== -1) {
      const oldUserId = daily_info_schedule[index].userId;
      
      // Swap: Find if the new user (userId) is already scheduled on a different date
      const duplicateIndex = daily_info_schedule.findIndex(s => s.date !== date && s.userId === userId);
      if (duplicateIndex !== -1) {
        // Swap their slots so oldUserId takes the new user's original slot
        daily_info_schedule[duplicateIndex].userId = oldUserId;
      }
      
      // Assign new user to the target date
      daily_info_schedule[index].userId = userId;
    } else {
      daily_info_schedule.push({
        id: `sch-${date}`,
        date,
        userId
      });
    }
    
    await db.saveCollection('daily_info_schedule', daily_info_schedule);
    res.json({ success: true, message: 'Schedule updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Feed (Active posts in last 24 hours)
app.get('/api/daily-info/feed', async (req, res) => {
  try {
    const posts = await db.getCollection('daily_info_posts') || [];
    const now = Date.now();
    
    // Filter posts that are less than 24 hours old
    const activePosts = posts.filter(p => {
      const createdTime = new Date(p.createdAt).getTime();
      return (now - createdTime) < 24 * 60 * 60 * 1000;
    });
    
    // If some posts expired, we save the active ones back to cleanup DB
    if (activePosts.length !== posts.length) {
      await db.saveCollection('daily_info_posts', activePosts);
    }
    
    // Sort newest first
    activePosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(activePosts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Post (Allowed only on scheduled day)
app.post('/api/daily-info/posts', async (req, res) => {
  try {
    const { userId, text, mediaUrl, mediaType } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required.' });
    }
    
    // Check schedule for today
    const today = getTodayDate();
    const scheduleData = await getOrGenerateSchedule(1);
    const todaySch = scheduleData.schedule.find(s => s.date === today);
    
    if (!todaySch || todaySch.userId !== userId) {
      return res.status(403).json({ error: "It is not your scheduled day to post daily information." });
    }
    
    const users = await db.getCollection('users');
    const user = users.find(u => (u._id ? u._id.toString() : u.id) === userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    
    const posts = await db.getCollection('daily_info_posts') || [];
    const newPost = {
      id: `post-${Date.now()}`,
      userId,
      username: user.name,
      userDomain: user.domain || 'Intern',
      text: text || '',
      mediaUrl: mediaUrl || '',
      mediaType: mediaType || 'none',
      createdAt: new Date().toISOString(),
      likes: [],
      comments: []
    };
    
    posts.push(newPost);
    await db.saveCollection('daily_info_posts', posts);
    res.status(201).json({ success: true, post: newPost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Like / Unlike Post
app.post('/api/daily-info/posts/:postId/like', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required.' });
    }
    
    const posts = await db.getCollection('daily_info_posts') || [];
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    
    if (!post.likes) post.likes = [];
    const likeIndex = post.likes.indexOf(userId);
    if (likeIndex !== -1) {
      // Unlike
      post.likes.splice(likeIndex, 1);
    } else {
      // Like
      post.likes.push(userId);
    }
    
    await db.saveCollection('daily_info_posts', posts);
    res.json({ success: true, likes: post.likes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Comment
app.post('/api/daily-info/posts/:postId/comment', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId, text } = req.body;
    if (!userId || !text) {
      return res.status(400).json({ error: 'User ID and comment text are required.' });
    }
    
    const users = await db.getCollection('users');
    const user = users.find(u => (u._id ? u._id.toString() : u.id) === userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    
    const posts = await db.getCollection('daily_info_posts') || [];
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found.' });
    }
    
    const comment = {
      id: `comment-${Date.now()}`,
      userId,
      username: user.name,
      text,
      createdAt: new Date().toISOString()
    };
    
    if (!post.comments) post.comments = [];
    post.comments.push(comment);
    
    await db.saveCollection('daily_info_posts', posts);
    res.json({ success: true, comments: post.comments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback HTML page routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Skynora Attendance Management System is running on http://localhost:${PORT}`);
});
