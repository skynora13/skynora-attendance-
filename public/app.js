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

  // Setup Timesheet generator events
  const genBtn = document.getElementById('generate-timesheet-btn');
  if (genBtn) {
    genBtn.addEventListener('click', async () => {
      const userId = document.getElementById('report-intern-select').value;
      const month = document.getElementById('report-month-select').value;
      const year = new Date().getFullYear();
      
      if (!userId) {
        showToast('Please select an Intern first.');
        return;
      }
      
      try {
        const res = await fetch(`/api/admin/timesheet/${userId}?year=${year}&month=${month}`);
        if (!res.ok) throw new Error('Failed to load timesheet data');
        
        const data = await res.json();
        renderGeneratedTimesheet(data, month, year);
      } catch (err) {
        showToast(err.message);
      }
    });
  }
  
  const printBtn = document.getElementById('print-timesheet-btn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      const printContent = document.getElementById('printable-timesheet-area').innerHTML;
      const win = window.open('', '_blank');
      win.document.write(`
        <html>
          <head>
            <title>Intern Monthly Timesheet Report</title>
            <style>
              body { font-family: 'Plus Jakarta Sans', sans-serif; padding: 40px; color: #111827; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #e5e7eb; padding: 10px 12px; text-align: left; font-size: 12px; }
              th { background-color: #f9fafb; font-weight: 700; }
              .data-table { border-spacing: 0; }
            </style>
          </head>
          <body>
            ${printContent}
            <script>
              window.onload = function() {
                window.print();
                setTimeout(function() { window.close(); }, 500);
              }
            <\/script>
          </body>
        </html>
      `);
      win.document.close();
    });
  }

  // Setup History tab event
  const loadHistoryBtn = document.getElementById('load-history-btn');
  if (loadHistoryBtn) {
    loadHistoryBtn.addEventListener('click', async () => {
      const userId = document.getElementById('history-intern-select').value;
      if (!userId) {
        showToast('Please select an Intern first.');
        return;
      }
      
      try {
        const res = await fetch(`/api/admin/history/${userId}`);
        if (!res.ok) throw new Error('Failed to load history data');
        
        const data = await res.json();
        renderInternHistory(data);
      } catch (err) {
        showToast(err.message);
      }
    });
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
    
    initDoubleCalendar('intern', attData.attendance, leavesData.leaves);
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
    document.getElementById('stat-active-checkins').textContent = data.activeCount;
    document.getElementById('stat-pending-leaves').textContent = data.pendingLeaves.length;

    // Render active/completed checkins today
    const activeTbody = document.getElementById('active-checkins-body');
    activeTbody.innerHTML = '';
    if (data.activeCheckins.length === 0) {
      activeTbody.innerHTML = `<tr><td colspan="6" class="empty-state" style="padding:20px 0;">No work sessions recorded today.</td></tr>`;
    } else {
      data.activeCheckins.forEach(ac => {
        const checkInTime = new Date(ac.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const checkOutTime = ac.checkOut 
          ? new Date(ac.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
          : '<span class="status-badge status-completed" style="padding:2px 6px;">Active</span>';
        const duration = ac.totalHours ? `${ac.totalHours} hrs` : '--';
        
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><span style="font-weight:600;">${ac.internName}</span></td>
          <td><span class="badge">${ac.domain}</span></td>
          <td style="font-family:var(--font-mono);">${checkInTime}</td>
          <td style="font-family:var(--font-mono);">${checkOutTime}</td>
          <td style="font-family:var(--font-mono); font-weight:600;">${duration}</td>
          <td>
            <button class="btn btn-secondary btn-sm delete-session-btn" data-id="${ac._id || ac.id}" style="color: var(--status-danger); border-color: var(--status-danger); padding: 2px 6px; font-size: 10px;">Delete</button>
          </td>
        `;
        activeTbody.appendChild(row);
      });
    }

    // Render recent daily reports with full times and hours
    const reportsContainer = document.getElementById('recent-reports-container');
    reportsContainer.innerHTML = '';
    if (data.recentReports.length === 0) {
      reportsContainer.innerHTML = `<div class="empty-state">No work reports submitted yet.</div>`;
    } else {
      data.recentReports.forEach(r => {
        const reportDate = new Date(r.checkIn).toLocaleDateString([], { month: 'short', day: 'numeric' });
        const checkInTime = new Date(r.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const checkOutTime = r.checkOut 
          ? new Date(r.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
          : 'Active';
        const hoursLogged = r.totalHours ? `${r.totalHours} hrs` : 'Active';
        
        const div = document.createElement('div');
        div.className = 'report-item';
        div.innerHTML = `
          <div class="report-meta" style="flex-wrap: wrap; gap: 4px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span style="font-weight:600; color:var(--text-primary);">${r.internName} (${r.domain})</span>
              <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-secondary); margin-top: 2px;">${reportDate} &nbsp;|&nbsp; In: ${checkInTime} &nbsp;|&nbsp; Out: ${checkOutTime} &nbsp;|&nbsp; ${hoursLogged}</div>
            </div>
            <button class="btn btn-secondary btn-sm delete-session-btn" data-id="${r._id || r.id}" style="color: var(--status-danger); border-color: var(--status-danger); padding: 2px 6px; font-size: 10px;">Delete</button>
          </div>
          <div class="report-text" style="margin-top: 6px; padding: 6px; border-radius: 4px; background-color: var(--bg-secondary); border: 1px solid var(--border-color); font-style: italic;">
            ${escapeHtml(r.dailyReport)}
          </div>
        `;
        reportsContainer.appendChild(div);
      });
    }

    // Bind delete clicks for all delete buttons in overview
    document.querySelectorAll('#active-checkins-body .delete-session-btn, #recent-reports-container .delete-session-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this work session record?')) {
          try {
            const res = await fetch(`/api/admin/attendance/${id}`, { method: 'DELETE' });
            if (res.ok) {
              showToast('Session record deleted successfully');
              // Reload overview from server
              const freshData = await (await fetch('/api/admin/dashboard')).json();
              loadAdminOverview(freshData);
            } else {
              const data = await res.json();
              showToast(data.error || 'Failed to delete record');
            }
          } catch (err) {
            showToast(err.message);
          }
        }
      };
    });

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
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No tasks assigned yet.</td></tr>`;
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
        <td>
          <button class="btn btn-secondary btn-sm delete-task-btn" data-id="${t._id || t.id}" style="color: var(--status-danger); border-color: var(--status-danger); padding: 2px 6px; font-size: 11px;">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });

    // Add click listeners for delete buttons
    document.querySelectorAll('.delete-task-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const taskId = e.target.getAttribute('data-id');
        if (!confirm('Are you sure you want to delete this task?')) return;
        
        try {
          const res = await fetch(`/api/admin/tasks/delete/${taskId}`, {
            method: 'DELETE'
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          
          showToast('Task deleted successfully');
          loadAdminTasks();
        } catch (err) {
          showToast(err.message);
        }
      });
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
let comparisonChartInstance = null;

function renderInternsComparisonChart(reports) {
  const ctx = document.getElementById('interns-comparison-chart');
  if (!ctx) return;
  
  if (comparisonChartInstance) {
    comparisonChartInstance.destroy();
  }
  
  const labels = reports.map(r => r.name);
  const hoursData = reports.map(r => r.totalHours);
  const scoresData = reports.map(r => r.performanceScore);
  
  const isDark = document.body.classList.contains('dark-theme');
  const textColor = isDark ? '#f3f4f6' : '#1f2937';
  const gridColor = isDark ? '#374151' : '#e5e7eb';
  
  comparisonChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Total Hours Logged',
          data: hoursData,
          backgroundColor: 'rgba(99, 102, 241, 0.75)',
          borderColor: '#6366f1',
          borderWidth: 1,
          borderRadius: 4
        },
        {
          label: 'Performance Score (%)',
          data: scoresData,
          backgroundColor: 'rgba(18, 176, 126, 0.75)',
          borderColor: '#12b07e',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: textColor,
            font: { family: 'Plus Jakarta Sans', weight: '600' }
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: 'Plus Jakarta Sans' } }
        },
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: 'Plus Jakarta Sans' } }
        }
      }
    }
  });
}

function populateTimesheetDropdowns(reports) {
  const selectEl = document.getElementById('report-intern-select');
  if (!selectEl) return;
  
  const prevVal = selectEl.value;
  selectEl.innerHTML = '<option value="">-- Choose an Intern --</option>';
  
  reports.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.userId;
    opt.textContent = `${r.name} (${r.domain})`;
    selectEl.appendChild(opt);
  });
  selectEl.value = prevVal;
  
  const monthSelect = document.getElementById('report-month-select');
  if (monthSelect && monthSelect.children.length === 0) {
    const monthsNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    for (let m = 0; m <= 11; m++) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = `${monthsNames[m]} ${currentYear}`;
      if (m === currentMonth) opt.selected = true;
      monthSelect.appendChild(opt);
    }
  }
}

function populateHistoryDropdown(reports) {
  const selectEl = document.getElementById('history-intern-select');
  if (!selectEl) return;
  
  const prevVal = selectEl.value;
  selectEl.innerHTML = '<option value="">-- Choose an Intern --</option>';
  
  reports.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.userId;
    opt.textContent = `${r.name} (${r.domain})`;
    selectEl.appendChild(opt);
  });
  
  selectEl.value = prevVal;
}

function renderInternHistory(data) {
  const resultsArea = document.getElementById('history-results-area');
  if (!resultsArea) return;
  
  document.getElementById('history-intern-title').textContent = `${data.intern.name}'s Complete Work History`;
  document.getElementById('history-total-days-badge').textContent = `${data.logs.length} Days Logged`;
  
  const tbody = document.getElementById('history-table-body');
  tbody.innerHTML = '';
  
  const daysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  if (data.logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--text-secondary);">No attendance history found for this intern.</td></tr>`;
  } else {
    data.logs.forEach(log => {
      const dateObj = new Date(log.date);
      const dayName = daysShort[dateObj.getDay()];
      const formattedDate = `${log.date} (${dayName})`;
      
      const checkInTime = new Date(log.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const checkOutTime = log.checkOut 
        ? new Date(log.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        : '<span class="status-badge status-completed" style="padding:2px 6px;">Active</span>';
      const duration = log.totalHours ? `${log.totalHours} hrs` : '--';
      const report = log.dailyReport ? escapeHtml(log.dailyReport) : 'No work report submitted';
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: var(--font-mono); font-weight: 600;">${formattedDate}</td>
        <td style="font-family: var(--font-mono);">${checkInTime}</td>
        <td style="font-family: var(--font-mono);">${checkOutTime}</td>
        <td style="font-family: var(--font-mono); font-weight: 600;">${duration}</td>
        <td style="font-style: italic; line-height: 1.4; max-width: 400px; word-break: break-word;">${report}</td>
        <td>
          <button class="btn btn-secondary btn-sm delete-session-btn" data-id="${log._id || log.id}" style="color: var(--status-danger); border-color: var(--status-danger); padding: 2px 6px; font-size: 10px;">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    
    // Bind delete clicks inside history table
    tbody.querySelectorAll('.delete-session-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (confirm('Are you sure you want to delete this work session record?')) {
          try {
            const res = await fetch(`/api/admin/attendance/${id}`, { method: 'DELETE' });
            if (res.ok) {
              showToast('Session record deleted successfully');
              // Reload history
              const userId = document.getElementById('history-intern-select').value;
              const freshRes = await fetch(`/api/admin/history/${userId}`);
              const freshData = await freshRes.json();
              renderInternHistory(freshData);
              
              // Also reload performance overview to keep metrics synced
              loadPerformanceReports();
            } else {
              const data = await res.json();
              showToast(data.error || 'Failed to delete record');
            }
          } catch (err) {
            showToast(err.message);
          }
        }
      };
    });
  }
  
  resultsArea.style.display = 'block';
  resultsArea.scrollIntoView({ behavior: 'smooth' });
}

function renderGeneratedTimesheet(data, monthIndex, year) {
  const wrapper = document.getElementById('timesheet-report-wrapper');
  if (!wrapper) return;
  
  const monthsFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const daysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  document.getElementById('timesheet-meta-name').textContent = data.intern.name;
  document.getElementById('timesheet-meta-email').textContent = data.intern.email;
  document.getElementById('timesheet-meta-domain').textContent = data.intern.domain;
  document.getElementById('timesheet-meta-month').textContent = `${monthsFull[monthIndex]} ${year}`;
  document.getElementById('timesheet-meta-generated-date').textContent = `Generated: ${new Date().toLocaleDateString()}`;
  
  const tbody = document.getElementById('timesheet-table-body');
  tbody.innerHTML = '';
  
  if (data.logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 30px; color: var(--text-secondary);">No attendance logs found for this intern in the selected month.</td></tr>`;
  } else {
    data.logs.forEach(log => {
      const dateObj = new Date(log.date);
      const dayName = daysShort[dateObj.getDay()];
      const formattedDate = `${log.date} (${dayName})`;
      
      const checkInTime = new Date(log.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const checkOutTime = log.checkOut 
        ? new Date(log.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        : 'Active';
      const duration = log.totalHours ? `${log.totalHours} hrs` : '--';
      const report = log.dailyReport ? escapeHtml(log.dailyReport) : 'No work report submitted';
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: var(--font-mono); font-weight: 600;">${formattedDate}</td>
        <td style="font-family: var(--font-mono);">${checkInTime}</td>
        <td style="font-family: var(--font-mono);">${checkOutTime}</td>
        <td style="font-family: var(--font-mono); font-weight: 600;">${duration}</td>
        <td style="font-style: italic; line-height: 1.4; max-width: 400px; word-break: break-word;">${report}</td>
      `;
      tbody.appendChild(tr);
    });
  }
  
  wrapper.style.display = 'block';
  wrapper.scrollIntoView({ behavior: 'smooth' });
}

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

    // Populate helper graphs and dropdown structures
    renderInternsComparisonChart(data.reports);
    populateTimesheetDropdowns(data.reports);
    populateHistoryDropdown(data.reports);

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
  
  const placeholder = document.getElementById('admin-calendar-placeholder');
  const container = document.getElementById('admin-calendar-layout-container');
  if (placeholder) placeholder.style.display = 'none';
  if (container) container.style.display = 'flex';
  
  try {
    const attRes = await fetch(`/api/intern/attendance/${internId}`);
    const attData = await attRes.json();
    
    const leavesRes = await fetch(`/api/intern/leaves/${internId}`);
    const leavesData = await leavesRes.json();
    
    initDoubleCalendar('admin', attData.attendance, leavesData.leaves);
  } catch (err) {
    console.error('Error loading intern calendar details:', err);
  }
}

// Double Card Calendar Controller (Matches the hover.dev look & feel)
function initDoubleCalendar(prefix, attendanceList, leavesList) {
  let displayDate = new Date();
  let currentSelectedDay = new Date().getDate();
  
  console.log(`[Calendar Init] prefix: ${prefix}, attendance records: ${attendanceList.length}, leaves: ${leavesList.length}`);
  
  const prevBtn = document.getElementById(`${prefix}-prev-month-btn`);
  const nextBtn = document.getElementById(`${prefix}-next-month-btn`);
  
  // Set direct onclick handlers (Fixes navigation click conflicts 100% reliably)
  if (prevBtn && nextBtn) {
    prevBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log(`[Calendar Nav] Month prev clicked. Previous date: ${displayDate}`);
      displayDate.setMonth(displayDate.getMonth() - 1);
      console.log(`[Calendar Nav] Month prev clicked. New date: ${displayDate}`);
      drawCells();
    };
    nextBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log(`[Calendar Nav] Month next clicked. Previous date: ${displayDate}`);
      displayDate.setMonth(displayDate.getMonth() + 1);
      console.log(`[Calendar Nav] Month next clicked. New date: ${displayDate}`);
      drawCells();
    };
  } else {
    console.warn(`[Calendar Warning] Month navigation buttons not found: ${prefix}-prev-month-btn, ${prefix}-next-month-btn`);
  }

  // Bind day-by-day navigation button clicks on the card itself
  const bindDayNavigation = (btnId, step) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log(`[Calendar Day Nav] Clicked: ${btnId}, step: ${step}`);
        
        const year = displayDate.getFullYear();
        const month = displayDate.getMonth();
        const totalDays = new Date(year, month + 1, 0).getDate();
        
        let targetDay = currentSelectedDay + step;
        console.log(`[Calendar Day Nav] Current selected day: ${currentSelectedDay}, target day: ${targetDay}`);
        
        if (targetDay < 1) {
          console.log(`[Calendar Day Nav] Wrapping to prev month`);
          displayDate.setMonth(displayDate.getMonth() - 1);
          const prevMonthDays = new Date(displayDate.getFullYear(), displayDate.getMonth() + 1, 0).getDate();
          currentSelectedDay = prevMonthDays;
          drawCells();
        } else if (targetDay > totalDays) {
          console.log(`[Calendar Day Nav] Wrapping to next month`);
          displayDate.setMonth(displayDate.getMonth() + 1);
          currentSelectedDay = 1;
          drawCells();
        } else {
          currentSelectedDay = targetDay;
          selectDayCell(currentSelectedDay);
        }
      };
    } else {
      console.log(`[Calendar Info] Day button not found: ${btnId}`);
    }
  };

  bindDayNavigation(`${prefix}-prev-day-btn`, -1);
  bindDayNavigation(`${prefix}-next-day-btn`, 1);
  bindDayNavigation(`${prefix}-prev-day-btn-back`, -1);
  bindDayNavigation(`${prefix}-next-day-btn-back`, 1);

  function selectDayCell(day) {
    console.log(`[Calendar selectDayCell] Selecting day: ${day}`);
    const cellsContainer = document.getElementById(`${prefix}-grid-cells`);
    if (!cellsContainer) return;
    
    const year = displayDate.getFullYear();
    const month = displayDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const cellIndex = firstDayIndex + (day - 1);
    
    const targetCell = cellsContainer.children[cellIndex];
    if (targetCell && !targetCell.classList.contains('empty')) {
      cellsContainer.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('selected'));
      targetCell.classList.add('selected');
      
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cellDateObj = new Date(year, month, day);
      const attRecord = attendanceList.find(a => a.date === dateString);
      const leaveRecord = leavesList.find(l => {
        const start = new Date(l.startDate);
        const end = new Date(l.endDate);
        return l.status === 'approved' && cellDateObj >= start && cellDateObj <= end;
      });
      
      currentSelectedDay = day;
      updateTearOffCard(day, month, year, attRecord, leaveRecord);
    }
  }

  // Setup static card (No flipping event listeners needed)
  const cardElement = document.getElementById(`${prefix}-tear-off-card`);
  if (cardElement) {
    cardElement.classList.remove('flipped');
  }
  
  function getDaySuffix(day) {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1:  return "st";
      case 2:  return "nd";
      case 3:  return "rd";
      default: return "th";
    }
  }

  function updateTearOffCard(day, month, year, attRecord, leaveRecord) {
    const monthsFull = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
    const suffix = getDaySuffix(day);
    
    const frontHeader = document.getElementById(`${prefix}-tear-header`);
    const frontDay = document.getElementById(`${prefix}-tear-day`);
    const frontDetails = document.getElementById(`${prefix}-tear-front-details`);
    
    const monthName = monthsFull[month];
    
    if (frontHeader) frontHeader.textContent = monthName;
    if (frontDay) frontDay.textContent = `${day}${suffix}`;
    
    // Change coloring dynamically
    const headerColor = attRecord ? '#12b07e' : (leaveRecord ? '#e74c3c' : '#6366f1');
    if (frontHeader) frontHeader.style.backgroundColor = headerColor;
    
    // FRONT DETAILS: Show Check-in, Check-out, Duration AND Daily report/reason directly!
    let frontDetailsHtml = '';
    if (attRecord) {
      const checkInLocal = new Date(attRecord.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const checkOutLocal = attRecord.checkOut 
        ? new Date(attRecord.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        : 'Active';
      const hoursLogged = attRecord.totalHours ? `${attRecord.totalHours} hrs` : 'Active';
      const reportText = attRecord.dailyReport ? escapeHtml(attRecord.dailyReport) : 'No work report submitted yet.';
      
      frontDetailsHtml = `
        <div style="display: flex; flex-direction: column; gap: 4px; text-align: left; width: 100%; box-sizing: border-box; padding: 0 4px;">
          <div style="font-size: 11px; font-weight: 700; color: var(--status-success);">In: <span style="font-weight: 600; color: var(--text-primary);">${checkInLocal}</span></div>
          <div style="font-size: 11px; font-weight: 700; color: var(--status-success);">Out: <span style="font-weight: 600; color: var(--text-primary);">${checkOutLocal}</span></div>
          <div style="font-size: 11px; font-weight: 700; color: var(--status-success); margin-bottom: 4px;">Hrs: <span style="font-weight: 600; color: var(--text-primary);">${hoursLogged}</span></div>
          
          <div style="font-size: 9px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; border-top: 1px solid var(--border-color); padding-top: 4px; margin-top: 2px;">Report:</div>
          <div style="font-size: 9px; max-height: 50px; overflow-y: auto; font-style: italic; line-height: 1.3; color: var(--text-secondary); padding: 4px; border-radius: 4px; background-color: var(--bg-secondary); border: 1px solid var(--border-color); word-break: break-word;">
            ${reportText}
          </div>
        </div>
      `;
    } else if (leaveRecord) {
      frontDetailsHtml = `
        <div style="display: flex; flex-direction: column; gap: 4px; text-align: left; width: 100%; box-sizing: border-box; padding: 0 4px;">
          <div style="font-size: 11px; font-weight: 700; color: var(--status-danger); text-align: center; margin-bottom: 4px;">APPROVED LEAVE</div>
          <div style="font-size: 9px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; border-top: 1px solid var(--border-color); padding-top: 4px;">Reason:</div>
          <div style="font-size: 9px; max-height: 50px; overflow-y: auto; font-style: italic; line-height: 1.3; color: var(--text-secondary); padding: 4px; border-radius: 4px; background-color: var(--bg-secondary); border: 1px solid var(--border-color); word-break: break-word;">
            ${escapeHtml(leaveRecord.reason)}
          </div>
        </div>
      `;
    } else {
      frontDetailsHtml = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 90px; text-align: center;">
          <div style="color: var(--text-secondary); font-weight: 700; font-size: 11px;">NO RECORD</div>
          <div style="font-size: 10px; color: var(--text-secondary); margin-top: 4px;">Did not check in or submit leave.</div>
        </div>
      `;
    }
    if (frontDetails) frontDetails.innerHTML = frontDetailsHtml;
  }
  
  function drawCells() {
    const cellsContainer = document.getElementById(`${prefix}-grid-cells`);
    const titleEl = document.getElementById(`${prefix}-grid-month-title`);
    if (!cellsContainer || !titleEl) return;
    
    cellsContainer.innerHTML = '';
    
    const year = displayDate.getFullYear();
    const month = displayDate.getMonth();
    
    const monthsNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    titleEl.textContent = `${monthsNames[month]} ${year}`;
    
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    // Draw padding cells for previous month
    for (let i = 0; i < firstDayIndex; i++) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'grid-cell empty';
      cellsContainer.appendChild(emptyDiv);
    }
    
    let selectedDayCell = null;
    
    for (let day = 1; day <= totalDays; day++) {
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cellDateObj = new Date(year, month, day);
      
      const attRecord = attendanceList.find(a => a.date === dateString);
      const leaveRecord = leavesList.find(l => {
        const start = new Date(l.startDate);
        const end = new Date(l.endDate);
        return l.status === 'approved' && cellDateObj >= start && cellDateObj <= end;
      });
      
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.textContent = day;
      
      if (attRecord) {
        cell.classList.add('status-present');
      } else if (leaveRecord) {
        cell.classList.add('status-leave');
      }
      
      cell.addEventListener('click', () => {
        if (selectedDayCell) {
          selectedDayCell.classList.remove('selected');
        }
        cell.classList.add('selected');
        selectedDayCell = cell;
        
        currentSelectedDay = day; // Track the currently selected day
        updateTearOffCard(day, month, year, attRecord, leaveRecord);
      });
      
      // Auto-select today
      const todayDate = new Date();
      if (day === todayDate.getDate() && month === todayDate.getMonth() && year === todayDate.getFullYear()) {
        cell.classList.add('selected');
        selectedDayCell = cell;
        updateTearOffCard(day, month, year, attRecord, leaveRecord);
      }
      
      cellsContainer.appendChild(cell);
    }
    
    // Select first cell if today is not in selected month view
    if (!selectedDayCell && cellsContainer.children.length > firstDayIndex) {
      const firstCell = cellsContainer.children[firstDayIndex];
      firstCell.click();
    }
  }
  
  drawCells();
}
