const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'database.json');

// Ensure database directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Initial default data
const defaultData = {
  users: [
    {
      id: "u-admin",
      email: "admin@skynora.com",
      password: "admin123",
      name: "Skynora Admin",
      role: "admin",
      domain: "Management"
    },
    {
      id: "u-ven",
      email: "ven@skynora.com",
      password: "ven132026",
      name: "Ven",
      role: "intern",
      domain: "Web Development"
    }
  ],
  attendance: [
    {
      id: "att-1",
      userId: "u-ven",
      date: "2026-08-16",
      checkIn: "2026-08-16T09:00:00+05:30",
      checkOut: "2026-08-16T18:00:00+05:30",
      dailyReport: "Completed the login page API and structured the database.",
      totalHours: 9.0
    }
  ],
  leaves: [
    {
      id: "lv-1",
      userId: "u-ven",
      startDate: "2026-08-20",
      endDate: "2026-08-21",
      reason: "Family emergency",
      status: "pending",
      createdAt: "2026-08-17T10:00:00+05:30"
    }
  ],
  tasks: [
    {
      id: "tsk-1",
      userId: "u-ven",
      title: "Implement Leave Request UI",
      description: "Create a minimalist form for interns to request leaves and an admin review table.",
      status: "In Progress",
      assignedAt: "2026-08-17T11:00:00+05:30",
      statusUpdatedAt: "2026-08-17T11:00:00+05:30",
      notes: null
    }
  ]
};

function readDb() {
  if (!fs.existsSync(DB_PATH)) {
    writeDb(defaultData);
    return defaultData;
  }
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading database file, resetting to default:", err);
    writeDb(defaultData);
    return defaultData;
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = {
  getCollection: (name) => {
    const db = readDb();
    return db[name] || [];
  },
  saveCollection: (name, items) => {
    const db = readDb();
    db[name] = items;
    writeDb(db);
  },
  insert: (name, item) => {
    const db = readDb();
    if (!db[name]) db[name] = [];
    db[name].push(item);
    writeDb(db);
    return item;
  },
  update: (name, id, updateData) => {
    const db = readDb();
    const index = db[name].findIndex(item => item.id === id);
    if (index !== -1) {
      db[name][index] = { ...db[name][index], ...updateData };
      writeDb(db);
      return db[name][index];
    }
    return null;
  }
};
