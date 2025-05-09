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
app.use(express.static(path.join(__dirname, '..')));

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

// Inventory items endpoints
app.get('/api/inventory', async (req, res) => {
    try {
        const items = await getAll(`
            SELECT i.*, s.name as supplier_name, c.name as category_name,
                   n.content as notes, n.priority
            FROM items i 
            LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
            LEFT JOIN categories c ON i.category = c.id
            LEFT JOIN notes n ON i.product_id = n.item_id
        `);
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory', async (req, res) => {
    try {
        const { name, category, status, availability, supplier_id, notes } = req.body;
        
        // Start a transaction
        await runQuery('BEGIN TRANSACTION');
        
        try {
            // Insert the item
            const itemResult = await runQuery(
                `INSERT INTO items (name, category, status, availability, supplier_id) 
                 VALUES (?, ?, ?, ?, ?)`,
                [name, category, status, availability, supplier_id]
            );
            
            // If notes provided, add them
            if (notes) {
                await runQuery(
                    `INSERT INTO notes (item_id, content, priority) 
                     VALUES (?, ?, ?)`,
                    [itemResult.lastID, notes.content, notes.priority]
                );
            }
            
            // Log the activity
            await runQuery(
                `INSERT INTO user_activities (timestamp, username, action, details) 
                 VALUES (?, ?, ?, ?)`,
                [new Date().toISOString(), req.body.username || 'system', 'add_item', `Added item: ${name}`]
            );
            
            await runQuery('COMMIT');
            
            // Return the created item
            const item = await getOne(
                `SELECT i.*, s.name as supplier_name, n.content as notes, n.priority
                 FROM items i 
                 LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
                 LEFT JOIN notes n ON i.product_id = n.item_id
                 WHERE i.product_id = ?`,
                [itemResult.lastID]
            );
            
            res.json(item);
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/inventory/:id', async (req, res) => {
    try {
        const { name, category, status, availability, supplier_id, notes } = req.body;
        const itemId = req.params.id;
        
        // Start a transaction
        await runQuery('BEGIN TRANSACTION');
        
        try {
            // Update the item
            await runQuery(
                `UPDATE items 
                 SET name = ?, category = ?, status = ?, 
                     availability = ?, supplier_id = ?
                 WHERE product_id = ?`,
                [name, category, status, availability, supplier_id, itemId]
            );
            
            // Update or insert notes
            if (notes) {
                await runQuery(
                    `INSERT OR REPLACE INTO notes (item_id, content, priority) 
                     VALUES (?, ?, ?)`,
                    [itemId, notes.content, notes.priority]
                );
            }
            
            // Log the activity
        await runQuery(
                `INSERT INTO user_activities (timestamp, username, action, details) 
                 VALUES (?, ?, ?, ?)`,
                [new Date().toISOString(), req.body.username || 'system', 'update_item', `Updated item: ${name}`]
            );
            
            await runQuery('COMMIT');
            
            // Return the updated item
            const item = await getOne(
                `SELECT i.*, s.name as supplier_name, n.content as notes, n.priority
                 FROM items i 
                 LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
                 LEFT JOIN notes n ON i.product_id = n.item_id
                 WHERE i.product_id = ?`,
                [itemId]
            );
            
            res.json(item);
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/inventory/:id', async (req, res) => {
    try {
        const itemId = req.params.id;
        
        // Start a transaction
        await runQuery('BEGIN TRANSACTION');
        
        try {
            // Get item details for activity log
            const item = await getOne('SELECT name FROM items WHERE product_id = ?', [itemId]);
            
            // Delete related notes first
            await runQuery('DELETE FROM notes WHERE item_id = ?', [itemId]);
            
            // Delete the item
            await runQuery('DELETE FROM items WHERE product_id = ?', [itemId]);
            
            // Log the activity
            await runQuery(
                `INSERT INTO user_activities (timestamp, username, action, details) 
                 VALUES (?, ?, ?, ?)`,
                [new Date().toISOString(), req.body.username || 'system', 'delete_item', `Deleted item: ${item.name}`]
            );
            
            await runQuery('COMMIT');
            
        res.json({ message: 'Item deleted successfully' });
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// User activities endpoints
app.get('/api/activities', async (req, res) => {
    try {
        const activities = await getAll('SELECT * FROM user_activities ORDER BY timestamp DESC LIMIT 1000');
        res.json(activities);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/activities', async (req, res) => {
    try {
        const { username, action, details } = req.body;
        const timestamp = new Date().toISOString();
        
        const result = await runQuery(
            'INSERT INTO user_activities (timestamp, username, action, details) VALUES (?, ?, ?, ?)',
            [timestamp, username, action, details]
        );
        
        res.json({ id: result.lastID, timestamp, username, action, details });
    } catch (err) {
        res.status(500).json({ error: err.message });
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

// Supplier Management Endpoints
app.get('/api/suppliers', async (req, res) => {
    try {
        const suppliers = await getAll('SELECT * FROM suppliers ORDER BY supplier_id');
        res.setHeader('Content-Type', 'application/json');
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
            error: "Name, contact person, and email are required" 
        });
    }

    try {
        // Start transaction
        await runQuery('BEGIN TRANSACTION');

        try {
            // Insert supplier
            const result = await runQuery(
                `INSERT INTO suppliers (name, contact, email, phone, address) 
                 VALUES (?, ?, ?, ?, ?)`,
                [name, contact, email, phone || null, address || null]
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
                [result.lastID]
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

// Items endpoints
app.get('/api/items', async (req, res) => {
    try {
        const items = await getAll(`
            SELECT i.*, s.name as supplier_name 
            FROM items i 
            LEFT JOIN suppliers s ON i.supplier_id = s.supplier_id
        `);
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/items', async (req, res) => {
    try {
        const { name, category, status, availability, supplier_id } = req.body;
        
        const result = await runQuery(
            `INSERT INTO items (name, category, status, availability) 
             VALUES (?, ?, ?, ?)`,
            [name, category, status, availability]
        );
        
        res.json({ 
            product_id: result.lastID,
            name,
            category,
            status,
            availability
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
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

// Serve the supplier page with server-side rendered data
app.get('/supplier', async (req, res) => {
    try {
        // Get suppliers from database
        const suppliers = await getAll('SELECT * FROM suppliers ORDER BY name');
        console.log('Fetched suppliers:', suppliers); // Debug log

        // Read the HTML template
        let html = await require('fs').promises.readFile(
            path.join(__dirname, '..', 'supplier.html'), 
            'utf8'
        );

        // Generate the table rows HTML
        const tableRows = suppliers.map(supplier => `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">${supplier.name || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">${supplier.contact || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">${supplier.email || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-secondary-900">${supplier.phone || '-'}</td>
                <td class="px-6 py-4 text-sm text-secondary-900">${supplier.address || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-secondary-900 actions-column">
                    <button onclick="editSupplier(${supplier.supplier_id})" class="text-primary-600 hover:text-primary-900 mr-3">Edit</button>
                    <button onclick="deleteSupplier(${supplier.supplier_id})" class="text-red-600 hover:text-red-900">Delete</button>
                </td>
            </tr>
        `).join('');

        console.log('Generated table rows:', tableRows); // Debug log

        // Find the table body position
        const tableBodyStart = html.indexOf('<tbody id="supplierTableBody"');
        const tableBodyEnd = html.indexOf('</tbody>', tableBodyStart) + 8;
        
        // Replace the entire table body with our new content
        html = html.slice(0, tableBodyStart) +
            '<tbody id="supplierTableBody" class="bg-white divide-y divide-secondary-200">' +
            tableRows +
            '</tbody>' +
            html.slice(tableBodyEnd);

        res.send(html);
    } catch (err) {
        console.error('Error rendering supplier page:', err);
        res.status(500).send('Error loading suppliers: ' + err.message);
    }
});

// Handle supplier form submission
app.post('/supplier/add', async (req, res) => {
    try {
        console.log('Adding supplier:', req.body);
        const { name, contact, email, phone, address } = req.body;
        
        if (!name || name.trim() === '') {
            console.log('Company name is missing');
            return res.status(400).send('Company name is required');
        }

        await runQuery('BEGIN TRANSACTION');

        try {
            // Insert the supplier
            const result = await runQuery(
                `INSERT INTO suppliers (name, contact, email, phone, address) 
                 VALUES (?, ?, ?, ?, ?)`,
                [name.trim(), contact?.trim(), email?.trim(), phone?.trim(), address?.trim()]
            );

            // Log the activity
            await runQuery(
                `INSERT INTO user_activities (timestamp, username, action, details) 
                 VALUES (?, ?, ?, ?)`,
                [new Date().toISOString(), 'system', 'add_supplier', `Added supplier: ${name}`]
            );

            await runQuery('COMMIT');
            res.redirect('/supplier');
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error adding supplier:', err);
        res.status(500).send('Error adding supplier: ' + err.message);
    }
});

// Handle supplier deletion
app.post('/supplier/delete/:id', async (req, res) => {
    try {
        const supplierId = req.params.id;

        await runQuery('BEGIN TRANSACTION');

        try {
            // Get supplier details for activity log
            const supplier = await getOne(
                'SELECT name FROM suppliers WHERE supplier_id = ?',
                [supplierId]
            );

            if (!supplier) {
                return res.status(404).send('Supplier not found');
            }

            // Delete the supplier
            await runQuery('DELETE FROM suppliers WHERE supplier_id = ?', [supplierId]);

            // Log the activity
            await runQuery(
                `INSERT INTO user_activities (timestamp, username, action, details) 
                 VALUES (?, ?, ?, ?)`,
                [new Date().toISOString(), 'system', 'delete_supplier', `Deleted supplier: ${supplier.name}`]
            );

            await runQuery('COMMIT');
            res.redirect('/supplier');
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error deleting supplier:', err);
        res.status(500).send('Error deleting supplier');
    }
});

// Handle supplier update
app.post('/supplier/update/:id', async (req, res) => {
    try {
        const { name, contact, email, phone, address } = req.body;
        const supplierId = req.params.id;

        if (!name) {
            return res.status(400).send('Company name is required');
        }

        await runQuery('BEGIN TRANSACTION');

        try {
            // Update the supplier
            await runQuery(
                `UPDATE suppliers 
                 SET name = ?, contact = ?, email = ?, phone = ?, address = ?
                 WHERE supplier_id = ?`,
                [name, contact, email, phone, address, supplierId]
            );

            // Log the activity
            await runQuery(
                `INSERT INTO user_activities (timestamp, username, action, details) 
                 VALUES (?, ?, ?, ?)`,
                [new Date().toISOString(), 'system', 'update_supplier', `Updated supplier: ${name}`]
            );

            await runQuery('COMMIT');
            res.redirect('/supplier');
        } catch (err) {
            await runQuery('ROLLBACK');
            throw err;
        }
    } catch (err) {
        console.error('Error updating supplier:', err);
        res.status(500).send('Error updating supplier');
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