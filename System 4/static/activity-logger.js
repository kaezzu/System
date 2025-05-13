// Activity Logger Module
const ActivityLogger = {
    // Activity types
    ACTIONS: {
        ITEM: {
            ADD: 'add_item',
            EDIT: 'edit_item',
            DELETE: 'delete_item',
            UPDATE_QUANTITY: 'update_quantity'
        },
        SUPPLIER: {
            ADD: 'add_supplier',
            EDIT: 'edit_supplier',
            DELETE: 'delete_supplier'
        },
        USER: {
            LOGIN: 'user_login',
            LOGOUT: 'user_logout'
        },
        NOTE: {
            ADD: 'add_note',
            EDIT: 'edit_note',
            DELETE: 'delete_note'
        }
    },

    /**
     * Log an activity to the server
     * @param {string} action - The type of action (e.g., 'add_item', 'edit_supplier')
     * @param {string} details - Description of the activity
     * @param {Object} [options] - Additional options
     * @param {number} [options.userId] - User ID associated with the activity
     * @param {Object} [options.metadata] - Additional metadata to store with the activity
     */
    async logActivity(action, details, options = {}) {
        try {
            const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
            const response = await fetch(`http://localhost:3000/api/activities`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': sessionStorage.getItem('token') // If you have auth
                },
                body: JSON.stringify({
                    action,
                    details,
                    user_id: options.userId || currentUser?.id || null,
                    metadata: options.metadata || null,
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to log activity: ${response.statusText}`);
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to log activity');
            }

            return data.activity;
        } catch (error) {
            console.error('Error logging activity:', error);
            // Don't throw the error - logging should not break the main functionality
            return null;
        }
    },

    /**
     * Log item-related activities
     */
    async logItemActivity(action, item, oldItem = null) {
        let details = '';
        let metadata = { item_id: item.product_id };

        switch (action) {
            case this.ACTIONS.ITEM.ADD:
                details = `Added new item: ${item.name}`;
                break;
            case this.ACTIONS.ITEM.EDIT:
                details = `Updated item: ${item.name}`;
                metadata.changes = this.getChanges(oldItem, item);
                break;
            case this.ACTIONS.ITEM.DELETE:
                details = `Deleted item: ${item.name}`;
                break;
            case this.ACTIONS.ITEM.UPDATE_QUANTITY:
                const change = item.quantity - (oldItem?.quantity || 0);
                const action = change > 0 ? 'Added' : 'Removed';
                details = `${action} ${Math.abs(change)} units to/from item: ${item.name}`;
                metadata.quantity_change = change;
                break;
        }

        return this.logActivity(action, details, { metadata });
    },

    /**
     * Log supplier-related activities
     */
    async logSupplierActivity(action, supplier, oldSupplier = null) {
        let details = '';
        let metadata = { supplier_id: supplier.supplier_id };

        switch (action) {
            case this.ACTIONS.SUPPLIER.ADD:
                details = `Added new supplier: ${supplier.name}`;
                break;
            case this.ACTIONS.SUPPLIER.EDIT:
                details = `Updated supplier: ${supplier.name}`;
                metadata.changes = this.getChanges(oldSupplier, supplier);
                break;
            case this.ACTIONS.SUPPLIER.DELETE:
                details = `Deleted supplier: ${supplier.name}`;
                break;
        }

        return this.logActivity(action, details, { metadata });
    },

    /**
     * Log user-related activities
     */
    async logUserActivity(action, user) {
        let details = '';
        switch (action) {
            case this.ACTIONS.USER.LOGIN:
                details = `User logged in: ${user.username}`;
                break;
            case this.ACTIONS.USER.LOGOUT:
                details = `User logged out: ${user.username}`;
                break;
        }

        return this.logActivity(action, details, { 
            userId: user.id,
            metadata: { username: user.username, role: user.role }
        });
    },

    /**
     * Log note-related activities
     */
    async logNoteActivity(action, note, oldNote = null) {
        let details = '';
        let metadata = { 
            note_id: note.id,
            title: note.title,
            priority: note.priority
        };

        switch (action) {
            case this.ACTIONS.NOTE.ADD:
                details = `Added new note: ${note.title}`;
                break;
            case this.ACTIONS.NOTE.EDIT:
                details = `Updated note: ${note.title}`;
                metadata.changes = this.getChanges(oldNote, note);
                break;
            case this.ACTIONS.NOTE.DELETE:
                details = `Deleted note: ${note.title}`;
                break;
        }

        return this.logActivity(action, details, { metadata });
    },

    /**
     * Get changes between old and new object
     * @private
     */
    getChanges(oldObj, newObj) {
        if (!oldObj) return null;
        
        const changes = {};
        for (const [key, value] of Object.entries(newObj)) {
            if (oldObj[key] !== value) {
                changes[key] = {
                    from: oldObj[key],
                    to: value
                };
            }
        }
        return Object.keys(changes).length > 0 ? changes : null;
    },

    /**
     * Format an activity for display
     */
    formatActivity(activity) {
        return {
            ...activity,
            formattedTimestamp: new Date(activity.timestamp).toLocaleString(),
            actionDisplay: this.formatAction(activity.action),
            actionColor: this.getActionColor(activity.action)
        };
    },

    /**
     * Format action type for display
     */
    formatAction(action) {
        return action.split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    },

    /**
     * Get the color class for an action type
     */
    getActionColor(action) {
        const colors = {
            // Item actions
            add_item: 'bg-green-100 text-green-800',
            edit_item: 'bg-blue-100 text-blue-800',
            delete_item: 'bg-red-100 text-red-800',
            update_quantity: 'bg-purple-100 text-purple-800',
            
            // Supplier actions
            add_supplier: 'bg-yellow-100 text-yellow-800',
            edit_supplier: 'bg-indigo-100 text-indigo-800',
            delete_supplier: 'bg-pink-100 text-pink-800',
            
            // User actions
            user_login: 'bg-teal-100 text-teal-800',
            user_logout: 'bg-gray-100 text-gray-800',
            
            // Note actions
            add_note: 'bg-emerald-100 text-emerald-800',
            edit_note: 'bg-amber-100 text-amber-800',
            delete_note: 'bg-rose-100 text-rose-800',
            
            default: 'bg-gray-100 text-gray-800'
        };
        return colors[action] || colors.default;
    }
};

// Export the module
window.ActivityLogger = ActivityLogger; 