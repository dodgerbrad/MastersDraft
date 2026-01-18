/**
 * GOLF FANTASY DRAFT LOGIC (2025)
 */

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxpdmq-J2KiLXS11PnX4V55GoT-HHV9Yukq3FQIBPJyQN6JOgTrNgyDO2tsuKsOfbbN9w/exec";
const STORAGE_KEY = "mastersDraftProgress_2025";

// Draft State Variables (These must remain in the global scope)
let bettors = [];
let totalRounds = 0;
let currentPickIndex = 0;
let draftOrder = [];
let totalPicks = 0;
let availableGolfers = [];
let draftHistory = []; 
let existingMasters = [];

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Try to restore draft
    const restored = loadDraftFromLocal();
    
    const setup = document.getElementById('setup-controls');
    const draft = document.getElementById('draft-controls');

    if (restored && bettors.length > 0) {
        // ACTIVE DRAFT: Show board
        setup.style.display = 'none';
        draft.style.display = 'block';
        populateDatalist(availableGolfers);
        updateUndoButtonState();
        refreshAllDisplays();
    } else {
        // NO ACTIVE DRAFT: Force Setup View
        setup.style.display = 'block';
        draft.style.display = 'none';
        
        // Wipe any "Ghost" HTML that might be lingering
        document.getElementById('draft-board-body').innerHTML = "";
        document.getElementById('last-pick-display').innerHTML = "";
        
        // Fetch fresh data for the new draft
        await fetchGolfers();
    }
});




/**
 * 1. GET GOLFERS FROM GOOGLE SHEETS
 */
async function fetchGolfers() {
    try {
        const response = await fetch(SCRIPT_URL+ "?page=draft");
        const data = await response.json();
        
        // Update both global lists
        availableGolfers = data.golfers;
        existingMasters = data.existingMasters; 
        
        populateDatalist(availableGolfers);
        saveDraftToLocal();
        console.log("Data fetched from Google.");
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

/**
 * 2. INITIALIZE SERPENTINE ORDER
 */
function initializeDraftOrder() {
    const masterInput = document.getElementById('draftMaster');
    const masterName = masterInput.value.trim();

    // 1. Check if we are resuming an active session for this specific person
    const savedData = localStorage.getItem(STORAGE_KEY);
    const isAlreadyActiveSession = savedData && JSON.parse(savedData).draftMaster === masterName;

    if (!masterName) {
        alert("Please enter a Commissioner name.");
        return;
    }

    // 2. Only block the name if it's NOT the one we are already using
    if (!isAlreadyActiveSession && existingMasters.includes(masterName)) {
        alert("This Commissioner name has already been used. Please choose a unique name for this draft.");
        masterInput.style.border = "2px solid red";
        return;
    }

    const namesInput = document.getElementById('bettorNamesInput').value;
    totalRounds = parseInt(document.getElementById('roundsTotal').value, 10);

    if (!namesInput || isNaN(totalRounds)) {
        alert("Please enter bettor names and total rounds.");
        return;
    }

    // 3. Process Bettor Names and Generate Serpentine Order
    bettors = namesInput.split(',').map(name => name.trim()).filter(Boolean);
    totalPicks = bettors.length * totalRounds;

    draftOrder = [];
    for (let round = 1; round <= totalRounds; round++) {
        let roundOrder = [...bettors];
        if (round % 2 === 0) { roundOrder.reverse(); }
        draftOrder.push(...roundOrder);
    }

    // 4. PRE-GENERATE THE WHOLE DRAFT TABLE
    const tableBody = document.getElementById('draft-board-body');
    tableBody.innerHTML = ""; // Clear existing rows

    draftOrder.forEach((bettor, index) => {
        const pickNum = index + 1;
        const roundNum = Math.floor(index / bettors.length) + 1;
        
        const row = document.createElement('tr');
        row.id = `pick-row-${index}`; // Unique ID for scrolling and targeting
        row.innerHTML = `
            <td>${pickNum}</td>
            <td>${roundNum}</td>
            <td>${bettor}</td>
            <td class="golfer-cell">---</td>
        `;
        tableBody.appendChild(row);
    });

    // 5. Update UI State
    document.getElementById('setup-controls').style.display = 'none';
    document.getElementById('draft-controls').style.display = 'block';
    document.getElementById('draftMaster').disabled = true;
    document.getElementById('draftMaster').style.borderColor = '#2d5a27';
    
    // 6. Finalize setup
    refreshAllDisplays();
    saveDraftToLocal();
    updateUndoButtonState();

    // Optional: Scroll to the very first pick to start
    const firstRow = document.getElementById('pick-row-0');
    if (firstRow) firstRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
}


/**
 * 3. RECORD PICK & POST TO GOOGLE
 * Updated for pre-generated rows and smooth-centering scroll
 */
async function recordCurrentPick() {
    const golferInput = document.getElementById('golfer-choice');
    const golferName = golferInput.value;

    // Check if valid golfer
    if (!golferName || !availableGolfers.includes(golferName)) {
        alert("Invalid or already drafted golfer selected.");
        return;
    }

    // Use specific function for the record button only
    setRecordButtonState(true);

    // Save the current state to history *before* changes
    saveStateToHistory();

    const currentBettorName = draftOrder[currentPickIndex];
    const pickNumber = currentPickIndex + 1;
    const roundNumber = Math.floor(currentPickIndex / bettors.length) + 1;

    // A. UPDATE UI TABLE (Find existing row instead of adding new)
    const currentRow = document.getElementById(`pick-row-${currentPickIndex}`);
    if (currentRow) {
        // Find the cell with the placeholder "---" and update it
        const golferCell = currentRow.querySelector('.golfer-cell');
        if (golferCell) {
            golferCell.textContent = golferName;
        }
        
        // Add a class for styling (e.g., highlighting the row in green)
        currentRow.classList.add('completed-pick');

        // SCROLL: Smoothly center the row so you see picks before and after it
        currentRow.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
        });
    }

    // Update the "Last Pick" display text
    const lastPickDisplay = document.getElementById('last-pick-display');
    if (lastPickDisplay) {
        lastPickDisplay.innerHTML = `<strong>Last Pick:</strong> ${golferName} by ${currentBettorName}`;
    }

    // Prepare data for Google Sheets
    const pickData = {
        action: "add",
        draftMaster: document.getElementById('draftMaster').value,
        bettorName: currentBettorName,
        pickNum: pickNumber,
        round: roundNumber,
        golferName: golferName
    };

    // B. Post to Google Apps Script (Saves to Sheet)
    try {
        fetch(SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(pickData)
        });
    } catch (e) { 
        console.error("Error saving pick to Google Sheets:", e); 
    }

    // C. Update State
    const indexInList = availableGolfers.indexOf(golferName);
    if (indexInList > -1) {
        availableGolfers.splice(indexInList, 1);
        populateDatalist(availableGolfers);
    }

    // Finalize Pick
    currentPickIndex++;
    golferInput.value = '';
    
    // UI Cleanup
    refreshAllDisplays();
    setRecordButtonState(false);
    updateUndoButtonState();
    saveDraftToLocal();

    // Auto-focus back to input for the next person
    golferInput.focus();
}


/**
 * PERSISTENCE HELPERS
 */
function saveDraftToLocal() {
    const state = {
        existingMasters,
        draftMaster: document.getElementById('draftMaster').value,
        bettors,
        totalRounds,
        currentPickIndex,
        draftOrder,
        totalPicks,
        availableGolfers,
        tableHTML: document.getElementById('draft-board-body').innerHTML,
        setupHidden: document.getElementById('setup-controls').style.display === 'none',
        draftHistory: draftHistory // Store the history array
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}


function loadDraftFromLocal() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    
    try {
        const state = JSON.parse(saved);
        
        // Restore commissioner name
        const masterInput = document.getElementById('draftMaster');
        if (masterInput) masterInput.value = state.draftMaster || "";

        // Restore core variables
        bettors = state.bettors || [];
        totalRounds = state.totalRounds || 0;
        currentPickIndex = state.currentPickIndex || 0;
        draftOrder = state.draftOrder || [];
        totalPicks = state.totalPicks || 0;
        availableGolfers = state.availableGolfers || [];
        draftHistory = state.draftHistory || [];
        existingMasters = state.existingMasters || [];

        // Restore Table and Display
        const tableBody = document.getElementById('draft-board-body');
        if (tableBody) tableBody.innerHTML = state.tableHTML || "";
        
        const lastPickDisplay = document.getElementById('last-pick-display');
        if (lastPickDisplay) lastPickDisplay.innerHTML = state.lastPickHTML || "";

        return true; 
    } catch (e) {
        console.error("Critical error parsing saved draft state:", e);
        return false;
    }
}


/**
 * UI HELPERS
 */
function populateDatalist(golfersList) {
    const datalist = document.getElementById('golfer-names');
    if (!datalist) return;
    datalist.innerHTML = '';
    golfersList.forEach(name => {
        let option = document.createElement('option');
        option.value = name;
        datalist.appendChild(option);
    });
}

function refreshAllDisplays() {
    const p = currentPickIndex;
    const t = totalPicks;
    
    // 1. Update text displays
    document.getElementById('current-bettor-display').textContent = (p < t) ? draftOrder[p] : "DRAFT FINISHED!";
    document.getElementById('next-up-display').textContent = (p + 1 < t) ? draftOrder[p + 1] : "N/A";
    document.getElementById('on-deck-display').textContent = (p + 2 < t) ? draftOrder[p + 2] : "N/A";
    document.getElementById('in-the-hole-display').textContent = (p + 3 < t) ? draftOrder[p + 3] : "N/A";
   
    // 2. Get button references
    const finishBtn = document.getElementById('finish-draft-button');
    const recordBtn = document.getElementById('record-pick-button');
    const golferInput = document.getElementById('golfer-choice');

    // 3. Logic for when draft is finished
    if (p >= t && t > 0) {
        if (golferInput) golferInput.disabled = true;
        if (recordBtn) recordBtn.style.display = 'none';           
        if (finishBtn) finishBtn.style.display = 'inline-block';    
    } else {
        if (golferInput) golferInput.disabled = false;
        if (recordBtn) recordBtn.style.display = 'inline-block';    
        if (finishBtn) finishBtn.style.display = 'none';            
    }
}

/**
 * FIXED: This was missing and caused the "Record Pick" button to crash
 */
function setRecordButtonState(isDisabled) {
    const btn = document.getElementById('record-pick-button');
    if (btn) {
        btn.disabled = isDisabled;
        btn.textContent = isDisabled ? 'Processing...' : 'Record Pick';
    }
}

/**
 * UNDO LOGIC
 */
function saveStateToHistory() {
    draftHistory.push({
        index: currentPickIndex,
        availableGolfersSnapshot: [...availableGolfers],
        tableHTMLSnapshot: document.getElementById('draft-board-body').innerHTML,
        lastPickHTMLSnapshot: document.getElementById('last-pick-display').innerHTML
    });
}

function updateUndoButtonState() {
    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) {
        undoBtn.disabled = draftHistory.length === 0;
    }
}

async function undoLastPick(event) {
    // 1. Prevent any default button behavior (critical in 2026 browsers)
    if (event) event.preventDefault();

    if (draftHistory.length === 0) {
        console.log("Nothing to undo.");
        return;
    }

    // 2. The confirm dialog (Causes the Violation warning, but is perfectly safe)
    const confirmed = confirm("Are you sure you want to undo? This will also remove the last row from your Google Sheet.");
    if (!confirmed) return;

    try {
        // 3. Fire-and-forget the delete action to the sheet
        fetch(SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "deleteLast" })
        });
        
        // 4. Restore local state immediately for a fast UI feel
        const prevState = draftHistory.pop();
        
        // Restore variables
        currentPickIndex = prevState.index;
        availableGolfers = prevState.availableGolfersSnapshot;

        // Restore Table UI - Check if element exists first to prevent crashes
        const boardBody = document.getElementById('draft-board-body');
        if (boardBody) {
            boardBody.innerHTML = prevState.tableHTMLSnapshot;
        }

        // Restore Last Pick display - Check if element exists
        const lastPickDisplay = document.getElementById('last-pick-display');
        if (lastPickDisplay) {
            lastPickDisplay.innerHTML = prevState.lastPickHTMLSnapshot || "";
        }

        // 5. Trigger UI updates
        populateDatalist(availableGolfers);
        refreshAllDisplays();
        saveDraftToLocal(); 
        updateUndoButtonState();
        
        console.log("Undo successful.");
    } catch (e) {
        console.error("Error during undo:", e);
    }
}

/**
 * FINISH DRAFT
 */
/**
 * FINISH DRAFT: Resets all progress and starts over
 */
function finishAndClearDraft() {
    if (!confirm("Are you sure you want to permanently clear the board and start fresh?")) {
        return;
    }

    try {
        // 1. Clear ALL storage
        localStorage.removeItem(STORAGE_KEY);
        localStorage.clear(); 
        sessionStorage.clear();

        // 2. Clear global memory variables
        currentPickIndex = 0;
        draftHistory = [];
        bettors = [];
        draftOrder = [];

        // 3. Force UI Reset
        const setup = document.getElementById('setup-controls');
        const draft = document.getElementById('draft-controls');
        if (setup) setup.style.display = 'block';
        if (draft) draft.style.display = 'none';

        // 4. Hard reload to a clean URL
        window.location.href = window.location.pathname; 
    } catch (e) {
        console.error("Error during draft reset:", e);
        // Fallback: just clear storage and reload
        localStorage.clear();
        window.location.reload();
    }
}

// At the very bottom of mastersDraft.js, outside of any other brackets
window.finishAndClearDraft = function() {
    if (!confirm("Are you sure you want to permanently clear the board and start fresh?")) {
        return;
    }

    console.log("Resetting draft data...");

    // 1. Clear Storage
    localStorage.removeItem("mastersDraftProgress_2025"); // Use your specific key
    localStorage.clear();
    sessionStorage.clear();

    // 2. Clear global memory variables to prevent state ghosting
    currentPickIndex = 0;
    draftHistory = [];
    bettors = [];
    draftOrder = [];

    // 3. Force a clean reload to the original page
    window.location.href = window.location.pathname; 
};

window.initializeDraftOrder = initializeDraftOrder;
window.undoLastPick = undoLastPick;





