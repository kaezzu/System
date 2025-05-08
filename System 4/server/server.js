const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { runQuery, getAll, getOne } = require('./database');

const app = express();
const port = 3000;

// CORS configuration
app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

// Middleware
app.use(bodyParser.json());

// Debug middleware to log requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
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

// Serve static files from the parent directory
app.use(express.static(staticDir));

// Debug: Log all requests
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
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
        const result = await runQuery('INSERT INTO categories (name) VALUES (?)', [name]);
        res.json({ id: result.lastID, name });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Inventory items endpoints
app.get('/api/inventory', async (req, res) => {
    try {
        const items = await getAll(`
            SELECT i.*, c.name as category_name 
            FROM inventory_items i 
            LEFT JOIN categories c ON i.category_id = c.id
        `);
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory', async (req, res) => {
    try {
        const { name, category_id, quantity, status, expiration, quality } = req.body;
        const last_updated = new Date().toISOString();
        
        const result = await runQuery(
            `INSERT INTO inventory_items 
            (name, category_id, quantity, status, expiration, quality, last_updated) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, category_id, quantity, status, expiration, quality, last_updated]
        );
        
        res.json({ id: result.lastID, ...req.body, last_updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/inventory/:id', async (req, res) => {
    try {
        const { name, category_id, quantity, status, expiration, quality } = req.body;
        const last_updated = new Date().toISOString();
        
        await runQuery(
            `UPDATE inventory_items 
            SET name = ?, category_id = ?, quantity = ?, status = ?, 
                expiration = ?, quality = ?, last_updated = ?
            WHERE id = ?`,
            [name, category_id, quantity, status, expiration, quality, last_updated, req.params.id]
        );
        
        res.json({ id: req.params.id, ...req.body, last_updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/inventory/:id', async (req, res) => {
    try {
        await runQuery('DELETE FROM inventory_items WHERE id = ?', [req.params.id]);
        res.json({ message: 'Item deleted successfully' });
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
        const allUsers = await getAll('SELECT username, role FROM users');
        console.log('Current users:', allUsers);
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

// Handle all other routes by serving the index.html
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, '..', 'index.html');
    console.log('Serving index.html for route:', req.url);
    res.sendFile(indexPath);
});

// Start server
app.listen(port, () => {
    console.log('Current working directory:', process.cwd());
    console.log(`Server running at http://localhost:${port}`);
}); 