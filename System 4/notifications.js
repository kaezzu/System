// Function to check for low stock items
function checkLowStock() {
    const items = JSON.parse(localStorage.getItem('inventoryItems')) || [];
    const lowStockThreshold = 20;
    
    const lowStockItems = items.filter(item => 
        parseInt(item.quantity) <= lowStockThreshold && 
        item.status !== 'Out of Stock'
    );
    
    return lowStockItems;
}

// Function to create a notification
function createNotification(type, message, details = {}) {
    const notifications = JSON.parse(localStorage.getItem('notifications')) || [];
    
    // Check if a similar notification already exists and is unread
    const existingSimilarNotification = notifications.find(n => 
        n.type === type && 
        n.message === message && 
        !n.read &&
        JSON.stringify(n.details) === JSON.stringify(details)
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

// Function to mark notification as read
function markNotificationAsRead(notificationId) {
    const notifications = JSON.parse(localStorage.getItem('notifications')) || [];
    const notification = notifications.find(n => n.id === notificationId);
    
    if (notification && !notification.read) {
        notification.read = true;
        localStorage.setItem('notifications', JSON.stringify(notifications));
        
        // Update badge immediately
        updateNotificationBadge();
        
        // If we're on the notifications page, update the display
        if (document.getElementById('notificationsList')) {
            displayNotifications();
        }
        
        // If we're on the dashboard, update the recent notifications
        if (document.getElementById('recentNotifications')) {
            displayRecentNotifications();
        }
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
        
        // Update badge immediately
        updateNotificationBadge();
        
        // Update displays if on relevant pages
        if (document.getElementById('notificationsList')) {
            displayNotifications();
        }
        if (document.getElementById('recentNotifications')) {
            displayRecentNotifications();
        }
    }
}

// Function to check for low stock and create notifications
function checkAndNotifyLowStock() {
    const lowStockItems = checkLowStock();
    
    lowStockItems.forEach(item => {
        createNotification(
            'low_stock',
            `Low Stock Alert: ${item.name}`,
            {
                itemName: item.name,
                currentQuantity: item.quantity,
                category: item.category
            }
        );
    });
}

// Initialize notification system
document.addEventListener('DOMContentLoaded', function() {
    updateNotificationBadge();
    
    // Only check for low stock on inventory-related pages
    const isInventoryPage = window.location.pathname.includes('inventory.html') ||
                          window.location.pathname.includes('dashboard.html');
    if (isInventoryPage) {
        checkAndNotifyLowStock();
    }
});

// Export functions for use in other files
window.createNotification = createNotification;
window.markNotificationAsRead = markNotificationAsRead;
window.markAllNotificationsAsRead = markAllNotificationsAsRead;
window.updateNotificationBadge = updateNotificationBadge; 