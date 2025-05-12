const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create database connection
const db = new sqlite3.Database(path.join(__dirname, 'inventory.db'), (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Initialize database tables
async function initializeDatabase() {
    console.log('Initializing database...');
    db.serialize(() => {
        // Remove verbose table existence checks
        
        // Categories table
        db.run(`CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )`);

        
        // Items table (ERD)
        db.run(`CREATE TABLE IF NOT EXISTS items (
            product_id TEXT PRIMARY KEY,
            category TEXT,
            name TEXT NOT NULL,
            status TEXT,
            availability TEXT,
            quantity INTEGER DEFAULT 0,
            expiration_date TEXT
        )`);
        
        // Remaining table creation statements...
        
        // Add confirmation when done
        console.log('Database initialization complete');
    });
}

// Helper function to run queries with promises
function runQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
}

// Helper function to get all rows with promises
function getAll(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Helper function to get a single row with promises
function getOne(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

module.exports = {
    db,
    runQuery,
    getAll,
    getOne
}; 