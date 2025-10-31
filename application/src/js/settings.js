import $ from "jquery";
import '@shoelace-style/shoelace/dist/themes/dark.css';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import '@shoelace-style/shoelace/dist/components/input/input.js';
import '@shoelace-style/shoelace/dist/components/range/range.js';
import '@shoelace-style/shoelace/dist/components/color-picker/color-picker.js';
import '@shoelace-style/shoelace/dist/components/tooltip/tooltip.js';
import '@shoelace-style/shoelace/dist/components/select/select.js';
import '@shoelace-style/shoelace/dist/components/option/option.js';
import '@shoelace-style/shoelace/dist/components/details/details.js';
import '@shoelace-style/shoelace/dist/components/spinner/spinner.js';
import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/textarea/textarea.js';
import '@shoelace-style/shoelace/dist/components/checkbox/checkbox.js';
import '@shoelace-style/shoelace/dist/components/dialog/dialog.js';
import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path.js';
setBasePath('./shoelace');

// streamlabs api variables
let streamlabs, streamlabsOBS;
let canAddSource = false;
let existingSource;

let username = "";
let twitchImage = "";

const defaultEntries = { entries: [
    {
        "id": "28b88b01-3e06-41e2-8bfe-5f2beea60c56",
        "name": "Example Note",
        "creationDate": 1761883040877,
        "entries": [
            {
                "id": "4d7e7a9f-5d73-461e-8ab0-b28c7513f50d",
                "contentType": "text",
                "content": "Here's an example of a note! Maybe you need to figure out how to beat the ender dragon or a learn a crafting recipe.",
                "createdAt": 1761883042363
            },
            {
                "id": "372f7871-a3fe-4cf6-84f0-354d1cf4504c",
                "contentType": "task",
                "content": {
                    "description": "Get Wood",
                    "completed": true
                },
                "createdAt": 1761883045582
            },
            {
                "id": "95c22a5c-2eb2-4c4f-9142-63dcea7c23ad",
                "contentType": "task",
                "content": {
                    "description": "Slay the Dragon",
                    "completed": false
                },
                "createdAt": 1761883131876
            }
        ]
    }
] };
let noteEntries = { entries: [] };



// Scene selection state
let availableScenes = [];
let activeSceneId = null;
let selectedSceneId = null;

// Pagination state
let currentPage = 0;
const itemsPerPage = 5; // 5 journals + 1 "Create New" = 6 total

// Current journal state
let currentNoteId = null;

// Auto-save functionality
let autoSaveTimeout = null;
let hasUnsavedChanges = false;

// Reminder due date checking
let reminderCheckInterval = null;

// Function to check and update reminder due status
function checkReminderDueDates() {
    // Only check if we're in journal view with reminders
    if (!currentNoteId) return;
    
    const currentTime = new Date();
    
    // Find all reminder items on the page
    $('.reminder-item[data-contentType="reminder"]').each(function() {
        const reminderItem = $(this);
        const dueDateTime = parseInt(reminderItem.attr('data-dueDate'));
        
        if (dueDateTime) {
            const dueDate = new Date(dueDateTime);
            const isDue = dueDate <= currentTime;
            
            // Update the due class based on current time
            if (isDue) {
                if (!reminderItem.hasClass('due')) {
                    reminderItem.addClass('due');
                    console.log('Reminder became due:', reminderItem.attr('data-title'));
                }
            } else {
                if (reminderItem.hasClass('due')) {
                    reminderItem.removeClass('due');
                    console.log('Reminder no longer due:', reminderItem.attr('data-title'));
                }
            }
        }
    });
}

// Start periodic reminder checking (every 1 minute)
function startReminderChecking() {
    // Clear existing interval if any
    if (reminderCheckInterval) {
        clearInterval(reminderCheckInterval);
    }
    
    // Set up new interval - check every 60 seconds
    reminderCheckInterval = setInterval(checkReminderDueDates, 60000);
    console.log('Started reminder due date checking (every 1 minute)');
}

// Stop periodic reminder checking
function stopReminderChecking() {
    if (reminderCheckInterval) {
        clearInterval(reminderCheckInterval);
        reminderCheckInterval = null;
        console.log('Stopped reminder due date checking');
    }
}

// Debounced save function - saves after 2 seconds of no changes
function debouncedSave() {
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
    }
    
    hasUnsavedChanges = true;
    
    autoSaveTimeout = setTimeout(() => {
        if (hasUnsavedChanges) {
            collectNoteData();
            saveNoteEntries();
            hasUnsavedChanges = false;
        }
    }, 2000); // Save after 2 seconds of inactivity
}


async function loadShoelaceElements() {
    await Promise.allSettled([
        customElements.whenDefined('sl-range'),
        customElements.whenDefined('sl-icon'),
        customElements.whenDefined('sl-select'),
        customElements.whenDefined('sl-details'),
    ]);
}

$(function() {
    loadShoelaceElements();
    initApp();
});

async function initApp() {
    streamlabs = window.Streamlabs;
    streamlabs.init({receiveEvents: true}).then(async (data) => {
        console.log('Streamlabs initialized with data:', data);
        username = data.profiles.streamlabs.name;
        twitchImage = data.profiles.twitch.icon_url;
        await loadNoteEntries();

        streamlabsOBS = window.streamlabsOBS;
        streamlabsOBS.apiReady.then(() => {
            canAddSource = true;
        });

        streamlabsOBS.v1.App.onNavigation(nav => {
            // Load scenes data whenever navigation happens to get current active scene
            loadScenesData().then(() => {
                // If scene modal is open, refresh the scene list
                if ($('#sceneModal').hasClass('active')) {
                    populateSceneList();
                }
            });

            if(nav.sourceId) {
                // Accesses via existing source, load source settings
                console.log('Accessed via existing source');

                streamlabsOBS.v1.Sources.getAppSourceSettings(nav.sourceId).then(journalId => {
                    existingSource = nav.sourceId;
                    if(!journalId) {
                        console.log('New source, no settings');
                    } else {
                        console.log('loading journal entry', journalId);
                        loadNote(journalId);
                    }
                });  
            } else {
                existingSource = null;
                // Accesses via side nav
                console.log('Accessed via side nav');
            }
        });
    });
}

async function loadNoteEntries() {
    streamlabs.userSettings.get('streamNoteEntries').then(data => {
        if (!data) {
            console.log("no settings found, reverting to default")
            data = defaultEntries;
            console.log('default data', data);
        }
        
        // Check if data exists but entries array is empty
        if (data && typeof data == "object" && data.entries && Array.isArray(data.entries) && data.entries.length === 0) {
            console.log("empty entries array found, reverting to default")
            data = defaultEntries;
        }
        
       for (const [key, value] of Object.entries(defaultEntries)) {
            if(!data.hasOwnProperty(key)) {
                console.log(`setting '${key}' missing! set to ${value}`);
                data[key] = defaultEntries[key];
            }
        }

        noteEntries = structuredClone(data);
        console.log('Loaded Note Entries:', noteEntries);
        
        // Populate journal entries in the UI
        populateNoteGrid();
    });

    return new Promise((resolve) => {
        setTimeout(() => {
            //console.log('loaded Journal Entries:', noteEntries);
            resolve();
        }, 1000);
    });
}

async function saveNoteEntries() {
    try {
        await streamlabs.userSettings.set('streamNoteEntries', noteEntries).then(() => {
            streamlabs.postMessage('update', {});
        });
        //console.log('Note entries saved successfully');
        return true;
    } catch (error) {
        console.error('Error saving note entries:', error);
        showAlert('#generalAlert', 'Save Error', 'Failed to save note entries.', 'danger');
        return false;
    }
}

// Collect note data from the current note view UI
function collectNoteData() {
    if (!currentNoteId) return;
    
    const noteIndex = noteEntries.entries.findIndex(j => j.id === currentNoteId);
    if (noteIndex === -1) return;
    
    const collectedEntries = [];
    
    // Get all journal entries from the UI
    $('#noteEntries .note-entry').each(function() {
        const entryElement = $(this);
        
        // Skip if this is the empty journal entry with toolbar (no header)
        if (entryElement.find('.note-entry-header').length === 0) {
            
            // Collect text areas
            entryElement.find('sl-textarea[data-contentType="text"]').each(function() {
                const textarea = $(this);
                const content = textarea.val();
                if (content && content.trim()) {
                    collectedEntries.push({
                        id: crypto.randomUUID(),
                        contentType: 'text',
                        content: content.trim(),
                        createdAt: parseInt(textarea.attr('data-createdAt')) || Date.now()
                    });
                }
            });
            
            // Collect task items
            entryElement.find('.task-item[data-contentType="task"]').each(function() {
                const taskItem = $(this);
                const text = taskItem.attr('data-task-text') || taskItem.find('.task-text').text();
                const completed = taskItem.attr('data-completed') === 'true';
                const createdAt = parseInt(taskItem.attr('data-createdAt')) || Date.now();
                
                if (text && text.trim()) {
                    collectedEntries.push({
                        id: crypto.randomUUID(),
                        contentType: 'task',
                        content: {
                            description: text.trim(),
                            completed: completed
                        },
                        createdAt: createdAt
                    });
                }
            });
            
            // Collect reminder items
            entryElement.find('.reminder-item[data-contentType="reminder"]').each(function() {
                const reminderItem = $(this);
                const title = reminderItem.attr('data-title') || reminderItem.find('.reminder-title strong').text();
                const dueDate = parseInt(reminderItem.attr('data-dueDate')) || Date.now();
                const createdAt = parseInt(reminderItem.attr('data-createdAt')) || Date.now();
                
                if (title && title.trim()) {
                    collectedEntries.push({
                        id: crypto.randomUUID(),
                        contentType: 'reminder',
                        content: {
                            title: title.trim(),
                            dueDate: dueDate,
                            completed: false
                        },
                        createdAt: createdAt
                    });
                }
            });
        }
    });
    
    // Update the journal entries in the data structure
    noteEntries.entries[noteIndex].entries = collectedEntries;
    
    console.log('Collected journal data:', collectedEntries);
}

function populateNoteGrid() {
    if(!noteEntries || !noteEntries.entries) return;
    const noteGrid = $('.journal-grid');
    
    // Clear existing journal cards
    noteGrid.find('.journal-card').remove();
    
    // Sort journals by creation date (newest first)
    const sortedNotes = [...noteEntries.entries].sort((a, b) => b.creationDate - a.creationDate);
    
    // Only show "Create New" button on the first page (page 0)
    if (currentPage === 0) {
        const createNewCard = $(`
            <div class="journal-card create-new" id="createNewNote">
                <div class="journal-icon">
                    <sl-icon name="plus-circle" style="font-size: 3rem; color: var(--sl-color-primary-500);" aria-hidden="true" library="default"></sl-icon>
                </div>
                <h3>Create Notepad</h3>
            </div>
        `);
        noteGrid.append(createNewCard);
    }
    
    // Calculate pagination based on available space
    // Page 0: 5 notes (1 slot used by "Create New" button)
    // Other pages: 6 notes (full grid)
    const notesPerPage = currentPage === 0 ? 5 : 6;
    const startIndex = currentPage === 0 ? 0 : 5 + ((currentPage - 1) * 6);
    const endIndex = Math.min(startIndex + notesPerPage, sortedNotes.length);
    const notesToShow = sortedNotes.slice(startIndex, endIndex);
    
    // Calculate total pages correctly
    const totalPages = sortedNotes.length <= 5 ? 1 : Math.ceil((sortedNotes.length - 5) / 6) + 1;
    
    // Add each journal as a card
    notesToShow.forEach((journal, index) => {
        
        // Pick a random color from the custom palette
        const colors = ['#f9fbe1', '#ecc1c4', '#e19ead', '#bde1f0', '#90a9d4', '#6b7bad'];
        const iconColor = colors[Math.floor(Math.random() * colors.length)];
        
        const noteCard = $(`
            <div class="journal-card existing" id="journal-${journal.id}" data-note-id="${journal.id}"${journal.sceneItemId ? ` data-sceneitem-id="${journal.sceneItemId}"` : ''}>
                <sl-tooltip content="Delete Note">
                    <sl-button class="note-delete-btn" variant="danger" size="small" outline data-note-id="${journal.id}"${journal.sceneItemId ? ` data-sceneitem-id="${journal.sceneItemId}"` : ''} pill>
                        <sl-icon name="trash"></sl-icon>
                    </sl-button>
                </sl-tooltip>
                <div class="journal-icon">
                    <sl-icon name="sticky" style="font-size: 3rem; color: ${iconColor};" aria-hidden="true" library="default"></sl-icon>
                </div>
                <h3>${journal.name}</h3>
            </div>
        `);
        
        // Add click handler for the entire card to load journal (but not when clicking delete button)
        noteCard.on('click', (e) => {
            // Don't load journal if clicking on delete button or its tooltip
            if ($(e.target).closest('.note-delete-btn, sl-tooltip').length === 0) {
                loadNote(journal.id);
            }
        });
        
        noteGrid.append(noteCard);
    });
    
    // Update pagination controls
    updatePaginationControls(currentPage, totalPages, sortedNotes.length);
    
    //console.log(`Showing notes ${startIndex + 1}-${endIndex} of ${sortedNotes.length} (Page ${currentPage + 1}/${totalPages})`);
}

// Pagination functions
function updatePaginationControls(currentPageNum, totalPages, totalNotes) {
    let paginationHtml = '';
    
    if (totalPages > 1) {
        paginationHtml = `
            <div class="pagination-controls">
                <div class="pagination-info">
                    <span>Page ${currentPageNum + 1} of ${totalPages} (${totalNotes} journals)</span>
                </div>
                <div class="pagination-buttons">
                    <sl-button size="small" variant="default" ${currentPageNum === 0 ? 'disabled' : ''} id="prevPage">
                        <sl-icon slot="prefix" name="chevron-left"></sl-icon>Previous
                    </sl-button>
                    <sl-button size="small" variant="default" ${currentPageNum >= totalPages - 1 ? 'disabled' : ''} id="nextPage">
                        Next<sl-icon slot="suffix" name="chevron-right"></sl-icon>
                    </sl-button>
                </div>
            </div>
        `;
    }
    
    // Remove existing pagination and add new one
    $('.pagination-controls').remove();
    if (paginationHtml) {
        $('.journal-grid').after(paginationHtml);
    }
}

function goToNextPage() {
    const sortedNotes = [...noteEntries.entries].sort((a, b) => b.creationDate - a.creationDate);
    const totalPages = sortedNotes.length <= 5 ? 1 : Math.ceil((sortedNotes.length - 5) / 6) + 1;
    
    if (currentPage < totalPages - 1) {
        currentPage++;
        populateNoteGrid();
    }
}

function goToPreviousPage() {
    if (currentPage > 0) {
        currentPage--;
        populateNoteGrid();
    }
}

function loadNote(noteId) {
    const note = noteEntries.entries.find(j => j.id === noteId);
    if (note) {
        console.log('Loading note:', note);

        // Show the note view
        showNoteView(note);
    }
}

function showNoteView(note) {
    // Store the current journal ID
    currentNoteId = note.id;

    // Hide the journal list step and show the journal view
    $('#step1').removeClass('active');
    $('#journalView').addClass('active');
    
    // Set journal title and formatted date
    $('#noteTitle').text(note.name);
    
    // Set journal author
    $('#journalViewAuthor').text(`By ${username}`);
    
    // Format the creation date with full details and timezone
    const creationDate = new Date(note.creationDate);
    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
    };
    const formattedDate = creationDate.toLocaleDateString('en-US', options);
    $('#journalDate').text(formattedDate);

    // Populate note entries
    populateNoteEntries(note.entries);

    // Start periodic reminder due date checking
    startReminderChecking();
}

function populateNoteEntries(entries) {
    const noteEntriesContainer = $('#noteEntries');
    noteEntriesContainer.empty();
    
    if (entries.length === 0) {
        const currentTime = Date.now();
        const entryId = crypto.randomUUID();
        noteEntriesContainer.append(`
            <div class="note-entry" data-entry-id="${entryId}">
                <div class="note-entry-content">
                    <sl-tooltip content="Delete note">
                        <sl-button variant="danger" size="small" class="note-entry-textarea-delete-btn" onclick="deleteNoteEntry(this)" pill>
                            <sl-icon name="trash"></sl-icon>
                        </sl-button>
                    </sl-tooltip>
                    <sl-textarea 
                        data-contentType="text"
                        data-createdAt="${currentTime}"
                        placeholder="Write your note..."
                        rows="3"
                        style="width: 100%;">
                    </sl-textarea>
                </div>
            </div>
        `);
        
        // Focus the newly created textarea
        setTimeout(() => {
            const newTextarea = noteEntriesContainer.find(`[data-entry-id="${entryId}"] sl-textarea`)[0];
            if (newTextarea) {
                newTextarea.focus();
            }
        }, 50);
        
        return;
    }
    
    // Sort entries by creation date (oldest first)
    const sortedEntries = [...entries].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    
    sortedEntries.forEach(entry => {
        const entryDate = new Date(entry.createdAt || Date.now());
        const entryTime = entryDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        
        let contentHtml = '';
        
        switch (entry.contentType) {
            case 'text':
                contentHtml = `
                    <sl-tooltip content="Delete note">
                        <sl-button variant="danger" size="small" class="note-entry-textarea-delete-btn" onclick="deleteNoteEntry(this)" pill>
                            <sl-icon name="trash"></sl-icon>
                        </sl-button>
                    </sl-tooltip>
                    <sl-textarea 
                        data-contentType="text"
                        data-createdAt="${entry.createdAt || Date.now()}"
                        value="${entry.content}"
                        rows="3"
                        style="width: 100%;">
                    </sl-textarea>
                `;
                break;
            case 'task':
                const isCompleted = entry.content.completed || false;
                const completedAttr = isCompleted ? 'checked' : '';
                const taskText = entry.content.description || entry.content.title || '';
                contentHtml = `
                    <div class="task-item" 
                         data-contentType="task" 
                         data-createdAt="${entry.createdAt || Date.now()}"
                         data-completed="${isCompleted}"
                         data-task-text="${taskText}">
                         
                        <!-- Edit Button -->
                        <sl-tooltip content="Edit task">
                            <sl-button variant="neutral" size="small" class="task-edit-btn" onclick="edittask(this)" pill>
                                <sl-icon name="pencil"></sl-icon>
                            </sl-button>
                        </sl-tooltip>

                        <sl-tooltip content="Delete task">
                            <sl-button variant="danger" size="small" class="note-entry-delete-btn" onclick="deleteNoteEntry(this)" pill>
                                <sl-icon name="trash"></sl-icon>
                            </sl-button>
                        </sl-tooltip>
                        
                        <sl-checkbox class="task-checkbox" ${completedAttr}></sl-checkbox>
                        <span class="task-text" ${isCompleted ? 'style="text-decoration: line-through;"' : ''}>${taskText}</span>
                    </div>
                `;
                break;
            case 'reminder':
                const dueDate = new Date(entry.content.dueDate || Date.now());
                const formattedDate = dueDate.toLocaleDateString() + ' ' + dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                // Check if the reminder is due
                const currentTime = new Date();
                const isDue = dueDate <= currentTime;
                const dueClass = isDue ? ' due' : '';
                
                contentHtml = `
                    <div class="reminder-item${dueClass}" 
                         data-contentType="reminder" 
                         data-createdAt="${entry.createdAt || Date.now()}"
                         data-dueDate="${entry.content.dueDate || Date.now()}"
                         data-title="${entry.content.title || ''}">
                        
                        <!-- Edit Button -->
                        <sl-tooltip content="Edit reminder">
                            <sl-button variant="neutral" size="small" class="reminder-edit-btn" onclick="editReminder(this)" pill>
                                <sl-icon name="pencil"></sl-icon>
                            </sl-button>
                        </sl-tooltip>

                        <sl-tooltip content="Delete reminder">
                            <sl-button variant="danger" size="small" class="note-entry-delete-btn" onclick="deleteNoteEntry(this)" pill>
                                <sl-icon name="trash"></sl-icon>
                            </sl-button>
                        </sl-tooltip>
                        
                        <!-- Display Content -->
                        <div class="reminder-title">
                            <strong>${entry.content.title || 'Untitled Reminder'}</strong>
                        </div>
                        <div class="reminder-due-date">
                            Due: ${formattedDate}
                        </div>
                    </div>
                `;
                break;
            default:
                contentHtml = `
                    <sl-tooltip content="Delete note">
                        <sl-button variant="danger" size="small" class="note-entry-textarea-delete-btn" onclick="deleteNoteEntry(this)" pill>
                            <sl-icon name="trash"></sl-icon>
                        </sl-button>
                    </sl-tooltip>
                    <sl-textarea 
                        data-contentType="text"
                        data-createdAt="${entry.createdAt || Date.now()}"
                        value="${JSON.stringify(entry.content)}"
                        rows="3"
                        style="width: 100%; margin-bottom: 0.5rem;">
                    </sl-textarea>
                `;
        }
        
        const entryHtml = `
            <div class="note-entry" data-entry-id="${entry.id || crypto.randomUUID()}">
                <div class="note-entry-content">
                    ${contentHtml}
                </div>
            </div>
        `;
        
        noteEntriesContainer.append(entryHtml);
    });
}

function deleteNote(noteId, sceneItemId) {
    if (confirm('Are you sure you want to delete this note? This also removes it from your scenes.')) {
        noteEntries.entries = noteEntries.entries.filter(j => j.id !== noteId);

        // Save updated entries
        streamlabs.userSettings.set('streamNoteEntries', noteEntries).then(() => {
            // if the source is in a scene, remove it
           // console.log(noteEntries);
            streamlabsOBS.v1.Scenes.getScenes().then(scenes => {
                //console.log('Current scenes:', scenes);
                const sceneWithSource = scenes.find(scene => scene.nodes.some(node => node.id === sceneItemId));
                if (sceneWithSource) {
                    let saveScene = structuredClone(sceneWithSource);
                    console.log(saveScene, sceneItemId);
                    streamlabsOBS.v1.Scenes.removeSceneItem(sceneWithSource.id, sceneItemId);
                }
                
            });
        });
            
        // Check if current page is now empty and adjust if needed
        const sortedNotes = [...noteEntries.entries].sort((a, b) => b.creationDate - a.creationDate);
        const totalPages = sortedNotes.length <= 5 ? 1 : Math.ceil((sortedNotes.length - 5) / 6) + 1;
        
        if (currentPage >= totalPages && currentPage > 0) {
            currentPage = totalPages - 1;
        }
        
        // Refresh the grid
        populateNoteGrid();
        
        console.log('Deleted note:', noteId);
    }
}

$("#addAppSource").on('click', () => { 
    if(!canAddSource) return;
    
    // Show the scene selection modal
    openSceneSelectionModal();
});

function showAlert(element, title, content, variant = 'primary') {
    const alertElement = $(element)[0];
    const iconMap = {
        'primary': 'info-circle',
        'success': 'check2-circle',
        'warning': 'exclamation-triangle',
        'danger': 'exclamation-octagon'
    };
    
    // Set the variant and icon
    alertElement.variant = variant;
    $(element).find('sl-icon[slot="icon"]').attr('name', iconMap[variant] || 'info-circle');
    
    // Set the content
    alertElement.show();
    $(element).find('.alert-title').text(title);
    $(element).find('.alert-content').text(content);
}

// Scene Selection Modal Functions
function openSceneSelectionModal() {
    // Show modal first
    $('#sceneModal').addClass('active');
    selectedSceneId = null;
    $('#sceneModalConfirm').removeClass('visible');
    
    // Load scenes and populate modal
    loadScenesData().then(() => {
        // Ensure scene list is populated
        populateSceneList();
        // Set the active scene as initially selected and update button text
        if (activeSceneId) {
            const activeScene = availableScenes.find(scene => scene.id === activeSceneId);
            if (activeScene) {
                selectedSceneId = activeSceneId;
                $('#sceneModalConfirm').addClass('visible');
                $(`.scene-item[data-scene-id="${activeSceneId}"]`).addClass('selected');
            }
        }
    });
}

function closeSceneSelectionModal() {
    $('#sceneModal').removeClass('active');
    selectedSceneId = null;
}

async function loadScenesData() {
    try {
        // Get all scenes and active scene
        const [scenes, activeScene] = await Promise.all([
            streamlabsOBS.v1.Scenes.getScenes(),
            streamlabsOBS.v1.Scenes.getActiveScene()
        ]);
        
        availableScenes = scenes;
        activeSceneId = activeScene.id;
        
    } catch (error) {
        console.error('Error loading scenes data:', error);
        if ($('#sceneModal').hasClass('active')) {
            showAlert('#generalAlert', 'Error', 'Failed to load scenes data.', 'danger');
        }
    }
}

function populateSceneList() {
    const sceneListContainer = $('#sceneList');
    sceneListContainer.empty();
    
    availableScenes.forEach(scene => {
        const isActive = scene.id === activeSceneId;
        const badgeHtml = isActive ? ' <sl-badge variant="primary">Current</sl-badge>' : '';
        const sceneItem = $(`
            <div class="scene-item ${isActive ? 'selected' : ''}" data-scene-id="${scene.id}">
                ${scene.name}${badgeHtml}
            </div>
        `);
        
        sceneItem.on('click', () => selectScene(scene));
        sceneListContainer.append(sceneItem);
    });
}

function selectScene(scene) {
    // Update UI
    $('.scene-item').removeClass('selected');
    $(`.scene-item[data-scene-id="${scene.id}"]`).addClass('selected');
    
    selectedSceneId = scene.id;
    $('#sceneModalConfirm').addClass('visible');
}

// Get current journal data for saving to source settings
function getCurrentNoteData() {
    if (!currentNoteId) return null;
    
    const note = noteEntries.entries.find(j => j.id === currentNoteId);
    if (!note) return null;
    
    // Collect the latest data from UI before returning
    collectNoteData();
    
    return {
        currentNoteId: currentNoteId,
        noteData: note
    };
}

async function confirmAddToScene() {
    if (!selectedSceneId) return;

    // Get current note data
    const currentNoteData = getCurrentNoteData();
    console.log('Current note data for source settings:', currentNoteData);
    
    try {
        const source = await streamlabsOBS.v1.Sources.createAppSource(currentNoteData.noteData.name, 'bb-stream-notepad');
        await streamlabsOBS.v1.Sources.setAppSourceSettings(source.id, currentNoteData.currentNoteId);
        const sceneItem = await streamlabsOBS.v1.Scenes.createSceneItem(selectedSceneId, source.id);
        console.log(`Added ${currentNoteData.noteData.name} to scene:`, {
            id: sceneItem.id,
            sourceId: sceneItem.sourceId,
        });
         // Update the note card in the grid view to include the source ID
        const noteCard = $(`#journal-${currentNoteData.currentNoteId}`);
        if (noteCard.length) {
            noteCard.attr('data-sceneitem-id', sceneItem.id);
            // Also update the delete button to include the source ID
            noteCard.find('.note-delete-btn').attr('data-sceneitem-id', sceneItem.id);
        }
        
        closeSceneSelectionModal();
        streamlabsOBS.v1.App.navigate('Editor');
        
    } catch (error) {
        console.error('Error adding source to scene:', error);
        showAlert('#generalAlert', 'Error', 'Failed to add source to scene.', 'danger');
    }
}

// Modal event handlers
$(document).ready(() => {
    $('#cancelSceneModal').on('click', closeSceneSelectionModal);
    $('#confirmAddSource').on('click', confirmAddToScene);
    
    // Close app button handler
    $('#closeApp').on('click', () => {
        streamlabsOBS.v1.App.navigate('Editor');
    });
    
    // Close modal when clicking outside
    $('#sceneModal').on('click', (e) => {
        if (e.target.id === 'sceneModal') {
            closeSceneSelectionModal();
        }
    });
    
    $(document).on('click', '#createNewNote', function() {
        createNewNote();
    });
    
    $('#cancelCreateNote').on('click', closeCreateNoteModal);
    $('#confirmCreateNote').on('click', confirmCreateNote);
    
    // Close create journal modal when clicking outside
    $('#createNoteModal').on('click', (e) => {
        if (e.target.id === 'createNoteModal') {
            closeCreateNoteModal();
        }
    });
    
    // Handle Enter key in Note name input
    $('#noteNameInput').on('keypress', (e) => {
        if (e.which === 13) { // Enter key
            confirmCreateNote();
        }
    });
    
    // Pagination button handlers (using event delegation since buttons are dynamically created)
    $(document).on('click', '#nextPage', goToNextPage);
    $(document).on('click', '#prevPage', goToPreviousPage);
    
    // Journal view navigation with auto-save
    $('#backToNoteList').on('click', function() {
        console.log('Navigating back to journal list');
        
        // Collect and save data before navigation
        collectNoteData();
        saveNoteEntries();

        showNoteList();
    });
    
    // Delete journal from grid (using event delegation since buttons are dynamically created)
    $(document).on('click', '.note-delete-btn', function(e) {
        e.stopPropagation(); // Prevent card click from firing
        const noteId = $(this).attr('data-note-id');
        const sceneItemId = $(this).attr('data-sceneitem-id');
        if (noteId) {
            deleteNote(noteId, sceneItemId);
        }
    });
    
    // Toolbar button handlers (now in fixed location)
    $(document).on('click', '.note-entry-toolbar .toolbar-btn[data-type="text"]', function() {
        // Find the journal entries container and add a new text entry
        const noteEntriesContainer = $('#noteEntries');
        addTextEntryToContainer(noteEntriesContainer);
    });
    
    $(document).on('click', '.note-entry-toolbar .toolbar-btn[data-type="task"]', function() {
        // Store reference to the journal entries container for later use
        window.currentnoteEntriesContainer = $('#noteEntries');
        
        // Clear and show the task dialog
        $('#taskInput').val('');
        
        // Ensure dialog is in "add" mode
        editingtaskItem = null;
        $('#taskDialog')[0].label = 'Add task Item';
        $('#confirmtask').text('Add task');
        
        document.getElementById('taskDialog').show();
    });
    
    $(document).on('click', '.note-entry-toolbar .toolbar-btn[data-type="reminder"]', function() {
        // Store reference to the journal entries container for later use
        window.currentnoteEntriesContainer = $('#noteEntries');
        
        // Clear and show the reminder dialog
        $('#reminderNameInput').val('');
        $('#reminderDateInput').val('');
        
        // Ensure dialog is in "add" mode
        editingReminderItem = null;
        $('#reminderDialog')[0].label = 'Add Reminder';
        $('#confirmReminder').text('Add Reminder');
        
        // Set default date to current time + 1 hour
        const defaultDate = new Date();
        defaultDate.setHours(defaultDate.getHours() + 1);
        const isoString = defaultDate.toISOString().slice(0, 16); // Format for datetime-local
        $('#reminderDateInput').val(isoString);
        
        document.getElementById('reminderDialog').show();
    });
    
    // task checkbox handler
    $(document).on('sl-change', '.task-checkbox', function() {
        const taskItem = $(this).closest('.task-item');
        const taskText = taskItem.find('.task-text');
        const isCompleted = $(this).prop('checked');
        console.log('task item completed status changed:', isCompleted);
        
        // Update CSS class and data attribute
        taskItem.toggleClass('completed', isCompleted);
        taskItem.attr('data-completed', isCompleted ? 'true' : 'false');
        
        // Update the inline style on the task text
        if (isCompleted) {
            taskText.css('text-decoration', 'line-through');
        } else {
            taskText.css('text-decoration', 'none');
        }
        
        // Trigger auto-save
        hasUnsavedChanges = true;
        debouncedSave();
    });
    
    // Dialog event handlers
    $('#canceltask').on('click', function() {
        // Reset editing state
        editingtaskItem = null;
        $('#taskDialog')[0].label = 'Add task Item';
        $('#confirmtask').text('Add task');
        document.getElementById('taskDialog').hide();
    });
    
    $('#confirmtask').on('click', function() {
        confirmAddtask();
    });
    
    $('#cancelReminder').on('click', function() {
        // Reset editing state
        editingReminderItem = null;
        $('#reminderDialog')[0].label = 'Add Reminder';
        $('#confirmReminder').text('Add Reminder');
        document.getElementById('reminderDialog').hide();
    });
    
    $('#confirmReminder').on('click', function() {
        confirmAddReminder();
    });
    
    // Handle Enter key in dialog inputs
    $('#taskInput').on('keypress', function(e) {
        if (e.which === 13) {
            confirmAddtask();
        }
    });
    
    // Edit Journal modal handlers
    $('#editnoteTitle').on('click', function() {
        openEditNoteModal();
    });
    
    $('#cancelEditJournal').on('click', function() {
        closeEditNoteModal();
    });
    
    $('#confirmEditNote').on('click', function() {
        confirmEditNote();
    });
    
    // Handle Enter key in edit journal input
    $('#editnoteNameInput').on('keypress', function(e) {
        if (e.which === 13) {
            confirmEditNote();
        }
    });
    
    // Close edit journal modal when clicking outside
    $('#editNoteModal').on('click', function(e) {
        if (e.target.id === 'editNoteModal') {
            closeEditNoteModal();
        }
    });
});

function showNoteList() {
    // Clear current journal ID
    currentNoteId = null;
    
    // Stop periodic reminder due date checking
    stopReminderChecking();
    
    // Hide journal view and show journal list
    $('#journalView').removeClass('active');
    $('#step1').addClass('active');
}

function createNewNote() {
    // Show the create journal modal
    opencreateNoteModal();
}

function opencreateNoteModal() {
    // Get current day of the week
    const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    
    // Update the author text with current username
    $('#noteAuthor').text(`By ${username || 'Username'}`);
    $('#createNoteModal').addClass('active');
    $('#noteNameInput').val(''); // Clear the input
    $('#noteNameInput').attr('placeholder', `${currentDay} Stream Notes`); // Set dynamic placeholder
    $('#noteNameInput').focus(); // Focus on input
}

function closeCreateNoteModal() {
    $('#createNoteModal').removeClass('active');
    $('#noteNameInput').val(''); // Clear the input
}

function confirmCreateNote() {
    let noteName = $('#noteNameInput').val().trim();
    
    if (!noteName) {
        const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        noteName = `${currentDay} Stream Notes`;
    }
    
    // Check if noteEntries exists and has entries array
    if (!noteEntries || !noteEntries.entries) {
        console.log(noteEntries);
        console.error('noteEntries not properly initialized');
        showAlert('#generalAlert', 'Error', 'Note system not properly initialized. Please refresh the page.', 'danger');
        return;
    }
    
    const existingNote = noteEntries.entries.find(j => j.name.toLowerCase() === noteName.toLowerCase());
    if (existingNote) {
        showAlert('#generalAlert', 'Name Already Exists', 'A journal with this name already exists. Please choose a different name.', 'warning');
        return;
    }
    
    const newNote = {
        id: crypto.randomUUID(),
        name: noteName,
        creationDate: Date.now(),
        entries: []
    };
    
    // Add to entries
    noteEntries.entries.push(newNote);
    
    // Save to settings
    streamlabs.userSettings.set('streamNoteEntries', noteEntries).then(() => {
        streamlabs.postMessage('update', {});
    });
    
    // Close modal
    closeCreateNoteModal();
    
    populateNoteGrid();
    showNoteView(newNote);
    
    console.log('Created new note:', newNote);
}

function addTextEntryToContainer(container) {
    const currentTime = Date.now();
    const entryId = crypto.randomUUID();
    const entryHtml = `
        <div class="note-entry" data-entry-id="${entryId}">
            <sl-tooltip content="Delete note">
                <sl-button variant="danger" size="small" class="note-entry-textarea-delete-btn" onclick="deleteNoteEntry(this)" pill>
                    <sl-icon name="trash"></sl-icon>
                </sl-button>
            </sl-tooltip>
            <div class="note-entry-content">
                <sl-textarea 
                    data-contentType="text"
                    data-createdAt="${currentTime}"
                    placeholder="Write your note..."
                    rows="3"
                    style="width: 100%;">
                </sl-textarea>
            </div>
        </div>
    `;
    
    container.append(entryHtml);
    
    // Trigger auto-save
    hasUnsavedChanges = true;
    debouncedSave();
    
    // Focus the newly created textarea after it's rendered
    setTimeout(() => {
        const newTextarea = container.find(`[data-entry-id="${entryId}"] sl-textarea`).last()[0];
        if (newTextarea) {
            newTextarea.focus();
        }
    }, 50);
}

function addtaskEntry(journalEntryElement) {
    // Store reference to the journal entry element for later use
    window.currentJournalEntry = journalEntryElement;
    
    // Clear and show the task dialog
    $('#taskInput').val('');
    document.getElementById('taskDialog').show();
}

function addReminderEntry(journalEntryElement) {
    // Store reference to the journal entry element for later use
    window.currentJournalEntry = journalEntryElement;
    
    // Clear and show the reminder dialog
    $('#reminderNameInput').val('');
    $('#reminderDateInput').val('');
    
    // Set default date to current time + 1 hour
    const defaultDate = new Date();
    defaultDate.setHours(defaultDate.getHours() + 1);
    const isoString = defaultDate.toISOString().slice(0, 16); // Format for datetime-local
    $('#reminderDateInput').val(isoString);
    
    document.getElementById('reminderDialog').show();
}

// Dialog confirmation functions
function confirmAddtask() {
    const taskText = $('#taskInput').val().trim();
    if (!taskText) {
        showAlert('#generalAlert', 'Invalid Input', 'Please enter a task item.', 'warning');
        return;
    }
    
    // Check if we're editing an existing task
    if (editingtaskItem) {
        // Update existing task
        editingtaskItem.attr('data-task-text', taskText);
        editingtaskItem.find('.task-text').text(taskText);
        
        // Clear editing state
        editingtaskItem = null;
        
        // Reset dialog title and button text
        $('#taskDialog')[0].label = 'Add task Item';
        $('#confirmtask').text('Add task');
        
        // Trigger auto-save
        hasUnsavedChanges = true;
        debouncedSave();
    } else {
        // Create new task
        const currentTime = Date.now();
        const entryId = crypto.randomUUID();
        const entryHtml = `
            <div class="note-entry" data-entry-id="${entryId}">
                <div class="note-entry-content">
                    <div class="task-item" 
                         data-contentType="task" 
                         data-createdAt="${currentTime}"
                         data-completed="false"
                         data-task-text="${taskText}">
                         
                        <!-- Edit Button -->
                        <sl-tooltip content="Edit task">
                            <sl-button variant="neutral" size="small" class="task-edit-btn" onclick="edittask(this)" pill>
                                <sl-icon name="pencil"></sl-icon>
                            </sl-button>
                        </sl-tooltip>

                        <sl-tooltip content="Delete task">
                            <sl-button variant="danger" size="small" class="note-entry-delete-btn" onclick="deleteNoteEntry(this)" pill>
                                <sl-icon name="trash"></sl-icon>
                            </sl-button>
                        </sl-tooltip>
                        
                        <sl-checkbox class="task-checkbox"></sl-checkbox>
                        <span class="task-text">${taskText}</span>
                    </div>
                </div>
            </div>
        `;
        
        window.currentnoteEntriesContainer.append(entryHtml);
        
        // Trigger auto-save
        hasUnsavedChanges = true;
        debouncedSave();
    }
    
    document.getElementById('taskDialog').hide();
}

function confirmAddReminder() {
    const reminderName = $('#reminderNameInput').val().trim();
    const dueDateInput = $('#reminderDateInput').val();
    
    if (!reminderName) {
        showAlert('#generalAlert', 'Invalid Input', 'Please enter a reminder name.', 'warning');
        return;
    }
    
    if (!dueDateInput) {
        showAlert('#generalAlert', 'Invalid Input', 'Please select a due date.', 'warning');
        return;
    }
    
    const dueDate = new Date(dueDateInput);
    if (isNaN(dueDate.getTime())) {
        showAlert('#generalAlert', 'Invalid Date', 'Please enter a valid date.', 'warning');
        return;
    }
    
    const currentTime = Date.now();
    const formattedDueDate = dueDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
    
    // Check if we're editing an existing reminder
    if (editingReminderItem) {
        // Update existing reminder
        editingReminderItem.attr('data-title', reminderName);
        editingReminderItem.attr('data-dueDate', dueDate.getTime());
        
        // Check if the reminder is due and update CSS class
        const isDue = dueDate <= new Date();
        if (isDue) {
            editingReminderItem.addClass('due');
        } else {
            editingReminderItem.removeClass('due');
        }
        
        // Update display content
        editingReminderItem.find('.reminder-title strong').text(reminderName);
        editingReminderItem.find('.reminder-due-date').text(`Due: ${formattedDueDate}`);
        
        // Clear editing state
        editingReminderItem = null;
        
        // Reset dialog title and button text
        $('#reminderDialog')[0].label = 'Add Reminder';
        $('#confirmReminder').text('Add Reminder');
        
        // Trigger auto-save
        hasUnsavedChanges = true;
        debouncedSave();
    } else {
        // Create new reminder
        const entryId = crypto.randomUUID();
        
        // Check if the reminder is due
        const isDue = dueDate <= new Date();
        const dueClass = isDue ? ' due' : '';
        
        const entryHtml = `
            <div class="note-entry" data-entry-id="${entryId}">
                <div class="note-entry-content">
                    <div class="reminder-item${dueClass}" 
                         data-contentType="reminder" 
                         data-createdAt="${currentTime}"
                         data-dueDate="${dueDate.getTime()}"
                         data-title="${reminderName}">
                        
                        <!-- Edit Button -->
                        <sl-tooltip content="Edit reminder">
                            <sl-button variant="neutral" size="small" class="reminder-edit-btn" onclick="editReminder(this)" pill>
                                <sl-icon name="pencil"></sl-icon>
                            </sl-button>
                        </sl-tooltip>

                        <sl-tooltip content="Delete reminder">
                            <sl-button variant="danger" size="small" class="note-entry-delete-btn" onclick="deleteNoteEntry(this)" pill>
                                <sl-icon name="trash"></sl-icon>
                            </sl-button>
                        </sl-tooltip>
                        
                        <!-- Display Content -->
                        <div class="reminder-title">
                            <strong>${reminderName}</strong>
                        </div>
                        <div class="reminder-due-date">
                            Due: ${formattedDueDate}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        window.currentnoteEntriesContainer.append(entryHtml);
        
        // Trigger auto-save
        hasUnsavedChanges = true;
        debouncedSave();
    }
    
    document.getElementById('reminderDialog').hide();
}

function openEditNoteModal() {
    if (!currentNoteId) return;
    
    const note = noteEntries.entries.find(j => j.id === currentNoteId);
    if (!note) return;

    // Pre-fill the input with current note name
    $('#editnoteNameInput').val(note.name);
    
    // Update the author text with current username
    $('#editnoteAuthor').text(`By ${username || 'Username'}`);
    
    $('#editNoteModal').addClass('active');
    $('#editnoteNameInput').focus();
}

function closeEditNoteModal() {
    $('#editNoteModal').removeClass('active');
    $('#editnoteNameInput').val('');
}

function confirmEditNote() {
    if (!currentNoteId) return;
    
    const newNoteName = $('#editnoteNameInput').val().trim();
    
    if (!newNoteName) {
        showAlert('#generalAlert', 'Invalid Name', 'Please enter a valid Note name.', 'warning');
        return;
    }
    
    // Check if Note name already exists (excluding current journal)
    const existingNote = noteEntries.entries.find(j => 
        j.id !== currentNoteId && 
        j.name.toLowerCase() === newNoteName.toLowerCase()
    );
    if (existingNote) {
        showAlert('#generalAlert', 'Name Already Exists', 'A journal with this name already exists. Please choose a different name.', 'warning');
        return;
    }
    
    // Find and update the journal
    const noteIndex = noteEntries.entries.findIndex(j => j.id === currentNoteId);
    if (noteIndex === -1) return;
    
    const oldName = noteEntries.entries[noteIndex].name;
    noteEntries.entries[noteIndex].name = newNoteName;
    
    // Save updated entries to settings
    streamlabs.userSettings.set('streamNoteEntries', noteEntries).then(() => {
        streamlabs.postMessage('update', {});
    });
    
    
    // Update the UI
    $('#noteTitle').text(newNoteName);
    
    // Refresh the journal grid to update the title there as well
    populateNoteGrid();
    
    // Close modal
    closeEditNoteModal();
    
    console.log(`Updated Note name from "${oldName}" to "${newNoteName}"`);
    showAlert('#generalAlert', 'Note Updated', `Note name updated to "${newNoteName}" successfully!`, 'success');
}

// Auto-save event bindings for input changes
$(document).ready(function() {
    // Trigger auto-save on textarea input changes
    $(document).on('input', 'sl-textarea[data-contentType="text"]', function() {
        console.log('Text content changed, triggering auto-save');
        hasUnsavedChanges = true;
        debouncedSave();
    });
    
    // Trigger auto-save on task checkbox changes
    $(document).on('click', '.task-checkbox', function() {
        console.log('task checkbox changed, triggering auto-save');
        hasUnsavedChanges = true;
        debouncedSave();
    });
    
    // Trigger auto-save on any other input changes within journal entries
    $(document).on('input change', '#noteEntries input, #noteEntries textarea, #noteEntries sl-input, #noteEntries sl-textarea', function() {
        console.log('Input changed, triggering auto-save');
        hasUnsavedChanges = true;
        debouncedSave();
    });
});

// Global variable to track if we're editing an existing reminder
let editingReminderItem = null;

// Global variable to track if we're editing an existing task
let editingtaskItem = null;

// Edit Reminder Function
window.editReminder = function(button) {
    const reminderItem = $(button).closest('.reminder-item');
    editingReminderItem = reminderItem;
    
    // Get current values
    const currentTitle = reminderItem.attr('data-title') || '';
    const currentDueDate = parseInt(reminderItem.attr('data-dueDate')) || Date.now();
    
    // Format date for datetime-local input
    const dueDateForInput = new Date(currentDueDate).toISOString().slice(0, 16);
    
    // Populate the dialog with current values
    $('#reminderNameInput')[0].value = currentTitle;
    $('#reminderDateInput')[0].value = dueDateForInput;
    
    // Change dialog title and button text to indicate editing
    $('#reminderDialog')[0].label = 'Edit Reminder';
    $('#confirmReminder').text('Save Reminder');
    
    // Show the dialog
    $('#reminderDialog')[0].show();
};

// Edit task Function
window.edittask = function(button) {
    const taskItem = $(button).closest('.task-item');
    editingtaskItem = taskItem;
    
    // Get current task text
    const currentText = taskItem.attr('data-task-text') || taskItem.find('.task-text').text();
    
    // Populate the dialog with current value
    $('#taskInput')[0].value = currentText;
    
    // Change dialog title and button text to indicate editing
    $('#taskDialog')[0].label = 'Edit task Item';
    $('#confirmtask').text('Save task');
    
    // Show the dialog
    $('#taskDialog')[0].show();
};

// Delete Note Entry Function
window.deleteNoteEntry = function(button) {

    if (confirm('Are you sure you want to delete this note? This action cannot be undone.')) {
        const noteEntry = $(button).closest('.note-entry');
        noteEntry.remove();
        
        // Trigger auto-save
        hasUnsavedChanges = true;
        debouncedSave();
    }
};