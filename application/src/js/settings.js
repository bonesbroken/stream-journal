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
                title: 'Mine Wood',
                completed: false
            },
            createdAt: Date.now()
        },
        {
            id: crypto.randomUUID(),
            contentType: 'todo',
            content: {
                title: 'Kill the Ender Dragon',
                completed: false
            },
            createdAt: Date.now()
        },
        {
            id: crypto.randomUUID(),
            contentType: 'todo',
            content: {
                title: 'Get 10 Kills',
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


async function loadShoelaceElements() {
    await Promise.allSettled([
        customElements.whenDefined('sl-range'),
        customElements.whenDefined('sl-icon'),
        customElements.whenDefined('sl-select'),
        customElements.whenDefined('sl-details'),
        customElements.whenDefined('sl-range')
    ]);
}

$(function() {
    loadShoelaceElements();
    initApp();
});

async function initApp() {
    streamlabs = window.Streamlabs;
    streamlabs.init().then(async () => {
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
                <h3>Create New Journal</h3>
                <p>Start a fresh journal for your stream</p>
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
        const lastEditDate = new Date(journal.creationDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        
        // Pick a random color from the custom palette
        const colors = ['#f9fbe1', '#ecc1c4', '#e19ead', '#bde1f0', '#90a9d4', '#6b7bad'];
        const iconColor = colors[Math.floor(Math.random() * colors.length)];
        
        const journalCard = $(`
            <div class="journal-card existing" id="journal-${journal.id}" data-journal-id="${journal.id}">
                <div class="journal-icon">
                    <sl-icon name="journal-text" style="font-size: 3rem; color: ${iconColor};" aria-hidden="true" library="default"></sl-icon>
                </div>
                <h3>${journal.name}</h3>
                <p>Last edited: ${lastEditDate}</p>
            </div>
        `);
        
        // Add click handler for the entire card to load journal
        journalCard.on('click', () => {
            loadJournal(journal.id);
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
        
        showAlert('#generalAlert', 'Journal Loaded', `Loaded "${journal.name}" successfully!`, 'success');
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
        journalEntriesContainer.append(`
            <div class="journal-entry">
                <div class="journal-entry-content" style="text-align: center; color: var(--sl-color-neutral-500); font-style: italic;">
                    This journal is empty. No entries have been added yet.
                </div>
            </div>
        `);
        return;
    }
    
    // Sort entries by creation date (newest first)
    const sortedEntries = [...entries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    
    sortedEntries.forEach(entry => {
        const entryDate = new Date(entry.createdAt || Date.now());
        const entryTime = entryDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        
        let contentHtml = '';
        let typeLabel = entry.contentType.charAt(0).toUpperCase() + entry.contentType.slice(1);
        
        switch (entry.contentType) {
            case 'text':
                contentHtml = `<p>${entry.content}</p>`;
                break;
            case 'todo':
                const todoStatus = entry.content.completed ? 'completed' : 'pending';
                const todoIcon = entry.content.completed ? 'check-circle-fill' : 'circle';
                contentHtml = `
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <sl-icon name="${todoIcon}" style="color: ${entry.content.completed ? 'var(--sl-color-success-500)' : 'var(--sl-color-neutral-400)'}"></sl-icon>
                        <span style="${entry.content.completed ? 'text-decoration: line-through; color: var(--sl-color-neutral-500);' : ''}">${entry.content.title}</span>
                    </div>
                `;
                typeLabel = `Todo (${todoStatus})`;
                break;
            case 'reminder':
                const dueDate = new Date(entry.content.dueDate);
                const reminderStatus = entry.content.completed ? 'completed' : 'pending';
                contentHtml = `
                    <div>
                        <p><strong>${entry.content.title}</strong></p>
                        <p style="color: var(--sl-color-neutral-600); font-size: var(--sl-font-size-small);">
                            Due: ${dueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                    </div>
                `;
                typeLabel = `Reminder (${reminderStatus})`;
                break;
            default:
                contentHtml = `<p>${JSON.stringify(entry.content)}</p>`;
        }
        
        const entryHtml = `
            <div class="journal-entry">
                <div class="journal-entry-header">
                    <span class="journal-entry-type">${typeLabel}</span>
                    <span class="journal-entry-time">${entryTime}</span>
                </div>
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
        const source = await streamlabsOBS.v1.Sources.createAppSource('Stream Journal', 'bb-stream-journal');
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
    
    // Journal view navigation
    $('#backToJournalList').on('click', function() {
        showJournalList();
    });
    
    // Delete current journal from journal view
    $('#deleteCurrentJournal').on('click', function() {
        if (currentJournalId) {
            deleteCurrentJournal();
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

function deleteCurrentJournal() {
    if (!currentJournalId) return;
    
    const journal = journalEntries.entries.find(j => j.id === currentJournalId);
    if (!journal) return;
    
    if (confirm(`Are you sure you want to delete "${journal.name}"? This action cannot be undone.`)) {
        // Remove journal from entries
        journalEntries.entries = journalEntries.entries.filter(j => j.id !== currentJournalId);
        
        // Save updated entries
        streamlabs.userSettings.set('streamJournalEntries', journalEntries);
        
        // Go back to journal list
        showJournalList();
        
        // Check if current page is now empty and adjust if needed
        const sortedJournals = [...journalEntries.entries].sort((a, b) => b.creationDate - a.creationDate);
        const totalPages = sortedJournals.length <= 5 ? 1 : Math.ceil((sortedJournals.length - 5) / 6) + 1;
        
        if (currentPage >= totalPages && currentPage > 0) {
            currentPage = totalPages - 1;
        }
        
        // Refresh the grid
        populateJournalGrid();
        
        console.log('Deleted journal:', currentJournalId);
        showAlert('#generalAlert', 'Journal Deleted', 'Journal has been deleted successfully.', 'success');
        
        // Clear current journal ID
        currentJournalId = null;
    }
}

function createNewJournal() {
    // Show the create journal modal
    openCreateJournalModal();
}

function openCreateJournalModal() {
    $('#createJournalModal').addClass('active');
    $('#journalNameInput').val(''); // Clear the input
    $('#journalNameInput').focus(); // Focus on input
}

function closeCreateJournalModal() {
    $('#createJournalModal').removeClass('active');
    $('#journalNameInput').val(''); // Clear the input
}

function confirmCreateJournal() {
    const journalName = $('#journalNameInput').val().trim();
    
    if (!journalName) {
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
    showAlert('#generalAlert', 'Journal Created', `"${journalName}" has been created successfully!`, 'success');
}