/**
 * GOLF FANTASY DRAFT LOGIC (2026) - Updated with Flags & Custom Dropdown
 */

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxhmMVgaZSypaomfxz6ip2a3UZ8GNiLa-9otCgTLfRfwshDSk4HdnySFVXboiCl69KbbA/exec";
const STORAGE_KEY = "mastersDraftProgress_2026";

// Draft State Variables
let bettors = [];
let totalRounds = 0;
let currentPickIndex = 0;
let draftOrder = [];
let totalPicks = 0;
let availableGolfers = []; // Stores objects: { name, flag }
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
        
        // Map the Array(2) from Apps Script into objects: {name, flag}
        availableGolfers = data.golfers.map(row => ({
            name: row[0], 
            flag: row[1] || 'default.png' 
        }));
        
        existingMasters = data.existingMasters; 
        
        saveDraftToLocal();
        console.log("Data successfully mapped and loaded.");
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
 * 3. CUSTOM DROPDOWN SEARCH LOGIC
 */
function onSearchInput() {
    const input = document.getElementById('golfer-choice');
    const dropdown = document.getElementById('custom-dropdown');
    const filter = input.value.toLowerCase().trim();
    
    dropdown.innerHTML = '';

    // If filter is empty, show EVERYTHING; otherwise, show MATCHES
    const matches = filter === '' 
        ? availableGolfers 
        : availableGolfers.filter(g => g.name.toLowerCase().includes(filter));

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
            div.style.backgroundColor = 'white';

            div.innerHTML = `
                <img src="flags/${golfer.flag}" 
                     onerror="this.onerror=null; this.src='flags/default.png';" 
                     style="width: 20px; height: auto; border-radius: 2px;">
                <span style="color: black;">${golfer.name}</span>
            `;

            div.onclick = () => {
                input.value = golfer.name;
                dropdown.style.display = 'none';
                input.focus();
            };

            dropdown.appendChild(div);
        });
        dropdown.style.display = 'block';
    } else {
        dropdown.style.display = 'none';
    }
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
        if (recordBtn) recordBtn.style.display = 'none';
        if (finishBtn) finishBtn.style.display = 'inline-block';
    } else {
        if (recordBtn) recordBtn.style.display = 'inline-block';
        if (finishBtn) finishBtn.style.display = 'none';
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

function finishAndClearDraft() {
    if (!confirm("Are you sure you want to permanently clear the board and start fresh?")) {
        return;
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.clear();
    window.location.href = window.location.pathname; 
}
async function recordCurrentPick() {
    const golferInput = document.getElementById('golfer-choice');
    const selectedName = golferInput.value.trim();

    // 1. Find the golfer in our master list to get their flag
    const golferObj = availableGolfers.find(g => g.name === selectedName);

    if (!selectedName || !golferObj) {
        alert("Please select a valid golfer from the list.");
        return;
    }

    // 2. Prevent double-clicking
    setRecordButtonState(true);
    saveStateToHistory();

    const currentBettorName = draftOrder[currentPickIndex];
    const pickNumber = currentPickIndex + 1;
    const roundNumber = Math.floor(currentPickIndex / bettors.length) + 1;

    // 3. Update the UI Table with the flag and name
    const currentRow = document.getElementById(`pick-row-${currentPickIndex}`);
    if (currentRow) {
        const golferCell = currentRow.querySelector('.golfer-cell');
        if (golferCell) {
            golferCell.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="flags/${golferObj.flag}" onerror="this.src='flags/default.png'" style="width: 20px; height: auto;">
                    <span>${golferObj.name}</span>
                </div>
            `;
        }
        currentRow.classList.add('completed-pick');
        currentRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // 4. Prepare data for Google Sheets
    const pickData = {
        action: "add",
        draftMaster: document.getElementById('draftMaster').value,
        bettorName: currentBettorName,
        pickNum: pickNumber,
        round: roundNumber,
        golferName: golferObj.name,
        flag: golferObj.flag 
    };

    // 5. Post to Google
    try {
        await fetch(SCRIPT_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(pickData)
        });
    } catch (e) { console.error("Post failed:", e); }

    // 6. Remove drafted golfer from the search list
    availableGolfers = availableGolfers.filter(g => g.name !== selectedName);

    // 7. Advance the draft
    currentPickIndex++;
    golferInput.value = '';
    
    refreshAllDisplays();
    setRecordButtonState(false);
    updateUndoButtonState();
    saveDraftToLocal();
    golferInput.focus();
}


window.recordCurrentPick = recordCurrentPick;
window.onSearchInput = onSearchInput;
window.initializeDraftOrder = initializeDraftOrder;
window.undoLastPick = undoLastPick;
window.finishAndClearDraft = finishAndClearDraft;
