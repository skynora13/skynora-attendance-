const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'database.json');

// Ensure local database directory exists
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

// Local Database Helpers (Sync)
function readDb() {
  if (!fs.existsSync(DB_PATH)) {
    writeDb(defaultData);
    return defaultData;
  }
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(data);
    
    // Auto-migrate legacy emails if they exist in the saved file
    let migrated = false;
    if (parsed.users) {
      parsed.users.forEach(u => {
        if (u.email === 'admin@skynora') {
          u.email = 'admin@skynora.com';
          migrated = true;
        }
        if (u.email === 'ven@skynora') {
          u.email = 'ven@skynora.com';
          migrated = true;
        }
      });
    }
    if (migrated) {
      fs.writeFileSync(DB_PATH, JSON.stringify(parsed, null, 2), 'utf8');
      console.log('Database migrated: legacy emails updated to .com format');
    }
    return parsed;
  } catch (err) {
    console.error("Error reading database file, resetting to default:", err);
    writeDb(defaultData);
    return defaultData;
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// MongoDB Connection State
const MONGODB_URI = process.env.MONGODB_URI;
let client = null;
let mongoDb = null;
let useMongo = false;

if (MONGODB_URI) {
  useMongo = true;
  client = new MongoClient(MONGODB_URI);
}

async function connectDb() {
  if (!useMongo) return null;
  if (mongoDb) return mongoDb;
  try {
    await client.connect();
    mongoDb = client.db();
    console.log('Connected successfully to MongoDB Cloud');
    
    // Seed default data if collections do not exist
    await seedMongoDefaults();
    return mongoDb;
  } catch (err) {
    console.error('Failed to connect to MongoDB, falling back to local file:', err);
    useMongo = false;
    return null;
  }
}

async function seedMongoDefaults() {
  try {
    const collections = await mongoDb.listCollections().toArray();
    const hasUsers = collections.some(c => c.name === 'users');
    if (!hasUsers) {
      console.log('Seeding default data into MongoDB...');
      await mongoDb.collection('users').insertMany(defaultData.users);
      await mongoDb.collection('attendance').insertMany(defaultData.attendance);
      await mongoDb.collection('leaves').insertMany(defaultData.leaves);
      await mongoDb.collection('tasks').insertMany(defaultData.tasks);
    }
  } catch (e) {
    console.error('Error seeding defaults to MongoDB:', e);
  }
}

// Initialize connection if using Mongo
if (useMongo) {
  connectDb().catch(err => console.error("Initial DB connection failed:", err));
}

module.exports = {
  getCollection: async (name) => {
    if (useMongo) {
      const dbInstance = await connectDb();
      if (dbInstance) {
        return await dbInstance.collection(name).find({}).toArray();
      }
    }
    const db = readDb();
    return db[name] || [];
  },
  
  saveCollection: async (name, items) => {
    if (useMongo) {
      const dbInstance = await connectDb();
      if (dbInstance) {
        await dbInstance.collection(name).deleteMany({});
        if (items.length > 0) {
          await dbInstance.collection(name).insertMany(items);
        }
        return;
      }
    }
    const db = readDb();
    db[name] = items;
    writeDb(db);
  },
  
  insert: async (name, item) => {
    if (useMongo) {
      const dbInstance = await connectDb();
      if (dbInstance) {
        await dbInstance.collection(name).insertOne({ ...item });
        return item;
      }
    }
    const db = readDb();
    if (!db[name]) db[name] = [];
    db[name].push(item);
    writeDb(db);
    return item;
  },
  
  update: async (name, id, updateData) => {
    if (useMongo) {
      const dbInstance = await connectDb();
      if (dbInstance) {
        const result = await dbInstance.collection(name).findOneAndUpdate(
          { id: id },
          { $set: updateData },
          { returnDocument: 'after' }
        );
        return result;
      }
    }
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
