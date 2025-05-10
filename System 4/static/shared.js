// Shared functionality across pages

// API base URL
const API_BASE_URL = 'http://localhost:3000/api';

// Function to log user activity
async function logActivity(action, details) {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser')) || { username: 'Unknown' };
    try {
        const response = await fetch(`${API_BASE_URL}/activities`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: currentUser.username,
                action,
                details
            })
        });
        if (!response.ok) throw new Error('Failed to log activity');
    } catch (err) {
        console.error('Error logging activity:', err);
    }
}

// Function to check for low stock
async function checkLowStock() {
    try {
        const response = await fetch(`${API_BASE_URL}/items/low-stock`);
        const items = await response.json();
        const lowStockThreshold = 20;
        return items.filter(item => parseInt(item.quantity) <= lowStockThreshold);
    } catch (err) {
        console.error('Error checking low stock:', err);
        return [];
    }
}

// Function to check for out of stock items
async function checkOutOfStock() {
    try {
        const response = await fetch(`${API_BASE_URL}/items/out-of-stock`);
        const items = await response.json();
        return items.filter(item => parseInt(item.quantity) <= 0);
    } catch (err) {
        console.error('Error checking out of stock items:', err);
        return [];
    }
}

// Function to create a notification
async function createNotification(type, message, details = {}) {
    try {
        // Check if a similar notification already exists and is unread
        const response = await fetch(`${API_BASE_URL}/notifications`);
        const notifications = await response.json();
        
        const existingSimilarNotification = notifications.find(n => 
            n.type === type && 
            n.message === message && 
            !n.read &&
            JSON.stringify(n.details) === JSON.stringify(details) &&
            // Only consider notifications created in the last hour
            (new Date().getTime() - new Date(n.timestamp).getTime()) < 3600000
        );

        // Only create a new notification if no similar unread notification exists
        if (!existingSimilarNotification) {
            await fetch(`${API_BASE_URL}/notifications`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type,
                    message,
                    details
                })
            });
            updateNotificationBadge();
        }
    } catch (err) {
        console.error('Error creating notification:', err);
    }
}

// Function to update notification badge count
async function updateNotificationBadge() {
    try {
        const response = await fetch(`${API_BASE_URL}/notifications`);
        const notifications = await response.json();
        const unreadCount = notifications.filter(n => !n.read).length;
        
        // Update all notification badges in the document
        const badges = document.querySelectorAll('.notification-badge');
        badges.forEach(badge => {
            badge.textContent = unreadCount;
            if (unreadCount > 0) {
                badge.classList.add('visible');
            } else {
                badge.classList.remove('visible');
            }
        });
    } catch (err) {
        console.error('Error updating notification badge:', err);
    }
}

// Function to check for low stock and create notifications
async function checkAndNotifyLowStock() {
    try {
        // Get the last check timestamp
        const lastCheck = localStorage.getItem('lastLowStockCheck');
        const now = new Date().getTime();
        
        // Only check if it's been more than 5 minutes since the last check
        if (!lastCheck || (now - parseInt(lastCheck)) > 300000) {
            const lowStockItems = await checkLowStock();
            const outOfStockItems = await checkOutOfStock();
            
            // Notify for low stock items
            for (const item of lowStockItems) {
                if (parseInt(item.quantity) > 0) { // Only notify if not out of stock
                    await createNotification(
                        'low_stock',
                        `Low Stock Alert: ${item.name}`,
                        {
                            itemName: item.name,
                            currentQuantity: item.quantity,
                            category: item.category_name
                        }
                    );
                }
            }

            // Notify for out of stock items
            for (const item of outOfStockItems) {
                await createNotification(
                    'out_of_stock',
                    `Out of Stock Alert: ${item.name}`,
                    {
                        itemName: item.name,
                        category: item.category_name
                    }
                );
            }
            
            // Update last check timestamp
            localStorage.setItem('lastLowStockCheck', now.toString());
        }
    } catch (err) {
        console.error('Error checking and notifying low stock:', err);
    }
}

// Function to mark notification as read
async function markNotificationAsRead(notificationId) {
    try {
        await fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
            method: 'PUT'
        });
        updateNotificationBadge();
    } catch (err) {
        console.error('Error marking notification as read:', err);
    }
}

// Function to mark all notifications as read
async function markAllNotificationsAsRead() {
    try {
        await fetch(`${API_BASE_URL}/notifications/read-all`, {
            method: 'PUT'
        });
        updateNotificationBadge();
    } catch (err) {
        console.error('Error marking all notifications as read:', err);
    }
}

// Function to clear all existing notifications and user activities
function clearAllData() {
    // Clear existing notifications
    localStorage.removeItem('notifications');
    
    // Clear existing user activities
    localStorage.removeItem('userActivities');
    
    // Initialize empty arrays for new data
    localStorage.setItem('notifications', JSON.stringify([]));
    localStorage.setItem('userActivities', JSON.stringify([]));
    
    updateNotificationBadge();
}

// Export all functions to window object so they can be used in other files
window.logActivity = logActivity;
window.createNotification = createNotification;
window.markNotificationAsRead = markNotificationAsRead;
window.markAllNotificationsAsRead = markAllNotificationsAsRead;
window.updateNotificationBadge = updateNotificationBadge;
window.checkAndNotifyLowStock = checkAndNotifyLowStock;
window.checkLowStock = checkLowStock;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Update notification badge on every page load
    updateNotificationBadge();
    
    // Check for low stock on inventory-related pages
    const isInventoryPage = window.location.pathname.includes('inventory.html') ||
                          window.location.pathname.includes('dashboard.html');
    if (isInventoryPage) {
        checkAndNotifyLowStock();
    }
});

// Function to format role text
function formatRole(role) {
    switch(role) {
        case 'department_head':
            return 'Department Head';
        case 'logistic_officer':
            return 'Logistic Officer';
        case 'member':
            return 'Member';
        default:
            return role;
    }
}

function logout() {
    sessionStorage.removeItem('isLoggedIn');
    window.location.href = 'index.html';
}

// Function to update user info in sidebar
function updateUserInfo() {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (currentUser) {
        document.getElementById('sidebarUserName').textContent = currentUser.username;
        document.getElementById('sidebarUserRole').textContent = formatRole(currentUser.role);
        document.getElementById('sidebarUserFullName').textContent = currentUser.fullName;
    }
}

// Initialize user info when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    updateUserInfo();
}); 