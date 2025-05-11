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
    
    // Apply role-based access control to the navbar
    applyRoleBasedAccess();
    
    // Display role-based access banner
    displayRoleBasedBanner();
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

// Function to display a role-based access banner
function displayRoleBasedBanner() {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!currentUser) return;
    
    const role = currentUser.role;
    let bannerText = '';
    let bannerColor = '';
    
    if (role === 'department_head') {
        bannerText = 'Department Head Access: Full administrative control of the system';
        bannerColor = 'bg-green-100 border-green-300 text-green-800';
    } else if (role === 'logistic_officer') {
        bannerText = 'Logistic Officer Access: You can view and modify inventory, but some administrative features are restricted';
        bannerColor = 'bg-blue-100 border-blue-300 text-blue-800';
    } else if (role === 'member') {
        bannerText = 'Member Access: View-only access to the system. You cannot add, edit, or delete items';
        bannerColor = 'bg-orange-100 border-orange-300 text-orange-800';
    }
    
    if (bannerText) {
        // Create the banner
        const banner = document.createElement('div');
        banner.className = `py-2 px-4 ${bannerColor} text-sm border-b flex items-center justify-between role-banner`;
        
        const textSpan = document.createElement('span');
        textSpan.textContent = bannerText;
        
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '&times;';
        closeButton.className = 'ml-2 text-lg font-bold';
        closeButton.onclick = function() {
            banner.remove();
        };
        
        banner.appendChild(textSpan);
        banner.appendChild(closeButton);
        
        // Add it right after the header
        const header = document.querySelector('header');
        if (header && header.nextSibling) {
            header.parentNode.insertBefore(banner, header.nextSibling);
        }
    }
}

// Function to apply role-based access control
function applyRoleBasedAccess() {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!currentUser) return;
    
    const role = currentUser.role;
    
    // Define access levels for each role
    const navLinks = document.querySelectorAll('nav a');
    
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        
        // Define which links are visible based on role
        // Department head has access to everything
        if (role === 'department_head') {
            link.style.display = 'flex';
        } 
        // Logistic officer has access to most features except certain admin functions
        else if (role === 'logistic_officer') {
            if (href.includes('user-activity.html')) {
                link.style.display = 'none';
            } else {
                link.style.display = 'flex';
            }
        } 
        // Regular members have view-only access
        else if (role === 'member') {
            // Hide management features
            if (
                href.includes('user-activity.html') ||
                href.includes('supplier.html') ||
                href.includes('notes.html')
            ) {
                link.style.display = 'none';
            } else {
                link.style.display = 'flex';
            }
            
            // Disable edit controls for members
            if (document.readyState === 'complete') {
                if (href.includes('inventory.html') || href.includes('borrowed.html')) {
                    // Hide add/edit buttons for members
                    const addButtons = document.querySelectorAll('.btn-primary:not(.view-only)');
                    addButtons.forEach(btn => {
                        if (btn.textContent.includes('Add') || btn.textContent.includes('Edit')) {
                            btn.style.display = 'none';
                        }
                    });
                    
                    // Hide delete buttons/icons
                    const deleteButtons = document.querySelectorAll('.delete-btn, .btn-danger');
                    deleteButtons.forEach(btn => btn.style.display = 'none');
                }
            }
        }
    });
    
    // Modify quick actions on dashboard
    if (window.location.pathname.includes('dashboard.html')) {
        setTimeout(() => {
            const quickActions = document.querySelectorAll('.card.cursor-pointer');
            
            quickActions.forEach(action => {
                const destination = action.getAttribute('onclick')?.toString() || '';
                
                if (role === 'member') {
                    if (
                        destination.includes('supplier.html') ||
                        destination.includes('notes.html')
                    ) {
                        action.style.display = 'none';
                    }
                }
            });
            
            // Hide "Add Quick Note" button for members
            if (role === 'member') {
                const quickNoteBtn = document.querySelector('button[onclick="showQuickNoteModal()"]');
                if (quickNoteBtn) quickNoteBtn.style.display = 'none';
            }
        }, 100);
    }
    
    // Disable add/edit/delete buttons based on role
    if (role === 'member') {
        // Inventory and borrowed pages
        if (window.location.pathname.includes('inventory.html') || 
            window.location.pathname.includes('borrowed.html')) {
            
            // Hide all action buttons for regular members
            document.addEventListener('DOMContentLoaded', function() {
                // Hide main action buttons (like "Add New Item")
                const addButtons = document.querySelectorAll('.btn-primary');
                addButtons.forEach(btn => {
                    if (btn.textContent.includes('Add') || btn.textContent.includes('Edit')) {
                        btn.style.display = 'none';
                    }
                });
                
                // Hide action buttons in table rows (added via JavaScript)
                // This will be applied as rows are dynamically added
                const observer = new MutationObserver(function(mutations) {
                    mutations.forEach(function(mutation) {
                        if (mutation.type === 'childList') {
                            const deleteButtons = document.querySelectorAll('.delete-btn, .btn-danger');
                            deleteButtons.forEach(btn => btn.style.display = 'none');
                            
                            const editButtons = document.querySelectorAll('.edit-btn');
                            editButtons.forEach(btn => btn.style.display = 'none');
                        }
                    });
                });
                
                const tableBody = document.getElementById('inventoryTableBody') || 
                                 document.getElementById('borrowedItemsTableBody');
                                 
                if (tableBody) {
                    observer.observe(tableBody, { childList: true, subtree: true });
                }
            });
        }
    }
}

// Initialize user info when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    updateUserInfo();
});

// Function to check if the current user has permission for a specific action
function hasPermission(action) {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    if (!currentUser) return false;
    
    const role = currentUser.role;
    
    // Define permissions for different actions based on role
    switch(action) {
        case 'view_inventory':
        case 'view_borrowed':
        case 'view_dashboard':
            // All roles can view these pages
            return true;
            
        case 'add_item':
        case 'edit_item':
        case 'delete_item':
        case 'borrow_item':
        case 'return_item':
            // Only department head and logistic officer can modify inventory
            return role === 'department_head' || role === 'logistic_officer';
            
        case 'view_user_activity':
        case 'view_supplier':
        case 'manage_supplier':
            // Only department head can access these administrative features
            return role === 'department_head';
            
        case 'view_notes':
        case 'add_note':
        case 'edit_note':
        case 'delete_note':
            // Department head and logistic officer can manage notes
            return role === 'department_head' || role === 'logistic_officer';
            
        default:
            console.warn(`Unknown permission check for action: ${action}`);
            return false;
    }
}

// Make function available globally
window.hasPermission = hasPermission; 