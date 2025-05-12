// Function to check for low stock items
function checkLowStock() {
    const items = JSON.parse(localStorage.getItem('inventoryItems')) || [];
    const lowStockThreshold = 20;
    
    const lowStockItems = items.filter(item => 
        parseInt(item.quantity) <= lowStockThreshold && 
        parseInt(item.quantity) > 0 &&
        item.status !== 'Out of Stock'
    );
    
    return lowStockItems;
}

// Function to check for out of stock items
function checkOutOfStock() {
    const items = JSON.parse(localStorage.getItem('inventoryItems')) || [];
    
    const outOfStockItems = items.filter(item => 
        parseInt(item.quantity) === 0 || 
        item.status === 'Out of Stock'
    );
    
    return outOfStockItems;
}

// Function to check for items near expiration date
function checkNearExpirationDate() {
    const items = JSON.parse(localStorage.getItem('inventoryItems')) || [];
    const warningDays = 30; // Alert for items expiring within 30 days
    
    const today = new Date();
    const warningDate = new Date();
    warningDate.setDate(today.getDate() + warningDays);
    
    const nearExpirationItems = items.filter(item => {
        if (!item.expiration_date) return false;
        
        const expirationDate = new Date(item.expiration_date);
        return expirationDate > today && expirationDate <= warningDate;
    });
    
    return nearExpirationItems;
}

// Function to check for borrowed items near due date
function checkNearDueDate() {
    const borrowedItems = JSON.parse(localStorage.getItem('borrowedItems')) || [];
    const warningDays = 7; // Alert for items due within 7 days
    
    const today = new Date();
    const warningDate = new Date();
    warningDate.setDate(today.getDate() + warningDays);
    
    const nearDueItems = borrowedItems.filter(item => {
        if (!item.due_date || item.status === 'Returned') return false;
        
        const dueDate = new Date(item.due_date);
        return dueDate > today && dueDate <= warningDate;
    });
    
    return nearDueItems;
}

// Function to fetch inventory data and update local storage
async function syncInventoryData() {
    try {
        const response = await fetch('/api/items');
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.items) {
                localStorage.setItem('inventoryItems', JSON.stringify(data.items));
                return data.items;
            }
        }
        return null;
    } catch (error) {
        console.error('Error fetching inventory data:', error);
        return null;
    }
}

// Function to fetch borrowed items and update local storage
async function syncBorrowedItems() {
    try {
        const response = await fetch('/api/borrowed-items');
        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('borrowedItems', JSON.stringify(data));
            return data;
        }
        return null;
    } catch (error) {
        console.error('Error fetching borrowed items:', error);
        return null;
    }
}

// Function to fetch notifications from server
async function fetchNotifications() {
    try {
        // Get current user ID from session if available
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser')) || {};
        const userId = currentUser.id;
        
        let url = '/api/notifications';
        if (userId) {
            url += `?user_id=${userId}`;
        }
        
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                return data.notifications || [];
            }
        }
        
        console.warn('Failed to fetch notifications, checking if tables need initialization');
        
        // Try to reinitialize tables if this might be a schema issue
        const initResponse = await fetch('/debug/reinitialize-tables');
        if (initResponse.ok) {
            console.log('Tables reinitialized, trying again to fetch notifications');
            
            // Try once more after reinitialization
            const retryResponse = await fetch(url);
            if (retryResponse.ok) {
                const retryData = await retryResponse.json();
                if (retryData.success) {
                    return retryData.notifications || [];
                }
            }
        }
        
        return [];
    } catch (error) {
        console.error('Error fetching notifications:', error);
        return [];
    }
}

// Function to trigger server-side notification checks
async function checkServerNotifications() {
    try {
        // First try to fetch any existing notifications to ensure table exists
        await fetchNotifications();
        
        const response = await fetch('/api/notifications/check');
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                // Update notification badge after new checks
                updateNotificationBadge();
                return data.notifications;
            }
        }
        return null;
    } catch (error) {
        console.error('Error checking server notifications:', error);
        return null;
    }
}

// Function to create a notification on the server
async function createNotification(type, message, details = {}) {
    try {
        // Get current user ID from session if available
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser')) || {};
        const userId = currentUser.id;
        
        const response = await fetch('/api/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type,
                message,
                details,
                user_id: userId
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                // Update notification badge after creating a new notification
                updateNotificationBadge();
                return data.notification;
            }
        }
        return null;
    } catch (error) {
        console.error('Error creating notification:', error);
        return null;
    }
}

// Function to update notification badge count
async function updateNotificationBadge() {
    try {
        const notifications = await fetchNotifications();
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
    } catch (error) {
        console.error('Error updating notification badge:', error);
    }
}

// Function to mark notification as read
async function markNotificationAsRead(notificationId) {
    try {
        const response = await fetch(`/api/notifications/${notificationId}/read`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
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
            
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error marking notification as read:', error);
        return false;
    }
}

// Function to mark all notifications as read
async function markAllNotificationsAsRead() {
    try {
        // Get current user ID from session if available
        const currentUser = JSON.parse(sessionStorage.getItem('currentUser')) || {};
        const userId = currentUser.id;
        
        const response = await fetch('/api/notifications/read-all', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_id: userId
            })
        });
        
        if (response.ok) {
            // Update badge immediately
            updateNotificationBadge();
            
            // Update displays if on relevant pages
            if (document.getElementById('notificationsList')) {
                displayNotifications();
            }
            if (document.getElementById('recentNotifications')) {
                displayRecentNotifications();
            }
            
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        return false;
    }
}

// Function to display recent notifications on the dashboard
async function displayRecentNotifications() {
    const container = document.getElementById('recentNotifications');
    
    if (!container) return;
    
    container.innerHTML = '';
    
    try {
        // Get up to 5 most recent notifications
        const notifications = await fetchNotifications();
        const recentNotifications = notifications.slice(0, 5);
        
        if (recentNotifications.length === 0) {
            container.innerHTML = '<div class="p-4 text-center text-secondary-500">No recent notifications</div>';
            return;
        }
        
        recentNotifications.forEach(notification => {
            const notificationElement = document.createElement('div');
            notificationElement.className = `p-4 border-b border-secondary-200 ${notification.read ? '' : 'bg-blue-50'}`;
            
            let typeLabel;
            let typeColor;
            
            switch (notification.type) {
                case 'low_stock':
                    typeLabel = 'Low Stock';
                    typeColor = 'text-orange-600';
                    break;
                case 'out_of_stock':
                    typeLabel = 'Out of Stock';
                    typeColor = 'text-red-600';
                    break;
                case 'near_expiration':
                    typeLabel = 'Near Expiration';
                    typeColor = 'text-orange-600';
                    break;
                case 'near_due_date':
                    typeLabel = 'Near Due Date';
                    typeColor = 'text-blue-600';
                    break;
                default:
                    typeLabel = notification.type;
                    typeColor = 'text-primary-600';
            }
            
            notificationElement.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <div class="flex items-center gap-2 mb-1">
                            <span class="${typeColor} text-sm font-medium">${typeLabel}</span>
                            ${!notification.read ? '<span class="bg-blue-500 w-2 h-2 rounded-full"></span>' : ''}
                        </div>
                        <p class="text-secondary-800 font-medium">${notification.message}</p>
                        <p class="text-xs text-secondary-500 mt-1">${new Date(notification.timestamp).toLocaleString()}</p>
                    </div>
                    ${!notification.read ? `
                    <button onclick="markNotificationAsRead(${notification.id})" class="text-xs text-primary-600 hover:text-primary-800">
                        Mark as read
                    </button>` : ''}
                </div>
            `;
            
            container.appendChild(notificationElement);
        });
        
        // Add a link to view all notifications
        const viewAllLink = document.createElement('div');
        viewAllLink.className = 'p-3 text-center';
        viewAllLink.innerHTML = '<a href="notifications.html" class="text-primary-600 hover:text-primary-800 text-sm font-medium">View all notifications</a>';
        container.appendChild(viewAllLink);
    } catch (error) {
        console.error('Error displaying recent notifications:', error);
        container.innerHTML = '<div class="p-4 text-center text-red-500">Error loading notifications</div>';
    }
}

// Function to sync data and check for all notifications
async function syncDataAndCheckNotifications() {
    // Sync inventory data
    await syncInventoryData();
    
    // Sync borrowed items
    await syncBorrowedItems();
    
    // Check for notifications on the server
    await checkServerNotifications();
    
    // Update notification count
    await updateNotificationBadge();
}

// Initialize notification system
document.addEventListener('DOMContentLoaded', function() {
    // Update badge count
    updateNotificationBadge();
    
    // Run notification checks on relevant pages
    const isRelevantPage = window.location.pathname.includes('inventory.html') ||
                           window.location.pathname.includes('dashboard.html') ||
                           window.location.pathname.includes('borrowed.html');
    if (isRelevantPage) {
        syncDataAndCheckNotifications();
    }
    
    // Display recent notifications on dashboard
    if (window.location.pathname.includes('dashboard.html')) {
        displayRecentNotifications();
    }
});

// Export functions for use in other files
window.createNotification = createNotification;
window.markNotificationAsRead = markNotificationAsRead;
window.markAllNotificationsAsRead = markAllNotificationsAsRead;
window.updateNotificationBadge = updateNotificationBadge;
window.checkServerNotifications = checkServerNotifications;
window.syncDataAndCheckNotifications = syncDataAndCheckNotifications;
window.displayRecentNotifications = displayRecentNotifications; 