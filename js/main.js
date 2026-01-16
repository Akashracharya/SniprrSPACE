const csInterface = new CSInterface();
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
const extensionRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
const assetsRoot = path.join(extensionRoot, 'assets');

const TAB_CONFIG = {
    'SFX': { types: ['.wav', '.mp3', '.aiff'], color: '#7f00ff', isPreset: false },
    'GFX': { types: ['.mov', '.mp4', '.png'], color: '#7f00ff', isPreset: false },
    'PRESETS': { types: ['.ffx'], color: '#7f00ff', isPreset: true },
    'MAIN': { color: '#7f00ff' }
};

let activeTab = 'SFX';
let activeCategory = '';
let currentAudio = null;

// --- PAGINATION VARIABLES ---
let allFiles = [];      // Full list of files for category
let currentPage = 0;    // Current page index
let isLoading = false;  

// --- DYNAMIC BATCH SIZE ---
function getBatchSize() {
    if (activeTab === 'SFX') return 21; // 3 columns * 7 rows
    if (activeTab === 'GFX') return 6;  // 3 columns * 2 rows
    return 9; // Default (Presets etc.)
}

function init() {
    setupTabs();
    setupMainTools();
    
    // 1. Sidebar Toggle Listener
    const toggleBtn = document.getElementById('sidebarToggle');
    if (toggleBtn) {
        toggleBtn.onclick = () => {
            const sidebar = document.getElementById('subFolderList');
            sidebar.classList.toggle('visible');
        };
    }

    // 2. Scroll Listener (Triggers Next Page)
    const grid = document.getElementById('assetGrid');
    if (grid) {
        grid.onscroll = null; 
        grid.addEventListener('wheel', (e) => {
            if (isLoading || activeTab === 'MAIN') return;

            if (e.deltaY > 0) {
                // NEXT PAGE: If at bottom
                if(grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 5) {
                    nextPage();
                }
            } else {
                // PREV PAGE: If at top
                if(grid.scrollTop <= 0) {
                    prevPage();
                }
            }
        });
    }

    // Initial load
    document.querySelector('.tab-btn[data-tab="SFX"]').click(); 
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const browserView = document.getElementById('browserView');
    const toolsView = document.getElementById('toolsView');
    const toggleBtn = document.getElementById('sidebarToggle');

    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeTab = tab.getAttribute('data-tab');

            // --- Toggle Views ---
            if (activeTab === 'MAIN') {
                if(toggleBtn) toggleBtn.classList.add('hidden');
                document.getElementById('subFolderList').classList.remove('visible'); 
                document.getElementById('sfxNavBar').classList.add('hidden'); // Hide SFX Nav
                
                browserView.classList.add('hidden');
                toolsView.classList.remove('hidden');
            } else if (activeTab === 'SFX') {
                if(toggleBtn) toggleBtn.classList.add('hidden'); // SFX uses Top Nav
                document.getElementById('subFolderList').classList.remove('visible');
                document.getElementById('sfxNavBar').classList.remove('hidden'); // Show SFX Nav
                
                toolsView.classList.add('hidden');
                browserView.classList.remove('hidden');
                
                loadSFXCategories(); // Load Horizontal Nav
            } else {
                // GFX & PRESETS
                if(toggleBtn) toggleBtn.classList.remove('hidden');
                document.getElementById('sfxNavBar').classList.add('hidden');
                
                toolsView.classList.add('hidden');
                browserView.classList.remove('hidden');
                loadSidebar(activeTab); 
            }
        };
    });
}

function setupMainTools() {
    // 1. Pre-compose Logic
    const btnPre = document.getElementById('btnPrecompose');
    if(btnPre) {
        btnPre.onclick = (e) => {
            const isShift = e.shiftKey;
            let name = document.getElementById('layerNameInput') ? document.getElementById('layerNameInput').value : "Pre-comp";
            name = name.replace(/"/g, '\\"');
            csInterface.evalScript(`doPrecompose(${isShift}, "${name}")`);
        };
    }

    // 2. Solid Color Modal Logic
    const btnSolid = document.getElementById('btnSolid');
    const modal = document.getElementById('colorModal');
    const closeModal = document.getElementById('closeModal');
    const swatches = document.querySelectorAll('.color-swatch');

    if(btnSolid) btnSolid.onclick = () => { modal.classList.remove('hidden'); };
    if(closeModal) closeModal.onclick = () => { modal.classList.add('hidden'); };

    swatches.forEach(swatch => {
        swatch.onclick = () => {
            const color = swatch.getAttribute('data-col');
            csInterface.evalScript(`createLayer("solid", "${color}")`);
            modal.classList.add('hidden');
        };
    });
}

// Global Wrappers
window.runScript = function(funcName, arg1, arg2) {
    let script = `${funcName}()`;
    if (arg1 !== undefined && arg2 !== undefined) script = `${funcName}("${arg1}", "${arg2}")`;
    else if (arg1 !== undefined) {
        if (typeof arg1 === 'number') script = `${funcName}(${arg1})`;
        else script = `${funcName}("${arg1}")`;
    }
    csInterface.evalScript(script);
};

// --- SFX HORIZONTAL NAV LOADER ---
function loadSFXCategories() {
    const navBar = document.getElementById('sfxNavBar');
    const folderPath = path.join(assetsRoot, 'SFX');
    navBar.innerHTML = '';

    fs.readdir(folderPath, (err, files) => {
        if (err) {
            navBar.innerHTML = '<div style="padding:5px; opacity:0.5; font-size:10px;">No SFX found</div>';
            return;
        }
        
        const folders = files.filter(file => fs.statSync(path.join(folderPath, file)).isDirectory());
        
        folders.forEach((cat, index) => {
            const btn = document.createElement('div');
            btn.className = 'sfx-cat-btn';
            
            // Icon & Text Logic
            const firstLetter = cat.charAt(0).toUpperCase();
            const restOfWord = cat.slice(1);
            btn.innerHTML = `<span class="cat-icon">${firstLetter}</span><span class="cat-text">${restOfWord}</span>`;
            
            btn.onclick = () => {
                document.querySelectorAll('.sfx-cat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeCategory = cat;
                loadGrid('SFX', cat);
            };
            
            navBar.appendChild(btn);
            if(index === 0) btn.click();
        });
    });
}

function loadSidebar(tabName) {
    const sidebar = document.getElementById('subFolderList');
    const folderPath = path.join(assetsRoot, tabName);
    sidebar.innerHTML = '';

    fs.readdir(folderPath, (err, files) => {
        if (err) {
            sidebar.innerHTML = '<div style="padding:10px; opacity:0.5">No folder found</div>';
            return;
        }
        const folders = files.filter(file => fs.statSync(path.join(folderPath, file)).isDirectory());
        folders.forEach((cat, index) => {
            const btn = document.createElement('div');
            btn.className = 'sub-folder-btn';
            btn.innerText = cat;
            btn.onclick = () => {
                document.querySelectorAll('.sub-folder-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                btn.style.borderLeftColor = TAB_CONFIG[activeTab].color;
                activeCategory = cat;
                loadGrid(tabName, cat);
            };
            sidebar.appendChild(btn);
            if(index === 0) btn.click();
        });
    });
}

function loadGrid(tabName, category) {
    const grid = document.getElementById('assetGrid');
    const folderPath = path.join(assetsRoot, tabName, category);
    const config = TAB_CONFIG[tabName];

    // Layout Switching
    grid.className = 'grid'; 
    if (tabName === 'SFX') {
        grid.classList.add('layout-sfx-grid'); // 3x7
    } else {
        grid.classList.add('layout-gallery'); // 3 Cols (Will be 3x2 for GFX due to batch size)
    }

    // Header
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

function nextPage() {
    const batchSize = getBatchSize();
    const totalPages = Math.ceil(allFiles.length / batchSize);
    if (currentPage < totalPages - 1) {
        currentPage++;
        renderPage(currentPage);
    }
}

function prevPage() {
    if (currentPage > 0) {
        currentPage--;
        renderPage(currentPage);
    }
}

function renderPage(pageIndex) {
    const grid = document.getElementById('assetGrid');
    const folderPath = path.join(assetsRoot, activeTab, activeCategory);
    const config = TAB_CONFIG[activeTab];
    const batchSize = getBatchSize(); // Returns 6 for GFX
    
    isLoading = true;
    grid.innerHTML = ''; 
    grid.scrollTop = 0;  

    const start = pageIndex * batchSize;
    const end = start + batchSize;
    const batch = allFiles.slice(start, end);

    batch.forEach(file => {
        const fullPath = path.join(folderPath, file);
        const card = document.createElement('div');
        card.className = 'asset-card';
        if(config.isPreset) card.classList.add('preset-card');
        
        if (activeTab === 'SFX') {
            card.innerHTML = `<div class="preset-placeholder" style="color:${config.color}">🔊</div><div class="card-label">${file}</div>`;
            card.onmouseenter = () => playAudio(fullPath);
            card.onmouseleave = () => stopAudio();
        } else if (activeTab === 'GFX' || activeTab === 'VFX') {
            const isVideo = ['.mov', '.mp4'].includes(path.extname(file).toLowerCase());
            if(isVideo) {
                card.innerHTML = `<video class="card-media" src="${fullPath}" loop muted></video><div class="card-label">${file}</div>`;
                const vid = card.querySelector('video');
                vid.onloadedmetadata = () => { vid.currentTime = vid.duration / 2; };
                card.onmouseenter = () => { vid.play(); };
                card.onmouseleave = () => { vid.pause(); vid.currentTime = vid.duration / 2; };
            } else {
                card.innerHTML = `<img class="card-media" src="${fullPath}"> <div class="card-label">${file}</div>`;
            }
        } else if (activeTab === 'PRESETS') {
            const previewPath = fullPath.replace('.ffx', '.mp4');
            let html = `<div class="preset-placeholder">✨</div>`;
            if (fs.existsSync(previewPath)) {
               html = `<div class="preset-placeholder">✨</div><video class="card-media" src="${previewPath}" loop muted></video><div class="card-label">${file}</div>`;
            } else {
                html += `<div class="card-label">${file}</div>`;
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

function updateFloatingPagination(pageIndex) {
    let container = document.getElementById('paginationFloat');
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'paginationFloat';
        container.className = 'pagination-float';
        document.querySelector('.grid-container').appendChild(container);
    }
    
    container.innerHTML = ''; 

    const batchSize = getBatchSize();
    const totalPages = Math.ceil(allFiles.length / batchSize);

    if (pageIndex > 0) {
        const upBtn = document.createElement('div');
        upBtn.className = 'float-btn';
        upBtn.innerHTML = '▲'; 
        upBtn.title = "Previous Page";
        upBtn.onclick = prevPage;
        container.appendChild(upBtn);
    }

    if (pageIndex < totalPages - 1) {
        const downBtn = document.createElement('div');
        downBtn.className = 'float-btn';
        downBtn.innerHTML = '▼';
        downBtn.title = "Next Page";
        downBtn.onclick = nextPage;
        container.appendChild(downBtn);
    }
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

function sendToAE(functionName, filePath) {
    const cleanPath = filePath.replace(/\\/g, "\\\\");
    csInterface.evalScript(`${functionName}("${cleanPath}")`);
}

init();