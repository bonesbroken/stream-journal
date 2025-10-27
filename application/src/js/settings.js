import $ from "jquery";
import { defaultWebcamFrameSettings } from './utils.js';
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

let defaultJournal = {
    id: crypto.randomUUID(),
    name: 'My Stream Journal',
    creationDate: Date.now(),
    entries: [
        {
            id: crypto.randomUUID(),
            contentType: 'text',
            content: 'First journal entry!',
            createdAt: Date.now()
        },
        {
            id: crypto.randomUUID(),
            contentType: 'todo',
            content: {
                description: 'Kill the Ender Dragon',
                completed: false
            },
            createdAt: Date.now()
        },
        {
            id: crypto.randomUUID(),
            contentType: 'todo',
            content: {
                description: 'Get 10 Kills',
                completed: false
            },
            createdAt: Date.now()
        },
        {
            id: crypto.randomUUID(),
            contentType: 'reminder',
            content: {
                title: 'Get a bucket of milk',
                dueDate: Date.now() + 3600000, // 1 hour from now
                completed: false
            },
            createdAt: Date.now()
        },
    ]
}
let username = "";
let twitchImage = "";

let journalEntries = {entries: [defaultJournal]};

// Scene selection state
let availableScenes = [];
let activeSceneId = null;
let selectedSceneId = null;

// Pagination state
let currentPage = 0;
const itemsPerPage = 5; // 5 journals + 1 "Create New" = 6 total

// Current journal state
let currentJournalId = null;

// Auto-save functionality
let autoSaveTimeout = null;
let hasUnsavedChanges = false;

// Debounced save function - saves after 2 seconds of no changes
function debouncedSave() {
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
    }
    
    hasUnsavedChanges = true;
    
    autoSaveTimeout = setTimeout(() => {
        if (hasUnsavedChanges) {
            collectJournalData();
            saveJournalEntries();
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
        await loadJournalEntries();

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

                streamlabsOBS.v1.Sources.getAppSourceSettings(nav.sourceId).then(loadedSettings => {
                    existingSource = nav.sourceId;

                    if(!loadedSettings) {
                        console.log('New source, no settings');
   
                        
                    } else {
                        console.log('Source updated from stored settings', loadedSettings);
                    }
                });  
            } else {
                existingSource = null;
                // Accesses via side nav, load saved settings
                console.log('Accessed via side nav');
            }
        });
    });
}

async function loadJournalEntries() {
    streamlabs.userSettings.get('streamJournalEntries').then(data => {
        if (!data) {
            console.log("no settings found, reverting to default")
            return;
        }
        if (typeof data == "object") {
            journalEntries = structuredClone(data);
            
            // Populate journal entries in the UI
            populateJournalGrid();
        }
    });

    return new Promise((resolve) => {
        setTimeout(() => {
            console.log('loaded Journal Entries:', journalEntries);
            resolve();
        }, 1000);
    });
}

async function saveJournalEntries() {
    try {
        await streamlabs.userSettings.set('streamJournalEntries', journalEntries);
        console.log('Journal entries saved successfully');
        return true;
    } catch (error) {
        console.error('Error saving journal entries:', error);
        showAlert('#generalAlert', 'Save Error', 'Failed to save journal entries.', 'danger');
        return false;
    }
}

// Collect journal data from the current journal view UI
function collectJournalData() {
    if (!currentJournalId) return;
    
    const journalIndex = journalEntries.entries.findIndex(j => j.id === currentJournalId);
    if (journalIndex === -1) return;
    
    const collectedEntries = [];
    
    // Get all journal entries from the UI
    $('#journalEntries .journal-entry').each(function() {
        const entryElement = $(this);
        
        // Skip if this is the empty journal entry with toolbar (no header)
        if (entryElement.find('.journal-entry-header').length === 0) {
            
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
            
            // Collect todo items
            entryElement.find('.todo-item[data-contentType="todo"]').each(function() {
                const todoItem = $(this);
                const text = todoItem.attr('data-todo-text') || todoItem.find('.todo-text').text();
                const completed = todoItem.attr('data-completed') === 'true';
                const createdAt = parseInt(todoItem.attr('data-createdAt')) || Date.now();
                
                if (text && text.trim()) {
                    collectedEntries.push({
                        id: crypto.randomUUID(),
                        contentType: 'todo',
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
    journalEntries.entries[journalIndex].entries = collectedEntries;
    
    console.log('Collected journal data:', collectedEntries);
}

function updateUI(settings, newSource) {
    console.log('Updating UI with settings:', settings, 'New source:', newSource);

    if(newSource === 'new') {
        $('#saveAppSource').hide();
    } else {
        $('#saveAppSource').show();
    }
    
}

function populateJournalGrid() {
    const journalGrid = $('.journal-grid');
    
    // Clear existing journal cards
    journalGrid.find('.journal-card').remove();
    
    // Sort journals by creation date (newest first)
    const sortedJournals = [...journalEntries.entries].sort((a, b) => b.creationDate - a.creationDate);
    
    // Only show "Create New" button on the first page (page 0)
    if (currentPage === 0) {
        const createNewCard = $(`
            <div class="journal-card create-new" id="createNewJournal">
                <div class="journal-icon">
                    <sl-icon name="plus-circle" style="font-size: 3rem; color: var(--sl-color-primary-500);" aria-hidden="true" library="default"></sl-icon>
                </div>
                <h3>Create Notepad</h3>
            </div>
        `);
        journalGrid.append(createNewCard);
    }
    
    // Calculate pagination based on available space
    // Page 0: 5 journals (1 slot used by "Create New" button)
    // Other pages: 6 journals (full grid)
    const journalsPerPage = currentPage === 0 ? 5 : 6;
    const startIndex = currentPage === 0 ? 0 : 5 + ((currentPage - 1) * 6);
    const endIndex = Math.min(startIndex + journalsPerPage, sortedJournals.length);
    const journalsToShow = sortedJournals.slice(startIndex, endIndex);
    
    // Calculate total pages correctly
    const totalPages = sortedJournals.length <= 5 ? 1 : Math.ceil((sortedJournals.length - 5) / 6) + 1;
    
    // Add each journal as a card
    journalsToShow.forEach((journal, index) => {
        
        // Pick a random color from the custom palette
        const colors = ['#f9fbe1', '#ecc1c4', '#e19ead', '#bde1f0', '#90a9d4', '#6b7bad'];
        const iconColor = colors[Math.floor(Math.random() * colors.length)];
        
        const journalCard = $(`
            <div class="journal-card existing" id="journal-${journal.id}" data-journal-id="${journal.id}">
                <sl-tooltip content="Delete Journal">
                    <sl-button class="journal-delete-btn" variant="danger" size="small" outline data-journal-id="${journal.id}" pill>
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
        journalCard.on('click', (e) => {
            // Don't load journal if clicking on delete button or its tooltip
            if ($(e.target).closest('.journal-delete-btn, sl-tooltip').length === 0) {
                loadJournal(journal.id);
            }
        });
        
        journalGrid.append(journalCard);
    });
    
    // Update pagination controls
    updatePaginationControls(currentPage, totalPages, sortedJournals.length);
    
    console.log(`Showing journals ${startIndex + 1}-${endIndex} of ${sortedJournals.length} (Page ${currentPage + 1}/${totalPages})`);
}

// Pagination functions
function updatePaginationControls(currentPageNum, totalPages, totalJournals) {
    let paginationHtml = '';
    
    if (totalPages > 1) {
        paginationHtml = `
            <div class="pagination-controls">
                <div class="pagination-info">
                    <span>Page ${currentPageNum + 1} of ${totalPages} (${totalJournals} journals)</span>
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
    const sortedJournals = [...journalEntries.entries].sort((a, b) => b.creationDate - a.creationDate);
    const totalPages = sortedJournals.length <= 5 ? 1 : Math.ceil((sortedJournals.length - 5) / 6) + 1;
    
    if (currentPage < totalPages - 1) {
        currentPage++;
        populateJournalGrid();
    }
}

function goToPreviousPage() {
    if (currentPage > 0) {
        currentPage--;
        populateJournalGrid();
    }
}

// Journal management functions
function selectJournal(journalId) {
    // Remove selected class from all cards
    $('.journal-card').removeClass('selected');
    
    // Add selected class to clicked card
    $(`.journal-card[data-journal-id="${journalId}"]`).addClass('selected');
    
    console.log('Selected journal:', journalId);
}

function loadJournal(journalId) {
    const journal = journalEntries.entries.find(j => j.id === journalId);
    if (journal) {
        console.log('Loading journal:', journal);
        
        // Show the journal view
        showJournalView(journal);
        
        //showAlert('#generalAlert', 'Journal Loaded', `Loaded "${journal.name}" successfully!`, 'success');
    }
}

function showJournalView(journal) {
    // Store the current journal ID
    currentJournalId = journal.id;
    
    // Hide the journal list step and show the journal view
    $('#step1').removeClass('active');
    $('#journalView').addClass('active');
    
    // Set journal title and formatted date
    $('#journalTitle').text(journal.name);
    
    // Set journal author
    $('#journalViewAuthor').text(`By ${username}`);
    
    // Format the creation date with full details and timezone
    const creationDate = new Date(journal.creationDate);
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
    
    // Populate journal entries
    populateJournalEntries(journal.entries);
}

function populateJournalEntries(entries) {
    const journalEntriesContainer = $('#journalEntries');
    journalEntriesContainer.empty();
    
    if (entries.length === 0) {
        const currentTime = Date.now();
        const entryId = crypto.randomUUID();
        journalEntriesContainer.append(`
            <div class="journal-entry" data-entry-id="${entryId}">
                <sl-tooltip content="Delete entry">
                    <sl-button variant="text" size="small" class="journal-entry-delete-btn" onclick="deleteJournalEntry(this)">
                        <sl-icon name="trash"></sl-icon>
                    </sl-button>
                </sl-tooltip>
                <div class="journal-entry-content">
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
            const newTextarea = journalEntriesContainer.find(`[data-entry-id="${entryId}"] sl-textarea`)[0];
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
                    <sl-textarea 
                        data-contentType="text"
                        data-createdAt="${entry.createdAt || Date.now()}"
                        value="${entry.content}"
                        rows="3"
                        style="width: 100%;">
                    </sl-textarea>
                `;
                break;
            case 'todo':
                const isCompleted = entry.content.completed || false;
                const completedAttr = isCompleted ? 'checked' : '';
                const todoText = entry.content.description || entry.content.title || '';
                contentHtml = `
                    <div class="todo-item" 
                         data-contentType="todo" 
                         data-createdAt="${entry.createdAt || Date.now()}"
                         data-completed="${isCompleted}"
                         data-todo-text="${todoText}">
                         
                        <!-- Edit Button -->
                        <sl-tooltip content="Edit todo">
                            <sl-button variant="text" size="small" class="todo-edit-btn" onclick="editTodo(this)">
                                <sl-icon name="pencil"></sl-icon>
                            </sl-button>
                        </sl-tooltip>
                        
                        <sl-checkbox class="todo-checkbox" ${completedAttr}></sl-checkbox>
                        <span class="todo-text" ${isCompleted ? 'style="text-decoration: line-through;"' : ''}>${todoText}</span>
                    </div>
                `;
                break;
            case 'reminder':
                const dueDate = new Date(entry.content.dueDate || Date.now());
                const formattedDate = dueDate.toLocaleDateString() + ' ' + dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                contentHtml = `
                    <div class="reminder-item" 
                         data-contentType="reminder" 
                         data-createdAt="${entry.createdAt || Date.now()}"
                         data-dueDate="${entry.content.dueDate || Date.now()}"
                         data-title="${entry.content.title || ''}">
                        
                        <!-- Edit Button -->
                        <sl-tooltip content="Edit reminder">
                            <sl-button variant="text" size="small" class="reminder-edit-btn" onclick="editReminder(this)">
                                <sl-icon name="pencil"></sl-icon>
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
                    <sl-textarea 
                        data-contentType="text"
                        data-createdAt="${entry.createdAt || Date.now()}"
                        value="${JSON.stringify(entry.content)}"
                        rows="3"
                        style="width: 100%; margin-bottom: 0.5rem;"></sl-textarea>
                `;
        }
        
        const entryHtml = `
            <div class="journal-entry" data-entry-id="${entry.id || crypto.randomUUID()}">
                <sl-tooltip content="Delete entry">
                    <sl-button variant="text" size="small" class="journal-entry-delete-btn" onclick="deleteJournalEntry(this)">
                        <sl-icon name="trash"></sl-icon>
                    </sl-button>
                </sl-tooltip>
                <div class="journal-entry-content">
                    ${contentHtml}
                </div>
            </div>
        `;
        
        journalEntriesContainer.append(entryHtml);
    });
}

function deleteJournal(journalId) {
    if (confirm('Are you sure you want to delete this journal? This action cannot be undone.')) {
        // Remove journal from entries
        journalEntries.entries = journalEntries.entries.filter(j => j.id !== journalId);
        
        // Save updated entries
        streamlabs.userSettings.set('streamJournalEntries', journalEntries);
        
        // Check if current page is now empty and adjust if needed
        const sortedJournals = [...journalEntries.entries].sort((a, b) => b.creationDate - a.creationDate);
        const totalPages = sortedJournals.length <= 5 ? 1 : Math.ceil((sortedJournals.length - 5) / 6) + 1;
        
        if (currentPage >= totalPages && currentPage > 0) {
            currentPage = totalPages - 1;
        }
        
        // Refresh the grid
        populateJournalGrid();
        
        console.log('Deleted journal:', journalId);
        showAlert('#generalAlert', 'Journal Deleted', 'Journal has been deleted successfully.', 'success');
    }
}

$("#saveAppSource").on('click', () => { 
    if(!canAddSource) return;

    if(existingSource) {
        streamlabsOBS.v1.Sources.updateSource({id: existingSource, name: 'Stream Journal'});
        streamlabsOBS.v1.Sources.setAppSourceSettings(existingSource, JSON.stringify(webcamSettings));
        streamlabsOBS.v1.App.navigate('Editor');
        existingSource = null;
    }
});


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

async function confirmAddToScene() {
    if (!selectedSceneId) return;
    
    try {
        const source = await streamlabsOBS.v1.Sources.createAppSource('Stream Notes', 'bb-stream-notepad');
        await streamlabsOBS.v1.Sources.setAppSourceSettings(source.id, JSON.stringify(webcamSettings));
        await streamlabsOBS.v1.Scenes.createSceneItem(selectedSceneId, source.id);
        
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
    
    // Create New Journal modal handlers
    $(document).on('click', '#createNewJournal', function() {
        createNewJournal();
    });
    
    $('#cancelCreateJournal').on('click', closeCreateJournalModal);
    $('#confirmCreateJournal').on('click', confirmCreateJournal);
    
    // Close create journal modal when clicking outside
    $('#createJournalModal').on('click', (e) => {
        if (e.target.id === 'createJournalModal') {
            closeCreateJournalModal();
        }
    });
    
    // Handle Enter key in journal name input
    $('#journalNameInput').on('keypress', (e) => {
        if (e.which === 13) { // Enter key
            confirmCreateJournal();
        }
    });
    
    // Pagination button handlers (using event delegation since buttons are dynamically created)
    $(document).on('click', '#nextPage', goToNextPage);
    $(document).on('click', '#prevPage', goToPreviousPage);
    
    // Journal view navigation with auto-save
    $('#backToJournalList').on('click', function() {
        console.log('Navigating back to journal list');
        
        // Collect and save data before navigation
        collectJournalData();
        saveJournalEntries();
        
        showJournalList();
    });
    
    // Delete journal from grid (using event delegation since buttons are dynamically created)
    $(document).on('click', '.journal-delete-btn', function(e) {
        e.stopPropagation(); // Prevent card click from firing
        const journalId = $(this).attr('data-journal-id');
        if (journalId) {
            deleteJournal(journalId);
        }
    });
    
    // Toolbar button handlers (now in fixed location)
    $(document).on('click', '.journal-entry-toolbar .toolbar-btn[data-type="text"]', function() {
        // Find the journal entries container and add a new text entry
        const journalEntriesContainer = $('#journalEntries');
        addTextEntryToContainer(journalEntriesContainer);
    });
    
    $(document).on('click', '.journal-entry-toolbar .toolbar-btn[data-type="todo"]', function() {
        // Store reference to the journal entries container for later use
        window.currentJournalEntriesContainer = $('#journalEntries');
        
        // Clear and show the todo dialog
        $('#todoInput').val('');
        
        // Ensure dialog is in "add" mode
        editingTodoItem = null;
        $('#todoDialog')[0].label = 'Add Todo Item';
        $('#confirmTodo').text('Add Todo');
        
        document.getElementById('todoDialog').show();
    });
    
    $(document).on('click', '.journal-entry-toolbar .toolbar-btn[data-type="reminder"]', function() {
        // Store reference to the journal entries container for later use
        window.currentJournalEntriesContainer = $('#journalEntries');
        
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
    
    // Todo checkbox handler
    $(document).on('sl-change', '.todo-checkbox', function() {
        const todoItem = $(this).closest('.todo-item');
        const isCompleted = $(this).prop('checked');
        console.log('Todo item completed status changed:', isCompleted);
        todoItem.toggleClass('completed', isCompleted);
        todoItem.attr('data-completed', isCompleted ? 'true' : 'false');
    });
    
    // Dialog event handlers
    $('#cancelTodo').on('click', function() {
        // Reset editing state
        editingTodoItem = null;
        $('#todoDialog')[0].label = 'Add Todo Item';
        $('#confirmTodo').text('Add Todo');
        document.getElementById('todoDialog').hide();
    });
    
    $('#confirmTodo').on('click', function() {
        confirmAddTodo();
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
    $('#todoInput').on('keypress', function(e) {
        if (e.which === 13) {
            confirmAddTodo();
        }
    });
    
    // Edit Journal modal handlers
    $('#editJournalTitle').on('click', function() {
        openEditJournalModal();
    });
    
    $('#cancelEditJournal').on('click', function() {
        closeEditJournalModal();
    });
    
    $('#confirmEditJournal').on('click', function() {
        confirmEditJournal();
    });
    
    // Handle Enter key in edit journal input
    $('#editJournalNameInput').on('keypress', function(e) {
        if (e.which === 13) {
            confirmEditJournal();
        }
    });
    
    // Close edit journal modal when clicking outside
    $('#editJournalModal').on('click', function(e) {
        if (e.target.id === 'editJournalModal') {
            closeEditJournalModal();
        }
    });
});

function showJournalList() {
    // Clear current journal ID
    currentJournalId = null;
    
    // Hide journal view and show journal list
    $('#journalView').removeClass('active');
    $('#step1').addClass('active');
}

function createNewJournal() {
    // Show the create journal modal
    openCreateJournalModal();
}

function openCreateJournalModal() {
    // Get current day of the week
    const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    
    // Update the author text with current username
    $('#journalAuthor').text(`By ${username || 'Username'}`);
    $('#createJournalModal').addClass('active');
    $('#journalNameInput').val(''); // Clear the input
    $('#journalNameInput').attr('placeholder', `${currentDay} Stream Notes`); // Set dynamic placeholder
    $('#journalNameInput').focus(); // Focus on input
}

function closeCreateJournalModal() {
    $('#createJournalModal').removeClass('active');
    $('#journalNameInput').val(''); // Clear the input
}

function confirmCreateJournal() {
    let journalName = $('#journalNameInput').val().trim();
    
    if (!journalName) {
        const currentDay = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        journalName = `${currentDay} Stream Notes`;
        showAlert('#generalAlert', 'Invalid Name', 'Please enter a valid journal name.', 'warning');
        return;
    }
    
    // Check if journal name already exists
    const existingJournal = journalEntries.entries.find(j => j.name.toLowerCase() === journalName.toLowerCase());
    if (existingJournal) {
        showAlert('#generalAlert', 'Name Already Exists', 'A journal with this name already exists. Please choose a different name.', 'warning');
        return;
    }
    
    const newJournal = {
        id: crypto.randomUUID(),
        name: journalName,
        creationDate: Date.now(),
        entries: []
    };
    
    // Add to entries
    journalEntries.entries.push(newJournal);
    
    // Save to settings
    streamlabs.userSettings.set('streamJournalEntries', journalEntries);
    
    // Close modal
    closeCreateJournalModal();
    
    populateJournalGrid();
    // Open the newly created journal
    showJournalView(newJournal);
    
    console.log('Created new journal:', newJournal);
    //showAlert('#generalAlert', 'Journal Created', `"${journalName}" has been created successfully!`, 'success');
}

// Toolbar entry creation functions
function addTextEntry(journalEntryElement) {
    const currentTime = Date.now();
    const textAreaHtml = `
        <sl-textarea 
            data-contentType="text"
            data-createdAt="${currentTime}"
            placeholder="Write your note..."
            rows="3"
            style="width: 100%;">
        </sl-textarea>
    `;
    
    journalEntryElement.find('.journal-entry-content').append(textAreaHtml);
}

function addTextEntryToContainer(container) {
    const currentTime = Date.now();
    const entryId = crypto.randomUUID();
    const entryHtml = `
        <div class="journal-entry" data-entry-id="${entryId}">
            <sl-tooltip content="Delete entry">
                <sl-button variant="text" size="small" class="journal-entry-delete-btn" onclick="deleteJournalEntry(this)">
                    <sl-icon name="trash"></sl-icon>
                </sl-button>
            </sl-tooltip>
            <div class="journal-entry-content">
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
    
    // Focus the newly created textarea after it's rendered
    setTimeout(() => {
        const newTextarea = container.find(`[data-entry-id="${entryId}"] sl-textarea`).last()[0];
        if (newTextarea) {
            newTextarea.focus();
        }
    }, 50);
}

function addTodoEntry(journalEntryElement) {
    // Store reference to the journal entry element for later use
    window.currentJournalEntry = journalEntryElement;
    
    // Clear and show the todo dialog
    $('#todoInput').val('');
    document.getElementById('todoDialog').show();
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
function confirmAddTodo() {
    const todoText = $('#todoInput').val().trim();
    if (!todoText) {
        showAlert('#generalAlert', 'Invalid Input', 'Please enter a todo item.', 'warning');
        return;
    }
    
    // Check if we're editing an existing todo
    if (editingTodoItem) {
        // Update existing todo
        editingTodoItem.attr('data-todo-text', todoText);
        editingTodoItem.find('.todo-text').text(todoText);
        
        // Clear editing state
        editingTodoItem = null;
        
        // Reset dialog title and button text
        $('#todoDialog')[0].label = 'Add Todo Item';
        $('#confirmTodo').text('Add Todo');
        
        // Trigger auto-save
        hasUnsavedChanges = true;
        debouncedSave();
    } else {
        // Create new todo
        const currentTime = Date.now();
        const entryId = crypto.randomUUID();
        const entryHtml = `
            <div class="journal-entry" data-entry-id="${entryId}">
                <sl-tooltip content="Delete entry">
                    <sl-button variant="text" size="small" class="journal-entry-delete-btn" onclick="deleteJournalEntry(this)">
                        <sl-icon name="trash"></sl-icon>
                    </sl-button>
                </sl-tooltip>
                <div class="journal-entry-content">
                    <div class="todo-item" 
                         data-contentType="todo" 
                         data-createdAt="${currentTime}"
                         data-completed="false"
                         data-todo-text="${todoText}">
                         
                        <!-- Edit Button -->
                        <sl-tooltip content="Edit todo">
                            <sl-button variant="text" size="small" class="todo-edit-btn" onclick="editTodo(this)">
                                <sl-icon name="pencil"></sl-icon>
                            </sl-button>
                        </sl-tooltip>
                        
                        <sl-checkbox class="todo-checkbox"></sl-checkbox>
                        <span class="todo-text">${todoText}</span>
                    </div>
                </div>
            </div>
        `;
        
        window.currentJournalEntriesContainer.append(entryHtml);
    }
    
    document.getElementById('todoDialog').hide();
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
        const entryHtml = `
            <div class="journal-entry" data-entry-id="${entryId}">
                <sl-tooltip content="Delete entry">
                    <sl-button variant="text" size="small" class="journal-entry-delete-btn" onclick="deleteJournalEntry(this)">
                        <sl-icon name="trash"></sl-icon>
                    </sl-button>
                </sl-tooltip>
                <div class="journal-entry-content">
                    <div class="reminder-item" 
                         data-contentType="reminder" 
                         data-createdAt="${currentTime}"
                         data-dueDate="${dueDate.getTime()}"
                         data-title="${reminderName}">
                        
                        <!-- Edit Button -->
                        <sl-tooltip content="Edit reminder">
                            <sl-button variant="text" size="small" class="reminder-edit-btn" onclick="editReminder(this)">
                                <sl-icon name="pencil"></sl-icon>
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
        
        window.currentJournalEntriesContainer.append(entryHtml);
    }
    
    document.getElementById('reminderDialog').hide();
}

// Edit Journal functions
function openEditJournalModal() {
    if (!currentJournalId) return;
    
    const journal = journalEntries.entries.find(j => j.id === currentJournalId);
    if (!journal) return;
    
    // Pre-fill the input with current journal name
    $('#editJournalNameInput').val(journal.name);
    
    // Update the author text with current username
    $('#editJournalAuthor').text(`By ${username || 'Username'}`);
    
    $('#editJournalModal').addClass('active');
    $('#editJournalNameInput').focus();
}

function closeEditJournalModal() {
    $('#editJournalModal').removeClass('active');
    $('#editJournalNameInput').val('');
}

function confirmEditJournal() {
    if (!currentJournalId) return;
    
    const newJournalName = $('#editJournalNameInput').val().trim();
    
    if (!newJournalName) {
        showAlert('#generalAlert', 'Invalid Name', 'Please enter a valid journal name.', 'warning');
        return;
    }
    
    // Check if journal name already exists (excluding current journal)
    const existingJournal = journalEntries.entries.find(j => 
        j.id !== currentJournalId && 
        j.name.toLowerCase() === newJournalName.toLowerCase()
    );
    if (existingJournal) {
        showAlert('#generalAlert', 'Name Already Exists', 'A journal with this name already exists. Please choose a different name.', 'warning');
        return;
    }
    
    // Find and update the journal
    const journalIndex = journalEntries.entries.findIndex(j => j.id === currentJournalId);
    if (journalIndex === -1) return;
    
    const oldName = journalEntries.entries[journalIndex].name;
    journalEntries.entries[journalIndex].name = newJournalName;
    
    // Save updated entries to settings
    streamlabs.userSettings.set('streamJournalEntries', journalEntries);
    
    // Update the UI
    $('#journalTitle').text(newJournalName);
    
    // Refresh the journal grid to update the title there as well
    populateJournalGrid();
    
    // Close modal
    closeEditJournalModal();
    
    console.log(`Updated journal name from "${oldName}" to "${newJournalName}"`);
    showAlert('#generalAlert', 'Journal Updated', `Journal name updated to "${newJournalName}" successfully!`, 'success');
}

// Auto-save event bindings for input changes
$(document).ready(function() {
    // Trigger auto-save on textarea input changes
    $(document).on('input', 'sl-textarea[data-contentType="text"]', function() {
        console.log('Text content changed, triggering auto-save');
        hasUnsavedChanges = true;
        debouncedSave();
    });
    
    // Trigger auto-save on todo checkbox changes
    $(document).on('click', '.todo-checkbox', function() {
        console.log('Todo checkbox changed, triggering auto-save');
        hasUnsavedChanges = true;
        debouncedSave();
    });
    
    // Trigger auto-save on any other input changes within journal entries
    $(document).on('input change', '#journalEntries input, #journalEntries textarea, #journalEntries sl-input, #journalEntries sl-textarea', function() {
        console.log('Input changed, triggering auto-save');
        hasUnsavedChanges = true;
        debouncedSave();
    });
});

// Global variable to track if we're editing an existing reminder
let editingReminderItem = null;

// Global variable to track if we're editing an existing todo
let editingTodoItem = null;

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

// Edit Todo Function
window.editTodo = function(button) {
    const todoItem = $(button).closest('.todo-item');
    editingTodoItem = todoItem;
    
    // Get current todo text
    const currentText = todoItem.attr('data-todo-text') || todoItem.find('.todo-text').text();
    
    // Populate the dialog with current value
    $('#todoInput')[0].value = currentText;
    
    // Change dialog title and button text to indicate editing
    $('#todoDialog')[0].label = 'Edit Todo Item';
    $('#confirmTodo').text('Save Todo');
    
    // Show the dialog
    $('#todoDialog')[0].show();
};

// Delete Journal Entry Function
window.deleteJournalEntry = function(button) {
    if (confirm('Are you sure you want to delete this entry? This action cannot be undone.')) {
        const journalEntry = $(button).closest('.journal-entry');
        journalEntry.remove();
        
        // Trigger auto-save
        hasUnsavedChanges = true;
        debouncedSave();
    }
};