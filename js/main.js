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
    'VFX': { types: ['.mov', '.mp4'], color: '#00e5ff', isPreset: false },
    'PRESETS': { types: ['.ffx'], color: '#00e5ff', isPreset: true }
};

let activeTab = 'SFX';
let activeCategory = '';
let currentAudio = null;

// --- INITIALIZATION ---
function init() {
    setupTabs();
    loadSidebar('SFX'); // Load default
}

// 1. SETUP TABS (Horizontal)
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.onclick = () => {
            // UI Update
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Logic Update
            activeTab = tab.getAttribute('data-tab');
            updateThemeColor();
            loadSidebar(activeTab);
        };
    });
}

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
function updateThemeColor() {
    const color = TAB_CONFIG[activeTab].color;
    document.querySelector('.brand span').style.color = color;
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