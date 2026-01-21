const csInterface = new CSInterface();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// --- CONFIGURATION ---
const extensionRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
const assetsRoot = path.join(extensionRoot, 'assets');

const TAB_CONFIG = {
    'SFX': { types: ['.wav', '.mp3', '.aiff'], color: '#7f00ff', isPreset: false },
    'GFX': { types: ['.mov', '.mp4', '.png', '.jpg'], color: '#7f00ff', isPreset: false },
    'PRESETS': { types: ['.ffx'], color: '#7f00ff', isPreset: true },
    'MAIN': { color: '#7f00ff' }
};


let isPageLock = false;
let activeTab = 'MAIN'; // Will be overridden by init
let activeCategory = '';
let currentAudio = null;
let currentTabIndex = 3; 
let scrollDebounce = 0;

// --- PAGINATION VARIABLES ---
let allFiles = [];      
let currentPage = 0;    
let isLoading = false;  
let loadContentTimer = null;
// --- DYNAMIC BATCH SIZE ---
function getBatchSize() {
    if (activeTab === 'SFX') return 21; // 3x7
    if (activeTab === 'GFX') return 6;  // 3x2
    return 9; 
}

function init() {
    setupTabs();
    setupMainTools();
    setupFolderButton();

    // Default to MAIN on load
    document.querySelector('.tab-btn[data-tab="MAIN"]').click(); 
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const navBar = document.getElementById('bottomNavBar');
    const glider = document.getElementById('tabGlider');
    
    // Helper to switch tab visually instantly, but delay loading data
    const activateTab = (index) => {
        const tab = tabs[index];
        if (!tab) return;

        // 1. VISUAL UPDATE (Instant)
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentTabIndex = index;
        
        // Move Glider Animation
        if (glider) {
            glider.style.width = tab.offsetWidth + 'px';
            glider.style.left = tab.offsetLeft + 'px';
        }

        // 2. DATA LOAD (Delayed/Debounced)
        // Clear any pending load from the previous tab you just scrolled past
        if (loadContentTimer) clearTimeout(loadContentTimer);

        // Wait 400ms. If user doesn't switch again, THEN load the files.
        loadContentTimer = setTimeout(() => {
            switchTabContent(tab.getAttribute('data-tab'));
        }, 400); 
    };

    // 1. Click Logic
    tabs.forEach((tab, index) => {
        tab.onclick = () => {
            // For clicks, we usually want instant response, 
            // but keeping the timer prevents double-loading if they spam click.
            activateTab(index);
        };
    });

    // 2. Scroll Wheel Logic
    if (navBar) {
        navBar.addEventListener('wheel', (e) => {
            // Limit scroll speed slightly (UI Debounce)
            if (Date.now() - scrollDebounce < 150) return;
            
            if (e.deltaY > 0) {
                // Scroll Down -> Next Tab
                if (currentTabIndex < tabs.length - 1) {
                    activateTab(currentTabIndex + 1);
                }
            } else {
                // Scroll Up -> Prev Tab
                if (currentTabIndex > 0) {
                    activateTab(currentTabIndex - 1);
                }
            }
            scrollDebounce = Date.now();
        });
    }

    // Init Glider Position
    setTimeout(() => {
        const active = document.querySelector('.tab-btn.active');
        if (active && glider) {
            glider.style.width = active.offsetWidth + 'px';
            glider.style.left = active.offsetLeft + 'px';
        }
    }, 100);
}

function switchTabContent(tabName) {
    activeTab = tabName;
    const browserView = document.getElementById('browserView');
    const toolsView = document.getElementById('toolsView');
    const navBar = document.getElementById('categoryNavBar'); 

    if (activeTab === 'MAIN') {
        browserView.classList.add('hidden');
        toolsView.classList.remove('hidden');
    } else {
        // UNIFIED LOGIC: SFX, GFX, PRESETS all look the same now
        toolsView.classList.add('hidden');
        browserView.classList.remove('hidden');
        
        // Load the Horizontal Bubble Bar for this tab
        loadCategories(tabName); 
    }
}

// --- UNIFIED CATEGORY LOADER (Bubble Style for All) ---
function loadCategories(tabName) {
    const navBar = document.getElementById('categoryNavBar'); // Reused ID
    const folderPath = path.join(assetsRoot, tabName);
    
    navBar.innerHTML = '';
    
    // Mouse Wheel Horizontal Scroll
    navBar.onwheel = (e) => {
        e.preventDefault();
        navBar.scrollLeft += e.deltaY;
    };

    fs.readdir(folderPath, (err, files) => {
        if (err) {
            navBar.innerHTML = '<div style="padding:10px; opacity:0.5; font-size:10px;">No folders</div>';
            return;
        }
        
        const folders = files.filter(file => fs.statSync(path.join(folderPath, file)).isDirectory());
        
        folders.forEach((cat, index) => {
            const btn = document.createElement('div');
            btn.className = 'sfx-cat-btn'; // We reuse the CSS class because it has the animation
            
            const firstLetter = cat.charAt(0).toUpperCase();
            const restOfWord = cat.slice(1);
            btn.innerHTML = `<span class="cat-icon">${firstLetter}</span><span class="cat-text">${restOfWord}</span>`;
            
            btn.onclick = () => {
                document.querySelectorAll('.sfx-cat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                
                activeCategory = cat;
                loadGrid(tabName, cat);
            };
            
            navBar.appendChild(btn);
            
            // Auto-load first category
            if(index === 0) {
                // Wait slightly for UI to settle
                setTimeout(() => btn.click(), 50); 
            }
        });
    });
}

function loadGrid(tabName, category) {
    const grid = document.getElementById('assetGrid');
    const folderPath = path.join(assetsRoot, tabName, category);
    const config = TAB_CONFIG[tabName];

    // Layout Switching
    grid.className = 'grid'; 
    if (tabName === 'SFX') grid.classList.add('layout-sfx-grid');
    else grid.classList.add('layout-gallery');

    // Header Update
    const display = document.getElementById('currentPathDisplay');
    display.innerText = `${tabName} > ${category}`;
    display.style.color = config.color;
    
    // Reset Data
    allFiles = [];
    currentPage = 0;
    
    fs.readdir(folderPath, (err, files) => {
        if (err) return;
        allFiles = files.filter(file => config.types.includes(path.extname(file).toLowerCase()));
        renderPage(0); 
    });
}

function renderPage(pageIndex) {
    const grid = document.getElementById('assetGrid');
    const folderPath = path.join(assetsRoot, activeTab, activeCategory);
    const config = TAB_CONFIG[activeTab];
    const batchSize = getBatchSize();
    
    isLoading = true;
    grid.innerHTML = ''; 
    grid.scrollTop = 0;  

    const start = pageIndex * batchSize;
    const end = start + batchSize;
    const batch = allFiles.slice(start, end);

    batch.forEach(file => {
        const fullPath = path.join(folderPath, file);
        const displayName = file
            .replace(/\[.*?\]/g, "")   
            .replace(/\.[^/.]+$/, "")  
            .replace(/\s+/g, " ")      
            .trim();
        const card = document.createElement('div');
        card.className = 'asset-card';
        if(config.isPreset) card.classList.add('preset-card');
        
        if (activeTab === 'SFX') {
            card.innerHTML = `<div class="preset-placeholder" style="color:${config.color}">🔊</div><div class="card-label">${displayName}</div>`;
            card.onmouseenter = () => playAudio(fullPath);
            card.onmouseleave = () => stopAudio();
        } else if (activeTab === 'GFX') {
            const isVideo = ['.mov', '.mp4'].includes(path.extname(file).toLowerCase());
            if(isVideo) {
                card.innerHTML = `<video class="card-media" src="${fullPath}" loop muted></video><div class="card-label">${displayName}</div>`;
                const vid = card.querySelector('video');
                vid.onloadedmetadata = () => { vid.currentTime = vid.duration / 2; };
                card.onmouseenter = () => { vid.play(); };
                card.onmouseleave = () => { vid.pause(); vid.currentTime = vid.duration / 2; };
            } else {
                card.innerHTML = `<img class="card-media" src="${fullPath}"> <div class="card-label">${displayName}</div>`;
            }
        } else if (activeTab === 'PRESETS') {
            const previewPath = fullPath.replace('.ffx', '.mp4');
            let html = `<div class="preset-placeholder">NO PREVIEW</div>`;
            if (fs.existsSync(previewPath)) {
               html = `<div class="preset-placeholder">NO PREVIEW</div><video class="card-media" src="${previewPath}" loop muted></video><div class="card-label">${file}</div>`;
            } else {
                html += `<div class="card-label">${displayName}</div>`;
            }
            card.innerHTML = html;
            const vid = card.querySelector('video');
            if (vid) {
                vid.onloadedmetadata = () => { vid.currentTime = vid.duration / 2; };
                card.onmouseenter = () => { vid.play(); };
                card.onmouseleave = () => { vid.pause(); vid.currentTime = vid.duration / 2; };
            }
        }
        
        card.ondblclick = () => {
            if (config.isPreset) sendToAE('applyPreset', fullPath);
            else sendToAE('importFile', fullPath);
        };
        grid.appendChild(card);
    });

    updateFloatingPagination(pageIndex);
    isLoading = false;
}

function nextPage() {
    // 1. SAFETY CHECK: If locked, stop immediately
    if (isPageLock) return;

    const batchSize = getBatchSize();
    const totalPages = Math.ceil(allFiles.length / batchSize);
    
    if (currentPage < totalPages - 1) {
        // 2. LOCK THE BUTTON
        isPageLock = true;
        
        currentPage++;
        renderPage(currentPage);

        // 3. UNLOCK AFTER 300ms (Prevents spam/crash)
        setTimeout(() => {
            isPageLock = false;
        }, 300);
    }
}
function prevPage() {
    // 1. SAFETY CHECK
    if (isPageLock) return;

    if (currentPage > 0) {
        // 2. LOCK
        isPageLock = true;

        currentPage--;
        renderPage(currentPage);

        // 3. UNLOCK
        setTimeout(() => {
            isPageLock = false;
        }, 300);
    }
}

function updateFloatingPagination(pageIndex) {
    // 1. Find or Create the Pagination Bar
    let container = document.getElementById('paginationBar');
    if (!container) {
        container = document.createElement('div');
        container.id = 'paginationBar';
        container.className = 'pagination-bar';
        // Append it to the browser view so it sits on top/bottom of grid
        document.getElementById('browserView').appendChild(container);
    }
    
    container.innerHTML = ''; // Clear existing buttons

    const batchSize = getBatchSize();
    const totalPages = Math.ceil(allFiles.length / batchSize);

    // If we only have 1 page, hide the bar completely
    if (totalPages <= 1) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';

    // 2. Add "Page X of Y" Text (Optional, good for UX)
    const info = document.createElement('span');
    info.className = 'page-info';
    info.innerText = `Page ${pageIndex + 1} / ${totalPages}`;
    container.appendChild(info);

    // 3. Create PREV Button
    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.innerText = 'Prev';
    prevBtn.disabled = (pageIndex === 0); // Disable if on first page
    prevBtn.onclick = prevPage;
    container.appendChild(prevBtn);

    // 4. Create NEXT Button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.innerText = 'Next';
    nextBtn.disabled = (pageIndex >= totalPages - 1); // Disable if on last page
    nextBtn.onclick = nextPage;
    container.appendChild(nextBtn);
}
// [ADD INSIDE init() or separate setup function]

// [REPLACE the setupFolderButton function with this]
// [REPLACE existing setupFolderButton]
function setupFolderButton() {
    const btn = document.getElementById('openFolderBtn');
    
    if (btn) {
        btn.onclick = () => {
            let targetPath = '';
            
            // Logic: Always open the ROOT of the current tab
            if (activeTab === 'MAIN') {
                targetPath = assetsRoot; 
            } else {
                // For SFX, GFX, PRESETS -> Open that main folder only
                // We ignore 'activeCategory' here intentionally.
                targetPath = path.join(assetsRoot, activeTab);
            }

            // Open using Node.js (Windows/Mac compatible)
            let command = '';
            if (process.platform === 'darwin') {
                command = `open "${targetPath}"`;
            } else {
                // Windows robust command
                command = `start "" "${targetPath}"`;
            }

            exec(command, (err) => {
                if (err) {
                    // Fallback
                    const csInterface = new CSInterface();
                    csInterface.openURL(targetPath); 
                }
            });
        };
    }
}


function setupMainTools() {
    const btnPre = document.getElementById('btnPrecompose');
    if(btnPre) {
        btnPre.onclick = (e) => {
            let name = document.getElementById('layerNameInput').value || "Pre-comp";
            csInterface.evalScript(`doPrecompose(${e.shiftKey}, "${name}")`);
        };
    }
    
    // Solid Color Modal
    const btnSolid = document.getElementById('btnSolid');
    const modal = document.getElementById('colorModal');
    const closeModal = document.getElementById('closeModal');
    if(btnSolid) btnSolid.onclick = () => modal.classList.remove('hidden');
    if(closeModal) closeModal.onclick = () => modal.classList.add('hidden');

    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.onclick = () => {
            csInterface.evalScript(`createLayer("solid", "${swatch.getAttribute('data-col')}")`);
            modal.classList.add('hidden');
        };
    });
}

function playAudio(path) {
    stopAudio();
    currentAudio = new Audio(path);
    currentAudio.volume = 0.5;
    currentAudio.play().catch(e => {});
}

function stopAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
    }
}

function sendToAE(funcName, filePath) {
    const cleanPath = filePath.replace(/\\/g, "\\\\");
    csInterface.evalScript(`${funcName}("${cleanPath}")`);
}

// Global Wrapper
window.runScript = function(funcName, arg1, arg2) {
    let script = `${funcName}()`;
    if (arg1 !== undefined && arg2 !== undefined) script = `${funcName}("${arg1}", "${arg2}")`;
    else if (arg1 !== undefined) script = typeof arg1 === 'number' ? `${funcName}(${arg1})` : `${funcName}("${arg1}")`;
    csInterface.evalScript(script);
};

// Start
init();