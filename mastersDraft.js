/**
 * GOLF FANTASY DRAFT LOGIC (2026) - Updated with Flags
 */

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwl3HomxeKLcRdfrzmlzY469q7TUMDnZd6wHUJrk3vK0bweXxmXmPbnvZNEVhVwvItvQQ/exec";
const STORAGE_KEY = "mastersDraftProgress_2026";

// Draft State Variables
let bettors = [];
let totalRounds = 0;
let currentPickIndex = 0;
let draftOrder = [];
let totalPicks = 0;
let availableGolfers = []; // Now stores objects: { name, flag }
let draftHistory = []; 
let existingMasters = [];

document.addEventListener('DOMContentLoaded', async () => {
    const restored = loadDraftFromLocal();
    const setup = document.getElementById('setup-controls');
    const draft = document.getElementById('draft-controls');

    if (restored && bettors.length > 0) {
        setup.style.display = 'none';
        draft.style.display = 'block';
        
        updateUndoButtonState();
        refreshAllDisplays();
    } else {
        setup.style.display = 'block';
        draft.style.display = 'none';
        document.getElementById('draft-board-body').innerHTML = "";
        document.getElementById('last-pick-display').innerHTML = "";
        await fetchGolfers();
    }
});

/**
 * 1. GET GOLFERS & FLAGS FROM GOOGLE SHEETS
 */
async function fetchGolfers() {
    try {
        const response = await fetch(SCRIPT_URL + "?page=draft");
        const data = await response.json();
        
        // Map the Array(2) to the object format our script uses
        availableGolfers = data.golfers.map(row => ({
            name: row[0], // Extract Name from the first spot in the array
            flag: row[1] || 'default.png' // Extract Flag from the second spot
        }));
        
        existingMasters = data.existingMasters; 
        
        // Pass ONLY the names (strings) to populate the datalist
        
        
        saveDraftToLocal();
        console.log("Data successfully mapped and loaded.");
        console.log(availableGolfers)
    } catch (error) {
        console.error("Error mapping golfers:", error);
    }
}






/**
 * 2. INITIALIZE SERPENTINE ORDER
 */
function initializeDraftOrder() {
    const masterInput = document.getElementById('draftMaster');
    const masterName = masterInput.value.trim();
    const savedData = localStorage.getItem(STORAGE_KEY);
    const isAlreadyActiveSession = savedData && JSON.parse(savedData).draftMaster === masterName;

    if (!masterName) {
        alert("Please enter a Commissioner name.");
        return;
    }

    if (!isAlreadyActiveSession && existingMasters.includes(masterName)) {
        alert("This Commissioner name has already been used.");
        return;
    }

    const namesInput = document.getElementById('bettorNamesInput').value;
    totalRounds = parseInt(document.getElementById('roundsTotal').value, 10);

    if (!namesInput || isNaN(totalRounds)) {
        alert("Please enter bettor names and total rounds.");
        return;
    }

    bettors = namesInput.split(',').map(name => name.trim()).filter(Boolean);
    totalPicks = bettors.length * totalRounds;

    draftOrder = [];
    for (let round = 1; round <= totalRounds; round++) {
        let roundOrder = [...bettors];
        if (round % 2 === 0) { roundOrder.reverse(); }
        draftOrder.push(...roundOrder);
    }

    const tableBody = document.getElementById('draft-board-body');
    tableBody.innerHTML = ""; 

    draftOrder.forEach((bettor, index) => {
        const pickNum = index + 1;
        const roundNum = Math.floor(index / bettors.length) + 1;
        const row = document.createElement('tr');
        row.id = `pick-row-${index}`;
        row.innerHTML = `
            <td>${pickNum}</td>
            <td>${roundNum}</td>
            <td>${bettor}</td>
            <td class="golfer-cell">---</td>
        `;
        tableBody.appendChild(row);
    });

    document.getElementById('setup-controls').style.display = 'none';
    document.getElementById('draft-controls').style.display = 'block';
    document.getElementById('draftMaster').disabled = true;
    
    refreshAllDisplays();
    saveDraftToLocal();
    updateUndoButtonState();
}

/**
 * 3. RECORD PICK & INJECT FLAG INTO TABLE
 */
async function recordCurrentPick() {
    const golferInput = document.getElementById('golfer-choice');
    const selectedName = golferInput.value;

    // Find the specific golfer object to get their flag filename
    const golferObj = availableGolfers.find(g => g.name === selectedName);

    if (!selectedName || !golferObj) {
        alert("Invalid or already drafted golfer selected.");
        return;
    }

    setRecordButtonState(true);
    saveStateToHistory();

    const currentBettorName = draftOrder[currentPickIndex];
    const pickNumber = currentPickIndex + 1;
    const roundNumber = Math.floor(currentPickIndex / bettors.length) + 1;

    // A. UPDATE UI TABLE WITH FLAG IMAGE
    const currentRow = document.getElementById(`pick-row-${currentPickIndex}`);
    if (currentRow) {
        const golferCell = currentRow.querySelector('.golfer-cell');
        if (golferCell) {
            golferCell.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="flags/${golferObj.flag}" style="width: 20px; height: auto;">
                    <span>${golferObj.name}</span>
                </div>
            `;
        }
        currentRow.classList.add('completed-pick');
        currentRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const lastPickDisplay = document.getElementById('last-pick-display');
    if (lastPickDisplay) {
        lastPickDisplay.innerHTML = `<strong>Last Pick:</strong> ${golferObj.name} by ${currentBettorName}`;
    }

    // Prepare data for Sheets
    const pickData = {
        action: "add",
        draftMaster: document.getElementById('draftMaster').value,
        bettorName: currentBettorName,
        pickNum: pickNumber,
        round: roundNumber,
        golferName: golferObj.name,
        flag: golferObj.flag // This ensures Column G gets filled
    };

    try {
        await fetch(SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(pickData)
        });
    } catch (e) { console.error(e); }

    // Remove from available list
    availableGolfers = availableGolfers.filter(g => g.name !== selectedName);
   

    currentPickIndex++;
    golferInput.value = '';
    refreshAllDisplays();
    setRecordButtonState(false);
    updateUndoButtonState();
    saveDraftToLocal();
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
        lastPickHTML: document.getElementById('last-pick-display').innerHTML,
        draftHistory
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadDraftFromLocal() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;
    try {
        const state = JSON.parse(saved);
        document.getElementById('draftMaster').value = state.draftMaster || "";
        bettors = state.bettors || [];
        totalRounds = state.totalRounds || 0;
        currentPickIndex = state.currentPickIndex || 0;
        draftOrder = state.draftOrder || [];
        totalPicks = state.totalPicks || 0;
        availableGolfers = state.availableGolfers || [];
        draftHistory = state.draftHistory || [];
        existingMasters = state.existingMasters || [];
        document.getElementById('draft-board-body').innerHTML = state.tableHTML || "";
        document.getElementById('last-pick-display').innerHTML = state.lastPickHTML || "";
        return true; 
    } catch (e) { return false; }
}

function onSearchInput() {
    const input = document.getElementById('golfer-choice');
    const dropdown = document.getElementById('custom-dropdown');
    const filter = input.value.toLowerCase().trim();
    
    // Clear previous results
    dropdown.innerHTML = '';

    // If search is empty, hide dropdown
    if (!filter) {
        dropdown.style.display = 'none';
        return;
    }

    // Filter golfers by name
    const matches = availableGolfers.filter(g => 
        g.name.toLowerCase().includes(filter)
    );

    if (matches.length > 0) {
        matches.forEach(golfer => {
            const div = document.createElement('div');
            div.className = 'dropdown-item';
            div.style.padding = '10px';
            div.style.cursor = 'pointer';
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.gap = '10px';
            div.style.borderBottom = '1px solid #eee';

            div.innerHTML = `
                <img src="flags/${golfer.flag}" style="width: 20px; height: auto;">
                <span>${golfer.name}</span>
            `;

            // When clicked, fill the input and hide dropdown
            div.onclick = () => {
                input.value = golfer.name;
                dropdown.style.display = 'none';
            };

            dropdown.appendChild(div);
        });
        dropdown.style.display = 'block';
    } else {
        dropdown.style.display = 'none';
    }
}




function refreshAllDisplays() {
    const p = currentPickIndex;
    const t = totalPicks;
    document.getElementById('current-bettor-display').textContent = (p < t) ? draftOrder[p] : "DRAFT FINISHED!";
    document.getElementById('next-up-display').textContent = (p + 1 < t) ? draftOrder[p + 1] : "N/A";
    document.getElementById('on-deck-display').textContent = (p + 2 < t) ? draftOrder[p + 2] : "N/A";
    document.getElementById('in-the-hole-display').textContent = (p + 3 < t) ? draftOrder[p + 3] : "N/A";
    
    const recordBtn = document.getElementById('record-pick-button');
    const finishBtn = document.getElementById('finish-draft-button');
    if (p >= t && t > 0) {
        recordBtn.style.display = 'none';
        finishBtn.style.display = 'inline-block';
    } else {
        recordBtn.style.display = 'inline-block';
        finishBtn.style.display = 'none';
    }
}

function setRecordButtonState(isDisabled) {
    const btn = document.getElementById('record-pick-button');
    if (btn) {
        btn.disabled = isDisabled;
        btn.textContent = isDisabled ? 'Processing...' : 'Record Pick';
    }
}

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
    if (undoBtn) undoBtn.disabled = draftHistory.length === 0;
}

async function undoLastPick(event) {
    if (event) event.preventDefault();
    if (draftHistory.length === 0) return;
    if (!confirm("Undo last pick?")) return;

    fetch(SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify({ action: "deleteLast" })
    });
    
    const prevState = draftHistory.pop();
    currentPickIndex = prevState.index;
    availableGolfers = prevState.availableGolfersSnapshot;
    document.getElementById('draft-board-body').innerHTML = prevState.tableHTMLSnapshot;
    document.getElementById('last-pick-display').innerHTML = prevState.lastPickHTMLSnapshot || "";

    
    refreshAllDisplays();
    saveDraftToLocal(); 
    updateUndoButtonState();
}
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('custom-dropdown');
    const input = document.getElementById('golfer-choice');
    if (e.target !== input && e.target !== dropdown) {
        dropdown.style.display = 'none';
    }
});


window.initializeDraftOrder = initializeDraftOrder;
window.undoLastPick = undoLastPick;
window.recordCurrentPick = recordCurrentPick;
