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
        // Categories table
        db.run(`CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        )`);

        // Inventory items table
        db.run(`CREATE TABLE IF NOT EXISTS inventory_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category_id INTEGER,
            quantity INTEGER NOT NULL,
            status TEXT NOT NULL,
            expiration TEXT,
            quality TEXT,
            last_updated TEXT NOT NULL,
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )`);

        // User activities table
        db.run(`CREATE TABLE IF NOT EXISTS user_activities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            username TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT NOT NULL
        )`);

        // Notifications table
        db.run(`CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            details TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            read INTEGER DEFAULT 0
        )`);

        // Users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            full_name TEXT NOT NULL,
            email TEXT
        )`, [], (err) => {
            if (err) {
                console.error('Error creating users table:', err);
                return;
            }
            
            // Check if any users exist
            db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
                if (err) {
                    console.error('Error checking users:', err);
                    return;
                }
                
                if (row.count === 0) {
                    console.log('No users found, creating default users...');
                    // Insert default users
                    const defaultUsers = [
                        ['admin', 'admin', 'department_head', 'System Administrator'],
                        ['member', 'member123', 'member', 'Regular Member']
                    ];
                    
                    const stmt = db.prepare('INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)');
                    defaultUsers.forEach(user => {
                        stmt.run(user, (err) => {
                            if (err) {
                                console.error('Error inserting default user:', err);
                            } else {
                                console.log('Created default user:', user[0]);
                            }
                        });
                    });
                    stmt.finalize();
                } else {
                    console.log('Users table already populated with', row.count, 'users');
                    // List existing users (for debugging)
                    db.all('SELECT username, role FROM users', [], (err, users) => {
                        if (err) {
                            console.error('Error listing users:', err);
                            return;
                        }
                    });
                }
            });
        });

        // Supplier table
        db.run(`CREATE TABLE IF NOT EXISTS suppliers (
            supplier_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            contact TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Activity log table
        db.run(`CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME NOT NULL,
            action TEXT NOT NULL,
            details TEXT NOT NULL
        )`);

        // Items table (ERD)
        db.run(`CREATE TABLE IF NOT EXISTS items (
            product_id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT,
            name TEXT NOT NULL,
            status TEXT,
            availability TEXT,
            quantity INTEGER DEFAULT 0
        )`);

        // Note table (ERD)
        db.run(`CREATE TABLE IF NOT EXISTS notes (
            note_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            content TEXT NOT NULL,
            priority TEXT,
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        )`);
    });
}

// Helper function to run queries with promises
function runQuery(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

// Helper function to get all rows with promises
function getAll(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
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