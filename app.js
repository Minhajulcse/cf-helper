const API = 'https://codeforces.com/api/';

// App State
let selectedDivs = new Set(['Div. 2']);
let selectedIndexes = new Set();
let selectedTags = new Set();
let targetType = 'contest'; // Default to match screenshot
let practiceMode = 'group'; // 'group' or 'target'
let selectedSource = 'normal';
let cachedProblems = null;
let cachedContests = {}; 

// DOM Elements
const sidebar = document.getElementById('main-sidebar');
const generateBtn = document.getElementById('generate-btn');
const divisionSection = document.getElementById('division-section');
const targetHandleSection = document.getElementById('target-handle-section');
const groupHandleLabel = document.getElementById('group-handle-label');

const handleInputs = {
    group: document.getElementById('group-handles'),
    target: document.getElementById('target-handle')
};
const cardContainers = {
    group: document.getElementById('group-user-cards'),
    target: document.getElementById('target-user-cards')
};

// UI Toggles
document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if(e.target.disabled) return;
        const type = e.target.dataset.type;
        const filter = e.target.dataset.filter;
        
        if (type) {
            document.querySelectorAll(`[data-type="${type}"]`).forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // Handle Contest vs Problems layout switch
            if (type === 'type') {
                targetType = e.target.dataset.val;
                if (targetType === 'contest') {
                    sidebar.classList.add('mode-contest');
                    generateBtn.textContent = "Generate Contest";
                } else {
                    sidebar.classList.remove('mode-contest');
                    generateBtn.textContent = "Find Problems";
                }
            }
            
            // Handle Practice Mode Explicit Toggle
            if (type === 'practice-mode') {
                practiceMode = e.target.dataset.val;
                if (practiceMode === 'target') {
                    targetHandleSection.classList.remove('hidden-feature');
                    groupHandleLabel.textContent = "Reference Group (Comma separated)";
                } else {
                    targetHandleSection.classList.add('hidden-feature');
                    groupHandleLabel.textContent = "Group Handles (Comma separated)";
                }
            }
            
        } else if (filter) {
            const val = e.target.dataset.val;
            
            if (filter === 'source') {
                document.querySelectorAll(`[data-filter="source"]`).forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                selectedSource = val;
                
                // Toggle division section visibility based on Gym selection
                if (selectedSource === 'gym') {
                    divisionSection.classList.add('hidden-div-section');
                } else {
                    divisionSection.classList.remove('hidden-div-section');
                }
                
            } else if (filter === 'div') {
                if (selectedDivs.has(val)) {
                    selectedDivs.delete(val);
                    e.target.classList.remove('active');
                } else {
                    selectedDivs.add(val);
                    e.target.classList.add('active');
                }
            } else if (filter === 'index') {
                if (selectedIndexes.has(val)) {
                    selectedIndexes.delete(val);
                    e.target.classList.remove('active');
                } else {
                    selectedIndexes.add(val);
                    e.target.classList.add('active');
                }
            }
        }
    });
});

document.querySelectorAll('.tag-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const val = e.target.dataset.val;
        if (selectedTags.has(val)) {
            selectedTags.delete(val);
            e.target.classList.remove('active');
        } else {
            selectedTags.add(val);
            e.target.classList.add('active');
        }
    });
});

// --- RATING BOUNDARY SYNC LOGIC ---
const minRatingInput = document.getElementById('min-rating');
const maxRatingInput = document.getElementById('max-rating');

function syncRatingBounds() {
    let minVal = parseInt(minRatingInput.value);
    let maxVal = parseInt(maxRatingInput.value);

    if (!isNaN(maxVal)) {
        minRatingInput.max = maxVal;
        if (!isNaN(minVal) && minVal > maxVal) {
            minRatingInput.value = maxVal;
        }
    } else {
        minRatingInput.removeAttribute('max');
    }

    if (!isNaN(minVal)) {
        maxRatingInput.min = minVal;
        if (!isNaN(maxVal) && maxVal < minVal) {
            maxRatingInput.value = minVal;
        }
    } else {
        maxRatingInput.min = 800;
    }
}

minRatingInput.addEventListener('change', syncRatingBounds);
maxRatingInput.addEventListener('change', syncRatingBounds);

// --- FETCHERS ---
async function updateUserCards(inputEl, containerEl) {
    const handles = inputEl.value.split(',').map(h => h.trim()).filter(h => h);
    containerEl.innerHTML = '';
    if (!handles.length) return;

    try {
        const res = await fetch(`${API}user.info?handles=${handles.join(';')}`);
        const data = await res.json();
        if (data.status === 'OK') {
            data.result.forEach(user => {
                const rankClass = user.rank ? user.rank.replace(' ', '-').toLowerCase() : 'newbie';
                containerEl.innerHTML += `
                    <div class="user-card">
                        <img src="${user.avatar}" alt="avatar" onerror="this.src='https://userpic.codeforces.org/no-title.jpg'">
                        <div class="user-info">
                            <div class="user-handle ${rankClass}">${user.handle}</div>
                            <div class="user-rating">${user.rating || 0} (${user.rank || 'Unrated'})</div>
                        </div>
                    </div>
                `;
            });
        }
    } catch (e) {
        console.error("Failed to load user info", e);
    }
}

let timeoutId;
[handleInputs.group, handleInputs.target].forEach(input => {
    input.addEventListener('input', (e) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            updateUserCards(e.target, e.target.id === 'group-handles' ? cardContainers.group : cardContainers.target);
        }, 800);
    });
});

async function getProblems() {
    if (cachedProblems) return cachedProblems;
    const res = await fetch(`${API}problemset.problems`);
    const data = await res.json();
    if (data.status !== 'OK') throw new Error("API Error fetching problems");
    cachedProblems = data.result.problems;
    return cachedProblems;
}

// Fetch Contests and map Gyms appropriately
async function getContests() {
    if (Object.keys(cachedContests).length > 0) return;
    
    try {
        const [normalRes, gymRes] = await Promise.all([
            fetch(`${API}contest.list?gym=false`),
            fetch(`${API}contest.list?gym=true`)
        ]);
        
        const normalData = await normalRes.json();
        const gymData = await gymRes.json();
        
        if (normalData.status === 'OK') {
            normalData.result.forEach(c => {
                cachedContests[c.id] = { name: c.name, time: c.startTimeSeconds, type: 'normal' };
            });
        }
        if (gymData.status === 'OK') {
            gymData.result.forEach(c => {
                cachedContests[c.id] = { name: c.name, time: c.startTimeSeconds, type: 'gym' };
            });
        }
    } catch (e) {
        throw new Error("Failed to load contest lists from Codeforces API.");
    }
}

async function getUserSolved(handle) {
    const res = await fetch(`${API}user.status?handle=${handle}`);
    const data = await res.json();
    if (data.status !== 'OK') throw new Error(`Codeforces API Error for user: ${handle}. Check spelling.`);
    const solved = new Set();
    data.result.forEach(s => {
        if (s.verdict === 'OK') solved.add(`${s.problem.contestId}${s.problem.index}`);
    });
    return solved;
}

function matchesDiv(contestId) {
    if (selectedSource === 'gym') return true; 

    if (selectedDivs.size === 0) return true;
    const contestInfo = cachedContests[contestId];
    if (!contestInfo) return false;
    
    for (const div of selectedDivs) {
        if (div === 'Other') {
            const standards = ['Div. 1', 'Div. 2', 'Div. 3', 'Div. 4', 'Edu', 'Global'];
            if (!standards.some(s => contestInfo.name.includes(s))) return true;
        } else if (contestInfo.name.includes(div)) {
            return true;
        }
    }
    return false;
}

// --- GENERATION LOGIC ---
generateBtn.addEventListener('click', async () => {
    const loader = document.getElementById('loader');
    const resultPanel = document.getElementById('result-panel');
    const errorMsg = document.getElementById('error-msg');
    
    loader.classList.remove('hidden');
    resultPanel.classList.add('hidden');
    errorMsg.classList.add('hidden');
    
    try {
        const gHandles = handleInputs.group.value.split(',').map(h => h.trim()).filter(h => h);
        const tHandle = handleInputs.target.value.trim();
        
        if (!gHandles.length) throw new Error("Please enter at least one Handle.");
        
        // Explicit check for Feature 2 Target Mode
        if (practiceMode === 'target' && !tHandle) {
            throw new Error("Target Blind Spots mode selected: Please enter a Target Handle.");
        }

        if (targetType === 'problems' && (selectedSource === 'gym' || selectedSource === 'both')) {
            throw new Error("Codeforces API does not support fetching individual Gym problems globally. Please switch to 'Contest' mode or select 'Normal' source.");
        }

        if (targetType === 'contest') {
            await getContests();
        } else {
            await Promise.all([getProblems(), getContests()]);
        }
        
        const groupSets = await Promise.all(gHandles.map(h => getUserSolved(h)));
        const unionGroup = new Set();
        groupSets.forEach(set => set.forEach(id => unionGroup.add(id)));
        
        const currentUnixTime = Math.floor(Date.now() / 1000);
        const recencyLimit = parseInt(document.getElementById('recency-filter').value);

        if (targetType === 'contest') {
            // === CONTEST MODE LOGIC ===
            const touchedContestIds = new Set();
            
            if (practiceMode === 'target') {
                const targetSolved = await getUserSolved(tHandle);
                targetSolved.forEach(id => {
                    const match = id.match(/^(\d+)/);
                    if (match) touchedContestIds.add(parseInt(match[1]));
                });
            } else {
                unionGroup.forEach(id => {
                    const match = id.match(/^(\d+)/);
                    if (match) touchedContestIds.add(parseInt(match[1]));
                });
            }

            let candidateContests = Object.keys(cachedContests).map(Number);
            
            candidateContests = candidateContests.filter(cId => {
                const info = cachedContests[cId];
                if (!info) return false;
                
                if (selectedSource === 'normal' && info.type !== 'normal') return false;
                if (selectedSource === 'gym' && info.type !== 'gym') return false;
                
                if (info.type === 'normal' && !matchesDiv(cId)) return false;
                
                if (recencyLimit > 0) {
                    const ageInSeconds = currentUnixTime - info.time;
                    if (ageInSeconds > recencyLimit) return false;
                }
                
                if (touchedContestIds.has(cId)) return false;
                
                return true;
            });

            if (candidateContests.length > 0) {
                const randomContest = candidateContests[Math.floor(Math.random() * candidateContests.length)];
                renderContest(randomContest);
                const desc = practiceMode === 'target' ? `Untouched by ${tHandle}` : "Unsolved by Group";
                addHistory(desc, 'CONTEST', 1);
            } else {
                throw new Error("No completely untouched contests found matching these exact filters.");
            }

        } else {
            // === PROBLEMS MODE LOGIC ===
            let validProblems = [];
            let featureDesc = "Unsolved by Group";

            if (practiceMode === 'target') {
                const targetSolved = await getUserSolved(tHandle);
                validProblems = cachedProblems.filter(p => {
                    const id = `${p.contestId}${p.index}`;
                    return unionGroup.has(id) && !targetSolved.has(id);
                });
                featureDesc = `Solved by Reference Group, Missed by ${tHandle}`;
            } else {
                validProblems = cachedProblems.filter(p => !unionGroup.has(`${p.contestId}${p.index}`));
            }

            let minR = parseInt(minRatingInput.value);
            if (isNaN(minR) || minR < 800) { minR = 800; minRatingInput.value = 800; }
            
            let maxR = parseInt(maxRatingInput.value);
            if (isNaN(maxR)) { maxR = 4000; } else if (maxR < minR) { maxR = minR; maxRatingInput.value = minR; }

            const resultLimit = parseInt(document.getElementById('result-limit').value) || 5;

            validProblems = validProblems.filter(p => {
                const contestInfo = cachedContests[p.contestId];
                if (!contestInfo) return false;
                
                if (!matchesDiv(p.contestId)) return false;

                if (recencyLimit > 0) {
                    const ageInSeconds = currentUnixTime - contestInfo.time;
                    if (ageInSeconds > recencyLimit) return false;
                }

                const rating = p.rating || 0;
                if (minR > 0 && rating < minR) return false;
                if (maxR < 4000 && rating > maxR) return false;

                if (selectedIndexes.size > 0) {
                    let matchesIdx = false;
                    for (const idx of selectedIndexes) {
                        if (p.index.startsWith(idx)) { matchesIdx = true; break; }
                    }
                    if (!matchesIdx) return false;
                }

                if (selectedTags.size > 0) {
                    for (const requiredTag of selectedTags) {
                        if (!p.tags.includes(requiredTag)) return false;
                    }
                }
                return true;
            });

            renderTable(validProblems.slice(0, resultLimit));
            addHistory(featureDesc, 'PROBLEMS', Math.min(validProblems.length, resultLimit));
        }
        
        resultPanel.classList.remove('hidden');

    } catch (e) {
        errorMsg.textContent = e.message;
        errorMsg.classList.remove('hidden');
    } finally {
        loader.classList.add('hidden');
    }
});

function renderTable(problems) {
    const resultPanel = document.getElementById('result-panel');
    if (problems.length === 0) {
        resultPanel.innerHTML = '<h3>No problems found. Try widening your filters!</h3>';
        return;
    }
    
    let rows = problems.map(p => {
        const tags = p.tags.map(t => `<span class="tag-badge">${t}</span>`).join('');
        const ratingDisplay = p.rating || 'Unrated';
        const contestInfo = cachedContests[p.contestId];
        const cName = contestInfo ? contestInfo.name : `Contest ${p.contestId}`;
        
        return `
            <tr>
                <td style="font-weight:bold; color:var(--accent)">${p.contestId}${p.index}</td>
                <td>
                    <strong>${p.name}</strong><br>
                    <span style="font-size: 0.75rem; color: var(--text-muted)">${cName}</span>
                </td>
                <td style="font-weight:600">${ratingDisplay}</td>
                <td style="max-width: 250px;">${tags}</td>
                <td><a href="https://codeforces.com/contest/${p.contestId}/problem/${p.index}" target="_blank" class="solve-link">Solve</a></td>
            </tr>
        `;
    }).join('');

    resultPanel.innerHTML = `
        <div class="panel-header"><h2>Practice Problem Set</h2></div>
        <div class="table-wrapper">
            <table>
                <thead><tr><th>ID</th><th>Problem Name</th><th>Rating</th><th>Tags</th><th>Action</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;
}

function renderContest(contestId) {
    const resultPanel = document.getElementById('result-panel');
    const contestInfo = cachedContests[contestId];
    const contestName = contestInfo ? contestInfo.name : `Codeforces Contest ${contestId}`;
    const isGym = contestInfo && contestInfo.type === 'gym';
    
    const urlBase = isGym ? `https://codeforces.com/gym/${contestId}` : `https://codeforces.com/contest/${contestId}`;
    
    let dateStr = "";
    if (contestInfo && contestInfo.time) {
        const date = new Date(contestInfo.time * 1000);
        dateStr = `<span class="contest-tag" style="background: rgba(255,255,255,0.1)">${date.toLocaleDateString()}</span>`;
    }

    resultPanel.innerHTML = `
        <div class="contest-card">
            <div class="contest-tags">
                <span class="contest-tag" style="background: var(--accent)">Codeforces ${isGym ? 'Gym' : ''}</span>
                <span class="contest-tag" style="background: var(--success)">Untouched Target</span>
                ${dateStr}
            </div>
            <h2 class="contest-title">${contestName}</h2>
            <div class="contest-actions">
                <a href="${urlBase}/virtual" target="_blank" style="text-decoration:none"><button class="btn-success">Start Virtual Contest</button></a>
                <a href="${urlBase}" target="_blank" style="text-decoration:none"><button class="btn-outline">View Problems</button></a>
            </div>
        </div>
    `;
}

function addHistory(title, type, count) {
    const grid = document.getElementById('history-grid');
    if (grid.querySelector('.empty-state')) grid.innerHTML = '';
    
    const d = new Date();
    const time = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
        <div class="history-meta">
            <span>${type} • Codeforces</span>
            <span>${time}</span>
        </div>
        <h4 style="margin-bottom: 0.5rem">${title}</h4>
        <p style="font-size: 0.75rem; color: var(--text-muted)">Results: ${count} found</p>
    `;
    grid.prepend(item);
}

document.getElementById('clear-history').addEventListener('click', () => {
    document.getElementById('history-grid').innerHTML = '<p class="empty-state">No recent searches.</p>';
});
