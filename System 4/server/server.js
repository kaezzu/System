const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { runQuery, getAll, getOne } = require('./database');

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

// Debug middleware to log requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    console.log('Request body:', req.body);
    next();
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: err.message });
});

// Debug: Log the static files directory
const staticDir = path.join(__dirname, '..');
console.log('Static files directory:', staticDir);

// Debug: Log all requests
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Categories endpoints
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await getAll('SELECT * FROM categories');
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/categories', async (req, res) => {
    try {
        const { name } = req.body;
        
        const result = await runQuery(
            'INSERT INTO categories (name) VALUES (?)',
            [name]
        );
        
        // Log activity
        await runQuery(
            `INSERT INTO user_activities (timestamp, username, action, details) 
             VALUES (?, ?, ?, ?)`,
            [new Date().toISOString(), req.body.username || 'system', 'add_category', `Added category: ${name}`]
        );
        
        res.json({ id: result.lastID, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
        const items = await getAll('SELECT * FROM items ORDER BY product_id DESC');
        res.setHeader('Content-Type', 'application/json');
        res.json({ success: true, items });
    } catch (err) {
        console.error('Error fetching items:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/items', async (req, res) => {
    const { name, category, status, availability } = req.body;

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

            // Insert item with custom ID
            await runQuery(
                `INSERT INTO items (product_id, name, category, status, availability) 
                 VALUES (?, ?, ?, ?, ?)`,
                [productId, name, category || null, status || null, availability || null]
            );

            // Log activity
            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details) 
                 VALUES (datetime('now'), ?, ?)`,
                ['add_item', `Added new item: ${name}`]
            );

            await runQuery('COMMIT');

            // Get the newly created item
            const item = await getOne(
                'SELECT * FROM items WHERE product_id = ?',
                [productId]
            );

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
    const { name, category, status, availability } = req.body;

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
                 SET name = ?, category = ?, status = ?, availability = ?
                 WHERE product_id = ?`,
                [name, category || null, status || null, availability || null, itemId]
            );

            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details) 
                 VALUES (datetime('now'), ?, ?)`,
                ['update_item', `Updated item: ${name}`]
            );

            await runQuery('COMMIT');

            const item = await getOne(
                'SELECT * FROM items WHERE product_id = ?',
                [itemId]
            );

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

// Activity log endpoints
app.post('/api/activities', async (req, res) => {
    const { action, details, user_id, timestamp, metadata } = req.body;

    if (!action || !details) {
        return res.status(400).json({
            success: false,
            error: "Action and details are required"
        });
    }

    try {
        await runQuery('BEGIN TRANSACTION');

        try {
            // Insert the activity
            const result = await runQuery(
                `INSERT INTO activity_log (
                    timestamp, 
                    action, 
                    details, 
                    user_id,
                    metadata
                ) VALUES (?, ?, ?, ?, ?)`,
                [
                    timestamp || new Date().toISOString(),
                    action,
                    details,
                    user_id,
                    metadata ? JSON.stringify(metadata) : null
                ]
            );

            // Get the created activity with user info
            const activity = await getOne(
                `SELECT 
                    activity_log.*, 
                    users.username,
                    users.role,
                    users.full_name as user_full_name
                FROM activity_log
                LEFT JOIN users ON activity_log.user_id = users.id
                WHERE activity_log.id = ?`,
                [result.lastID]
            );

            await runQuery('COMMIT');

            // Format the response
            const formattedActivity = {
                ...activity,
                metadata: activity.metadata ? JSON.parse(activity.metadata) : null,
                username: activity.username || 'System',
                role: activity.role || 'system',
                user_full_name: activity.user_full_name || null
            };

            res.status(201).json({
                success: true,
                message: 'Activity logged successfully',
                activity: formattedActivity
            });
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error logging activity:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/activities', async (req, res) => {
    try {
        const { 
            page = 1,
            limit = 10,
            action,
            search,
            user_id,
            start_date,
            end_date 
        } = req.query;
        
        // Calculate offset
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        // Build base query
        let countQuery = `
            SELECT COUNT(*) as total
            FROM activity_log
            LEFT JOIN users ON activity_log.user_id = users.id
            WHERE 1=1
        `;
        
        let query = `
            SELECT 
                activity_log.*, 
                users.username,
                users.role,
                users.full_name as user_full_name
            FROM activity_log
            LEFT JOIN users ON activity_log.user_id = users.id
            WHERE 1=1
        `;
        
        const params = [];
        const countParams = [];
        
        // Add filters
        if (action) {
            const condition = ` AND activity_log.action = ?`;
            query += condition;
            countQuery += condition;
            params.push(action);
            countParams.push(action);
        }
        
        if (user_id) {
            const condition = ` AND activity_log.user_id = ?`;
            query += condition;
            countQuery += condition;
            params.push(user_id);
            countParams.push(user_id);
        }

        if (start_date) {
            const condition = ` AND activity_log.timestamp >= ?`;
            query += condition;
            countQuery += condition;
            params.push(start_date);
            countParams.push(start_date);
        }
        
        if (end_date) {
            const condition = ` AND activity_log.timestamp <= ?`;
            query += condition;
            countQuery += condition;
            params.push(end_date);
            countParams.push(end_date);
        }
        
        if (search) {
            const condition = ` AND (
                activity_log.details LIKE ? 
                OR users.username LIKE ?
                OR activity_log.action LIKE ?
                OR activity_log.metadata LIKE ?
            )`;
            query += condition;
            countQuery += condition;
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam, searchParam);
            countParams.push(searchParam, searchParam, searchParam, searchParam);
        }
        
        // Add pagination
        query += ` ORDER BY activity_log.timestamp DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), offset);

        // Get total count
        const countResult = await getOne(countQuery, countParams);
        const total = countResult ? countResult.total : 0;
        const totalPages = Math.ceil(total / parseInt(limit));
        const currentPage = parseInt(page);

        // Get paginated activities
        const activities = await getAll(query, params);
        
        // Format activities
        const formattedActivities = activities.map(activity => ({
            ...activity,
            metadata: activity.metadata ? JSON.parse(activity.metadata) : null,
            username: activity.username || 'System',
            role: activity.role || 'system',
            user_full_name: activity.user_full_name || null
        }));

        // Send response with pagination metadata
        res.json({
            success: true,
            data: {
                activities: formattedActivities,
                pagination: {
                    total,
                    page: currentPage,
                    limit: parseInt(limit),
                    totalPages,
                    hasNextPage: currentPage < totalPages,
                    hasPrevPage: currentPage > 1
                }
            }
        });
    } catch (err) {
        console.error('Error fetching activities:', err);
        res.status(500).json({ 
            success: false, 
            error: err.message 
        });
    }
});

// Notifications endpoints
app.get('/api/notifications', async (req, res) => {
    try {
        const notifications = await getAll('SELECT * FROM notifications ORDER BY timestamp DESC LIMIT 100');
        res.json(notifications);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/notifications', async (req, res) => {
    try {
        const { type, message, details } = req.body;
        const timestamp = new Date().toISOString();
        
        const result = await runQuery(
            'INSERT INTO notifications (type, message, details, timestamp) VALUES (?, ?, ?, ?)',
            [type, message, JSON.stringify(details), timestamp]
        );
        
        res.json({ id: result.lastID, type, message, details, timestamp, read: 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notifications/:id/read', async (req, res) => {
    try {
        await runQuery('UPDATE notifications SET read = 1 WHERE id = ?', [req.params.id]);
        res.json({ message: 'Notification marked as read' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notifications/read-all', async (req, res) => {
    try {
        await runQuery('UPDATE notifications SET read = 1 WHERE read = 0');
        res.json({ message: 'All notifications marked as read' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// User authentication endpoints
app.post('/api/auth/login', async (req, res) => {
    try {
        console.log('Login attempt received:', {
            username: req.body.username,
            hasPassword: !!req.body.password
        });

        const { username, password } = req.body;

        if (!username || !password) {
            console.log('Missing credentials');
            return res.status(400).json({ 
                success: false, 
                message: 'Username and password are required' 
            });
        }

        // First check if user exists
        const userExists = await getOne('SELECT username FROM users WHERE username = ?', [username]);
        if (!userExists) {
            console.log('User not found:', username);
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }

        // Then check credentials
        const user = await getOne('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
        console.log('Authentication result:', {
            userFound: !!user,
            username: username,
            role: user ? user.role : 'unknown'
        });
        
        if (user) {
            res.json({
                success: true,
                user: {
                    username: user.username,
                    role: user.role,
                    fullName: user.full_name
                }
            });
        } else {
            console.log('Invalid password for user:', username);
            res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ 
            success: false, 
            message: 'An error occurred during login',
            error: err.message 
        });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, role, fullName, email } = req.body;
        
        // Check if username already exists
        const existingUser = await getOne('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Username already exists' });
        }
        
        // Insert new user with email
        const result = await runQuery(
            'INSERT INTO users (username, password, role, full_name, email) VALUES (?, ?, ?, ?, ?)',
            [username, password, role, fullName, email]
        );
        
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
                'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                ['admin', 'admin', 'department_head']
            );
            console.log('Created admin user');
        }
        
        // Add member if not exists
        const memberExists = users.some(user => user.username === 'member');
        if (!memberExists) {
            await runQuery(
                'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                ['member', 'member', 'member']
            );
            console.log('Created member user');
        }

        // Log all users
    } catch (err) {
        console.error('Error initializing default users:', err);
    }
}

// Call initialization when server starts
initializeDefaultUsers();

// Serve index.html for the root route
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, '..', 'index.html');
    console.log('Serving index.html from:', indexPath);
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
app.get('/api/inventory/search', async (req, res) => {
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
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Serve the inventory page with server-side rendered data
app.get('/inventory', async (req, res) => {
    try {
        // Get items from database
        const items = await getAll('SELECT * FROM items ORDER BY name');
        console.log('Fetched items:', items); // Debug log

        // Read the HTML template
        let html = await require('fs').promises.readFile(
            path.join(__dirname, '..', 'inventory.html'), 
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
        console.log('Adding item:', req.body);
        const { name, category, status, availability } = req.body;
        
        if (!name || name.trim() === '') {
            console.log('Item name is missing');
            return res.status(400).send('Item name is required');
        }

        await runQuery('BEGIN TRANSACTION');

        try {
            // Insert the item
            const result = await runQuery(
                `INSERT INTO items (name, category, status, availability) 
                 VALUES (?, ?, ?, ?)`,
                [name.trim(), category?.trim(), status?.trim(), availability?.trim()]
            );

            // Log the activity
            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details) 
                 VALUES (?, ?, ?)`,
                [new Date().toISOString(), 'add_item', `Added item: ${name}`]
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
        const { name, category, status, availability } = req.body;
        const itemId = req.params.id;

        if (!name) {
            return res.status(400).send('Item name is required');
        }

        await runQuery('BEGIN TRANSACTION');

        try {
            // Update the item
            await runQuery(
                `UPDATE items 
                 SET name = ?, category = ?, status = ?, availability = ?
                 WHERE product_id = ?`,
                [name, category, status, availability, itemId]
            );

            // Log the activity
            await runQuery(
                `INSERT INTO activity_log (timestamp, action, details) 
                 VALUES (?, ?, ?)`,
                [new Date().toISOString(), 'update_item', `Updated item: ${name}`]
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
        console.log('Suppliers table schema:', tableInfo);

        // Get suppliers count
        const count = await getOne('SELECT COUNT(*) as count FROM suppliers');
        console.log('Suppliers count:', count);

        // Get all suppliers
        const suppliers = await getAll('SELECT * FROM suppliers');
        console.log('All suppliers:', suppliers);

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
        console.log('Items table schema:', tableInfo);

        // Get items count
        const count = await getOne('SELECT COUNT(*) as count FROM items');
        console.log('Items count:', count);

        // Get all items
        const items = await getAll('SELECT * FROM items');
        console.log('All items:', items);

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

// Handle all other routes by serving the index.html
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, '..', 'index.html');
    console.log('Serving index.html for route:', req.url);
    res.sendFile(indexPath);
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Press Ctrl+C to stop');
}); 