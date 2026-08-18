// Global State
let currentUser = null;

// DOM Elements
const toastEl = document.getElementById('toast');
const loginSection = document.getElementById('login-section');
const internDashboard = document.getElementById('intern-dashboard');
const adminDashboard = document.getElementById('admin-dashboard');

// Auto Redirect if logged in
document.addEventListener('DOMContentLoaded', () => {
  // Load Theme
  const savedTheme = localStorage.getItem('skynora_theme') || 'light';
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
  }

  const savedUser = localStorage.getItem('skynora_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    setupDashboard();
  }

  // Handle Domain selector display and validation on login role selection
  const roleSelect = document.getElementById('login-role');
  const domainGroup = document.getElementById('domain-group');
  const domainInput = document.getElementById('login-domain');
  
  function updateDomainRequired() {
    if (roleSelect.value === 'admin') {
      domainGroup.style.display = 'none';
      if (domainInput) domainInput.required = false;
    } else {
      domainGroup.style.display = 'block';
      if (domainInput) domainInput.required = true;
    }
  }

  if (roleSelect) {
    updateDomainRequired();
    roleSelect.addEventListener('change', updateDomainRequired);
  }
});

// Toast Utility
function showToast(message, duration = 3000) {
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  setTimeout(() => {
    toastEl.classList.add('hidden');
  }, duration);
}

// Login API Form handler
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const role = document.getElementById('login-role').value;
  const domain = document.getElementById('login-domain').value;

  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Authenticating...';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Authentication failed');
    }

    // Role check alignment
    if (data.user.role !== role) {
      throw new Error(`Account role is ${data.user.role}, not ${role}`);
    }

    // If intern, verify or update domain (for testing flexibility)
    if (role === 'intern' && domain) {
      data.user.domain = domain;
    }

    currentUser = data.user;
    localStorage.setItem('skynora_user', JSON.stringify(currentUser));
    
    showToast(`Welcome back, ${currentUser.name}`);
    setupDashboard();
  } catch (err) {
    showToast(err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
});

// Logout Handlers
document.getElementById('logout-btn-intern').addEventListener('click', logout);
document.getElementById('logout-btn-admin').addEventListener('click', logout);

function logout() {
  currentUser = null;
  localStorage.removeItem('skynora_user');
  internDashboard.classList.add('hidden');
  adminDashboard.classList.add('hidden');
  loginSection.classList.remove('hidden');
  showToast('Logged out successfully');
}

// Route to dashboards
function setupDashboard() {
  loginSection.classList.add('hidden');
  if (currentUser.role === 'intern') {
    internDashboard.classList.remove('hidden');
    adminDashboard.classList.add('hidden');
    initInternDashboard();
  } else {
    adminDashboard.classList.remove('hidden');
    internDashboard.classList.add('hidden');
    initAdminDashboard();
  }
}

// -------------------------------------------------------------
// INTERN DASHBOARD CONTROLLER
// -------------------------------------------------------------
async function initInternDashboard() {
  document.getElementById('intern-name-display').textContent = currentUser.name;
  document.getElementById('intern-domain-badge').textContent = currentUser.domain;

  setupInternTabs();
  await updateAttendanceStatus();
  await loadInternTasks();
  await loadLeaveHistory();
  await loadInternAttendanceCalendar();
}

async function loadInternAttendanceCalendar() {
  try {
    const attRes = await fetch(`/api/intern/attendance/${currentUser.id}`);
    const attData = await attRes.json();
    
    const leavesRes = await fetch(`/api/intern/leaves/${currentUser.id}`);
    const leavesData = await leavesRes.json();
    
    renderFlipCalendar('intern-flip-calendar', attData.attendance, leavesData.leaves);
  } catch (err) {
    console.error('Error loading intern attendance calendar:', err);
  }
}

async function updateAttendanceStatus() {
  try {
    const res = await fetch(`/api/intern/status/${currentUser.id}`);
    const data = await res.json();
    
    const checkInPane = document.getElementById('check-in-pane');
    const checkOutPane = document.getElementById('check-out-pane');
    const completedPane = document.getElementById('completed-pane');
    const statusText = document.getElementById('session-status');

    if (!data.todayRecord) {
      // Offline / Checked out
      statusText.textContent = "Status: Offline";
      statusText.style.color = "var(--text-secondary)";
      checkInPane.classList.remove('hidden');
      checkOutPane.classList.add('hidden');
      completedPane.classList.add('hidden');
    } else if (data.todayRecord && !data.todayRecord.checkOut) {
      // Checked in
      statusText.textContent = "Status: Checked In";
      statusText.style.color = "var(--status-success)";
      checkInPane.classList.add('hidden');
      checkOutPane.classList.remove('hidden');
      completedPane.classList.add('hidden');

      const savedDraft = localStorage.getItem('skynora_daily_report_draft');
      if (savedDraft) {
        document.getElementById('daily-report-input').value = savedDraft;
      }
    } else {
      // Checked out and finished
      statusText.textContent = "Status: Completed";
      statusText.style.color = "var(--status-pending)";
      checkInPane.classList.add('hidden');
      checkOutPane.classList.add('hidden');
      completedPane.classList.remove('hidden');
      
      const checkInLocal = new Date(data.todayRecord.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const checkOutLocal = new Date(data.todayRecord.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      document.getElementById('session-summary-text').textContent = 
        `Checked in: ${checkInLocal} | Checked out: ${checkOutLocal} (${data.todayRecord.totalHours} hrs logged today)`;
    }
  } catch (err) {
    showToast('Failed to load session details.');
  }
}

// Check in button trigger
document.getElementById('check-in-btn').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/intern/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Session Started. Have a great work day!');
    triggerNotification('Session Started', 'You checked in successfully for today!');
    updateAttendanceStatus();
    loadInternAttendanceCalendar();
  } catch (err) {
    showToast(err.message);
  }
});

// Check out button trigger
document.getElementById('daily-report-input').addEventListener('input', (e) => {
  localStorage.setItem('skynora_daily_report_draft', e.target.value);
});

document.getElementById('check-out-btn').addEventListener('click', async () => {
  const dailyReport = document.getElementById('daily-report-input').value.trim();
  if (!dailyReport) {
    showToast('Please describe the work completed in your daily report before checking out.');
    return;
  }

  try {
    const res = await fetch('/api/intern/check-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, dailyReport })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Session ended and daily report submitted!');
    triggerNotification('Session Checked Out', 'Your daily report has been submitted.');
    document.getElementById('daily-report-input').value = '';
    localStorage.removeItem('skynora_daily_report_draft');
    updateAttendanceStatus();
    loadInternAttendanceCalendar();
  } catch (err) {
    showToast(err.message);
  }
});

// Leave Form Submit
document.getElementById('leave-request-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const startDate = document.getElementById('leave-start').value;
  const endDate = document.getElementById('leave-end').value;
  const reason = document.getElementById('leave-reason').value.trim();

  try {
    const res = await fetch('/api/intern/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, startDate, endDate, reason })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Leave request submitted successfully.');
    document.getElementById('leave-request-form').reset();
    loadLeaveHistory();
  } catch (err) {
    showToast(err.message);
  }
});

async function loadLeaveHistory() {
  try {
    const res = await fetch(`/api/intern/leaves/${currentUser.id}`);
    const data = await res.json();
    
    const tbody = document.getElementById('leave-history-body');
    tbody.innerHTML = '';

    if (data.leaves.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="empty-state" style="padding: 20px 0;">No leave records found.</td></tr>`;
      return;
    }

    data.leaves.forEach(l => {
      let statusClass = 'status-progress';
      if (l.status === 'approved') statusClass = 'status-completed';
      if (l.status === 'rejected') statusClass = 'status-time';

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <span style="font-weight: 500;">${l.startDate}</span> to 
          <span style="font-weight: 500;">${l.endDate}</span>
        </td>
        <td>${escapeHtml(l.reason)}</td>
        <td>
          <span class="status-badge ${statusClass}">${l.status}</span>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error('Error fetching leaves:', err);
  }
}

async function loadInternTasks() {
  try {
    const res = await fetch(`/api/intern/tasks/${currentUser.id}`);
    const data = await res.json();
    
    const countEl = document.getElementById('tasks-count');
    const emptyState = document.getElementById('tasks-empty-state');
    const listEl = document.getElementById('tasks-list');

    listEl.innerHTML = '';
    countEl.textContent = `${data.tasks.length} Task${data.tasks.length === 1 ? '' : 's'}`;

    if (data.tasks.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    data.tasks.forEach(t => {
      let statusClass = 'status-progress';
      if (t.status === 'Completed') statusClass = 'status-completed';
      if (t.status === 'Requesting More Time') statusClass = 'status-time';

      const div = document.createElement('div');
      div.className = 'task-item';
      div.innerHTML = `
        <div class="task-title-row">
          <h3>${escapeHtml(t.title)}</h3>
          <span class="status-badge ${statusClass}">${t.status}</span>
        </div>
        <p class="task-desc-text">${escapeHtml(t.description)}</p>
        <div class="task-actions-row">
          <span class="task-meta">Assigned: ${new Date(t.assignedAt).toLocaleDateString()}</span>
          <div style="display: flex; gap: 6px; align-items: center;">
            <select class="task-status-select" data-id="${t.id}" style="width: auto; padding: 4px 8px; font-size: 11px;">
              <option value="In Progress" ${t.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
              <option value="Completed" ${t.status === 'Completed' ? 'selected' : ''}>Completed</option>
              <option value="Requesting More Time" ${t.status === 'Requesting More Time' ? 'selected' : ''}>Requesting More Time</option>
            </select>
            <button class="btn btn-secondary btn-sm update-task-btn" data-id="${t.id}">Update</button>
          </div>
        </div>
      `;
      listEl.appendChild(div);
    });

    // Attach listeners
    document.querySelectorAll('.update-task-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const taskId = e.target.getAttribute('data-id');
        const selectEl = document.querySelector(`.task-status-select[data-id="${taskId}"]`);
        const status = selectEl.value;

        try {
          const res = await fetch('/api/intern/tasks/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId, status })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          showToast(`Task status updated to: ${status}`);
          loadInternTasks();
        } catch (err) {
          showToast(err.message);
        }
      });
    });

  } catch (err) {
    console.error('Error fetching tasks:', err);
  }
}

// -------------------------------------------------------------
// ADMIN DASHBOARD CONTROLLER
// -------------------------------------------------------------
async function initAdminDashboard() {
  setupAdminTabs();
  await refreshAdminDashboardData();
}

function setupAdminTabs() {
  const tabs = document.querySelectorAll('.admin-sidebar .sidebar-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      // Remove active classes from admin tabs only
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));

      // Add active to clicked tab
      const currentTab = e.currentTarget;
      currentTab.classList.add('active');
      const targetId = currentTab.getAttribute('data-target');
      document.getElementById(targetId).classList.remove('hidden');

      // Refresh specific tab data if needed
      if (targetId === 'admin-overview') loadAdminOverview();
      if (targetId === 'admin-interns') loadAdminInterns();
      if (targetId === 'admin-tasks') loadAdminTasks();
      if (targetId === 'admin-leaves') loadAdminLeaves();
      if (targetId === 'admin-reports') loadPerformanceReports();
    });
  });
}

function setupInternTabs() {
  const tabs = document.querySelectorAll('.intern-sidebar .sidebar-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      // Remove active classes from intern tabs only
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.intern-tab-content').forEach(c => c.classList.add('hidden'));

      // Add active to clicked tab
      const currentTab = e.currentTarget;
      currentTab.classList.add('active');
      const targetId = currentTab.getAttribute('data-target');
      document.getElementById(targetId).classList.remove('hidden');
    });
  });
}

async function refreshAdminDashboardData() {
  try {
    // Fetch dashboard data exactly once
    const res = await fetch('/api/admin/dashboard');
    const dashboardData = await res.json();

    // Load the active tab (overview) first so the dashboard opens immediately
    await loadAdminOverview(dashboardData);
    
    // Preload all other dashboard tabs in the background using the cached data
    Promise.all([
      loadAdminInterns(),
      loadAdminTasks(dashboardData),
      loadAdminLeaves(dashboardData),
      loadPerformanceReports()
    ]).catch(err => console.error("Error preloading background tabs:", err));
  } catch (err) {
    console.error("Error priming dashboard overview:", err);
  }
}

// TAB 1: OVERVIEW
async function loadAdminOverview(cachedData) {
  try {
    const data = cachedData || await (await fetch('/api/admin/dashboard')).json();

    document.getElementById('stat-total-interns').textContent = data.internsCount;
    document.getElementById('stat-active-checkins').textContent = data.activeCheckins.length;
    document.getElementById('stat-pending-leaves').textContent = data.pendingLeaves.length;

    // Render active checkins
    const activeTbody = document.getElementById('active-checkins-body');
    activeTbody.innerHTML = '';
    if (data.activeCheckins.length === 0) {
      activeTbody.innerHTML = `<tr><td colspan="3" class="empty-state" style="padding:20px 0;">No active work sessions.</td></tr>`;
    } else {
      data.activeCheckins.forEach(ac => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><span style="font-weight:600;">${ac.internName}</span></td>
          <td><span class="badge">${ac.domain}</span></td>
          <td style="font-family:var(--font-mono);">${new Date(ac.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
        `;
        activeTbody.appendChild(row);
      });
    }

    // Render recent daily reports
    const reportsContainer = document.getElementById('recent-reports-container');
    reportsContainer.innerHTML = '';
    if (data.recentReports.length === 0) {
      reportsContainer.innerHTML = `<div class="empty-state">No work reports submitted yet.</div>`;
    } else {
      data.recentReports.forEach(r => {
        const checkOutLocal = new Date(r.checkOut).toLocaleDateString([], { month: 'short', day: 'numeric' });
        const div = document.createElement('div');
        div.className = 'report-item';
        div.innerHTML = `
          <div class="report-meta">
            <span style="font-weight:600; color:var(--text-primary);">${r.internName} (${r.domain})</span>
            <span style="font-family:var(--font-mono);">${checkOutLocal} | ${r.totalHours} hrs</span>
          </div>
          <div class="report-text">${escapeHtml(r.dailyReport)}</div>
        `;
        reportsContainer.appendChild(div);
      });
    }

  } catch (err) {
    console.error('Error fetching admin dashboard summary:', err);
  }
}

// TAB 2: INTERN MANAGEMENT
async function loadAdminInterns() {
  try {
    const res = await fetch('/api/admin/interns');
    const data = await res.json();

    const tbody = document.getElementById('registered-interns-body');
    tbody.innerHTML = '';
    
    if (data.interns.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No interns registered yet.</td></tr>`;
      return;
    }

    data.interns.forEach(int => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><span style="font-weight:600;">${int.name}</span></td>
        <td style="font-family:var(--font-mono);">${int.email}</td>
        <td><span class="badge">${int.domain}</span></td>
        <td style="font-family:var(--font-mono); font-weight:600;">${int.totalHours} hrs</td>
        <td>${int.completedTasks} / ${int.tasksCount} completed</td>
        <td>
          <button class="btn btn-secondary btn-sm delete-intern-btn" data-id="${int.id}" style="color:var(--status-danger); border-color:rgba(231, 76, 60, 0.3); background-color:rgba(231, 76, 60, 0.05); font-weight: 500; font-size: 11px;">Delete</button>
        </td>
      `;
      
      // Load intern's calendar on row click
      row.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-intern-btn')) return;
        
        // Highlight selected row
        tbody.querySelectorAll('tr').forEach(r => r.style.backgroundColor = '');
        row.style.backgroundColor = 'var(--bg-secondary)';
        
        loadAdminInternCalendar(int.id, int.name);
      });

      tbody.appendChild(row);
    });

    // Add click listeners for delete buttons
    document.querySelectorAll('.delete-intern-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const internId = e.target.getAttribute('data-id');
        const internName = e.target.closest('tr').querySelector('span').textContent;
        
        if (!confirm(`Are you sure you want to delete ${internName}? This will also erase all their check-in histories, tasks, and leave records.`)) {
          return;
        }

        try {
          const res = await fetch(`/api/admin/delete-intern/${internId}`, {
            method: 'DELETE'
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          showToast('Intern account deleted successfully');
          
          // Reset calendar if active
          document.getElementById('selected-intern-calendar-name').textContent = 'Select an Intern below...';
          document.getElementById('admin-flip-calendar').innerHTML = `
            <div style="grid-column: span 7; text-align: center; padding: 40px; color: var(--text-secondary); font-size: 13px;">
              Please select an intern from the table above to view their monthly calendar.
            </div>
          `;

          loadAdminInterns();
          refreshAdminDashboardData(); // Refresh summary statistics card numbers
        } catch (err) {
          showToast(err.message);
        }
      });
    });
  } catch (err) {
    console.error('Error loading interns:', err);
  }
}

// Onboard Form Handler
document.getElementById('create-intern-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('intern-name').value.trim();
  const email = document.getElementById('intern-email').value.trim();
  const password = document.getElementById('intern-password').value;
  const domain = document.getElementById('intern-domain').value;

  try {
    const res = await fetch('/api/admin/create-intern', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, domain })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(`Account successfully created for ${name}!`);
    document.getElementById('create-intern-form').reset();
    loadAdminInterns();
  } catch (err) {
    showToast(err.message);
  }
});

// TAB 3: TASK ASSIGNMENT
async function loadAdminTasks(cachedData) {
  try {
    // Load interns list for assignment select dropdown
    const intRes = await fetch('/api/admin/interns');
    const intData = await intRes.json();
    const select = document.getElementById('task-intern');
    
    // Clear select
    select.innerHTML = '<option value="">Select an intern...</option>';
    intData.interns.forEach(int => {
      const option = document.createElement('option');
      option.value = int.id;
      option.textContent = `${int.name} (${int.domain})`;
      select.appendChild(option);
    });

    // Load tasks lists
    const summaryData = cachedData || await (await fetch('/api/admin/dashboard')).json();
    
    const tbody = document.getElementById('all-tasks-body');
    tbody.innerHTML = '';

    if (summaryData.allTasks.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No tasks assigned yet.</td></tr>`;
      return;
    }

    summaryData.allTasks.forEach(t => {
      let statusClass = 'status-progress';
      if (t.status === 'Completed') statusClass = 'status-completed';
      if (t.status === 'Requesting More Time') statusClass = 'status-time';

      const row = document.createElement('tr');
      row.innerHTML = `
        <td><span style="font-weight:600;">${t.internName}</span></td>
        <td>
          <div style="font-weight:500;">${escapeHtml(t.title)}</div>
          <div style="font-size:11px; color:var(--text-secondary);">${escapeHtml(t.description)}</div>
        </td>
        <td><span class="status-badge ${statusClass}">${t.status}</span></td>
        <td style="font-family:var(--font-mono); font-size:11px;">${new Date(t.statusUpdatedAt).toLocaleDateString()}</td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error('Error loading task tools:', err);
  }
}

// Assign Task form submit
document.getElementById('assign-task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const userId = document.getElementById('task-intern').value;
  const title = document.getElementById('task-title').value.trim();
  const description = document.getElementById('task-desc').value.trim();

  try {
    const res = await fetch('/api/admin/tasks/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, title, description })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Task assigned successfully!');
    document.getElementById('assign-task-form').reset();
    loadAdminTasks();
  } catch (err) {
    showToast(err.message);
  }
});

// TAB 4: LEAVE APPROVAL
async function loadAdminLeaves(cachedData) {
  try {
    const data = cachedData || await (await fetch('/api/admin/dashboard')).json();
    
    const tbody = document.getElementById('admin-leaves-body');
    tbody.innerHTML = '';

    if (data.pendingLeaves.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No pending leave requests.</td></tr>`;
      return;
    }

    data.pendingLeaves.forEach(l => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><span style="font-weight:600;">${l.internName}</span></td>
        <td><span class="badge">${l.domain}</span></td>
        <td><span style="font-weight:500;">${l.startDate}</span> to <span style="font-weight:500;">${l.endDate}</span></td>
        <td>${escapeHtml(l.reason)}</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-primary btn-sm review-leave-btn" data-id="${l.id}" data-action="approved">Approve</button>
            <button class="btn btn-secondary btn-sm review-leave-btn" data-id="${l.id}" data-action="rejected">Reject</button>
          </div>
        </td>
      `;
      tbody.appendChild(row);
    });

    // Add event listeners
    document.querySelectorAll('.review-leave-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const leaveId = e.target.getAttribute('data-id');
        const status = e.target.getAttribute('data-action');

        try {
          const res = await fetch('/api/admin/leaves/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leaveId, status })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          showToast(`Leave request ${status}!`);
          loadAdminLeaves();
        } catch (err) {
          showToast(err.message);
        }
      });
    });

  } catch (err) {
    console.error('Error loading leaves portal:', err);
  }
}

// TAB 5: PERFORMANCE REPORTS
async function loadPerformanceReports() {
  try {
    const res = await fetch('/api/admin/monthly-reports');
    const data = await res.json();

    const tbody = document.getElementById('performance-report-body');
    tbody.innerHTML = '';

    if (data.reports.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-state">No intern metrics to show. Try logging attendance.</td></tr>`;
      return;
    }

    data.reports.forEach(r => {
      let ratingClass = 'status-progress';
      if (r.performanceLevel === 'Outstanding') ratingClass = 'status-completed';
      if (r.performanceLevel === 'Needs Improvement') ratingClass = 'status-time';

      const row = document.createElement('tr');
      row.innerHTML = `
        <td><span style="font-weight:600;">${r.name}</span><div style="font-size:11px; color:var(--text-secondary);">${r.email}</div></td>
        <td><span class="badge">${r.domain}</span></td>
        <td style="font-family:var(--font-mono);">${r.totalHours} hrs <div style="font-size:10px; color:var(--text-secondary);">${r.daysCheckedIn} days</div></td>
        <td style="font-family:var(--font-mono);">${r.approvedLeaves} days</td>
        <td>${r.completedTasks} completed <div style="font-size:10px; color:var(--text-secondary);">${r.pendingTasks} active | ${r.requestedTimeTasks} time requested</div></td>
        <td style="font-family:var(--font-mono); font-weight:600;">${r.performanceScore}%</td>
        <td><span class="status-badge ${ratingClass}">${r.performanceLevel}</span></td>
        <td><span style="font-weight:500; font-size:12px;">${r.recommendation}</span></td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error('Error loading performance evaluations:', err);
  }
}

// Helper to escape HTML tags to prevent XSS injection
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// -------------------------------------------------------------
// SETTINGS & THEME & NOTIFICATIONS CONTROLLERS
// -------------------------------------------------------------
function setTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
  localStorage.setItem('skynora_theme', theme);
  
  // Synchronize both intern and admin radio selectors
  document.querySelectorAll('input[name="intern-theme-pref"], input[name="admin-theme-pref"]').forEach(radio => {
    radio.checked = (radio.value === theme);
  });
}

function triggerNotification(title, message) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body: message });
  } else {
    console.log(`System Notification: [${title}] - ${message}`);
  }
}

// Initialize Preferences & Sync Checkboxes
document.addEventListener('DOMContentLoaded', () => {
  // Sidebar Collapse Toggles
  const internToggle = document.getElementById('intern-sidebar-toggle');
  const internSidebar = document.getElementById('intern-sidebar');
  if (internToggle && internSidebar) {
    internToggle.addEventListener('click', () => {
      internSidebar.classList.toggle('collapsed');
      const label = internToggle.querySelector('.sidebar-toggle-label');
      if (internSidebar.classList.contains('collapsed')) {
        label.textContent = '';
      } else {
        label.textContent = 'Collapse';
      }
    });
  }

  const adminToggle = document.getElementById('admin-sidebar-toggle');
  const adminSidebar = document.getElementById('admin-sidebar');
  if (adminToggle && adminSidebar) {
    adminToggle.addEventListener('click', () => {
      adminSidebar.classList.toggle('collapsed');
      const label = adminToggle.querySelector('.sidebar-toggle-label');
      if (adminSidebar.classList.contains('collapsed')) {
        label.textContent = '';
      } else {
        label.textContent = 'Collapse';
      }
    });
  }

  // Mobile Hamburger menu toggle
  const internMenuToggle = document.getElementById('intern-menu-toggle');
  if (internMenuToggle && internSidebar) {
    internMenuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      internSidebar.classList.toggle('open');
    });
  }

  const adminMenuToggle = document.getElementById('admin-menu-toggle');
  if (adminMenuToggle && adminSidebar) {
    adminMenuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      adminSidebar.classList.toggle('open');
    });
  }

  // Close drawers when clicking a tab
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (internSidebar) internSidebar.classList.remove('open');
      if (adminSidebar) adminSidebar.classList.remove('open');
    });
  });

  // Close drawers when clicking outside
  document.addEventListener('click', (e) => {
    if (internSidebar && !internSidebar.contains(e.target) && e.target !== internMenuToggle) {
      internSidebar.classList.remove('open');
    }
    if (adminSidebar && !adminSidebar.contains(e.target) && e.target !== adminMenuToggle) {
      adminSidebar.classList.remove('open');
    }
  });

  const currentTheme = localStorage.getItem('skynora_theme') || 'light';
  setTheme(currentTheme);

  // Sync checkboxes
  const checkboxes = [
    'intern-notify-checkin',
    'intern-notify-checkout',
    'admin-notify-checkin',
    'admin-notify-leave',
    'admin-notify-task'
  ];
  checkboxes.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const saved = localStorage.getItem(id);
      if (saved !== null) {
        el.checked = (saved === 'true');
      }
      el.addEventListener('change', (e) => {
        localStorage.setItem(id, e.target.checked);
      });
    }
  });

  // Handle Theme Preference Changes
  document.querySelectorAll('input[name="intern-theme-pref"], input[name="admin-theme-pref"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      setTheme(e.target.value);
    });
  });

  // Handle Desktop Notification Request
  const desktopNotifyCheck = document.getElementById('intern-notify-desktop');
  if (desktopNotifyCheck) {
    desktopNotifyCheck.checked = (Notification.permission === 'granted');
    desktopNotifyCheck.addEventListener('change', async (e) => {
      if (e.target.checked) {
        const permission = await Notification.requestPermission();
        e.target.checked = (permission === 'granted');
        if (permission === 'granted') {
          showToast('Desktop notifications enabled!');
          triggerNotification('Skynora Portal', 'Desktop notifications are now active!');
        } else {
          showToast('Notification permission denied.');
        }
      }
    });
  }

  // Intern password update form submit
  const internForm = document.getElementById('intern-password-form');
  if (internForm) {
    internForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById('intern-new-password').value;
      try {
        const res = await fetch('/api/user/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id, newPassword })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        showToast('Password updated successfully!');
        internForm.reset();
      } catch (err) {
        showToast(err.message);
      }
    });
  }

  // Admin password update form submit
  const adminForm = document.getElementById('admin-password-form');
  if (adminForm) {
    adminForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById('admin-new-password').value;
      try {
        const res = await fetch('/api/user/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id, newPassword })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        showToast('Password updated successfully!');
        adminForm.reset();
      } catch (err) {
        showToast(err.message);
      }
    });
  }
});

// Admin Dashboard Calendar Loader
async function loadAdminInternCalendar(internId, internName) {
  document.getElementById('selected-intern-calendar-name').textContent = internName;
  try {
    const attRes = await fetch(`/api/intern/attendance/${internId}`);
    const attData = await attRes.json();
    
    const leavesRes = await fetch(`/api/intern/leaves/${internId}`);
    const leavesData = await leavesRes.json();
    
    renderFlipCalendar('admin-flip-calendar', attData.attendance, leavesData.leaves);
  } catch (err) {
    console.error('Error loading intern calendar details:', err);
  }
}

// Flip Calendar Renderer Helper
function renderFlipCalendar(containerId, attendanceList, leavesList) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = '';
  
  // Render Day Headers (Sun - Sat)
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  daysOfWeek.forEach(day => {
    const el = document.createElement('div');
    el.className = 'calendar-header-day';
    el.textContent = day;
    container.appendChild(el);
  });
  
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth(); // 0-indexed
  
  const firstDayIndex = new Date(year, month, 1).getDay(); // Day of week first day falls on (0-6)
  const totalDays = new Date(year, month + 1, 0).getDate(); // Days in current month
  
  // Render empty placeholder cells for days of previous month
  for (let i = 0; i < firstDayIndex; i++) {
    const el = document.createElement('div');
    el.className = 'calendar-cell';
    el.innerHTML = `<div class="calendar-cell-inner"><div class="calendar-cell-front status-empty"></div></div>`;
    container.appendChild(el);
  }
  
  // Render each day of the current month
  for (let day = 1; day <= totalDays; day++) {
    const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // Check if weekend
    const dateObj = new Date(year, month, day);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    // Find attendance record for this day
    const attRecord = attendanceList.find(a => a.date === dateString);
    
    // Find approved leave request for this day
    const leaveRecord = leavesList.find(l => {
      const start = new Date(l.startDate);
      const end = new Date(l.endDate);
      const current = new Date(year, month, day);
      return l.status === 'approved' && current >= start && current <= end;
    });
    
    let frontClass = '';
    let frontContent = '';
    let backContent = '';
    
    if (attRecord) {
      frontClass = 'status-present';
      frontContent = `
        <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
          <span style="font-size:18px; font-weight:700;">${day}</span>
          <span style="width: 8px; height: 8px; background-color: var(--status-success); border-radius: 50%;"></span>
        </div>
        <div style="font-size: 10px; font-weight: 500; color: var(--status-success); margin-top: auto;">PRESENT</div>
      `;
      
      const checkInLocal = new Date(attRecord.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const checkOutLocal = attRecord.checkOut 
        ? new Date(attRecord.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        : 'Active';
      const hoursLogged = attRecord.totalHours ? `${attRecord.totalHours} hrs` : 'Active';
      
      backContent = `
        <div style="font-weight:700; font-size:10px; color:var(--status-success);">PRESENT</div>
        <div style="margin-top:2px;">In: ${checkInLocal}</div>
        <div>Out: ${checkOutLocal}</div>
        <div style="font-weight:700; margin-top:2px; color:var(--status-success);">${hoursLogged}</div>
      `;
    } else if (leaveRecord) {
      frontClass = 'status-leave';
      frontContent = `
        <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
          <span style="font-size:18px; font-weight:700;">${day}</span>
          <span style="width: 8px; height: 8px; background-color: var(--status-danger); border-radius: 50%;"></span>
        </div>
        <div style="font-size: 10px; font-weight: 500; color: var(--status-danger); margin-top: auto;">LEAVE</div>
      `;
      backContent = `
        <div style="font-weight:700; font-size:10px; color:var(--status-danger);">LEAVE</div>
        <div style="margin-top:4px; font-size:8px; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(leaveRecord.reason)}</div>
      `;
    } else if (isWeekend) {
      frontClass = 'status-weekend';
      frontContent = `
        <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
          <span style="font-size:18px; font-weight:700; opacity:0.6;">${day}</span>
        </div>
        <div style="font-size: 10px; font-weight: 500; color: var(--text-secondary); margin-top: auto; opacity:0.6;">WEEKEND</div>
      `;
      backContent = `
        <div style="font-weight:700; color:var(--text-secondary);">WEEKEND</div>
        <div style="margin-top:2px;">Off Session</div>
      `;
    } else {
      frontContent = `
        <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
          <span style="font-size:18px; font-weight:700; opacity:0.3;">${day}</span>
        </div>
        <div style="font-size: 10px; font-weight: 500; color: var(--text-secondary); margin-top: auto; opacity:0.3;">ABSENT</div>
      `;
      backContent = `
        <div style="color:var(--text-secondary); font-size:10px;">NO RECORD</div>
        <div style="margin-top:2px;">Unchecked</div>
      `;
    }
    
    const cell = document.createElement('div');
    cell.className = 'calendar-cell';
    cell.innerHTML = `
      <div class="calendar-cell-inner">
        <div class="calendar-cell-front ${frontClass}">
          ${frontContent}
        </div>
        <div class="calendar-cell-back">
          ${backContent}
        </div>
      </div>
    `;
    container.appendChild(cell);
  }
}
