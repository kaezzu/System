const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'inventory.db'), async (err) => {
    if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
    }
    
    console.log('Connected to database, starting supplier migration...');
    
    try {
        // Begin transaction
        await runQuery('BEGIN TRANSACTION');

        try {
            // 1. Backup existing suppliers
            const suppliers = await getAll('SELECT * FROM suppliers');
            console.log(`Backing up ${suppliers.length} suppliers...`);

            // 2. Drop existing suppliers table
            await runQuery('DROP TABLE IF EXISTS suppliers');
            console.log('Dropped old suppliers table');

            // 3. Create new suppliers table with string ID
            await runQuery(`CREATE TABLE suppliers (
                supplier_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                contact TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT,
                address TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            console.log('Created new suppliers table');

            // 4. Generate new IDs and insert suppliers
            const date = new Date();
            const dateStr = date.getFullYear() +
                String(date.getMonth() + 1).padStart(2, '0') +
                String(date.getDate()).padStart(2, '0');

            for (let i = 0; i < suppliers.length; i++) {
                const supplier = suppliers[i];
                const newId = `S${dateStr}${String(i + 1).padStart(3, '0')}`; // Adding 'S' prefix to distinguish from items
                
                await runQuery(
                    `INSERT INTO suppliers (
                        supplier_id, name, contact, email, phone, address, 
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        newId,
                        supplier.name,
                        supplier.contact,
                        supplier.email,
                        supplier.phone,
                        supplier.address,
                        supplier.created_at,
                        supplier.updated_at
                    ]
                );
            }
            console.log(`Migrated ${suppliers.length} suppliers with new IDs`);

            await runQuery('COMMIT');
            console.log('Supplier migration completed successfully');
            process.exit(0);
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Supplier migration failed:', err);
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