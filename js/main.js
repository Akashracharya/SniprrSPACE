const os = require('os');
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

let isHoverPlayEnabled = false;
let isPageLock = false;
let activeTab = 'MAIN'; // Will be overridden by init
let activeCategory = '';
let currentAudio = null;
let currentTabIndex = 3; 
let scrollDebounce = 0;
let snapFolderPath = localStorage.getItem('sniprr_snap_path') || '';


// --- PAGINATION VARIABLES ---
let allFiles = [];      
let currentPage = 0;    
let isLoading = false;  
let loadContentTimer = null;
// --- DYNAMIC BATCH SIZE ---
function getBatchSize() {
    if (activeTab === 'SFX') return 60; // 3x7
    if (activeTab === 'GFX') return 6;
    if (activeTab === 'PRESETS') return 4;  // 3x2
    return 9; 
}

function init() {
    setupTabs();
    setupMainTools();
    setupFolderButton();
    setupSnapTools();
    setupPasteTool();
    setupHoverToggle();
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


function setupHoverToggle() {
    const toggleBtn = document.getElementById('sfxHoverToggle');
    if (toggleBtn) {
        toggleBtn.onclick = () => {
            isHoverPlayEnabled = !isHoverPlayEnabled; // Flip the switch
            
            if (isHoverPlayEnabled) {
                toggleBtn.innerText = "HOVER: ON";
                toggleBtn.classList.add('active-toggle');
            } else {
                toggleBtn.innerText = "HOVER: OFF";
                toggleBtn.classList.remove('active-toggle');
                stopAudio(); // Stop any audio immediately if turned off
            }
        };
    }
}



function switchTabContent(tabName) {
    activeTab = tabName;
    const browserView = document.getElementById('browserView');
    const toolsView = document.getElementById('toolsView');
    const hoverToggle = document.getElementById('sfxHoverToggle');
    
    // Grab the main wrapper that holds everything
    const contentArea = document.querySelector('.content-area'); 

    // --- 1. RESTART THE ANIMATION ---
    // Remove the class, force the browser to read the change, then add it back.
    // This creates a smooth transition every single time a tab is clicked!
    contentArea.classList.remove('tab-transition');
    void contentArea.offsetWidth; // <--- The magic line that forces a CSS reset
    contentArea.classList.add('tab-transition');

    // --- 2. SWITCH THE VIEWS ---
    if (activeTab === 'MAIN') {
        browserView.classList.add('hidden');
        toolsView.classList.remove('hidden');
        if(hoverToggle) hoverToggle.classList.add('hidden'); // Hide on MAIN
    } else {
        toolsView.classList.add('hidden');
        browserView.classList.remove('hidden');
        
        // Only show the hover toggle if we are on the SFX tab
        if (hoverToggle) {
            if (activeTab === 'SFX') hoverToggle.classList.remove('hidden');
            else hoverToggle.classList.add('hidden');
        }

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




// [REPLACE THE PREVIOUS setupSnapTools FUNCTION WITH THIS]

function setupSnapTools() {
    const btnSnap = document.getElementById('btnSnap');
    
    // Load existing path
    let snapFolderPath = localStorage.getItem('sniprr_snap_path') || '';

    if (btnSnap) {
        btnSnap.onclick = (e) => {
            // A. SHIFT+CLICK: Force Change Folder
            if (e.shiftKey) {
                const result = window.cep.fs.showOpenDialog(false, true, "Select New Snapshot Folder", snapFolderPath, []);
                if (result.data && result.data.length > 0) {
                    snapFolderPath = result.data[0];
                    localStorage.setItem('sniprr_snap_path', snapFolderPath);
                    alert("Folder updated!");
                }
                return;
            }
        
            // 2. Setup Logic (Same as before)
            if (!snapFolderPath) {
                const result = window.cep.fs.showOpenDialog(false, true, "Select Folder to Save Snapshots", "", []);
                if (result.data && result.data.length > 0) {
                    snapFolderPath = result.data[0];
                    localStorage.setItem('sniprr_snap_path', snapFolderPath);
                } else {
                    return; 
                }
            }
        
            // --- NEW TIMER LOGIC STARTS HERE ---
            
            let safePath = snapFolderPath.replace(/\\/g, "/");
            btnSnap.innerText = "SV..."; // Visual: "Saving..."
        
            // STEP 1: Call SAVE function
            csInterface.evalScript(`saveSnapshot("${safePath}")`, (resultPath) => {
                
                // Check for errors returned from JSX
                if (resultPath.indexOf("ERROR") !== -1) {
                    alert(resultPath);
                    btnSnap.innerText = "SNAP";
                    return;
                }
        
                // STEP 2: Wait 1500ms (1.5 Seconds)
                // This is the timer you requested. It runs in JS so AE doesn't freeze.
                btnSnap.innerText = "WT..."; // Visual: "Waiting..."
                
                setTimeout(() => {
                    
                    // STEP 3: Call IMPORT function
                    // We must escape backslashes for the string to pass correctly
                    const cleanImportPath = resultPath.replace(/\\/g, "\\\\");
                    
                    csInterface.evalScript(`importSnapshot("${cleanImportPath}")`);
                    
                    // Done
                    btnSnap.innerText = "✓";
                    setTimeout(() => btnSnap.innerText = "SNAP", 1000);
                    
                }, 1500); // <--- CHANGE THIS NUMBER (ms) if you need more/less time
            });
        };
}
}



function loadGrid(tabName, category) {
    const grid = document.getElementById('assetGrid');
    const folderPath = path.join(assetsRoot, tabName, category);
    const config = TAB_CONFIG[tabName];

    // Layout Switching
    grid.className = 'grid'; // Reset to default

    if (tabName === 'SFX') {
        grid.classList.add('layout-sfx-grid');
    } 
    else if (tabName === 'PRESETS') {
        // APPLY THE NEW 2x2 CLASS
        grid.classList.add('layout-presets-2x2');
    } 
    else {
        grid.classList.add('layout-gallery');
    }
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
            
            // Only play if the toggle is ON
            card.onmouseenter = () => {
                if (isHoverPlayEnabled) {
                    playAudio(fullPath);
                }
            };
            
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
            // --- 1. SMART PATH FINDING ---
            const dir = path.dirname(fullPath);
            const ext = path.extname(fullPath);
            const baseName = path.basename(fullPath, ext);
            
            // Create "Clean Name" for display (Remove tags)
            const cleanNameDisplay = baseName.replace(/\[.*?\]/g, "").trim();

            function findAsset(extensions) {
                for (let x = 0; x < extensions.length; x++) {
                    const format = extensions[x];
                    let testPath = path.join(dir, baseName + format);
                    if (fs.existsSync(testPath)) return testPath;
                    testPath = path.join(dir, cleanNameDisplay + format);
                    if (fs.existsSync(testPath)) return testPath;
                }
                return null;
            }

            // Path Sanitizer
            const toUrl = (p) => {
                if (!p) return '';
                let forward = p.replace(/\\/g, '/');
                let encoded = encodeURI(forward).replace(/#/g, '%23'); 
                return `file:///${encoded}`;
            };

            const videoPathRaw = findAsset(['.mp4', '.mov']);
            const videoSrc = toUrl(videoPathRaw);

            // --- 2. GENERATE HTML (Text Card First) ---
            
            // A. Base Thumbnail: Big Text Name
            let innerHTML = `
                <div class="text-thumbnail">
                    <div class="thumb-title">${cleanNameDisplay}</div>
                    ${!videoPathRaw ? '<div class="no-preview-tag">NO PREVIEW</div>' : ''}
                </div>
            `;

            // B. If Video Exists, Add Hidden Video Layer
            if (videoPathRaw) {
                innerHTML += `<video class="hover-video" src="${videoSrc}" loop muted playsinline></video>`;
            }

            card.innerHTML = innerHTML;

            // --- 3. PLAYBACK LOGIC ---
            if (videoPathRaw) {
                const vid = card.querySelector('video');
                
                // Only load metadata, don't waste resources loading frames yet
                vid.preload = "none"; 

                card.onmouseenter = () => { 
                    vid.currentTime = 0; 
                    vid.play().catch(e => {}); 
                };

                card.onmouseleave = () => { 
                    vid.pause(); 
                    vid.currentTime = 0; 
                };
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



function setupPasteTool() {
    const btnPaste = document.getElementById('btnPaste');

    if (btnPaste) {
        btnPaste.onclick = (e) => {
            const isShift = e.shiftKey;
            btnPaste.innerText = "WAIT"; // Shows you it's processing
            
            const os = require('os');
            const fs = require('fs');
            const path = require('path');
            const { exec } = require('child_process');

            // Set up a temporary hidden file to store the clipboard image
            const isWin = process.platform === 'win32';
            const ext = isWin ? '.png' : '.tiff';
            const fileName = `Pasted_Image_${Date.now()}${ext}`;
            const filePath = path.join(os.tmpdir(), fileName);
            
            let command = '';

            // Use Operating System commands to bypass Chrome's clipboard block
            if (isWin) {
                // Windows PowerShell command to pull image from clipboard
                command = `powershell.exe -command "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; if ($([System.Windows.Forms.Clipboard]::ContainsImage())) { $image = [System.Windows.Forms.Clipboard]::GetImage(); $image.Save('${filePath}', [System.Drawing.Imaging.ImageFormat]::Png); Write-Output 'SUCCESS' } else { Write-Output 'NO_IMAGE' }"`;
            } else {
                // Mac AppleScript command to pull image from clipboard
                command = `osascript -e 'try' -e 'set theFile to (open for access POSIX file "${filePath}" with write permission)' -e 'write (the clipboard as TIFF picture) to theFile' -e 'close access theFile' -e 'return "SUCCESS"' -e 'on error' -e 'try' -e 'close access file "${filePath}"' -e 'end try' -e 'return "NO_IMAGE"' -e 'end try'`;
            }

            // Run the command!
            exec(command, (err, stdout, stderr) => {
                const output = stdout.toString().trim();
                
                if (output.includes('NO_IMAGE') || err) {
                    alert("No image found in your clipboard!");
                    btnPaste.innerText = "PASTE";
                    return;
                }

                // Success! We have the image. Tell After Effects to import it.
                const safePath = filePath.replace(/\\/g, "\\\\");
                csInterface.evalScript(`importPastedImage("${safePath}", ${isShift})`);
                
                btnPaste.innerText = "DONE";
                setTimeout(() => btnPaste.innerText = "PASTE", 1000); // Reset button text
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
    const btnUnPre = document.getElementById('btnUnPrecompose');
    if(btnUnPre) {
        btnUnPre.onclick = () => {
            csInterface.evalScript('unPrecompose()');
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


window.runNullWithShift = function(e) {
    const isShift = e.shiftKey;
    // createLayer arguments: type, colorHex, userLabel, parentToNull
    csInterface.evalScript(`createLayer("null", null, null, ${isShift})`);
};

// Placeholder functions for the Easing Panel

// --- EASING PANEL LOGIC ---

// --- EASING PANEL & PRESET LOGIC ---

// Existing Copy Function
function copyEasing() {
    const statusText = document.getElementById('epStatus');
    csInterface.evalScript('sniprrCopyEase()', (result) => {
        if (result === "SUCCESS") {
            statusText.innerText = "1 keys copied";
            statusText.style.color = "#4ade80"; 
            setTimeout(() => statusText.style.color = "#888888", 1500);
        } else if (result.includes("ERROR")) alert(result.replace("ERROR: ", ""));
    });
}

// Existing Paste Function
function applyEasing() {
    const statusText = document.getElementById('epStatus');
    csInterface.evalScript('sniprrApplyEase()', (result) => {
        if (result.startsWith("SUCCESS")) {
            const count = result.split(":")[1]; 
            statusText.innerText = `${count} keys pasted!`;
            statusText.style.color = "#a855f7"; 
            setTimeout(() => {
                statusText.innerText = "1 keys copied"; 
                statusText.style.color = "#888888";
            }, 1500);
        } else if (result.includes("ERROR")) alert(result.replace("ERROR: ", ""));
    });
}

// --- NEW MENU LOGIC ---

// Toggle the floating menu
function togglePresetsMenu(e) {
    if (e) e.stopPropagation(); // Prevent document click from firing immediately
    const menu = document.getElementById('epPresetsMenu');
    const btn = document.getElementById('epPresetsTrigger');
    
    if (menu.classList.contains('hidden')) {
        menu.classList.remove('hidden');
        btn.classList.add('active');
    } else {
        menu.classList.add('hidden');
        btn.classList.remove('active');
    }
}

// Close the floating menu if the user clicks anywhere else in the extension window
document.addEventListener('click', (e) => {
    const menu = document.getElementById('epPresetsMenu');
    const triggerBtn = document.getElementById('epPresetsTrigger');
    
    if (menu && triggerBtn && !menu.contains(e.target) && !triggerBtn.contains(e.target)) {
        menu.classList.add('hidden');
        triggerBtn.classList.remove('active');
    }
});

// Send the selected preset to After Effects
function applyPreset(presetType) {
    const statusText = document.getElementById('epStatus');
    const menu = document.getElementById('epPresetsMenu');
    const triggerBtn = document.getElementById('epPresetsTrigger');
    if (menu) menu.classList.add('hidden');
    if (triggerBtn) triggerBtn.classList.remove('active');
    
    csInterface.evalScript(`sniprrApplyPresetEase("${presetType}")`, (result) => {
        if (result.startsWith("SUCCESS")) {
            const count = result.split(":")[1];
            statusText.innerText = `${count} keys eased!`;
            statusText.style.color = "#a855f7"; 
            setTimeout(() => statusText.style.color = "#888888", 1500);
            
            // Auto-close menu on successful apply
            document.getElementById('epPresetsMenu').classList.add('hidden');
            document.getElementById('epPresetsTrigger').classList.remove('active');
        } else if (result.includes("ERROR")) {
            alert(result.replace("ERROR: ", ""));
        }
    });
}
// --- ANCHOR GRID LOGIC ---
window.triggerAnchor = function(clickedBtn, posIndex) {
    // 1. Send the exact position number to After Effects
    const csInterface = new CSInterface();
    csInterface.evalScript(`setAnchorPoint(${parseInt(posIndex)})`);
    
    // 2. Clear 'active' styling from all buttons in the grid
    const allBtns = document.querySelectorAll('.anchor-btn');
    allBtns.forEach(btn => btn.classList.remove('active'));
    
    // 3. Highlight the button you just clicked in Sniprr Purple
    if (clickedBtn) {
        clickedBtn.classList.add('active');
    }
};


init();