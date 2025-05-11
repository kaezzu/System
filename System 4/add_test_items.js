// Script to add test items to the database
const { runQuery } = require('./server/database');

async function addTestItems() {
    try {
        console.log('Adding test items to the database...');
        
        // Sample items to add
        const items = [
            { name: 'Laptop', category: 'Electronics', status: 'Available', quantity: 10 },
            { name: 'Projector', category: 'Electronics', status: 'Available', quantity: 5 },
            { name: 'Textbook', category: 'Books', status: 'Available', quantity: 20 },
            { name: 'Whiteboard', category: 'Supplies', status: 'Available', quantity: 8 },
            { name: 'Lab Equipment', category: 'Science', status: 'Available', quantity: 15 }
        ];

        // Insert each item
        for (const item of items) {
            // Generate a simple product ID
            const productId = 'ITEM' + Math.floor(Math.random() * 10000);
            
            // Insert into database
            await runQuery(
                `INSERT INTO items (product_id, name, category, status, quantity) 
                 VALUES (?, ?, ?, ?, ?)`,
                [productId, item.name, item.category, item.status, item.quantity]
            );
            
            console.log(`Added item: ${item.name} with ID: ${productId}`);
        }

        console.log('Test items added successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Error adding test items:', err);
        process.exit(1);
    }
}

// Run the function
addTestItems(); 