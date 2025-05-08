// Initialize inventory data from localStorage or use empty array
let inventoryItems = JSON.parse(localStorage.getItem('inventoryItems')) || [];
let categories = [
    'Medical Supplies',
    'Emergency Supplies',
    'Communication Device',
    'PPE',
    'Others'
];

// Save the new categories to localStorage
localStorage.setItem('categories', JSON.stringify(categories));

// DOM Elements
const itemModal = document.getElementById('itemModal');
const categoryModal = document.getElementById('categoryModal');
const itemForm = document.getElementById('itemForm');
const categoryForm = document.getElementById('categoryForm');
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const inventoryTableBody = document.getElementById('inventoryTableBody');
const categorySelect = document.getElementById('itemCategory');
const addItemButton = document.getElementById('addItemButton');

// Current item being edited (for edit mode)
let currentEditingItem = null;

// Function to determine status based on quantity
function getStatusFromQuantity(quantity) {
    if (quantity <= 0) return 'Out of Stock';
    if (quantity <= 20) return 'Low Stock';
    return 'Available';
}

// Check user role and adjust UI accordingly
function checkUserRole() {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser')) || {};
    const isMember = currentUser.role === 'member';
    
    // Hide add button for members
    if (addItemButton) {
        addItemButton.style.display = isMember ? 'none' : 'block';
    }
    
    // Hide actions column for members
    const actionsColumns = document.querySelectorAll('.actions-column');
    actionsColumns.forEach(col => {
        col.style.display = isMember ? 'none' : 'table-cell';
    });
}

// Initialize categories in selects
function initializeCategories() {
    // Clear existing options
    categorySelect.innerHTML = '<option value="">Select Category</option>';
    categoryFilter.innerHTML = '<option value="">All Categories</option>';
    
    // Add categories to both selects
    categories.forEach(category => {
        // For item form
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
        
        // For filter
        const filterOption = document.createElement('option');
        filterOption.value = category;
        filterOption.textContent = category;
        categoryFilter.appendChild(filterOption);
    });
}

// Show modal for adding new item
function showAddItemModal() {
    currentEditingItem = null;
    document.getElementById('modalTitle').textContent = 'Add New Item';
    itemForm.reset();
    itemModal.style.display = 'block';
}

// Show modal for editing item
function showEditItemModal(index) {
    currentEditingItem = index;
    const item = inventoryItems[index];
    document.getElementById('modalTitle').textContent = 'Edit Item';
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemCategory').value = item.category;
    document.getElementById('itemQuantity').value = item.quantity;
    document.getElementById('itemExpiration').value = item.expiration || '';
    document.getElementById('itemQuality').value = item.quality || '';
    itemModal.style.display = 'block';
}

// Show modal for adding new category
function showAddCategoryModal() {
    categoryForm.reset();
    categoryModal.style.display = 'block';
}

// Close modals
function closeModal() {
    itemModal.style.display = 'none';
    itemForm.reset();
}

function closeCategoryModal() {
    categoryModal.style.display = 'none';
    categoryForm.reset();
}

// Function to check if a notification has ever been created and read for this item
function hasBeenNotifiedBefore(type, itemName) {
    const notifications = JSON.parse(localStorage.getItem('notifications')) || [];
    return notifications.some(notification => 
        notification.type === type && 
        notification.details.itemName === itemName &&
        notification.read
    );
}

// Function to check if a similar notification already exists
function hasExistingNotification(type, itemName) {
    const notifications = JSON.parse(localStorage.getItem('notifications')) || [];
    return notifications.some(notification => 
        notification.type === type && 
        notification.details.itemName === itemName &&
        !notification.read
    );
}

// Function to create a notification
function createNotification(type, message, details) {
    const notifications = JSON.parse(localStorage.getItem('notifications')) || [];
    const notification = {
        id: Date.now(),
        type: type,
        message: message,
        details: details,
        timestamp: new Date().toISOString(),
        read: false
    };
    notifications.push(notification);
    localStorage.setItem('notifications', JSON.stringify(notifications));
    updateNotificationBadge();
}

// Function to update notification badge
function updateNotificationBadge() {
    const notifications = JSON.parse(localStorage.getItem('notifications')) || [];
    const unreadCount = notifications.filter(n => !n.read).length;
    const badge = document.querySelector('.notification-badge');
    if (badge) {
        badge.textContent = unreadCount;
        badge.classList.toggle('visible', unreadCount > 0);
    }
}

// Function to handle item submission
function handleItemSubmit(event) {
    event.preventDefault();
    
    const itemName = document.getElementById('itemName').value;
    const category = document.getElementById('itemCategory').value;
    const quantity = parseInt(document.getElementById('itemQuantity').value);
    const expiration = document.getElementById('itemExpiration').value;
    const quality = document.getElementById('itemQuality').value;
    
    // Automatically determine status based on quantity
    const status = getStatusFromQuantity(quantity);
    
    if (currentEditingItem !== null) {
        // Editing existing item
        const oldItem = inventoryItems[currentEditingItem];
        inventoryItems[currentEditingItem] = {
            ...oldItem,
            name: itemName,
            category: category,
            quantity: quantity,
            status: status,
            expiration: expiration,
            quality: quality,
            lastUpdated: new Date().toLocaleString()
        };
        
        // Log edit activity
        logActivity('edit', `Updated item: ${itemName}`);
    } else {
        // Adding new item
        const newItem = {
            id: Date.now(),
            name: itemName,
            category: category,
            quantity: quantity,
            status: status,
            expiration: expiration,
            quality: quality,
            lastUpdated: new Date().toLocaleString()
        };
        
        inventoryItems.push(newItem);
        
        // Log add activity
        logActivity('add', `Added new item: ${itemName}`);
    }
    
    // Save to localStorage
    localStorage.setItem('inventoryItems', JSON.stringify(inventoryItems));
    
    // Check for low stock
    if (quantity <= 20) {
        // Skip if we've already notified and it was read
        if (!hasBeenNotifiedBefore('low_stock', itemName) && !hasExistingNotification('low_stock', itemName)) {
            createNotification(
                'low_stock',
                `Low Stock Alert: ${itemName}`,
                {
                    itemName: itemName,
                    currentQuantity: quantity,
                    category: category
                }
            );
        }
    }

    // Check for out of stock
    if (quantity <= 0) {
        // Skip if we've already notified and it was read
        if (!hasBeenNotifiedBefore('out_of_stock', itemName) && !hasExistingNotification('out_of_stock', itemName)) {
            createNotification(
                'out_of_stock',
                `Out of Stock Alert: ${itemName}`,
                {
                    itemName: itemName,
                    category: category
                }
            );
        }
    }

    // Check expiration date
    if (expiration && isWithin30Days(expiration)) {
        // Skip if we've already notified and it was read
        if (!hasBeenNotifiedBefore('Expiring Soon', itemName) && !hasExistingNotification('Expiring Soon', itemName)) {
            const daysUntilExpiration = Math.ceil((new Date(expiration) - new Date()) / (1000 * 3600 * 24));
            createNotification(
                'Expiring Soon',
                `Expiration Alert: ${itemName}`,
                {
                    itemName: itemName,
                    expirationDate: expiration,
                    daysRemaining: daysUntilExpiration,
                    category: category
                }
            );
        }
    }
    
    updateInventoryTable();
    closeModal();
}

// Function to check if a date is within 30 days
function isWithin30Days(expirationDate) {
    if (!expirationDate) return false;
    
    const today = new Date();
    const expDate = new Date(expirationDate);
    const differenceInTime = expDate.getTime() - today.getTime();
    const differenceInDays = differenceInTime / (1000 * 3600 * 24);
    
    return differenceInDays <= 30 && differenceInDays > 0;
}

// Function to check expiration dates and create notifications
function checkExpirationDates() {
    inventoryItems.forEach(item => {
        if (item.expiration && isWithin30Days(item.expiration)) {
            // Skip if we've already notified and it was read
            if (hasBeenNotifiedBefore('Expiring Soon', item.name)) {
                return;
            }
            // Only create notification if one doesn't already exist
            if (!hasExistingNotification('Expiring Soon', item.name)) {
                const daysUntilExpiration = Math.ceil((new Date(item.expiration) - new Date()) / (1000 * 3600 * 24));
                createNotification(
                    'Expiring Soon',
                    `Expiration Alert: ${item.name}`,
                    {
                        itemName: item.name,
                        expirationDate: item.expiration,
                        daysRemaining: daysUntilExpiration,
                        category: item.category
                    }
                );
            }
        }
    });
}

// Function to handle category submission
function handleCategorySubmit(event) {
    event.preventDefault();
    
    const categoryName = document.getElementById('newCategoryName').value;
    
    if (!categories.includes(categoryName)) {
        categories.push(categoryName);
        localStorage.setItem('categories', JSON.stringify(categories));
        logActivity('add', `Added new category: ${categoryName}`);
        initializeCategories();
    }
    
    closeCategoryModal();
}

// Function to delete an item
function deleteItem(id) {
    const itemIndex = inventoryItems.findIndex(item => item.id === id);
    
    if (itemIndex !== -1) {
        const item = inventoryItems[itemIndex];
        // Log activity before deletion
        logActivity('delete', `Deleted item: ${item.name}`);
        
        // Remove the item from the array
        inventoryItems.splice(itemIndex, 1);
        localStorage.setItem('inventoryItems', JSON.stringify(inventoryItems));
        updateInventoryTable();
    }
}

// Function to log activity
function logActivity(action, details) {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser')) || { username: 'Unknown' };
    const activity = {
        timestamp: new Date().toISOString(),
        username: currentUser.username,
        action: action,
        details: details
    };
    const activities = JSON.parse(localStorage.getItem('userActivities')) || [];
    activities.unshift(activity);
    if (activities.length > 1000) activities.length = 1000;
    localStorage.setItem('userActivities', JSON.stringify(activities));
}

// Update inventory table
function updateInventoryTable(items = inventoryItems) {
    inventoryTableBody.innerHTML = '';
    
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser')) || {};
    const isMember = currentUser.role === 'member';
    
    items.forEach((item, index) => {
        // Recalculate status based on current quantity to ensure consistency
        const currentStatus = getStatusFromQuantity(item.quantity);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.name}</td>
            <td>${item.category}</td>
            <td>${item.quantity}</td>
            <td class="${currentStatus === 'Available' ? 'status-green' : currentStatus === 'Low Stock' ? 'status-orange' : 'status-red'}">${currentStatus}</td>
            <td class="${item.quality === 'New' ? 'quality-green' : item.quality === 'Used' ? 'quality-orange' : 'quality-red'}">${item.quality || 'N/A'}</td>
            <td>${item.expiration || 'N/A'}</td>
            <td>${item.lastUpdated}</td>
            <td class="actions-column">
                ${!isMember ? `
                    <button onclick="showEditItemModal(${index})" class="action-button edit">Edit</button>
                    <button onclick="deleteItem(${item.id})" class="action-button delete">Delete</button>
                ` : ''}
            </td>
        `;
        inventoryTableBody.appendChild(row);
    });

    // Update dashboard counts
    updateDashboardCounts();
}

// Update dashboard counts
function updateDashboardCounts() {
    const counts = {};
    
    // Initialize counts for all categories
    categories.forEach(category => {
        counts[category] = 0;
    });

    // Count items in each category
    inventoryItems.forEach(item => {
        if (counts[item.category] !== undefined) {
            counts[item.category] += parseInt(item.quantity);
        }
    });

    // Store counts in localStorage for dashboard
    localStorage.setItem('inventoryCounts', JSON.stringify(counts));
}

// Initialize the table and categories
initializeCategories();
updateInventoryTable();
checkUserRole();

// Search and filter functionality
function filterItems() {
    const searchTerm = searchInput.value.toLowerCase();
    const selectedCategory = categoryFilter.value;
    
    const filteredItems = inventoryItems.filter(item => {
        const matchesSearch = 
            item.name.toLowerCase().includes(searchTerm) ||
            item.category.toLowerCase().includes(searchTerm) ||
            item.status.toLowerCase().includes(searchTerm);
        
        const matchesCategory = !selectedCategory || item.category === selectedCategory;
        
        return matchesSearch && matchesCategory;
    });
    
    updateInventoryTable(filteredItems);
}

// Add event listeners for search and filter
searchInput.addEventListener('input', filterItems);
categoryFilter.addEventListener('change', filterItems);

// Close modals when clicking outside
window.onclick = function(event) {
    if (event.target === itemModal) {
        closeModal();
    }
    if (event.target === categoryModal) {
        closeCategoryModal();
    }
}

// Add this to your initialization code
document.addEventListener('DOMContentLoaded', function() {
    // Check expiration dates when page loads
    checkExpirationDates();
    
    // Set up periodic checks (every hour)
    setInterval(checkExpirationDates, 3600000);
}); 