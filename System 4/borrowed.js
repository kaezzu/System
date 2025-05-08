// Initialize borrowed items from localStorage or use empty array
let borrowedItems = JSON.parse(localStorage.getItem('borrowedItems')) || [];

// DOM Elements
const borrowModal = document.getElementById('borrowModal');
const borrowForm = document.getElementById('borrowForm');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const borrowedTableBody = document.getElementById('borrowedTableBody');
const borrowItemSelect = document.getElementById('borrowItem');

// Function to update available items in the borrow select
function updateAvailableItems() {
    const inventoryItems = JSON.parse(localStorage.getItem('inventoryItems')) || [];
    borrowItemSelect.innerHTML = '<option value="">Select Item</option>';
    
    inventoryItems.forEach(item => {
        if (item.quantity > 0) {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = `${item.name} (Available: ${item.quantity})`;
            option.dataset.maxQuantity = item.quantity;
            borrowItemSelect.appendChild(option);
        }
    });
}

// Function to show borrow modal
function showBorrowItemModal() {
    updateAvailableItems();
    borrowForm.reset();
    borrowModal.style.display = 'block';
}

// Function to close borrow modal
function closeBorrowModal() {
    borrowModal.style.display = 'none';
    borrowForm.reset();
}

// Function to get status based on quantity
function getStatusFromQuantity(quantity) {
    if (quantity <= 0) return 'Out of Stock';
    if (quantity <= 20) return 'Low Stock';
    return 'Available';
}

// Function to check if item is past due
function isPastDue(dueDate) {
    const today = new Date();
    const due = new Date(dueDate);
    return due < today;
}

// Function to handle borrow submission
function handleBorrowSubmit(event) {
    event.preventDefault();
    
    const itemId = document.getElementById('borrowItem').value;
    const quantity = parseInt(document.getElementById('borrowQuantity').value);
    const borrowerName = document.getElementById('borrowerName').value;
    const department = document.getElementById('department').value;
    const dueDate = document.getElementById('dueDate').value;
    
    // Validate inputs
    if (!itemId || !quantity || !borrowerName || !department || !dueDate) {
        alert('Please fill in all fields');
        return;
    }
    
    // Get the inventory item
    const inventoryItems = JSON.parse(localStorage.getItem('inventoryItems')) || [];
    const itemIndex = inventoryItems.findIndex(item => item.id.toString() === itemId);
    
    if (itemIndex === -1) {
        alert('Item not found');
        return;
    }
    
    const item = inventoryItems[itemIndex];
    
    // Check if quantity is available
    if (quantity > item.quantity) {
        alert('Requested quantity is not available');
        return;
    }
    
    // Create borrow record
    const borrowRecord = {
        id: Date.now(),
        itemId: item.id,
        itemName: item.name,
        category: item.category,
        quantity: quantity,
        borrowerName: borrowerName,
        department: department,
        borrowDate: new Date().toLocaleString(),
        dueDate: dueDate,
        status: 'Borrowed'
    };
    
    // Update inventory quantity
    inventoryItems[itemIndex].quantity -= quantity;
    
    // Update status based on new quantity
    inventoryItems[itemIndex].status = getStatusFromQuantity(inventoryItems[itemIndex].quantity);
    
    // Save changes
    borrowedItems.push(borrowRecord);
    localStorage.setItem('borrowedItems', JSON.stringify(borrowedItems));
    localStorage.setItem('inventoryItems', JSON.stringify(inventoryItems));
    
    // Log activity
    logActivity('borrow', `${borrowerName} borrowed ${quantity} ${item.name}(s)`);
    
    // Show success message
    alert('Item borrowed successfully!');
    
    updateBorrowedTable();
    closeBorrowModal();
}

// Function to update borrowed items table
function updateBorrowedTable(items = borrowedItems) {
    borrowedTableBody.innerHTML = '';
    
    items.forEach(item => {
        // Check if item is past due and still borrowed
        if (item.status === 'Borrowed' && isPastDue(item.dueDate)) {
            item.status = 'Past Due';
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.itemName}</td>
            <td>${item.category}</td>
            <td>${item.quantity}</td>
            <td>${item.borrowerName}</td>
            <td>${item.department}</td>
            <td>${item.borrowDate}</td>
            <td>${item.dueDate}</td>
            <td class="${getStatusClass(item.status)}">${item.status}</td>
            <td class="actions-column">
                ${item.status === 'Borrowed' || item.status === 'Past Due' ? 
                    `<button onclick="returnItem(${item.id})" class="action-button">Return</button>` : 
                    `<span>Returned on ${item.returnDate}</span>`}
            </td>
        `;
        borrowedTableBody.appendChild(row);
    });
}

// Function to get status class for styling
function getStatusClass(status) {
    switch(status) {
        case 'Borrowed':
            return 'status-orange';
        case 'Past Due':
            return 'status-red';
        case 'Returned':
            return 'status-green';
        default:
            return '';
    }
}

// Update the status filter options
function updateStatusFilter() {
    statusFilter.innerHTML = `
        <option value="">All Status</option>
        <option value="Borrowed">Borrowed</option>
        <option value="Past Due">Past Due</option>
        <option value="Returned">Returned</option>
    `;
}

// Function to handle return
function returnItem(borrowId) {
    const borrowIndex = borrowedItems.findIndex(item => item.id === borrowId);
    if (borrowIndex === -1) return;
    
    const borrowRecord = borrowedItems[borrowIndex];
    
    // Get the inventory item
    const inventoryItems = JSON.parse(localStorage.getItem('inventoryItems')) || [];
    const itemIndex = inventoryItems.findIndex(item => item.id === borrowRecord.itemId);
    
    if (itemIndex === -1) return;
    
    // Update inventory quantity
    inventoryItems[itemIndex].quantity += borrowRecord.quantity;
    
    // Update status based on new quantity
    inventoryItems[itemIndex].status = getStatusFromQuantity(inventoryItems[itemIndex].quantity);
    
    // Update borrow record
    borrowedItems[borrowIndex].status = 'Returned';
    borrowedItems[borrowIndex].returnDate = new Date().toLocaleString();
    
    // Save changes
    localStorage.setItem('borrowedItems', JSON.stringify(borrowedItems));
    localStorage.setItem('inventoryItems', JSON.stringify(inventoryItems));
    
    // Log activity
    logActivity('return', `${borrowRecord.borrowerName} returned ${borrowRecord.quantity} ${borrowRecord.itemName}(s)`);
    
    // Show success message
    alert('Item returned successfully!');
    
    updateBorrowedTable();
}

// Search and filter functionality
function filterBorrowedItems() {
    const searchTerm = searchInput.value.toLowerCase();
    const selectedStatus = statusFilter.value;
    
    const filteredItems = borrowedItems.filter(item => {
        const matchesSearch = 
            item.itemName.toLowerCase().includes(searchTerm) ||
            item.borrowerName.toLowerCase().includes(searchTerm) ||
            item.department.toLowerCase().includes(searchTerm);
        
        const matchesStatus = !selectedStatus || item.status === selectedStatus;
        
        return matchesSearch && matchesStatus;
    });
    
    updateBorrowedTable(filteredItems);
}

// Add event listeners
searchInput.addEventListener('input', filterBorrowedItems);
statusFilter.addEventListener('change', filterBorrowedItems);

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target === borrowModal) {
        closeBorrowModal();
    }
}

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    updateStatusFilter();
    updateBorrowedTable();
    // Check for past due items every minute
    setInterval(updateBorrowedTable, 60000);
}); 