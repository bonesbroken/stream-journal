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
let streamlabs;
let noteEntries = {};

// Reminder due date checking
let reminderCheckInterval = null;

// Function to check and update reminder due status
function checkReminderDueDates() {
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

async function loadShoelaceElements() {
    await Promise.allSettled([
        customElements.whenDefined('sl-range'),
        customElements.whenDefined('sl-icon'),
        customElements.whenDefined('sl-select'),
        customElements.whenDefined('sl-details'),
        customElements.whenDefined('sl-checkbox'),
    ]);
}

$(function() {
    loadShoelaceElements();
    initApp();
    
    // Stop reminder checking when page is about to unload
    $(window).on('beforeunload', function() {
        stopReminderChecking();
    });
});

async function initApp() {
    streamlabs = window.Streamlabs;
    streamlabs.init({receiveEvents: true}).then(async (data) => {
        console.log('Streamlabs initialized with data:', data);
        await loadnoteEntries();
    });

    streamlabs.onMessage(event => {
        switch(event.type) {
            case 'update':
                loadnoteEntries();
                break;

            default:
                console.log("streamlabs.onMessage()");
        }
    });
}

async function loadnoteEntries() {
    streamlabs.userSettings.get('streamNoteEntries').then(data => {
        if (!data) {
            console.log("no settings found, reverting to default");
            $('.container').hide();
            return;
        }
        if (typeof data == "object") {
            noteEntries = structuredClone(data);
            
            const query = location.search.substr(1);

            if (query && query.includes('settings=')) {
                query.split('&').forEach(part => {
                    const item = part.split('=');
                    if (item[0] === 'settings' && item[1]) {
                        try {
                            const noteId = decodeURIComponent(item[1]);
                            if (noteId) {
                                const note = noteEntries.entries.find(j => j.id === noteId);
                                if (note) {
                                    displayNote(note);
                                    return;
                                }
                            }
                        } catch (err) {
                            $('.container').hide();
                            console.error('Failed to parse settings from query string', err);
                        }
                    }
                });
            }
        }
    });

    return new Promise((resolve) => {
        setTimeout(() => {
            console.log('loaded Note Entries:', noteEntries);
            resolve();
        }, 1000);
    });
}

function displayNote(note) {
    console.log('Loading note:', note);
    // Update header information
    $('.container').show();
    $('#journalTitle').text(note.name);

    populateNoteEntries(note.entries);
    
    // Start periodic reminder due date checking
    startReminderChecking();
}

function populateNoteEntries(entries) {
    const noteEntriesContainer = $('#noteEntries');
    noteEntriesContainer.empty();
    
    if (entries.length === 0) {
        noteEntriesContainer.append(`
            <div class="no-journal">
                This journal is empty.
            </div>
        `);
        return;
    }
    
    // Sort entries by creation date (oldest first)
    const sortedEntries = [...entries].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    
    sortedEntries.forEach(entry => {
        let contentHtml = '';
        
        switch (entry.contentType) {
            case 'text':
                contentHtml = `
                    <div class="text-content">${entry.content}</div>
                `;
                break;
            case 'task':
                const isCompleted = entry.content.completed || false;
                const completedAttr = isCompleted ? 'checked' : '';
                const completedClass = isCompleted ? 'completed' : '';
                const taskText = entry.content.description || entry.content.title || '';
                contentHtml = `
                    <div class="task-item ${completedClass}" 
                         data-contentType="task" 
                         data-completed="${isCompleted}"
                         data-task-text="${taskText}">
                        <sl-checkbox class="task-checkbox" ${completedAttr} disabled></sl-checkbox>
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
                         data-dueDate="${entry.content.dueDate || Date.now()}"
                         data-title="${entry.content.title || ''}">
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
                    <div class="text-content">${JSON.stringify(entry.content)}</div>
                `;
        }
        
        const entryHtml = `
            <div class="journal-entry" data-entry-id="${entry.id || crypto.randomUUID()}">
                <div class="journal-entry-content">
                    ${contentHtml}
                </div>
            </div>
        `;
        
        noteEntriesContainer.append(entryHtml);
    });
}