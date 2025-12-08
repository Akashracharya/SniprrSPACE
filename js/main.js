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

function init() {
    setupTabs();
    setupMainTools();
    document.querySelector('.tab-btn[data-tab="SFX"]').click(); 
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const browserView = document.getElementById('browserView');
    const toolsView = document.getElementById('toolsView');
    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeTab = tab.getAttribute('data-tab');
            if (activeTab === 'MAIN') {
                browserView.classList.add('hidden');
                toolsView.classList.remove('hidden');
            } else {
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
            let name = document.getElementById('layerNameInput').value;
            // Escape quotes to prevent script errors
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
            let name = document.getElementById('layerNameInput').value;
            name = name.replace(/"/g, '\\"');
            
            // Pass the name to the JSX
            csInterface.evalScript(`createLayer("solid", "${color}", "${name}")`);
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

// Helper for Named Layers (Null, Cam, Adj, Text)
window.createNamed = function(type) {
    const name = document.getElementById('layerNameInput').value;
    // createLayer(type, color=null, name)
    csInterface.evalScript(`createLayer("${type}", null, "${name}")`);
};

// Helper for Time Move
window.moveTime = function(frames) {
    csInterface.evalScript(`moveCTI(${frames})`);
};

// ... (Rest of sidebar/grid loading code remains the same) ...
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
    grid.className = 'grid'; 
    if (tabName === 'SFX') grid.classList.add('layout-list');
    else grid.classList.add('layout-gallery');

    const display = document.getElementById('currentPathDisplay');
    const folderPath = path.join(assetsRoot, tabName, category);
    const config = TAB_CONFIG[tabName];
    
    display.innerText = `${tabName} > ${category}`;
    display.style.color = config.color;
    grid.innerHTML = '';

    fs.readdir(folderPath, (err, files) => {
        if (err) return;
        const validFiles = files.filter(file => config.types.includes(path.extname(file).toLowerCase()));

        validFiles.forEach(file => {
            const fullPath = path.join(folderPath, file);
            const card = document.createElement('div');
            card.className = 'asset-card';
            if(config.isPreset) card.classList.add('preset-card');
            
            if (tabName === 'SFX') {
                card.innerHTML = `<div class="preset-placeholder" style="color:${config.color}">🔊</div><div class="card-label">${file}</div>`;
                card.onmouseenter = () => playAudio(fullPath);
                card.onmouseleave = () => stopAudio();
            } else if (tabName === 'GFX' || tabName === 'VFX') {
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
            } else if (tabName === 'PRESETS') {
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

function sendToAE(functionName, filePath) {
    const cleanPath = filePath.replace(/\\/g, "\\\\");
    csInterface.evalScript(`${functionName}("${cleanPath}")`);
}

init();