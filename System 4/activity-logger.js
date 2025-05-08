// Function to log user activity
function logActivity(action, details) {
    // Get current user from session storage
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser')) || { username: 'Unknown' };
    
    // Create activity object
    const activity = {
        timestamp: new Date().toISOString(),
        username: currentUser.username,
        action: action,
        details: details
    };
    
    // Get existing activities or initialize empty array
    const activities = JSON.parse(localStorage.getItem('userActivities')) || [];
    
    // Add new activity
    activities.unshift(activity); // Add to beginning of array
    
    // Keep only last 1000 activities to prevent storage issues
    if (activities.length > 1000) {
        activities.length = 1000;
    }
    
    // Save to localStorage
    localStorage.setItem('userActivities', JSON.stringify(activities));
}

// Example usage:
// logActivity('add', 'Added new item: First Aid Kit');
// logActivity('edit', 'Updated quantity of Bandages to 50');
// logActivity('delete', 'Removed item: Expired Medicine'); 