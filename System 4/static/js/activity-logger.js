class ActivityLogger {
    constructor() {
        this.baseUrl = '/api';
    }

    async logActivity(action, details, options = {}) {
        try {
            const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
            const userId = currentUser ? currentUser.id : null;
            
            const response = await fetch(`${this.baseUrl}/activity`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    action,
                    details,
                    user_id: userId,
                    metadata: options.metadata || null
                })
            });

            if (!response.ok) {
                throw new Error('Failed to log activity');
            }

            return await response.json();
        } catch (error) {
            console.error('Error logging activity:', error);
            throw error;
        }
    }

    async logItemActivity(action, item, oldItem = null) {
        const metadata = oldItem ? this.getChanges(oldItem, item) : null;
        await this.logActivity(action, `${action} item: ${item.name}`, {
            metadata: {
                item_id: item.product_id,
                changes: metadata
            }
        });
    }

    async logSupplierActivity(action, supplier, oldSupplier = null) {
        const metadata = oldSupplier ? this.getChanges(oldSupplier, supplier) : null;
        await this.logActivity(action, `${action} supplier: ${supplier.name}`, {
            metadata: {
                supplier_id: supplier.supplier_id,
                changes: metadata
            }
        });
    }

    async logUserActivity(action, user) {
        await this.logActivity(action, `${action} user: ${user.username}`, {
            metadata: {
                user_id: user.id,
                role: user.role
            }
        });
    }

    getChanges(oldObj, newObj) {
        const changes = {};
        for (const key in newObj) {
            if (oldObj[key] !== newObj[key]) {
                changes[key] = {
                    old: oldObj[key],
                    new: newObj[key]
                };
            }
        }
        return changes;
    }

    formatActivity(activity) {
        return {
            id: activity.id,
            timestamp: new Date(activity.timestamp).toLocaleString(),
            action: this.formatAction(activity.action),
            details: activity.details,
            color: this.getActionColor(activity.action),
            metadata: activity.metadata ? JSON.parse(activity.metadata) : null
        };
    }

    formatAction(action) {
        return action.split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    getActionColor(action) {
        const colors = {
            add: 'success',
            update: 'warning',
            delete: 'danger',
            login: 'info',
            logout: 'secondary'
        };

        for (const [key, value] of Object.entries(colors)) {
            if (action.toLowerCase().includes(key)) {
                return value;
            }
        }
        return 'primary';
    }
}

// Create global instance
window.activityLogger = new ActivityLogger(); 