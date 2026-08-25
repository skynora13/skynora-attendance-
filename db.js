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
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://skynora13_db_user:BtTbTEF3x6f1roTy@cluster0.2jmgcrz.mongodb.net/?appName=Cluster0';
let client = null;
let mongoDb = null;
let useMongo = true;

if (MONGODB_URI) {
  useMongo = true;
  client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 3000, connectTimeoutMS: 3000 });
}

let connectionPromise = null;

async function connectDb() {
  if (!useMongo) return null;
  if (mongoDb) return mongoDb;
  
  if (connectionPromise) {
    return connectionPromise;
  }
  
  connectionPromise = (async () => {
    try {
      await client.connect();
      mongoDb = client.db();
      console.log('Connected successfully to MongoDB Cloud');
      
      // Seed default data if collections do not exist
      await seedMongoDefaults();
      return mongoDb;
    } catch (err) {
      console.error('Failed to connect to MongoDB, falling back to local file:', err);
      // Reset connection promise so a retry can occur on next request
      connectionPromise = null;
      return null;
    }
  })();
  
  return connectionPromise;
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

// Local cache for collections
const memoryCache = {};
let isCacheLoaded = false;
let cachePromise = null;

async function loadCache() {
  if (isCacheLoaded) return;
  if (cachePromise) return cachePromise;

  cachePromise = (async () => {
    try {
      const collections = ['users', 'attendance', 'leaves', 'tasks', 'daily_info_schedule', 'daily_info_posts'];
      if (useMongo) {
        const dbInstance = await connectDb();
        if (dbInstance) {
          for (const name of collections) {
            memoryCache[name] = await dbInstance.collection(name).find({}).toArray();
          }
          isCacheLoaded = true;
          console.log('Memory cache successfully populated from MongoDB');
          return;
        }
      }
      // Fallback to local files
      const localDb = readDb();
      for (const name of collections) {
        memoryCache[name] = localDb[name] || [];
      }
      isCacheLoaded = true;
      console.log('Memory cache successfully populated from local database file');
    } catch (err) {
      console.error('Failed to load memory cache:', err);
    }
  })();

  return cachePromise;
}

// Initialize connection and cache
if (useMongo) {
  connectDb()
    .then(() => loadCache())
    .catch(err => {
      console.error("Initial DB connection failed:", err);
      loadCache();
    });
} else {
  loadCache();
}

module.exports = {
  getCollection: async (name) => {
    await loadCache();
    // Return a copy to prevent external mutation issues
    return JSON.parse(JSON.stringify(memoryCache[name] || []));
  },
  
  saveCollection: async (name, items) => {
    await loadCache();
    // Update cache immediately
    memoryCache[name] = JSON.parse(JSON.stringify(items));
    
    // Write to Mongo in the background
    if (useMongo) {
      const dbInstance = await connectDb();
      if (dbInstance) {
        dbInstance.collection(name).deleteMany({}).then(() => {
          if (items.length > 0) {
            dbInstance.collection(name).insertMany(items);
          }
        }).catch(err => console.error(`Error saving collection ${name} to Mongo:`, err));
      }
    }
    // Update local file backup
    const db = readDb();
    db[name] = items;
    writeDb(db);
  },
  
  insert: async (name, item) => {
    await loadCache();
    if (!memoryCache[name]) memoryCache[name] = [];
    memoryCache[name].push(JSON.parse(JSON.stringify(item)));
    
    // Write to Mongo in the background
    if (useMongo) {
      const dbInstance = await connectDb();
      if (dbInstance) {
        dbInstance.collection(name).insertOne({ ...item })
          .catch(err => console.error(`Error inserting to Mongo in collection ${name}:`, err));
      }
    }
    // Update local file backup
    const db = readDb();
    if (!db[name]) db[name] = [];
    db[name].push(item);
    writeDb(db);
    return item;
  },
  
  update: async (name, id, updateData) => {
    await loadCache();
    const index = memoryCache[name].findIndex(item => item.id === id);
    let updatedItem = null;
    if (index !== -1) {
      memoryCache[name][index] = { ...memoryCache[name][index], ...updateData };
      updatedItem = JSON.parse(JSON.stringify(memoryCache[name][index]));
    }
    
    // Write to Mongo in the background
    if (useMongo) {
      const dbInstance = await connectDb();
      if (dbInstance) {
        dbInstance.collection(name).findOneAndUpdate(
          { id: id },
          { $set: updateData },
          { returnDocument: 'after' }
        ).catch(err => console.error(`Error updating Mongo in collection ${name}:`, err));
      }
    }
    // Update local file backup
    const db = readDb();
    const localIndex = db[name].findIndex(item => item.id === id);
    if (localIndex !== -1) {
      db[name][localIndex] = { ...db[name][localIndex], ...updateData };
      writeDb(db);
    }
    return updatedItem;
  }
};
