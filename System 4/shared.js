// Shared functionality across pages

// Function to log user activity
function logActivity(action, details) {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser')) || { username: 'Unknown' };
    const activity = {
        timestamp: new Date().toISOString(),
        username: currentUser.username,
        action: action,
        details: details
    };
    const activities = JSON.parse(localStorage.getItem('userActivities')) || [];
    activities.unshift(activity); // Add to beginning of array
    if (activities.length > 1000) activities.length = 1000; // Limit to 1000 entries
    localStorage.setItem('userActivities', JSON.stringify(activities));
}

// Function to check for low stock
function checkLowStock() {
    const items = JSON.parse(localStorage.getItem('inventoryItems')) || [];
    const lowStockThreshold = 20;
    
    return items.filter(item => parseInt(item.quantity) <= lowStockThreshold);
}

// Function to check for out of stock items
function checkOutOfStock() {
    const items = JSON.parse(localStorage.getItem('inventoryItems')) || [];
    return items.filter(item => parseInt(item.quantity) <= 0);
}

// Function to create a notification
function createNotification(type, message, details = {}) {
    const notifications = JSON.parse(localStorage.getItem('notifications')) || [];
    
    // Check if a similar notification already exists and is unread
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
        const notification = {
            id: Date.now(),
            type,
            message,
            details,
            timestamp: new Date().toISOString(),
            read: false
        };
        
        notifications.unshift(notification);
        
        // Keep only last 100 notifications
        if (notifications.length > 100) {
            notifications.length = 100;
        }
        
        localStorage.setItem('notifications', JSON.stringify(notifications));
        updateNotificationBadge();
    }
}

// Function to update notification badge count
function updateNotificationBadge() {
    const notifications = JSON.parse(localStorage.getItem('notifications')) || [];
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
}

// Function to check for low stock and create notifications
function checkAndNotifyLowStock() {
    // Get the last check timestamp
    const lastCheck = localStorage.getItem('lastLowStockCheck');
    const now = new Date().getTime();
    
    // Only check if it's been more than 5 minutes since the last check
    if (!lastCheck || (now - parseInt(lastCheck)) > 300000) {
        const lowStockItems = checkLowStock();
        const outOfStockItems = checkOutOfStock();
        
        // Notify for low stock items
        lowStockItems.forEach(item => {
            if (parseInt(item.quantity) > 0) { // Only notify if not out of stock
                createNotification(
                    'low_stock',
                    `Low Stock Alert: ${item.name}`,
                    {
                        itemName: item.name,
                        currentQuantity: item.quantity,
                        category: item.category
                    }
                );
            }
        });

        // Notify for out of stock items
        outOfStockItems.forEach(item => {
            createNotification(
                'out_of_stock',
                `Out of Stock Alert: ${item.name}`,
                {
                    itemName: item.name,
                    category: item.category
                }
            );
        });
        
        // Update last check timestamp
        localStorage.setItem('lastLowStockCheck', now.toString());
    }
}

// Function to mark notification as read
function markNotificationAsRead(notificationId) {
    const notifications = JSON.parse(localStorage.getItem('notifications')) || [];
    const notification = notifications.find(n => n.id === notificationId);
    
    if (notification && !notification.read) {
        notification.read = true;
        localStorage.setItem('notifications', JSON.stringify(notifications));
        updateNotificationBadge();
    }
}

// Function to mark all notifications as read
function markAllNotificationsAsRead() {
    const notifications = JSON.parse(localStorage.getItem('notifications')) || [];
    let hasUnreadNotifications = false;
    
    notifications.forEach(notification => {
        if (!notification.read) {
            notification.read = true;
            hasUnreadNotifications = true;
        }
    });
    
    if (hasUnreadNotifications) {
        localStorage.setItem('notifications', JSON.stringify(notifications));
        updateNotificationBadge();
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