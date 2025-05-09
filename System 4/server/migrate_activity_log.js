const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'inventory.db'), async (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    
    console.log('Connected to database, starting activity log migration...');
    
    try {
        await runQuery('BEGIN TRANSACTION');

        try {
            // 1. Backup existing activities
            const activities = await getAll('SELECT * FROM activity_log');
            console.log(`Backing up ${activities.length} activities...`);

            // 2. Drop existing activity_log table
            await runQuery('DROP TABLE IF EXISTS activity_log');
            console.log('Dropped old activity_log table');

            // 3. Create new activity_log table with updated schema
            await runQuery(`CREATE TABLE activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME NOT NULL,
                action TEXT NOT NULL,
                details TEXT NOT NULL,
                user_id INTEGER,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )`);
            console.log('Created new activity_log table');

            // 4. Restore activities with new schema
            if (activities.length > 0) {
                for (const activity of activities) {
                    await runQuery(
                        `INSERT INTO activity_log (
                            timestamp, 
                            action, 
                            details, 
                            user_id, 
                            metadata,
                            created_at
                        ) VALUES (?, ?, ?, ?, ?, ?)`,
                        [
                            activity.timestamp,
                            activity.action,
                            activity.details,
                            activity.user_id || null,
                            activity.metadata || null,
                            activity.created_at || activity.timestamp
                        ]
                    );
                }
                console.log(`Restored ${activities.length} activities`);
            }

            await runQuery('COMMIT');
            console.log('Activity log migration completed successfully');
            process.exit(0);
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Activity log migration failed:', err);
        process.exit(1);
    }
});

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