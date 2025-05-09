const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'inventory.db'), async (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    
    console.log('Connected to database, starting migration...');
    
    try {
        // Begin transaction
        await runQuery('BEGIN TRANSACTION');

        try {
            // 1. Backup existing items
            const items = await getAll('SELECT * FROM items');
            console.log(`Backing up ${items.length} items...`);

            // 2. Drop existing items table
            await runQuery('DROP TABLE IF EXISTS items');
            console.log('Dropped old items table');

            // 3. Create new items table with string ID
            await runQuery(`CREATE TABLE items (
                product_id TEXT PRIMARY KEY,
                category TEXT,
                name TEXT NOT NULL,
                status TEXT,
                availability TEXT,
                quantity INTEGER DEFAULT 0
            )`);
            console.log('Created new items table');

            // 4. Generate new IDs and insert items
            const date = new Date();
            const dateStr = date.getFullYear() +
                String(date.getMonth() + 1).padStart(2, '0') +
                String(date.getDate()).padStart(2, '0');

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const newId = `${dateStr}${String(i + 1).padStart(3, '0')}`;
                
                await runQuery(
                    `INSERT INTO items (product_id, name, category, status, availability, quantity)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [newId, item.name, item.category, item.status, item.availability, item.quantity || 0]
                );
            }
            console.log(`Migrated ${items.length} items with new IDs`);

            await runQuery('COMMIT');
            console.log('Migration completed successfully');
            process.exit(0);
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Migration failed:', err);
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