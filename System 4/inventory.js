// API base URL
const API_BASE_URL = 'http://localhost:3000/api';

// Initialize inventory data
let inventoryItems = [];
let categories = [];

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
        option.value = category.id;
        option.textContent = category.name;
        categorySelect.appendChild(option);
        
        // For filter
        const filterOption = document.createElement('option');
        filterOption.value = category.id;
        filterOption.textContent = category.name;
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
function showEditItemModal(item) {
    currentEditingItem = item;
    document.getElementById('modalTitle').textContent = 'Edit Item';
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemCategory').value = item.category_id;
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

// Function to handle item submission
async function handleItemSubmit(event) {
    event.preventDefault();
    
    const itemName = document.getElementById('itemName').value;
    const category_id = document.getElementById('itemCategory').value;
    const quantity = parseInt(document.getElementById('itemQuantity').value);
    const expiration = document.getElementById('itemExpiration').value;
    const quality = document.getElementById('itemQuality').value;
    
    // Automatically determine status based on quantity
    const status = getStatusFromQuantity(quantity);
    
    try {
        if (currentEditingItem) {
            // Editing existing item
            const response = await fetch(`${API_BASE_URL}/inventory/${currentEditingItem.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: itemName,
                    category_id,
                    quantity,
                    status,
                    expiration,
                    quality
                })
            });
            
            if (!response.ok) throw new Error('Failed to update item');
            
            // Log edit activity
            logActivity('edit', `Updated item: ${itemName}`);
        } else {
            // Adding new item
            const response = await fetch(`${API_BASE_URL}/inventory`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: itemName,
                    category_id,
                    quantity,
                    status,
                    expiration,
                    quality
                })
            });
            
            if (!response.ok) throw new Error('Failed to add item');
            
            // Log add activity
            logActivity('add', `Added new item: ${itemName}`);
        }
        
        // Refresh inventory data
        await loadInventoryData();
        closeModal();
    } catch (err) {
        console.error('Error saving item:', err);
        alert('Failed to save item. Please try again.');
    }
}

// Function to handle category submission
async function handleCategorySubmit(event) {
    event.preventDefault();
    
    const categoryName = document.getElementById('categoryName').value;
    
    try {
        const response = await fetch(`${API_BASE_URL}/categories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: categoryName })
        });
        
        if (!response.ok) throw new Error('Failed to add category');
        
        // Refresh categories
        await loadCategories();
        closeCategoryModal();
        
        // Log activity
        logActivity('add', `Added new category: ${categoryName}`);
    } catch (err) {
        console.error('Error adding category:', err);
        alert('Failed to add category. Please try again.');
    }
}

// Function to delete item
async function deleteItem(id) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/inventory/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Failed to delete item');
        
        // Refresh inventory data
        await loadInventoryData();
        
        // Log activity
        logActivity('delete', `Deleted item ID: ${id}`);
    } catch (err) {
        console.error('Error deleting item:', err);
        alert('Failed to delete item. Please try again.');
    }
}

// Function to load inventory data
async function loadInventoryData() {
    try {
        const response = await fetch(`${API_BASE_URL}/inventory`);
        inventoryItems = await response.json();
        updateInventoryTable();
        updateDashboardCounts();
    } catch (err) {
        console.error('Error loading inventory:', err);
    }
}

// Function to load categories
async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE_URL}/categories`);
        categories = await response.json();
        initializeCategories();
    } catch (err) {
        console.error('Error loading categories:', err);
    }
}

// Function to update inventory table
function updateInventoryTable(items = inventoryItems) {
    inventoryTableBody.innerHTML = '';
    
    items.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.name}</td>
            <td>${item.category_name}</td>
            <td>${item.quantity}</td>
            <td>${item.status}</td>
            <td>${item.expiration || '-'}</td>
            <td>${item.quality || '-'}</td>
            <td>${item.last_updated}</td>
            <td class="actions-column">
                <button onclick="showEditItemModal(${JSON.stringify(item)})" class="edit-btn">Edit</button>
                <button onclick="deleteItem(${item.id})" class="delete-btn">Delete</button>
            </td>
        `;
        inventoryTableBody.appendChild(row);
    });
}

// Function to update dashboard counts
function updateDashboardCounts() {
    const totalItems = inventoryItems.length;
    const lowStockItems = inventoryItems.filter(item => item.status === 'Low Stock').length;
    const outOfStockItems = inventoryItems.filter(item => item.status === 'Out of Stock').length;
    
    // Update dashboard elements if they exist
    const totalItemsElement = document.getElementById('totalItems');
    const lowStockElement = document.getElementById('lowStockItems');
    const outOfStockElement = document.getElementById('outOfStockItems');
    
    if (totalItemsElement) totalItemsElement.textContent = totalItems;
    if (lowStockElement) lowStockElement.textContent = lowStockItems;
    if (outOfStockElement) outOfStockElement.textContent = outOfStockItems;
}

// Function to filter items
function filterItems() {
    const searchTerm = searchInput.value.toLowerCase();
    const categoryId = categoryFilter.value;
    
    const filteredItems = inventoryItems.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm);
        const matchesCategory = !categoryId || item.category_id === parseInt(categoryId);
        return matchesSearch && matchesCategory;
    });
    
    updateInventoryTable(filteredItems);
}

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
    // Load initial data
    await loadCategories();
    await loadInventoryData();
    
    // Check user role
    checkUserRole();
    
    // Add event listeners
    itemForm.addEventListener('submit', handleItemSubmit);
    categoryForm.addEventListener('submit', handleCategorySubmit);
    searchInput.addEventListener('input', filterItems);
    categoryFilter.addEventListener('change', filterItems);
}); 