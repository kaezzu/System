// Initialize notes from localStorage or use empty array
let notes = JSON.parse(localStorage.getItem('notes')) || [];

// DOM Elements
const noteModal = document.getElementById('noteModal');
const noteForm = document.getElementById('noteForm');
const searchInput = document.getElementById('searchInput');
const filterSelect = document.getElementById('filterSelect');
const sortSelect = document.getElementById('sortSelect');
const notesContainer = document.getElementById('notesContainer');

// Function to show add note modal
function showAddNoteModal() {
    noteForm.reset();
    document.getElementById('noteForm').dataset.mode = 'add';
    document.querySelector('#noteModal h2').textContent = 'Add New Note';
    noteModal.style.display = 'block';
}

// Function to show edit note modal
function showEditNoteModal(noteId) {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    document.getElementById('noteForm').dataset.mode = 'edit';
    document.getElementById('noteForm').dataset.noteId = noteId;
    document.querySelector('#noteModal h2').textContent = 'Edit Note';
    
    document.getElementById('noteTitle').value = note.title;
    document.getElementById('noteContent').value = note.content;
    document.getElementById('notePriority').value = note.priority;
    document.getElementById('noteCategory').value = note.category || 'general';
    
    noteModal.style.display = 'block';
}

// Function to close note modal
function closeNoteModal() {
    noteModal.style.display = 'none';
    noteForm.reset();
    delete noteForm.dataset.mode;
    delete noteForm.dataset.noteId;
}

// Function to handle note submission
function handleNoteSubmit(event) {
    event.preventDefault();
    
    // Get form elements
    const titleField = document.getElementById('noteTitle').parentElement.parentElement;
    const contentField = document.getElementById('noteContent').parentElement.parentElement;
    const submitButton = event.target.querySelector('.submit-button');
    
    // Reset error states
    titleField.classList.remove('error');
    contentField.classList.remove('error');
    
    // Get values
    const title = document.getElementById('noteTitle').value.trim();
    const content = document.getElementById('noteContent').value.trim();
    const priority = document.getElementById('notePriority').value;
    const category = document.getElementById('noteCategory').value;
    
    // Validate
    let hasError = false;
    
    if (!title) {
        titleField.classList.add('error');
        hasError = true;
    }
    
    if (!content) {
        contentField.classList.add('error');
        hasError = true;
    }
    
    if (hasError) return;
    
    // Show loading state
    submitButton.classList.add('loading');
    
    // Get current user
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    
    // Create or update note object
    const note = {
        id: event.target.dataset.mode === 'edit' ? parseInt(event.target.dataset.noteId) : Date.now(),
        title: title,
        content: content,
        priority: priority,
        category: category,
        author: currentUser.username,
        authorFullName: currentUser.fullName,
        createdAt: event.target.dataset.mode === 'edit' ? 
            notes.find(n => n.id === parseInt(event.target.dataset.noteId)).createdAt : 
            new Date().toLocaleString(),
        updatedAt: new Date().toLocaleString()
    };
    
    // Simulate network delay
    setTimeout(() => {
        if (event.target.dataset.mode === 'edit') {
            // Update existing note
            const index = notes.findIndex(n => n.id === note.id);
            if (index !== -1) {
                notes[index] = note;
            }
        } else {
            // Add new note
            notes.unshift(note);
        }
        
        // Save to localStorage
        localStorage.setItem('notes', JSON.stringify(notes));
        
        // Log activity
        logActivity('note', `${currentUser.username} ${event.target.dataset.mode === 'edit' ? 'updated' : 'created'} a note: ${title}`);
        
        // Update display and close modal
        updateNotesDisplay();
        closeNoteModal();
        
        // Show success message
        showSuccessMessage(`Note ${event.target.dataset.mode === 'edit' ? 'updated' : 'created'} successfully!`);
        
        // Reset loading state
        submitButton.classList.remove('loading');
    }, 500);
}

// Function to show success message
function showSuccessMessage(message) {
    const successMessage = document.createElement('div');
    successMessage.className = 'success-message';
    successMessage.style.position = 'fixed';
    successMessage.style.top = '20px';
    successMessage.style.right = '20px';
    successMessage.style.padding = '15px 25px';
    successMessage.style.borderRadius = '8px';
    successMessage.style.backgroundColor = '#dcfce7';
    successMessage.style.color = '#166534';
    successMessage.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
    successMessage.style.zIndex = '9999';
    successMessage.style.animation = 'slideIn 0.3s ease-out';
    successMessage.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 20px;">✓</span>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(successMessage);
    
    // Add animation keyframes
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
    
    // Remove after 3 seconds
    setTimeout(() => {
        successMessage.style.animation = 'slideOut 0.3s ease-in';
        successMessage.addEventListener('animationend', () => {
            document.body.removeChild(successMessage);
        });
    }, 3000);
}

// Function to delete note
function deleteNote(noteId) {
    if (confirm('Are you sure you want to delete this note?')) {
        const noteIndex = notes.findIndex(note => note.id === noteId);
        if (noteIndex === -1) return;
        
        const note = notes[noteIndex];
        notes.splice(noteIndex, 1);
        
        // Save to localStorage
        localStorage.setItem('notes', JSON.stringify(notes));
        
        // Log activity
        logActivity('note', `Note deleted: ${note.title}`);
        
        // Show success message
        showSuccessMessage('Note deleted successfully!');
        
        // Update display
        updateNotesDisplay();
    }
}

// Function to toggle note expansion
function toggleNoteExpansion(noteId) {
    const noteElement = document.querySelector(`[data-note-id="${noteId}"]`);
    noteElement.classList.toggle('expanded');
}

// Function to update notes display
function updateNotesDisplay(filteredNotes = notes) {
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    notesContainer.innerHTML = '';
    
    if (filteredNotes.length === 0) {
        notesContainer.innerHTML = '<div class="no-data">No notes found</div>';
        return;
    }
    
    filteredNotes.forEach(note => {
        const noteElement = document.createElement('div');
        noteElement.className = `note-card ${getPriorityClass(note.priority)}`;
        noteElement.dataset.noteId = note.id;
        noteElement.onclick = () => toggleNoteExpansion(note.id);
        
        noteElement.innerHTML = `
            <div class="note-header">
                <div class="note-title-section">
                    <span class="note-category">${note.category || 'General'}</span>
                    <h3>${note.title}</h3>
                </div>
                <div class="note-actions">
                    ${note.author === currentUser.username ? `
                        <button onclick="event.stopPropagation(); showEditNoteModal(${note.id})" class="action-button edit">Edit</button>
                        <button onclick="event.stopPropagation(); deleteNote(${note.id})" class="action-button delete">Delete</button>
                    ` : ''}
                </div>
            </div>
            <div class="note-content">${note.content}</div>
            <div class="note-footer">
                <div class="note-meta">
                    <span class="note-author">By ${note.authorFullName}</span>
                    <span class="note-date">Created: ${note.createdAt}</span>
                    ${note.updatedAt !== note.createdAt ? `<span class="note-date">Updated: ${note.updatedAt}</span>` : ''}
                </div>
                <span class="note-priority">${formatPriority(note.priority)}</span>
            </div>
        `;
        notesContainer.appendChild(noteElement);
    });
}

// Function to filter and sort notes
function filterAndSortNotes() {
    const searchTerm = searchInput.value.toLowerCase();
    const filterValue = filterSelect.value;
    const sortValue = sortSelect.value;
    const currentUser = JSON.parse(sessionStorage.getItem('currentUser'));
    
    let filteredNotes = notes.filter(note => {
        const matchesSearch = 
            note.title.toLowerCase().includes(searchTerm) ||
            note.content.toLowerCase().includes(searchTerm) ||
            note.author.toLowerCase().includes(searchTerm) ||
            (note.category && note.category.toLowerCase().includes(searchTerm));
        
        const matchesFilter = 
            !filterValue ||
            (filterValue === 'my' && note.author === currentUser.username) ||
            (filterValue === 'others' && note.author !== currentUser.username) ||
            (filterValue === note.category);
        
        return matchesSearch && matchesFilter;
    });
    
    // Sort notes
    filteredNotes.sort((a, b) => {
        switch(sortValue) {
            case 'newest':
                return new Date(b.createdAt) - new Date(a.createdAt);
            case 'oldest':
                return new Date(a.createdAt) - new Date(b.createdAt);
            case 'priority':
                const priorityOrder = { high: 0, medium: 1, low: 2 };
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            case 'title':
                return a.title.localeCompare(b.title);
            default:
                return 0;
        }
    });
    
    updateNotesDisplay(filteredNotes);
}

// Helper function to format priority
function formatPriority(priority) {
    return priority.charAt(0).toUpperCase() + priority.slice(1) + ' Priority';
}

// Helper function to get priority class
function getPriorityClass(priority) {
    return `priority-${priority}`;
}

// Add event listeners
searchInput.addEventListener('input', filterAndSortNotes);
filterSelect.addEventListener('change', filterAndSortNotes);
sortSelect.addEventListener('change', filterAndSortNotes);

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target === noteModal) {
        closeNoteModal();
    }
}

// Initialize display
updateNotesDisplay(); 