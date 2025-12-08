const csInterface = new CSInterface();
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
const extensionRoot = csInterface.getSystemPath(SystemPath.EXTENSION);
const assetsRoot = path.join(extensionRoot, 'assets');

// Valid extensions per tab
const TAB_CONFIG = {
    'SFX': { types: ['.wav', '.mp3', '.aiff'], color: '#00e5ff', isPreset: false },
    'GFX': { types: ['.mov', '.mp4', '.png'], color: '#00e5ff', isPreset: false },
    'PRESETS': { types: ['.ffx'], color: '#00e5ff', isPreset: true },
    'MAIN': { color: '#00e5ff' } // Main tools
};

let activeTab = 'SFX';
let activeCategory = '';
let currentAudio = null;

// --- INITIALIZATION ---
function init() {
    setupTabs();
    setupMainTools();
    document.querySelector('.tab-btn[data-tab="SFX"]').click(); // Load default
}

// 1. SETUP TABS (Horizontal)
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const browserView = document.getElementById('browserView');
    const toolsView = document.getElementById('toolsView');
    tabs.forEach(tab => {
        tab.onclick = () => {
            // UI Update
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Logic Update
            activeTab = tab.getAttribute('data-tab');
            if (activeTab === 'MAIN') {
                // Show Tools, Hide Browser
                browserView.classList.add('hidden');
                toolsView.classList.remove('hidden');
            } else {
                // Show Browser, Hide Tools
                toolsView.classList.add('hidden');
                browserView.classList.remove('hidden');
                loadSidebar(activeTab); // Load assets for this tab
            }
        };
    });
}


// Replace your existing setupMainTools function with this:

function setupMainTools() {
    // 1. Pre-compose Logic (Shift Key)
    const btnPre = document.getElementById('btnPrecompose');
    if(btnPre) {
        btnPre.onclick = (e) => {
            const isShift = e.shiftKey;
            runScript('doPrecompose', isShift);
        };
    }

    // 2. Solid Color Modal Logic
    const btnSolid = document.getElementById('btnSolid');
    const modal = document.getElementById('colorModal');
    const closeModal = document.getElementById('closeModal');
    const swatches = document.querySelectorAll('.color-swatch');

    // Open Modal
    btnSolid.onclick = () => {
        modal.classList.remove('hidden');
    };

    // Close Modal
    closeModal.onclick = () => {
        modal.classList.add('hidden');
    };

    // Color Click
    swatches.forEach(swatch => {
        swatch.onclick = () => {
            const color = swatch.getAttribute('data-col');
            // Pass 'solid' and the Hex Code to JSX
            csInterface.evalScript(`createLayer("solid", "${color}")`);
            modal.classList.add('hidden');
        };
    });
}
// Global script runner for HTML buttons
window.runScript = function(funcName, arg) {
    let script = `${funcName}(${arg})`;
    if (typeof arg === 'string') script = `${funcName}("${arg}")`;
    csInterface.evalScript(script);
};


// 2. LOAD SIDEBAR (Vertical Folders)
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
                // Set active border color dynamically
                btn.style.borderLeftColor = TAB_CONFIG[activeTab].color;
                
                activeCategory = cat;
                loadGrid(tabName, cat);
            };
            sidebar.appendChild(btn);
            
            // Auto-click first folder
            if(index === 0) btn.click();
        });
    });
}

// 3. LOAD GRID (The Assets)
// 3. LOAD GRID (The Assets)
function loadGrid(tabName, category) {
    const grid = document.getElementById('assetGrid');
    
    // ... (Your layout switching logic from previous steps) ...
    grid.className = 'grid'; 
    if (tabName === 'SFX') {
        grid.classList.add('layout-list');
    } else {
        grid.classList.add('layout-gallery');
    }

    const display = document.getElementById('currentPathDisplay');
    const folderPath = path.join(assetsRoot, tabName, category);
    const config = TAB_CONFIG[tabName];
    
    display.innerText = `${tabName} > ${category}`;
    display.style.color = config.color;
    grid.innerHTML = '';

    fs.readdir(folderPath, (err, files) => {
        if (err) return;

        const validFiles = files.filter(file => {
            return config.types.includes(path.extname(file).toLowerCase());
        });

        validFiles.forEach(file => {
            const fullPath = path.join(folderPath, file);
            const card = document.createElement('div');
            card.className = 'asset-card';
            if(config.isPreset) card.classList.add('preset-card');
            
            // --- CONTENT GENERATION ---
            
            // SFX: Show Icon
            if (tabName === 'SFX') {
                card.innerHTML = `
                    <div class="preset-placeholder" style="color:${config.color}">🔊</div>
                    <div class="card-label">${file}</div>
                `;
                card.onmouseenter = () => playAudio(fullPath);
                card.onmouseleave = () => stopAudio();
            }
            
            // GFX / VFX: Show Video/Image Thumbnail
            else if (tabName === 'GFX' || tabName === 'VFX') {
                const isVideo = ['.mov', '.mp4'].includes(path.extname(file).toLowerCase());
                if(isVideo) {
                    card.innerHTML = `
                        <video class="card-media" src="${fullPath}" loop muted></video>
                        <div class="card-label">${file}</div>
                    `;
                    
                    const vid = card.querySelector('video');
                    
                    // 1. SET THUMBNAIL TO MIDDLE
                    vid.onloadedmetadata = () => {
                        vid.currentTime = vid.duration / 2;
                    };

                    // 2. HOVER BEHAVIOR
                    card.onmouseenter = () => { 
                        vid.play(); 
                    };
                    card.onmouseleave = () => { 
                        vid.pause(); 
                        vid.currentTime = vid.duration / 2; // Snap back to middle
                    };
                } else {
                    card.innerHTML = `<img class="card-media" src="${fullPath}"> <div class="card-label">${file}</div>`;
                }
            }

            // PRESETS: Special Logic
            else if (tabName === 'PRESETS') {
                const previewPath = fullPath.replace('.ffx', '.mp4');
                let html = `<div class="preset-placeholder">✨</div>`;
                
                // Check if preview video exists
                if (fs.existsSync(previewPath)) {
                   html = `
                        <div class="preset-placeholder">✨</div>
                        <video class="card-media" src="${previewPath}" loop muted></video>
                        <div class="card-label">${file}</div>
                   `;
                } else {
                    html += `<div class="card-label">${file}</div>`;
                }
                card.innerHTML = html;

                // Video Logic (if exists)
                const vid = card.querySelector('video');
                if (vid) {
                    // 1. SET THUMBNAIL TO MIDDLE
                    vid.onloadedmetadata = () => {
                        vid.currentTime = vid.duration / 2;
                    };

                    // 2. HOVER BEHAVIOR
                    card.onmouseenter = () => { 
                        vid.play();
                    };
                    card.onmouseleave = () => { 
                        vid.pause(); 
                        vid.currentTime = vid.duration / 2; // Snap back to middle
                    };
                }
            }

            // --- DOUBLE CLICK ACTION ---
            card.ondblclick = () => {
                if (config.isPreset) {
                    sendToAE('applyPreset', fullPath);
                } else {
                    sendToAE('importFile', fullPath);
                }
            };

            grid.appendChild(card);
        });
    });
}

// Helpers

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