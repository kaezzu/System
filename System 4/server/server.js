const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { runQuery, getAll, getOne } = require('./database');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const port = 3000;

// Middleware setup
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'static')));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Helper function to set default due date (1 year from now)
function getDefaultDueDate() {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    return date.toISOString().split('T')[0];
}

// Borrowed Items endpoints
app.get('/api/borrowed-items', async (req, res) => {
    try {
        const borrowedItems = await getAll('SELECT * FROM borrowed_items ORDER BY borrow_date DESC');
        res.json(borrowedItems);
    } catch (err) {
        console.error('Error fetching borrowed items:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/borrowed-items', async (req, res) => {
    const {
        item_id,
        item_name,
        category,
        quantity,
        borrower_name,
        department,
        due_date
    } = req.body;

    try {
        await runQuery('BEGIN TRANSACTION');

        try {
            // Check if item exists and has enough quantity
            const item = await getOne('SELECT * FROM items WHERE product_id = ?', [item_id]);
            
            if (!item) {
                await runQuery('ROLLBACK');
                return res.status(404).json({ error: 'Item not found' });
            }
            
            if (item.quantity < quantity) {
                await runQuery('ROLLBACK');
                return res.status(400).json({ error: 'Not enough quantity available' });
            }
            
            // Subtract borrowed quantity from available inventory
            await runQuery(
                'UPDATE items SET quantity = quantity - ? WHERE product_id = ?',
                [quantity, item_id]
            );

            const newBorrowedItem = {
                id: Date.now().toString(),
                item_id,
                item_name,
                category,
                quantity,
                borrower_name,
                department,
                borrow_date: new Date().toISOString().split('T')[0],
                due_date: due_date || getDefaultDueDate(),
                status: 'Borrowed'
            };

            // Insert into database
            await runQuery(
                `INSERT INTO borrowed_items (
                    id, item_id, item_name, category, quantity, 
                    borrower_name, department, borrow_date, due_date, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    newBorrowedItem.id,
                    newBorrowedItem.item_id,
                    newBorrowedItem.item_name,
                    newBorrowedItem.category,
                    newBorrowedItem.quantity,
                    newBorrowedItem.borrower_name,
                    newBorrowedItem.department,
                    newBorrowedItem.borrow_date,
                    newBorrowedItem.due_date,
                    newBorrowedItem.status
                ]
            );

            // Log activity
            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details) 
                 VALUES (datetime('now'), ?, ?)`,
                ['borrow_item', `${borrower_name} borrowed ${quantity} ${item_name}(s). Inventory updated.`]
            );

            await runQuery('COMMIT');
            res.status(201).json(newBorrowedItem);
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error creating borrowed item:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/borrowed-items/:id/return', async (req, res) => {
    const { id } = req.params;
    
    try {
        await runQuery('BEGIN TRANSACTION');

        try {
            const item = await getOne('SELECT * FROM borrowed_items WHERE id = ?', [id]);
            
            if (!item) {
                await runQuery('ROLLBACK');
                return res.status(404).json({ error: 'Item not found' });
            }
            
            // Only add quantity back if the item is not already returned
            if (item.status !== 'Returned') {
                // Add returned quantity back to inventory
                await runQuery(
                    'UPDATE items SET quantity = quantity + ? WHERE product_id = ?',
                    [item.quantity, item.item_id]
                );
                
                // Update status and return date
                await runQuery(
                    `UPDATE borrowed_items 
                     SET status = ?, return_date = datetime('now')
                     WHERE id = ?`,
                    ['Returned', id]
                );
                
                // Log activity
                await runQuery(
                    `INSERT INTO activity_log (timestamp, action, details) 
                     VALUES (datetime('now'), ?, ?)`,
                    ['return_item', `${item.borrower_name} returned ${item.quantity} ${item.item_name}(s). Inventory updated.`]
                );
            } else {
                await runQuery('ROLLBACK');
                return res.status(400).json({ error: 'Item already returned' });
            }

            await runQuery('COMMIT');
            
            const updatedItem = await getOne('SELECT * FROM borrowed_items WHERE id = ?', [id]);
            res.json(updatedItem);
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error returning item:', err);
        res.status(500).json({ error: err.message });
    }
});

// Categories endpoints
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await loadCategories();
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

app.post('/api/categories', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Category name is required' });
        }

        // Check if category already exists
        const existingCategory = await getOne('SELECT * FROM categories WHERE name = ?', [name]);
        if (existingCategory) {
            return res.json({ 
                id: existingCategory.id,
                alreadyExists: true,
                message: 'Category already exists'
            });
        }

        // Default threshold for new categories
        const defaultThreshold = 10; // Default threshold for new categories

        // Insert new category with default threshold
        const result = await runQuery(
            'INSERT INTO categories (name, threshold) VALUES (?, ?)',
            [name, defaultThreshold]
        );

        res.json({ 
            id: result.lastID,
            name: name,
            threshold: defaultThreshold,
            alreadyExists: false,
            message: 'Category added successfully'
        });
    } catch (error) {
        console.error('Error adding category:', error);
        res.status(500).json({ error: 'Failed to add category' });
    }
});

// Delete category endpoint
app.delete('/api/categories/:name', async (req, res) => {
    const categoryName = req.params.name;
    
    try {
        await runQuery('BEGIN TRANSACTION');

        try {
            // Get category details for logging
            const category = await getOne('SELECT * FROM categories WHERE name = ?', [categoryName]);
            
            if (!category) {
                await runQuery('ROLLBACK');
                return res.status(404).json({ success: false, error: 'Category not found' });
            }

            // Delete the category
            await runQuery('DELETE FROM categories WHERE name = ?', [categoryName]);

            // Log activity
            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details) 
                 VALUES (datetime('now'), ?, ?)`,
                ['delete_category', `Deleted category: ${categoryName}`]
            );

            await runQuery('COMMIT');

            res.json({
                success: true,
                message: 'Category deleted successfully'
            });
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error deleting category:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Helper function to generate custom item ID
async function generateItemId() {
    // Get current date in YYYYMMDD format
    const date = new Date();
    const dateStr = date.getFullYear() +
        String(date.getMonth() + 1).padStart(2, '0') +
        String(date.getDate()).padStart(2, '0');
    
    try {
        // Get the latest ID for today
        const result = await getOne(`
            SELECT product_id 
            FROM items 
            WHERE product_id LIKE '${dateStr}%' 
            ORDER BY product_id DESC 
            LIMIT 1
        `);

        let sequentialNumber = 1;
        if (result && result.product_id) {
            // Extract the sequential number from the last ID and increment it
            const lastSequential = parseInt(result.product_id.slice(-3));
            sequentialNumber = lastSequential + 1;
        }

        // Combine date and sequential number (padded to 3 digits)
        return `${dateStr}${String(sequentialNumber).padStart(3, '0')}`;
    } catch (err) {
        console.error('Error generating item ID:', err);
        throw err;
    }
}

// Inventory items endpoints
app.get('/api/items', async (req, res) => {
    try {
        const { sort_by, sort_order } = req.query;
        let query = 'SELECT * FROM items';
        
        // Add sorting if sort parameters are provided
        if (sort_by) {
            const validColumns = ['product_id', 'name', 'category', 'status', 'availability', 'quantity', 'expiration_date'];
            const validOrders = ['ASC', 'DESC'];
            
            // Validate sort_by parameter to prevent SQL injection
            if (validColumns.includes(sort_by)) {
                query += ` ORDER BY ${sort_by}`;
                
                // Add sort order if valid
                if (sort_order && validOrders.includes(sort_order.toUpperCase())) {
                    query += ` ${sort_order.toUpperCase()}`;
                } else {
                    // Default to ascending order
                    query += ' ASC';
                }
            } else {
                // Default sorting if invalid column specified
                query += ' ORDER BY product_id DESC';
            }
        } else {
            // Default sorting (as before) if no sort params
            query += ' ORDER BY product_id DESC';
        }
        
        const items = await getAll(query);
        res.setHeader('Content-Type', 'application/json');
        res.json({ success: true, items });
    } catch (err) {
        console.error('Error fetching items:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/items', async (req, res) => {
    const { name, category, status, availability, quantity, expiration_date } = req.body;

    // Validate required fields
    if (!name) {
        return res.status(400).json({ 
            success: false, 
            error: "Name is required" 
        });
    }

    try {
        // Start transaction
        await runQuery('BEGIN TRANSACTION');

        try {
            // Generate custom ID
            const productId = await generateItemId();

            // Insert item with custom ID (now including quantity and expiration date)
            await runQuery(
                `INSERT INTO items (product_id, name, category, status, availability, quantity, expiration_date) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [productId, name, category || null, status || null, availability || null, parseInt(quantity) || 0, expiration_date || null]
            );

            // Log activity
            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details) 
                 VALUES (datetime('now'), ?, ?)`,
                ['add_item', `Added new item: ${name} with quantity: ${quantity || 0}${expiration_date ? ', expiration: ' + expiration_date : ''}`]
            );

            await runQuery('COMMIT');

            // Get the newly created item
            const item = await getOne(
                'SELECT * FROM items WHERE product_id = ?',
                [productId]
            );

            // After creating the item, check its threshold
            await checkItemThresholds(item);

            res.status(201).json({
                success: true,
                message: 'Item added successfully',
                item
            });
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error adding item:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/items/:id', async (req, res) => {
    try {
        const item = await getOne('SELECT * FROM items WHERE product_id = ?', [req.params.id]);
        
        if (!item) {
            return res.status(404).json({ success: false, error: 'Item not found' });
        }

        res.json({ success: true, item });
    } catch (err) {
        console.error('Error fetching item:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/items/:id', async (req, res) => {
    const itemId = req.params.id;
    const { name, category, status, availability, quantity, expiration_date } = req.body;

    if (!name) {
        return res.status(400).json({ 
            success: false, 
            error: "Name is required" 
        });
    }

    try {
        await runQuery('BEGIN TRANSACTION');

        try {
            await runQuery(
                `UPDATE items 
                 SET name = ?, category = ?, status = ?, availability = ?, quantity = ?, expiration_date = ?
                 WHERE product_id = ?`,
                [name, category || null, status || null, availability || null, parseInt(quantity) || 0, expiration_date || null, itemId]
            );

            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details) 
                 VALUES (datetime('now'), ?, ?)`,
                ['update_item', `Updated item: ${name} with quantity: ${quantity || 0}${expiration_date ? ', expiration: ' + expiration_date : ''}`]
            );

            await runQuery('COMMIT');

            const item = await getOne(
                'SELECT * FROM items WHERE product_id = ?',
                [itemId]
            );

            // After updating the item, check its threshold
            await checkItemThresholds(item);

            if (!item) {
                return res.status(404).json({ success: false, error: 'Item not found' });
            }

            res.json({
                success: true,
                message: 'Item updated successfully',
                item
            });
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error updating item:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Update quantity endpoint
app.post('/api/items/:id/quantity/:action', async (req, res) => {
    const itemId = req.params.id;
    const action = req.params.action;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({
            success: false,
            error: "Amount must be a positive number"
        });
    }

    try {
        await runQuery('BEGIN TRANSACTION');

        try {
            // Get current item details
            const item = await getOne('SELECT * FROM items WHERE product_id = ?', [itemId]);
            
            if (!item) {
                await runQuery('ROLLBACK');
                return res.status(404).json({ success: false, error: 'Item not found' });
            }

            // Calculate new quantity
            const currentQuantity = item.quantity || 0;
            const newQuantity = action === 'add' 
                ? currentQuantity + parseInt(amount) 
                : Math.max(0, currentQuantity - parseInt(amount));

            // Update item quantity
            await runQuery(
                'UPDATE items SET quantity = ? WHERE product_id = ?',
                [newQuantity, itemId]
            );

            // Log activity
            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details) 
                 VALUES (datetime('now'), ?, ?)`,
                ['update_quantity', `${action === 'add' ? 'Added' : 'Removed'} ${amount} units to/from item: ${item.name}`]
            );

            await runQuery('COMMIT');

            // After updating quantity, check the threshold
            const updatedItem = await getOne('SELECT * FROM items WHERE product_id = ?', [itemId]);
            if (updatedItem) {
                await checkItemThresholds(updatedItem);
            }

            res.json({
                success: true,
                message: `Quantity ${action === 'add' ? 'added' : 'removed'} successfully`,
                newQuantity: newQuantity
            });
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error updating quantity:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete item endpoint
app.delete('/api/items/:id', async (req, res) => {
    const itemId = req.params.id;
    
    try {
        await runQuery('BEGIN TRANSACTION');

        try {
            // Get item details for logging
            const item = await getOne('SELECT * FROM items WHERE product_id = ?', [itemId]);
            
            if (!item) {
                await runQuery('ROLLBACK');
                return res.status(404).json({ success: false, error: 'Item not found' });
            }

            // Delete the item
            await runQuery('DELETE FROM items WHERE product_id = ?', [itemId]);

            // Log activity
            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details) 
                 VALUES (datetime('now'), ?, ?)`,
                ['delete_item', `Deleted item: ${item.name}`]
            );

            await runQuery('COMMIT');

            res.json({
                success: true,
                message: 'Item deleted successfully'
            });
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error deleting item:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Initialize activity_log table
async function initializeActivityLogTable() {
    try {
        // Create activity_log table if it doesn't exist
        await runQuery(`
            CREATE TABLE IF NOT EXISTS activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME NOT NULL,
                action TEXT NOT NULL,
                details TEXT NOT NULL,
                user_id INTEGER,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
    } catch (err) {
        console.error('Error initializing activity log table:', err);
    }
}

// Initialize notes table
async function initializeNotesTable() {
    try {
        // Create notes table if it doesn't exist
        await runQuery(`
            CREATE TABLE IF NOT EXISTS notes (
                note_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                priority TEXT DEFAULT 'low',
                category TEXT DEFAULT 'general',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
    } catch (err) {
        console.error('Error initializing notes table:', err);
    }
}

// Initialize borrowed_items table
async function initializeBorrowedItemsTable() {
    try {
        await runQuery(`
            CREATE TABLE IF NOT EXISTS borrowed_items (
                id TEXT PRIMARY KEY,
                item_id TEXT NOT NULL,
                item_name TEXT NOT NULL,
                category TEXT,
                quantity INTEGER NOT NULL,
                borrower_name TEXT NOT NULL,
                department TEXT NOT NULL,
                borrow_date TEXT NOT NULL,
                due_date TEXT NOT NULL,
                return_date TEXT,
                status TEXT NOT NULL CHECK(status IN ('Borrowed', 'Returned', 'Past Due')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (item_id) REFERENCES items(product_id)
            )
        `);
    } catch (err) {
        console.error('Error initializing borrowed items table:', err);
    }
}

// Initialize notifications table
async function initializeNotificationsTable() {
    try {
        // First, check if the table exists
        const tableExists = await getOne(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'"
        );
        
        // If the table exists, drop it to ensure we have the right schema
        if (tableExists) {
            console.log('Dropping existing notifications table to recreate with updated schema');
            await runQuery('DROP TABLE IF EXISTS notifications');
        }
        
        // Create notifications table
        await runQuery(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                message TEXT NOT NULL,
                details TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                read INTEGER DEFAULT 0,
                resolved INTEGER DEFAULT 0,
                resolved_timestamp DATETIME,
                resolved_by INTEGER,
                resolved_note TEXT,
                user_id INTEGER,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (resolved_by) REFERENCES users(id)
            )
        `);
        
        console.log('Notifications table initialized with updated schema');
    } catch (err) {
        console.error('Error initializing notifications table:', err);
    }
}

// Initialize users table
async function initializeUsersTable() {
    try {
        await runQuery(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL,
                full_name TEXT,
                email TEXT,
                approved INTEGER DEFAULT 0,
                last_login DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    } catch (err) {
        console.error('Error initializing users table:', err);
    }
}

// Initialize password_reset_tokens table
async function initializePasswordResetTokensTable() {
    try {
        await runQuery(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                token TEXT NOT NULL UNIQUE,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
    } catch (err) {
        console.error('Error initializing password_reset_tokens table:', err);
    }
}

// Ensure 'approved' column exists in users table
async function ensureApprovedColumn() {
    try {
        const columns = await getAll("PRAGMA table_info(users)");
        const hasApproved = columns.some(col => col.name === 'approved');
        if (!hasApproved) {
            await runQuery('ALTER TABLE users ADD COLUMN approved INTEGER DEFAULT 0');
            console.log("Added 'approved' column to users table");
        }
    } catch (err) {
        console.error("Error ensuring 'approved' column:", err);
    }
}

// Ensure created_at column exists in users table
async function ensureCreatedAtColumn() {
    try {
        const columns = await getAll("PRAGMA table_info(users)");
        const hasCreatedAt = columns.some(col => col.name === 'created_at');
        if (!hasCreatedAt) {
            await runQuery('ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
            console.log("Added 'created_at' column to users table");
        }
    } catch (err) {
        console.error("Error ensuring 'created_at' column:", err);
    }
}

// Ensure threshold column exists in categories table
async function ensureThresholdColumn() {
    try {
        // Check if threshold column exists
        const tableInfo = await getAll("PRAGMA table_info(categories)");
        const hasThresholdColumn = tableInfo.some(col => col.name === 'threshold');

        if (!hasThresholdColumn) {
            // Add threshold column with default value of 20
            await runQuery('ALTER TABLE categories ADD COLUMN threshold INTEGER DEFAULT 20');
            console.log('Added threshold column to categories table');
        }
    } catch (error) {
        console.error('Error ensuring threshold column:', error);
    }
}

// Initialize tables sequentially to avoid transaction conflicts
async function initializeTables() {
    try {
        await initializeNotesTable();
        await initializeActivityLogTable();
        await initializeBorrowedItemsTable();
        await initializeNotificationsTable();
        await initializeUsersTable();
        await initializePasswordResetTokensTable();
        await ensureApprovedColumn();
        await ensureCreatedAtColumn();
        await ensureThresholdColumn();
        await initializeDefaultUsers();
        console.log('Database tables initialized');
    } catch (error) {
        console.error('Error initializing tables:', error);
        throw error;
    }
}

// Initialize tables when server starts
initializeTables();

// Get paginated activities endpoint
app.get('/api/activities', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const action = req.query.action || '';

        console.log('Pagination request:', { page, limit, offset, search, action });

        // Build the WHERE clause based on filters
        let whereClause = '1=1';
        const params = [];

        if (search) {
            whereClause += ' AND (details LIKE ? OR users.username LIKE ? OR users.full_name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        if (action) {
            whereClause += ' AND activity_log.action = ?';
            params.push(action);
        }

        // Get total count for pagination
        const totalCount = await getOne(
            `SELECT COUNT(*) as count 
             FROM activity_log 
             LEFT JOIN users ON activity_log.user_id = users.id
             WHERE ${whereClause}`,
            params
        );

        console.log('Total records found:', totalCount.count);

        // Get paginated activities
        const activities = await getAll(
            `SELECT activity_log.*, users.username, users.full_name
             FROM activity_log 
             LEFT JOIN users ON activity_log.user_id = users.id
             WHERE ${whereClause}
             ORDER BY activity_log.timestamp DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        console.log('Records in current page:', activities.length);
        console.log('Pagination details:', {
            totalItems: totalCount.count,
            itemsPerPage: limit,
            totalPages: Math.ceil(totalCount.count / limit),
            currentPage: page
        });

        const totalPages = Math.ceil(totalCount.count / limit);

        res.json({
            success: true,
            data: {
                activities,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalItems: totalCount.count,
                    itemsPerPage: limit,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                }
            }
        });
    } catch (err) {
        console.error('Error fetching activities:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Log activity endpoint
app.post('/api/activities', async (req, res) => {
    try {
        const { action, details, user_id, metadata } = req.body;
        
        // Validate required fields
        if (!action || !details) {
            return res.status(400).json({
                success: false,
                error: 'Action and details are required'
            });
        }

        // Insert activity
        const result = await runQuery(
            `INSERT INTO activity_log (timestamp, action, details, user_id, metadata)
             VALUES (datetime('now'), ?, ?, ?, ?)`,
            [action, details, user_id, metadata ? JSON.stringify(metadata) : null]
        );

        // Get the inserted activity
        const activity = await getOne(
            `SELECT activity_log.*, users.username, users.full_name
             FROM activity_log 
             LEFT JOIN users ON activity_log.user_id = users.id
             WHERE activity_log.id = ?`,
            [result.lastID]
        );

        res.json({
            success: true,
            activity
        });
    } catch (err) {
        console.error('Error logging activity:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Notifications endpoints
app.get('/api/notifications', async (req, res) => {
    try {
        // First check if the notifications table exists with the correct schema
        const tableInfo = await getAll("PRAGMA table_info(notifications)");
        const columns = tableInfo.map(col => col.name);
        
        // If the table doesn't have the right columns, initialize it
        if (!columns.includes('user_id') || !columns.includes('read') || !columns.includes('resolved')) {
            await initializeNotificationsTable();
        }
        
        const userId = req.query.user_id;  // Optional user filter
        const showResolved = req.query.show_resolved === 'true';  // Filter for resolved status
        
        let whereClause = showResolved ? '' : 'WHERE resolved = 0';
        const params = [];
        
        if (userId) {
            whereClause = showResolved 
                ? `WHERE (user_id = ? OR user_id IS NULL)` 
                : `WHERE resolved = 0 AND (user_id = ? OR user_id IS NULL)`;
            params.push(userId);
        }
        
        const query = `
            SELECT id, type, message, details, timestamp, read, resolved, 
                   resolved_timestamp, resolved_by, resolved_note, user_id
            FROM notifications
            ${whereClause}
            ORDER BY timestamp DESC LIMIT 100
        `;
        
        const notifications = await getAll(query, params);
        
        // Parse the details JSON string if it exists
        const parsedNotifications = notifications.map(notification => ({
            ...notification,
            details: notification.details ? JSON.parse(notification.details) : {}
        }));
        
        res.json({ 
            success: true, 
            notifications: parsedNotifications 
        });
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/notifications', async (req, res) => {
    try {
        const { type, message, details, user_id } = req.body;
        
        if (!type || !message) {
            return res.status(400).json({ 
                success: false, 
                error: 'Type and message are required'
            });
        }
        
        const detailsJson = details ? JSON.stringify(details) : null;
        
        const result = await runQuery(
            `INSERT INTO notifications (type, message, details, user_id, timestamp)
             VALUES (?, ?, ?, ?, datetime('now'))`,
            [type, message, detailsJson, user_id || null]
        );
        
        const newNotification = await getOne(
            `SELECT id, type, message, details, timestamp, read, user_id
             FROM notifications WHERE id = ?`,
            [result.lastID]
        );
        
        // Parse the details JSON for the response
        newNotification.details = newNotification.details ? 
            JSON.parse(newNotification.details) : {};
        
        res.status(201).json({ 
            success: true, 
            notification: newNotification 
        });
    } catch (err) {
        console.error('Error creating notification:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/notifications/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        
        await runQuery(
            'UPDATE notifications SET read = 1 WHERE id = ?', 
            [id]
        );
        
        const updatedNotification = await getOne(
            `SELECT id, type, message, details, timestamp, read, user_id
             FROM notifications WHERE id = ?`,
            [id]
        );
        
        if (!updatedNotification) {
            return res.status(404).json({ 
                success: false, 
                error: 'Notification not found' 
            });
        }
        
        // Parse the details JSON for the response
        updatedNotification.details = updatedNotification.details ? 
            JSON.parse(updatedNotification.details) : {};
        
        res.json({ 
            success: true, 
            notification: updatedNotification 
        });
    } catch (err) {
        console.error('Error marking notification as read:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/notifications/read-all', async (req, res) => {
    try {
        const { user_id } = req.body;
        
        let query = 'UPDATE notifications SET read = 1 WHERE read = 0';
        const params = [];
        
        if (user_id) {
            query = 'UPDATE notifications SET read = 1 WHERE read = 0 AND (user_id = ? OR user_id IS NULL)';
            params.push(user_id);
        }
        
        await runQuery(query, params);
        
        res.json({ 
            success: true, 
            message: 'All notifications marked as read' 
        });
    } catch (err) {
        console.error('Error marking all notifications as read:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Auto-notification endpoints for system checks
app.get('/api/notifications/check', async (req, res) => {
    try {
        // Get low stock items based on category thresholds
        const lowStockItems = await getAll(`
            SELECT i.*, c.threshold 
            FROM items i 
            LEFT JOIN categories c ON i.category = c.name 
            WHERE i.quantity > 0 
            AND i.status != 'Out of Stock'
            AND i.quantity <= COALESCE(c.threshold, 10)
        `);
        
        // Get out of stock items
        const outOfStockItems = await getAll(
            `SELECT * FROM items WHERE quantity = 0 OR status = 'Out of Stock'`
        );
        
        // Get items near expiration date (within 30 days)
        const nearExpirationItems = await getAll(
            `SELECT * FROM items 
             WHERE expiration_date IS NOT NULL 
             AND date(expiration_date) > date('now') 
             AND date(expiration_date) <= date('now', '+30 days')`
        );
        
        // Get borrowed items nearing due date (within 7 days)
        const nearDueItems = await getAll(
            `SELECT * FROM borrowed_items
             WHERE status != 'Returned'
             AND date(due_date) > date('now')
             AND date(due_date) <= date('now', '+7 days')`
        );

        // Get past due items
        const pastDueItems = await getAll(
            `SELECT * FROM borrowed_items
             WHERE status != 'Returned'
             AND date(due_date) < date('now')`
        );
        
        // Create notifications for each condition
        const notifications = {
            lowStock: [],
            outOfStock: [],
            nearExpiration: [],
            nearDue: [],
            pastDue: []
        };
        
        // Process low stock items
        for (const item of lowStockItems) {
            const notification = await createSystemNotification(
                'low_stock',
                `Low Stock Alert: ${item.name}`,
                {
                    itemName: item.name,
                    currentQuantity: item.quantity,
                    category: item.category,
                    threshold: parseInt(item.threshold) || 10
                }
            );
            if (notification) notifications.lowStock.push(notification);
        }
        
        // Process out of stock items
        for (const item of outOfStockItems) {
            const notification = await createSystemNotification(
                'out_of_stock',
                `Out of Stock Alert: ${item.name}`,
                {
                    itemName: item.name,
                    category: item.category
                }
            );
            if (notification) notifications.outOfStock.push(notification);
        }
        
        // Process near expiration items
        for (const item of nearExpirationItems) {
            const notification = await createSystemNotification(
                'near_expiration',
                `Expiration Alert: ${item.name}`,
                {
                    itemName: item.name,
                    expirationDate: item.expiration_date,
                    category: item.category
                }
            );
            if (notification) notifications.nearExpiration.push(notification);
        }
        
        // Process near due items
        for (const item of nearDueItems) {
            const notification = await createSystemNotification(
                'near_due_date',
                `Due Date Alert: ${item.item_name}`,
                {
                    itemName: item.item_name,
                    dueDate: item.due_date,
                    borrower: item.borrower_name,
                    department: item.department
                }
            );
            if (notification) notifications.nearDue.push(notification);
        }

        // Process past due items
        for (const item of pastDueItems) {
            // Update item status to Past Due if it's not already
            if (item.status !== 'Past Due') {
                await runQuery(
                    `UPDATE borrowed_items 
                     SET status = 'Past Due' 
                     WHERE id = ?`,
                    [item.id]
                );
            }

            const notification = await createSystemNotification(
                'past_due',
                `Past Due Alert: ${item.item_name}`,
                {
                    itemName: item.item_name,
                    dueDate: item.due_date,
                    borrower: item.borrower_name,
                    department: item.department,
                    daysOverdue: Math.floor((new Date() - new Date(item.due_date)) / (1000 * 60 * 60 * 24))
                }
            );
            if (notification) notifications.pastDue.push(notification);
        }
        
        res.json({
            success: true,
            notifications
        });
    } catch (err) {
        console.error('Error checking for notifications:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Helper function to create system notifications without duplicates
async function createSystemNotification(type, message, details) {
    try {
        // For low stock notifications, ensure we include the threshold
        if (type === 'low_stock' && details.itemName) {
            const item = await getOne(
                'SELECT i.*, c.threshold FROM items i LEFT JOIN categories c ON i.category = c.name WHERE i.name = ?',
                [details.itemName]
            );
            if (item) {
                details.threshold = parseInt(item.threshold) || 10;
            }
        }

        // Check if a similar unread notification already exists
        const existingSimilar = await getOne(
            `SELECT id FROM notifications 
             WHERE type = ? AND message = ? AND read = 0 AND details = ?`,
            [type, message, JSON.stringify(details)]
        );
        
        if (existingSimilar) {
            return null; // Skip creating duplicate notification
        }
        
        // Create new notification
        const result = await runQuery(
            `INSERT INTO notifications (type, message, details, timestamp)
             VALUES (?, ?, ?, datetime('now'))`,
            [type, message, JSON.stringify(details)]
        );
        
        const newNotification = await getOne(
            `SELECT id, type, message, details, timestamp, read
             FROM notifications WHERE id = ?`,
            [result.lastID]
        );
        
        // Parse the details JSON for the response
        newNotification.details = newNotification.details ? 
            JSON.parse(newNotification.details) : {};
            
        return newNotification;
    } catch (err) {
        console.error('Error creating system notification:', err);
        return null;
    }
}

// User authentication endpoints
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required' });
        }
        // Fetch user by username
        const user = await getOne('SELECT * FROM users WHERE username = ?', [username]);
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        // Compare password using bcrypt
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        // Only check approval status if the user has never logged in before
        if (!user.approved && !user.last_login) {
            return res.status(403).json({ success: false, message: 'Your account is pending approval by the department head.' });
        }
        // Update last login timestamp
        await runQuery('UPDATE users SET last_login = datetime("now") WHERE id = ?', [user.id]);
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                fullName: user.full_name
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An error occurred during login', error: err.message });
    }
});

// Verify user authentication
app.get('/api/auth/verify', async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) {
            return res.status(401).json({ success: false, message: 'No username provided' });
        }

        const user = await getOne('SELECT * FROM users WHERE username = ?', [username]);
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        // Only check approval status if the user has never logged in before
        if (!user.approved && !user.last_login) {
            return res.status(403).json({ success: false, message: 'Your account is pending approval by the department head.' });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                fullName: user.full_name
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'An error occurred during verification', error: err.message });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, role, fullName, email } = req.body;
        const existingUser = await getOne('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Username already exists' });
        }
        // Hash the password before saving
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await runQuery(
            'INSERT INTO users (username, password, role, full_name, email, approved) VALUES (?, ?, ?, ?, ?, 0)',
            [username, hashedPassword, role, fullName, email]
        );
        // Notify all department heads
        const deptHeads = await getAll('SELECT id FROM users WHERE role = ? AND approved = 1', ['department_head']);
        for (const head of deptHeads) {
            await runQuery(
                `INSERT INTO notifications (type, message, details, user_id, timestamp) VALUES (?, ?, ?, ?, datetime('now'))`,
                [
                    'user_approval',
                    `New user registration: ${fullName || username}`,
                    JSON.stringify({ username, fullName, email, role }),
                    head.id
                ]
            );
        }
        res.json({
            success: true,
            user: {
                id: result.lastID,
                username,
                role,
                fullName,
                email
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Initialize default admin if no users exist
async function initializeDefaultUsers() {
    try {
        // First, check if users exist
        const users = await getAll('SELECT username FROM users');
        
        // Add default admin if not exists
        const adminExists = users.some(user => user.username === 'admin');
        if (!adminExists) {
            await runQuery(
                'INSERT INTO users (username, password, role, approved) VALUES (?, ?, ?, 1)',
                ['admin', 'admin', 'department_head']
            );
        }
        
        // Add member if not exists
        const memberExists = users.some(user => user.username === 'member');
        if (!memberExists) {
            await runQuery(
                'INSERT INTO users (username, password, role, approved) VALUES (?, ?, ?, 1)',
                ['member', 'member', 'member']
            );
        }

        // Remove log all users
    } catch (err) {
        console.error('Error initializing default users:', err);
    }
}

// Call initialization when server starts
initializeDefaultUsers();

// Serve index.html for the root route
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, '..', 'static', 'index.html');
    res.sendFile(indexPath);
});

// Helper function to generate custom supplier ID
async function generateSupplierId() {
    // Get current date in YYYYMMDD format
    const date = new Date();
    const dateStr = date.getFullYear() +
        String(date.getMonth() + 1).padStart(2, '0') +
        String(date.getDate()).padStart(2, '0');
    
    try {
        // Get the latest ID for today
        const result = await getOne(`
            SELECT supplier_id 
            FROM suppliers 
            WHERE supplier_id LIKE 'S${dateStr}%' 
            ORDER BY supplier_id DESC 
            LIMIT 1
        `);

        let sequentialNumber = 1;
        if (result && result.supplier_id) {
            // Extract the sequential number from the last ID and increment it
            const lastSequential = parseInt(result.supplier_id.slice(-3));
            sequentialNumber = lastSequential + 1;
        }

        // Combine date and sequential number (padded to 3 digits)
        return `S${dateStr}${String(sequentialNumber).padStart(3, '0')}`;
    } catch (err) {
        console.error('Error generating supplier ID:', err);
        throw err;
    }
}

// Supplier endpoints
app.get('/api/suppliers', async (req, res) => {
    try {
        const suppliers = await getAll('SELECT * FROM suppliers ORDER BY supplier_id DESC');
        res.json({ success: true, suppliers });
    } catch (err) {
        console.error('Error fetching suppliers:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/suppliers/:id', async (req, res) => {
    const supplierId = req.params.id;
    try {
        const supplier = await getOne('SELECT * FROM suppliers WHERE supplier_id = ?', [supplierId]);
        
        if (!supplier) {
            return res.status(404).json({ success: false, error: 'Supplier not found' });
        }

        res.json({
            success: true,
            supplier
        });
    } catch (err) {
        console.error('Error fetching supplier:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/suppliers', async (req, res) => {
    const { name, contact, email, phone, address } = req.body;

    // Validate required fields
    if (!name || !contact || !email) {
        return res.status(400).json({
            success: false,
            error: "Name, contact, and email are required"
        });
    }

    try {
        await runQuery('BEGIN TRANSACTION');

        try {
            // Generate custom ID
            const supplierId = await generateSupplierId();

            // Insert supplier with custom ID
            await runQuery(
                `INSERT INTO suppliers (supplier_id, name, contact, email, phone, address)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [supplierId, name, contact, email, phone || null, address || null]
            );

            // Log activity
            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details)
                 VALUES (datetime('now'), ?, ?)`,
                ['add_supplier', `Added new supplier: ${name}`]
            );

            await runQuery('COMMIT');

            // Get the newly created supplier
            const supplier = await getOne(
                'SELECT * FROM suppliers WHERE supplier_id = ?',
                [supplierId]
            );

            res.status(201).json({
                success: true,
                message: 'Supplier added successfully',
                supplier
            });
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error adding supplier:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/suppliers/:id', async (req, res) => {
    const supplierId = req.params.id;
    const { name, contact, email, phone, address } = req.body;

    if (!name || !contact || !email) {
        return res.status(400).json({ 
            success: false, 
            error: "Name, contact person, and email are required" 
        });
    }

    try {
        await runQuery('BEGIN TRANSACTION');

        try {
            await runQuery(
                `UPDATE suppliers 
                 SET name = ?, contact = ?, email = ?, phone = ?, address = ?
                 WHERE supplier_id = ?`,
                [name, contact, email, phone || null, address || null, supplierId]
            );

            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details) 
                 VALUES (datetime('now'), ?, ?)`,
                ['update_supplier', `Updated supplier: ${name}`]
            );

            await runQuery('COMMIT');

            const supplier = await getOne(
                'SELECT * FROM suppliers WHERE supplier_id = ?',
                [supplierId]
            );

            if (!supplier) {
                return res.status(404).json({ success: false, error: 'Supplier not found' });
            }

            res.json({
                success: true,
                message: 'Supplier updated successfully',
                supplier
            });
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error updating supplier:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/suppliers/:id', async (req, res) => {
    const supplierId = req.params.id;

    try {
        await runQuery('BEGIN TRANSACTION');

        try {
            // Get supplier details for activity log
            const supplier = await getOne(
                'SELECT name FROM suppliers WHERE supplier_id = ?',
                [supplierId]
            );

            if (!supplier) {
                await runQuery('ROLLBACK');
                return res.status(404).json({ success: false, error: 'Supplier not found' });
            }

            // Delete supplier
            await runQuery('DELETE FROM suppliers WHERE supplier_id = ?', [supplierId]);

            // Log activity
            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details) 
                 VALUES (datetime('now'), ?, ?)`,
                ['delete_supplier', `Deleted supplier: ${supplier.name}`]
            );

            await runQuery('COMMIT');

            res.json({
                success: true,
                message: 'Supplier deleted successfully'
            });
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error deleting supplier:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Search endpoint
app.get('/api/items/search', async (req, res) => {
    try {
        const { query, category, status, availability } = req.query;
        let sql = `
            SELECT i.*, s.name as supplier_name, c.name as category_name,
                   n.content as notes, n.priority
            FROM items i 
            LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
            LEFT JOIN categories c ON i.category = c.id
            LEFT JOIN notes n ON i.product_id = n.item_id
            WHERE 1=1
        `;
        const params = [];
        if (query) {
            sql += ` AND (i.name LIKE ? OR i.product_id LIKE ?)`;
            params.push(`%${query}%`, `%${query}%`);
        }
        if (category) {
            sql += ` AND i.category = ?`;
            params.push(category);
        }
        if (status) {
            sql += ` AND i.status = ?`;
            params.push(status);
        }
        if (availability) {
            sql += ` AND i.availability = ?`;
            params.push(availability);
        }
        const items = await getAll(sql, params);
        res.json(Array.isArray(items) ? items : []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Serve the inventory page with server-side rendered data
app.get('/inventory', async (req, res) => {
    try {
        // Get items from database
        const items = await getAll('SELECT * FROM items ORDER BY name');

        // Read the HTML template
        let html = await require('fs').promises.readFile(
            path.join(__dirname, '..', 'static', 'inventory.html'), 
            'utf8'
        );

        // Generate the table rows HTML
        const tableRows = items.map(item => `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">${item.product_id || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">${item.name || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">${item.category || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">${item.status || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">${item.availability || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-secondary-900 actions-column">
                    <button onclick="editItem(${item.product_id})" class="text-primary-600 hover:text-primary-900 mr-3">Edit</button>
                    <button onclick="deleteItem(${item.product_id})" class="text-red-600 hover:text-red-900">Delete</button>
                </td>
            </tr>
        `).join('');

        // Find the table body position
        const tableBodyStart = html.indexOf('<tbody id="inventoryTableBody"');
        const tableBodyEnd = html.indexOf('</tbody>', tableBodyStart) + 8;
        
        // Replace the entire table body with our new content
        html = html.slice(0, tableBodyStart) +
            '<tbody id="inventoryTableBody" class="bg-white divide-y divide-secondary-200">' +
            tableRows +
            '</tbody>' +
            html.slice(tableBodyEnd);

        res.send(html);
    } catch (err) {
        console.error('Error rendering inventory page:', err);
        res.status(500).send('Error loading inventory: ' + err.message);
    }
});

// Handle inventory form submission
app.post('/inventory/add', async (req, res) => {
    try {
        const { name, category, status, availability, quantity, expiration_date } = req.body;
        
        if (!name || name.trim() === '') {
            return res.status(400).send('Item name is required');
        }

        await runQuery('BEGIN TRANSACTION');

        try {
            // Insert the item
            const result = await runQuery(
                `INSERT INTO items (name, category, status, availability, quantity, expiration_date) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [name.trim(), category?.trim(), status?.trim(), availability?.trim(), parseInt(quantity) || 0, expiration_date || null]
            );

            // Log the activity
            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details) 
                 VALUES (?, ?, ?)`,
                [new Date().toISOString(), 'add_item', `Added item: ${name} with quantity: ${quantity || 0}${expiration_date ? ', expiration: ' + expiration_date : ''}`]
            );

            await runQuery('COMMIT');
            res.redirect('/inventory');
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error adding item:', err);
        res.status(500).send('Error adding item: ' + err.message);
    }
});

// Handle inventory deletion
app.post('/inventory/delete/:id', async (req, res) => {
    try {
        const itemId = req.params.id;

        await runQuery('BEGIN TRANSACTION');

        try {
            // Get item details for activity log
            const item = await getOne(
                'SELECT name FROM items WHERE product_id = ?',
                [itemId]
            );

            if (!item) {
                return res.status(404).send('Item not found');
            }

            // Delete the item
            await runQuery('DELETE FROM items WHERE product_id = ?', [itemId]);

            // Log the activity
            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details) 
                 VALUES (?, ?, ?)`,
                [new Date().toISOString(), 'delete_item', `Deleted item: ${item.name}`]
            );

            await runQuery('COMMIT');
            res.redirect('/inventory');
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error deleting item:', err);
        res.status(500).send('Error deleting item');
    }
});

// Handle inventory update
app.post('/inventory/update/:id', async (req, res) => {
    try {
        const { name, category, status, availability, quantity, expiration_date } = req.body;
        const itemId = req.params.id;

        if (!name) {
            return res.status(400).send('Item name is required');
        }

        await runQuery('BEGIN TRANSACTION');

        try {
            // Update the item
            await runQuery(
                `UPDATE items 
                 SET name = ?, category = ?, status = ?, availability = ?, quantity = ?, expiration_date = ?
                 WHERE product_id = ?`,
                [name, category, status, availability, parseInt(quantity) || 0, expiration_date || null, itemId]
            );

            // Log the activity
            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details) 
                 VALUES (?, ?, ?)`,
                [new Date().toISOString(), 'update_item', `Updated item: ${name} with quantity: ${quantity || 0}${expiration_date ? ', expiration: ' + expiration_date : ''}`]
            );

            await runQuery('COMMIT');
            res.redirect('/inventory');
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error updating item:', err);
        res.status(500).send('Error updating item');
    }
});

// Debug endpoint to check suppliers table
app.get('/debug/suppliers', async (req, res) => {
    try {
        // Get table info
        const tableInfo = await getAll("SELECT sql FROM sqlite_master WHERE type='table' AND name='suppliers'");
        
        // Get suppliers count
        const count = await getOne('SELECT COUNT(*) as count FROM suppliers');
        
        // Get all suppliers
        const suppliers = await getAll('SELECT * FROM suppliers');
        
        res.json({
            schema: tableInfo,
            count: count,
            suppliers: suppliers
        });
    } catch (err) {
        console.error('Error checking suppliers table:', err);
        res.status(500).json({ error: err.message });
    }
});

// Debug endpoint to check items table
app.get('/debug/items', async (req, res) => {
    try {
        // Get table info
        const tableInfo = await getAll("SELECT sql FROM sqlite_master WHERE type='table' AND name='items'");
        
        // Get items count
        const count = await getOne('SELECT COUNT(*) as count FROM items');
        
        // Get all items
        const items = await getAll('SELECT * FROM items');
        
        res.json({
            schema: tableInfo,
            count: count,
            items: items
        });
    } catch (err) {
        console.error('Error checking items table:', err);
        res.status(500).json({ error: err.message });
    }
});

// Notes endpoints
app.post('/api/notes', async (req, res) => {
    const { title, content, priority, category, user_id } = req.body;

    // Validate required fields
    if (!title || !content || !user_id) {
        return res.status(400).json({ 
            success: false, 
            error: "Title, content and user_id are required" 
        });
    }

    try {
        await runQuery('BEGIN TRANSACTION');

        try {
            // Insert note
            const result = await runQuery(
                `INSERT INTO notes (user_id, title, content, priority, category, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
                [user_id, title, content, priority || 'low', category || 'general']
            );

            // Log activity
            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details, user_id, metadata) 
                 VALUES (datetime('now'), ?, ?, ?, ?)`,
                ['add_note', `Added new note: ${title}`, user_id, JSON.stringify({ note_id: result.lastID, priority, category })]
            );

            await runQuery('COMMIT');

            // Get the newly created note with user info
            const note = await getOne(
                `SELECT notes.*, users.username, users.full_name as author_name
                 FROM notes 
                 LEFT JOIN users ON notes.user_id = users.id
                 WHERE notes.note_id = ?`,
                [result.lastID]
            );

            res.status(201).json({
                success: true,
                message: 'Note added successfully',
                note
            });
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error adding note:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/notes', async (req, res) => {
    try {
        const notes = await getAll(
            `SELECT notes.*, users.username, users.full_name as author_name
             FROM notes 
             LEFT JOIN users ON notes.user_id = users.id
             ORDER BY notes.created_at DESC`
        );

        res.json({
            success: true,
            notes
        });
    } catch (err) {
        console.error('Error fetching notes:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/notes/:id', async (req, res) => {
    const noteId = req.params.id;
    const { title, content, priority, category } = req.body;

    if (!title || !content) {
        return res.status(400).json({ 
            success: false, 
            error: "Title and content are required" 
        });
    }

    try {
        await runQuery('BEGIN TRANSACTION');

        try {
            // Get the old note for activity logging
            const oldNote = await getOne(
                'SELECT * FROM notes WHERE note_id = ?',
                [noteId]
            );

            if (!oldNote) {
                return res.status(404).json({ success: false, error: 'Note not found' });
            }

            // Update note
            await runQuery(
                `UPDATE notes 
                 SET title = ?, content = ?, priority = ?, category = ?, updated_at = datetime('now')
                 WHERE note_id = ?`,
                [title, content, priority || oldNote.priority, category || oldNote.category, noteId]
            );

            // Log activity
            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details, user_id, metadata) 
                 VALUES (datetime('now'), ?, ?, ?, ?)`,
                ['edit_note', `Updated note: ${title}`, oldNote.user_id, 
                 JSON.stringify({
                     note_id: noteId,
                     changes: {
                         title: title !== oldNote.title ? { old: oldNote.title, new: title } : undefined,
                         priority: priority !== oldNote.priority ? { old: oldNote.priority, new: priority } : undefined,
                         category: category !== oldNote.category ? { old: oldNote.category, new: category } : undefined
                     }
                 })]
            );

            await runQuery('COMMIT');

            // Get the updated note with user info
            const note = await getOne(
                `SELECT notes.*, users.username, users.full_name as author_name
                 FROM notes 
                 LEFT JOIN users ON notes.user_id = users.id
                 WHERE notes.note_id = ?`,
                [noteId]
            );

            res.json({
                success: true,
                message: 'Note updated successfully',
                note
            });
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error updating note:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/notes/:id', async (req, res) => {
    const noteId = req.params.id;

    try {
        await runQuery('BEGIN TRANSACTION');

        try {
            // Get the note before deletion for activity logging
            const note = await getOne(
                'SELECT * FROM notes WHERE note_id = ?',
                [noteId]
            );

            if (!note) {
                return res.status(404).json({ success: false, error: 'Note not found' });
            }

            // Delete the note
            await runQuery('DELETE FROM notes WHERE note_id = ?', [noteId]);

            // Log activity
            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details, user_id, metadata) 
                 VALUES (datetime('now'), ?, ?, ?, ?)`,
                ['delete_note', `Deleted note: ${note.title}`, note.user_id, 
                 JSON.stringify({ note_id: noteId, title: note.title })]
            );

            await runQuery('COMMIT');

            res.json({
                success: true,
                message: 'Note deleted successfully'
            });
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error deleting note:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get recent activities endpoint
app.get('/api/recent-activities', async (req, res) => {
    try {
        const activities = await getAll(`
            SELECT activity_log.*, users.username, users.full_name
            FROM activity_log 
            LEFT JOIN users ON activity_log.user_id = users.id
            ORDER BY activity_log.timestamp DESC
            LIMIT 2
        `);

        res.json({
            success: true,
            activities: activities
        });
    } catch (err) {
        console.error('Error fetching recent activities:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Move catch-all route to the end


// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Press Ctrl+C to stop');
});



// Debug endpoint to reinitialize tables
app.get('/debug/reinitialize-tables', async (req, res) => {
    try {
        console.log('Reinitializing all database tables');
        await initializeTables();
        res.json({ 
            success: true, 
            message: 'Tables reinitialized successfully'
        });
    } catch (err) {
        console.error('Error reinitializing tables:', err);
        res.status(500).json({ 
            success: false, 
            error: err.message
        });
    }
});

// Resolve a notification
app.put('/api/notifications/:id/resolve', async (req, res) => {
    try {
        const { id } = req.params;
        const { resolved_note, user_id } = req.body;
        
        // Check if the notification exists
        const notification = await getOne('SELECT * FROM notifications WHERE id = ?', [id]);
        if (!notification) {
            return res.status(404).json({ 
                success: false, 
                error: 'Notification not found' 
            });
        }
        
        // Mark as resolved
        await runQuery(
            `UPDATE notifications 
             SET resolved = 1, 
                 resolved_timestamp = datetime('now'), 
                 resolved_by = ?, 
                 resolved_note = ?,
                 read = 1
             WHERE id = ?`,
            [user_id || null, resolved_note || null, id]
        );
        
        // Get the updated notification
        const updatedNotification = await getOne(
            `SELECT id, type, message, details, timestamp, read, resolved, 
                    resolved_timestamp, resolved_by, resolved_note, user_id
             FROM notifications WHERE id = ?`,
            [id]
        );
        
        // Parse the details JSON
        updatedNotification.details = updatedNotification.details ? 
            JSON.parse(updatedNotification.details) : {};
        
        // Also handle the condition that triggered this notification if possible
        try {
            // For low stock notifications, check if we should create a restocked notification
            if (notification.type === 'low_stock' && notification.details) {
                const details = JSON.parse(notification.details);
                if (details.itemName) {
                    // Get the current item info to see if it's been restocked
                    const item = await getOne(
                        'SELECT * FROM items WHERE name = ?',
                        [details.itemName]
                    );
                    
                    // If the item has been restocked above the threshold, create a restocked notification
                    if (item && item.quantity > 20) {
                        await createSystemNotification(
                            'item_restocked',
                            `Item Restocked: ${item.name}`,
                            {
                                itemName: item.name,
                                currentQuantity: item.quantity,
                                category: item.category,
                                previousNotificationId: id
                            }
                        );
                    }
                }
            }
            // Similarly for other notification types...
        } catch (autoResolveErr) {
            console.error('Error during auto-resolution:', autoResolveErr);
            // Continue anyway, since the main resolve operation succeeded
        }
        
        res.json({ 
            success: true, 
            notification: updatedNotification,
            message: 'Notification resolved successfully' 
        });
    } catch (err) {
        console.error('Error resolving notification:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get all resolved notifications
app.get('/api/notifications/resolved', async (req, res) => {
    try {
        const userId = req.query.user_id;  // Optional user filter
        let query = `
            SELECT id, type, message, details, timestamp, read, resolved, 
                   resolved_timestamp, resolved_by, resolved_note, user_id
            FROM notifications
            WHERE resolved = 1
            ORDER BY resolved_timestamp DESC LIMIT 100
        `;
        const params = [];
        
        if (userId) {
            query = `
                SELECT id, type, message, details, timestamp, read, resolved, 
                       resolved_timestamp, resolved_by, resolved_note, user_id
                FROM notifications
                WHERE resolved = 1 AND (user_id = ? OR user_id IS NULL)
                ORDER BY resolved_timestamp DESC LIMIT 100
            `;
            params.push(userId);
        }
        
        const notifications = await getAll(query, params);
        
        // Parse the details JSON string if it exists
        const parsedNotifications = notifications.map(notification => ({
            ...notification,
            details: notification.details ? JSON.parse(notification.details) : {}
        }));
        
        res.json({ 
            success: true, 
            notifications: parsedNotifications 
        });
    } catch (err) {
        console.error('Error fetching resolved notifications:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint to get all pending users
app.get('/api/pending-users', async (req, res) => {
    try {
        const users = await getAll('SELECT id, username, full_name, role, email FROM users WHERE approved = 0');
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint to approve a user
app.post('/api/approve-user', async (req, res) => {
    try {
        const { id } = req.body;
        await runQuery('UPDATE users SET approved = 1 WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint to reject (delete) a user
app.post('/api/reject-user', async (req, res) => {
    try {
        const { id } = req.body;
        await runQuery('DELETE FROM users WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// TEMPORARY: Approve admin user for debug
app.get('/debug/approve-admin', async (req, res) => {
    await runQuery('UPDATE users SET approved = 1 WHERE username = ?', ['admin']);
    res.send('Admin approved!');
});

app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, '..', 'static', 'index.html');
    res.sendFile(indexPath);
});

// Helper: send password reset email
async function sendPasswordResetEmail(email, token) {
    console.log('SMTP Configuration:', {
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_SECURE,
        user: process.env.SMTP_USER,
        from: process.env.SMTP_FROM
    });

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    try {
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password.html?token=${token}`;
        await transporter.sendMail({
            from: process.env.SMTP_FROM || 'noreply@example.com',
            to: email,
            subject: 'Password Reset Request',
            html: `<p>You requested a password reset. Click <a href="${resetUrl}">here</a> to reset your password. This link will expire in 1 hour.</p>`
        });
        console.log('Password reset email sent successfully to:', email);
    } catch (error) {
        console.error('Error sending password reset email:', error);
        throw error;
    }
}

// POST /api/auth/forgot-password
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    try {
        // Find user by email
        const user = await getOne('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) return res.status(404).json({ error: 'No user found with that email.' });
        // Generate token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
        // Store token
        await runQuery('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)', [user.id, token, expiresAt]);
        // Send email
        await sendPasswordResetEmail(email, token);
        res.json({ message: 'Password reset email sent.' });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// POST /api/auth/reset-password
app.post('/api/auth/reset-password', async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required.' });
    try {
        // Find token
        const row = await getOne('SELECT * FROM password_reset_tokens WHERE token = ?', [token]);
        if (!row) return res.status(400).json({ error: 'Invalid or expired token.' });
        if (new Date(row.expires_at) < new Date()) {
            await runQuery('DELETE FROM password_reset_tokens WHERE token = ?', [token]);
            return res.status(400).json({ error: 'Token expired.' });
        }
        // Update user password
        const hash = await bcrypt.hash(password, 10);
        await runQuery('UPDATE users SET password = ? WHERE id = ?', [hash, row.user_id]);
        // Delete token
        await runQuery('DELETE FROM password_reset_tokens WHERE token = ?', [token]);
        res.json({ message: 'Password has been reset.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Endpoint to update category threshold
app.put('/api/categories/:name/threshold', async (req, res) => {
    try {
        const { name } = req.params;
        const { threshold } = req.body;

        if (typeof threshold !== 'number' || threshold < 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Threshold must be a positive number' 
            });
        }

        await runQuery(
            'UPDATE categories SET threshold = ? WHERE name = ?',
            [threshold, name]
        );

        res.json({ 
            success: true, 
            message: 'Threshold updated successfully' 
        });
    } catch (error) {
        console.error('Error updating category threshold:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update threshold' 
        });
    }
});

// Function to check item quantities against category thresholds
async function checkItemThresholds(item) {
    try {
        // Get the category threshold with more detailed logging
        const category = await getOne('SELECT name, threshold FROM categories WHERE name = ?', [item.category]);
        console.log('Category data for threshold check:', {
            itemName: item.name,
            category: item.category,
            foundCategory: category
        });
        
        if (!category) {
            console.log(`No category found for item: ${item.name}, category: ${item.category}`);
            return;
        }

        const currentQuantity = parseInt(item.quantity) || 0;
        const threshold = parseInt(category.threshold) || 10; // Default to 10 if threshold is 0 or invalid
        
        console.log(`Threshold check details for ${item.name}:`, {
            currentQuantity,
            threshold,
            category: item.category,
            rawThreshold: category.threshold
        });
        
        // If quantity is below threshold and greater than 0, create a notification
        if (currentQuantity <= threshold && currentQuantity > 0) {
            const unitsBelow = Math.max(0, threshold - currentQuantity); // Ensure unitsBelow is never negative
            const notificationDetails = {
                itemName: item.name,
                currentQuantity: currentQuantity,
                category: item.category,
                threshold: threshold,
                unitsBelow: unitsBelow
            };
            
            console.log('Creating notification with details:', notificationDetails);
            
            await createSystemNotification(
                'low_stock',
                `Low Stock Alert: ${item.name}`,
                notificationDetails
            );
        }
    } catch (error) {
        console.error('Error checking item thresholds:', error);
    }
}

// Modify the loadCategories function to include threshold
async function loadCategories() {
    try {
        const categories = await getAll('SELECT name, threshold FROM categories');
        return categories;
    } catch (error) {
        console.error('Error loading categories:', error);
        return [];
    }
}

// Modify checkItemThresholds function to add more debugging
async function checkItemThresholds(item) {
    try {
        // Get the category threshold with more detailed logging
        const category = await getOne('SELECT name, threshold FROM categories WHERE name = ?', [item.category]);
        console.log('Category data for threshold check:', {
            itemName: item.name,
            category: item.category,
            foundCategory: category
        });
        
        if (!category) {
            console.log(`No category found for item: ${item.name}, category: ${item.category}`);
            return;
        }

        const currentQuantity = parseInt(item.quantity) || 0;
        const threshold = parseInt(category.threshold) || 10; // Default to 10 if threshold is 0 or invalid
        
        console.log(`Threshold check details for ${item.name}:`, {
            currentQuantity,
            threshold,
            category: item.category,
            rawThreshold: category.threshold
        });
        
        // If quantity is below threshold and greater than 0, create a notification
        if (currentQuantity <= threshold && currentQuantity > 0) {
            const unitsBelow = Math.max(0, threshold - currentQuantity); // Ensure unitsBelow is never negative
            const notificationDetails = {
                itemName: item.name,
                currentQuantity: currentQuantity,
                category: item.category,
                threshold: threshold,
                unitsBelow: unitsBelow
            };
            
            console.log('Creating notification with details:', notificationDetails);
            
            await createSystemNotification(
                'low_stock',
                `Low Stock Alert: ${item.name}`,
                notificationDetails
            );
        }
    } catch (error) {
        console.error('Error checking item thresholds:', error);
    }
}

// Add this to your initializeTables function
async function initializeTables() {
    try {
        await initializeNotesTable();
        await initializeActivityLogTable();
        await initializeBorrowedItemsTable();
        await initializeNotificationsTable();
        await initializeUsersTable();
        await initializePasswordResetTokensTable();
        await ensureApprovedColumn();
        await ensureCreatedAtColumn();
        await ensureThresholdColumn();
        await initializeDefaultUsers();
        console.log('Database tables initialized');
    } catch (error) {
        console.error('Error initializing tables:', error);
        throw error;
    }
}

// Add a new endpoint to manually update thresholds
app.post('/api/categories/update-thresholds', async (req, res) => {
    try {
        await updateCategoryThresholds();
        res.json({ success: true, message: 'Category thresholds updated successfully' });
    } catch (error) {
        console.error('Error updating thresholds:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add endpoint for updating a single category's threshold
app.put('/api/categories/:name/threshold', async (req, res) => {
    try {
        const { name } = req.params;
        const { threshold } = req.body;

        if (!threshold || threshold < 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Threshold must be a positive number' 
            });
        }

        await runQuery('UPDATE categories SET threshold = ? WHERE name = ?', [threshold, name]);
        
        res.json({ 
            success: true, 
            message: `Threshold updated for ${name}`,
            threshold: threshold
        });
    } catch (error) {
        console.error('Error updating threshold:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add endpoint to get low stock items with thresholds
app.get('/api/items/low-stock', async (req, res) => {
    try {
        const items = await getAll(`
            SELECT i.*, c.threshold 
            FROM items i 
            LEFT JOIN categories c ON i.category = c.name 
            WHERE i.quantity > 0
        `);
        
        res.json(items);
    } catch (error) {
        console.error('Error getting low stock items:', error);
        res.status(500).json({ error: 'Failed to get low stock items' });
    }
});