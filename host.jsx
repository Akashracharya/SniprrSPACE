// 1. IMPORT MEDIA
function importFile(filePath) {
    app.beginUndoGroup("SniprrSPACE Import");
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            alert("Please select a Composition.");
            return;
        }

        // Check for selected layer to place above
        var targetLayer = (comp.selectedLayers.length > 0) ? comp.selectedLayers[0] : null;

        var io = new ImportOptions(new File(filePath));
        var importedItem = app.project.importFile(io);

        var layer = comp.layers.add(importedItem);

        // 1. Set Start Time
        // If a layer is selected, match its start time? Or stick to CTI?
        // Usually imports go to CTI (Current Time Indicator).
        layer.startTime = comp.time;

        // 2. Place Above Selected Layer
        if (targetLayer) {
            layer.moveBefore(targetLayer);
        }

        // Auto-label colors
        if (filePath.match(/\.(mp3|wav|aiff)$/i)) layer.label = 11; // Orange for SFX
        else layer.label = 9; // Blue for video

    } catch (err) {
        // alert(err.toString());
    }
    app.endUndoGroup();
}

// 7. STRICT APPLY PRESET (Fixed: No .trim() error)
// 8. FINAL ROBUST APPLY PRESET (Decodes URI + Flexible Tagging)
// 16. FINAL HOST.JSX (Includes [direct] support)
function applyPreset(presetPath) {
    app.beginUndoGroup("Sniprr Apply Preset");

    try {
        var comp = app.project.activeItem;

        // --- CHECKS ---
        if (!comp || !(comp instanceof CompItem)) {
            alert("SniprrError: No Composition Active.");
            return;
        }

        // 1. ANALYZE FILE NAME
        var presetFile = new File(presetPath);
        if (!presetFile.exists) {
            presetFile = new File(decodeURIComponent(presetPath));
            if (!presetFile.exists) {
                alert("File not found: " + presetPath);
                return;
            }
        }

        var decodedName = decodeURIComponent(presetFile.name);
        var nameLower = decodedName.toLowerCase();

        // Create Clean Name (No tags) for new layers
        var layerName = decodedName
            .replace(/\.ffx$/i, "")         // Remove extension
            .replace(/\[.*?\]/g, "")        // Remove [tags]
            .replace(/\s+/g, " ")           // Collapse spaces
            .replace(/^\s+|\s+$/g, '');     // Trim

        // --- 2. PARSE TAGS ---
        var isDirect = /\[\s*direct\s*\]/i.test(nameLower); // NEW: [direct]
        var isFull   = /\[\s*full\s*\]/i.test(nameLower);
        var isNull   = /\[\s*null\s*\]/i.test(nameLower);
        var isSolid  = /\[\s*(s|sol|solid|white|flash)\s*\]/i.test(nameLower);
        var isBlack  = /\[\s*(black|shadow)\s*\]/i.test(nameLower);
        var isCentered = /\[\s*(c|center|trans)\s*\]/i.test(nameLower);

        var customDuration = null;
        var durationMatch = nameLower.match(/\[\s*(\d+)\s*(f|s)\s*\]/i);

        if (durationMatch) {
            var val = parseInt(durationMatch[1], 10);
            var unit = durationMatch[2];
            if (unit === 's') customDuration = val;
            else if (unit === 'f') customDuration = val * comp.frameDuration;
        }

        // --- 3. CHECK SELECTION ---
        var targets = comp.selectedLayers;
        var runGlobal = false;

        if (targets.length === 0) {
            // Logic: [direct] MUST have a selection. 
            // Only [full] WITHOUT [direct] can run globally.
            if (isFull && !isDirect) {
                runGlobal = true; 
            } else {
                alert("SniprrError: No Layer Selected.\nPlease select a layer.");
                return; 
            }
        }

        var loopCount = runGlobal ? 1 : targets.length;

        // --- 4. EXECUTE ---
        for (var i = 0; i < loopCount; i++) {
            
            var targetLayer = runGlobal ? null : targets[i];
            var newLayer;

            // A. Timing Logic
            var finalDuration = 0;
            var startTime = 0;

            if (isFull) {
                startTime = 0;
                finalDuration = comp.duration;
            } 
            else {
                // If Direct, we default to layer start, but we won't trim it later
                if (customDuration !== null) finalDuration = customDuration;
                else {
                    finalDuration = targetLayer ? (targetLayer.outPoint - targetLayer.inPoint) : comp.duration;
                    if (isCentered) finalDuration = 1.0;
                }
                
                if (targetLayer) {
                     if (isCentered) startTime = targetLayer.inPoint - (finalDuration / 2);
                     else startTime = targetLayer.inPoint;
                }
            }

            // Move CTI (Crucial for keyframes)
            comp.time = startTime;

            // B. Layer Creation Logic
            if (isDirect) {
                // [DIRECT MODE]: Apply to the existing layer
                if (!targetLayer) continue; // Safety check
                newLayer = targetLayer;
            } 
            else {
                // [NORMAL MODE]: Create a new container layer
                if (isNull) {
                    newLayer = comp.layers.addNull();
                    newLayer.label = 1;
                }
                else if (isSolid) {
                    newLayer = comp.layers.addSolid([1, 1, 1], layerName, comp.width, comp.height, comp.pixelAspect);
                    newLayer.label = 5;
                }
                else if (isBlack) {
                    newLayer = comp.layers.addSolid([0, 0, 0], layerName, comp.width, comp.height, comp.pixelAspect);
                    newLayer.label = 15;
                }
                else {
                    // Default: Adjustment Layer
                    newLayer = comp.layers.addSolid([1, 1, 1], layerName, comp.width, comp.height, comp.pixelAspect);
                    newLayer.adjustmentLayer = true;
                    newLayer.label = 8;
                }

                // Place above target
                if (targetLayer) newLayer.moveBefore(targetLayer);
                else newLayer.moveToBeginning();
            }

            // C. Apply Preset
            try { newLayer.applyPreset(presetFile); } catch (e) { }

            // D. Force Properties (ONLY for new layers)
            // If [direct], we leave the layer name and duration alone
            if (!isDirect) {
                newLayer.name = layerName;
                newLayer.inPoint = startTime;
                newLayer.outPoint = startTime + finalDuration;
            }
        }

    } catch (err) {
        alert("Error: " + err.toString());
    }

    app.endUndoGroup();
}

// [APPEND TO BOTTOM OF host.jsx]

// [REPLACE THE PREVIOUS saveSnapshot FUNCTION WITH THIS]

// [REPLACE saveSnapshot WITH THESE TWO FUNCTIONS]

// PHASE 1: SAVE ONLY
function saveSnapshot(folderPath) {
    app.beginUndoGroup("Sniprr Snapshot Save");
    var savedPath = ""; // We will return this path to JS
    
    try {
        // --- ROBUST COMP FINDER (Fixes the "Layer Selection" bug) ---
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            // If Project Panel is focused, check the Active Viewer
            if (app.activeViewer && app.activeViewer.activeComp) {
                comp = app.activeViewer.activeComp;
            }
        }
        
        if (!comp || !(comp instanceof CompItem)) {
            return "ERROR: No Composition found. Click inside the Timeline.";
        }

        // --- SAVE LOGIC ---
        var f = new Folder(folderPath);
        if (!f.exists) return "ERROR: Folder not found.";

        function pad(n, width) { return n.length >= width ? n : new Array(width - n.length + 1).join('0') + n; }
        
        // Create unique name
        var safeName = comp.name.replace(/[^a-z0-9]/gi, '_').toLowerCase().substr(0, 20);
        var frame = Math.round(comp.time / comp.frameDuration);
        var timestamp = new Date().getTime().toString().slice(-5);
        var fileName = safeName + "_" + pad(frame + "", 5) + "_" + timestamp + ".png";
        
        var fileObj = new File(f.fsName + "/" + fileName);
        
        // Save
        comp.saveFrameToPng(comp.time, fileObj);
        savedPath = fileObj.fsName;

    } catch (err) {
        return "ERROR: " + err.toString();
    }
    app.endUndoGroup();
    
    return savedPath; // Send path back to JavaScript
}

// PHASE 2: IMPORT ONLY
function importSnapshot(filePath) {
    app.beginUndoGroup("Sniprr Snapshot Import");
    try {
        var fileObj = new File(filePath);
        
        if (fileObj.exists) {
            var io = new ImportOptions(fileObj);
            io.sequence = false;
            var importedItem = app.project.importFile(io);
            importedItem.selected = true; // Highlight it
        } else {
            alert("Import Failed: File system was too slow.\nTry increasing the timer.");
        }
    } catch(err) {
        // alert("Import Error: " + err.toString());
    }
    app.endUndoGroup();
}


// 3. CREATE LAYER (Updated with Shift+Null Parenting)
function createLayer(type, colorHex, userLabel, doParent) {
    app.beginUndoGroup("Sniprr Create " + type);
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        app.endUndoGroup();
        return;
    }

    // Capture all selected layers BEFORE we create the new one (which deselects everything)
    // Capture all selected layers BEFORE we create the new one (which deselects everything)
    var originalSelection = [];
    for (var s = 0; s < comp.selectedLayers.length; s++) {
        originalSelection.push(comp.selectedLayers[s]);
    }
    
    // Find the physically highest layer in the timeline stack (lowest index)
    var target = null;
    if (originalSelection.length > 0) {
        var highestIndex = 999999;
        for (var k = 0; k < originalSelection.length; k++) {
            if (originalSelection[k].index < highestIndex) {
                highestIndex = originalSelection[k].index;
                target = originalSelection[k];
            }
        }
    }

    // 1. Determine Dimensions & Time
    var w = comp.width;
    var h = comp.height;
    var pa = comp.pixelAspect;
    var duration = comp.duration;
    var startT = (target) ? target.inPoint : comp.time;
    if (target) duration = target.outPoint - target.inPoint;

    // 2. Resolve Name
    var finalName = userLabel;
    if (!finalName || finalName === "") {
        if (type === 'adjustment') finalName = "Adjustment Layer";
        else if (type === 'solid') finalName = "Solid";
        else if (type === 'camera') finalName = "Camera";
        else if (type === 'text') finalName = "Text";
        else if (type === 'null') finalName = "Null";
        else finalName = "Layer";
    }

    // 3. Resolve Color
    var col = [0.5, 0.5, 0.5];
    if (colorHex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colorHex);
        if (result) col = [parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255];
    }

    var newLayer = null;
    try {
        switch (type) {
            case 'adjustment':
                newLayer = comp.layers.addSolid([1, 1, 1], finalName, w, h, pa, duration);
                newLayer.adjustmentLayer = true;
                newLayer.label = 5;
                break;
            case 'solid':
                newLayer = comp.layers.addSolid(col, finalName, w, h, pa, duration);
                break;
            case 'null':
                newLayer = comp.layers.addNull();
                break;
            case 'camera':
                var countBefore = comp.numLayers;
                app.executeCommand(app.findMenuCommandId("Camera..."));
                if (comp.numLayers > countBefore) {
                    newLayer = comp.selectedLayers[0];
                    if (userLabel && userLabel !== "") {
                        newLayer.name = finalName;
                    }
                    finalName = newLayer.name;
                }
                break;
            case 'text':
                newLayer = comp.layers.addText(finalName);
                break;
        }

        if (newLayer) {
            newLayer.name = finalName;

            // Match Timing / Position
            if (target) {
                newLayer.startTime = target.startTime;
                newLayer.inPoint = target.inPoint;
                newLayer.outPoint = target.outPoint;
                newLayer.moveBefore(target);
            } else {
                newLayer.startTime = startT;
            }
            
            // --- NEW PARENTING LOGIC ---
            var shouldParent = (doParent === true || doParent === "true");
            
            if (type === 'null' && shouldParent && originalSelection.length > 0) {
                // Loop through all the layers you had selected and link them to the Null
                for (var i = 0; i < originalSelection.length; i++) {
                    originalSelection[i].parent = newLayer;
                }
            }
        }
    } catch (err) { 
        alert(err.toString()); 
    }
    app.endUndoGroup();
}


// 4. PRE-COMPOSE (Fixed: Explicit Renaming)
function doPrecompose(individual, userLabel) {
    app.beginUndoGroup("Sniprr Pre-compose");
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem) || comp.selectedLayers.length === 0) {
        app.endUndoGroup();
        return;
    }

    var sel = comp.selectedLayers;

    function trimPrecomp(compItem, newLayer, minIn, duration) {
        compItem.duration = duration;
        for (var i = 1; i <= compItem.numLayers; i++) {
            var layer = compItem.layer(i);
            layer.startTime -= minIn;
        }
        newLayer.startTime = minIn;
        newLayer.inPoint = minIn;
        newLayer.outPoint = minIn + duration;
    }

    if (individual) {
        // Individual Mode
        for (var i = 0; i < sel.length; i++) {
            var layer = sel[i];
            var idx = layer.index;
            var inP = layer.inPoint;
            var outP = layer.outPoint;
            var dur = outP - inP;

            // Generate Name
            var baseName = (userLabel && userLabel !== "") ? userLabel : layer.name;
            var finalName = baseName + " Comp " + (i + 1);

            var newComp = comp.layers.precompose([idx], finalName, true);
            var newLayer = comp.selectedLayers[0]; // The new precomp layer

            // Rename the Layer inside the main comp
            if (userLabel && userLabel !== "") newLayer.name = userLabel + " " + (i + 1);

            trimPrecomp(newComp, newLayer, inP, dur);
        }

    } else {
        // Group Mode
        var indices = [];
        var minIn = 999999;
        var maxOut = -999999;

        for (var i = 0; i < sel.length; i++) {
            indices.push(sel[i].index);
            if (sel[i].inPoint < minIn) minIn = sel[i].inPoint;
            if (sel[i].outPoint > maxOut) maxOut = sel[i].outPoint;
        }

        var dur = maxOut - minIn;
        var pName = (userLabel && userLabel !== "") ? userLabel : "Pre-comp";

        var newComp = comp.layers.precompose(indices, pName, true);
        var newLayer = comp.selectedLayers[0];

        // Rename the Layer explicitly
        if (userLabel && userLabel !== "") newLayer.name = userLabel;

        trimPrecomp(newComp, newLayer, minIn, dur);
    }
    app.endUndoGroup();
}

// 5. FRAME BLENDING (Fixed)


// 6. FIT TO COMP (Fixed: No Shrink, Maintain Aspect)
// [REPLACE the existing fitToComp function with this updated version]

// 6. FIT TO COMP (Updated: FILL COMP logic)
// Scales the layer to completely cover the composition (no black bars)
function fitToComp() {
    app.beginUndoGroup("Sniprr Fit Fill");

    var comp = app.project.activeItem;
    if (!(comp && comp instanceof CompItem)) {
        app.endUndoGroup();
        return;
    }

    var sel = comp.selectedLayers;
    if (sel.length === 0) {
        app.endUndoGroup();
        return;
    }

    var t = comp.time;

    for (var i = 0; i < sel.length; i++) {
        var layer = sel[i];
        if (layer.locked) continue;
        if (layer instanceof CameraLayer || layer instanceof LightLayer) continue;

        // Reset scale to 100 to get accurate source dimensions
        var currentScale = layer.transform.scale.value;
        layer.transform.scale.setValue(layer.threeDLayer ? [100, 100, 100] : [100, 100]);

        var rect = layer.sourceRectAtTime(t, false);
        
        // Safety check for empty layers
        if (!rect || rect.width === 0 || rect.height === 0) {
            // Restore previous scale if we can't calculate
            layer.transform.scale.setValue(currentScale);
            continue;
        }

        // Calculate Scale needed for Width and Height
        var scaleX = comp.width / rect.width;
        var scaleY = comp.height / rect.height;

        // FILL LOGIC: Choose the LARGER scale factor to ensure coverage
        var finalScale = Math.max(scaleX, scaleY) * 100;

        // Apply Scale
        if (layer.threeDLayer) {
            layer.transform.scale.setValue([finalScale, finalScale, 100]);
        } else {
            layer.transform.scale.setValue([finalScale, finalScale]);
        }

        // Optional: Also center it (standard behavior for Fit/Fill commands)
        if (layer.threeDLayer) {
            layer.transform.position.setValue([comp.width / 2, comp.height / 2, 0]);
        } else {
            layer.transform.position.setValue([comp.width / 2, comp.height / 2]);
        }
    }

    app.endUndoGroup();
}

// [ADD THIS NEW FUNCTION to the bottom of host.jsx]

function centerLayer() {
    app.beginUndoGroup("Sniprr Center");
    var comp = app.project.activeItem;
    if (comp && comp.selectedLayers.length > 0) {
        var sel = comp.selectedLayers;
        for (var i = 0; i < sel.length; i++) {
            var layer = sel[i];
            if (layer.locked) continue;

            // Handle 2D vs 3D Position
            if (layer.threeDLayer) {
                // Keep existing Z position, reset X and Y
                var currentPos = layer.transform.position.value;
                layer.transform.position.setValue([comp.width / 2, comp.height / 2, currentPos[2]]);
            } else {
                layer.transform.position.setValue([comp.width / 2, comp.height / 2]);
            }
        }
    }
    app.endUndoGroup();
}


// [APPEND TO BOTTOM OF host.jsx]

// HUE: Adds "Hue/Saturation" effect to selected layers
function applyHueSaturation() {
    app.beginUndoGroup("Sniprr Add Hue/Sat");
    var comp = app.project.activeItem;
    
    if (comp && comp.selectedLayers.length > 0) {
        var sel = comp.selectedLayers;
        for (var i = 0; i < sel.length; i++) {
            var layer = sel[i];
            
            // Skip locked layers
            if (layer.locked) continue;

            try {
                // Check if layer can hold effects (Cameras/Lights usually can't)
                if (layer.property("Effects")) {
                    // "ADBE HUE SATURATION" is the universal match name
                    layer.property("Effects").addProperty("ADBE HUE SATURATION");
                }
            } catch (err) {
                // Ignore layers that don't accept effects
            }
        }
    }
    app.endUndoGroup();
}

// 7. ANCHOR POINT (Fixed: Robust 2D/3D Math)
// [PARTIAL UPDATE - Replace the existing setAnchorPoint function]

// 7. ANCHOR POINT (Standard 1-9 Grid Logic)
// 1 2 3
// 4 5 6
// 7 8 9
function setAnchorPoint(posIndex) {
    app.beginUndoGroup("Sniprr Anchor");
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return;
    var sel = comp.selectedLayers;

    for (var n = 0; n < sel.length; n++) {
        var layer = sel[n];
        var rect = layer.sourceRectAtTime(comp.time, false);

        // 1. Calculate Target X
        var newX = rect.left;
        if (posIndex === 2 || posIndex === 5 || posIndex === 8) newX += rect.width / 2; // Center Cols
        if (posIndex === 3 || posIndex === 6 || posIndex === 9) newX += rect.width;     // Right Cols

        // 2. Calculate Target Y
        var newY = rect.top;
        if (posIndex === 4 || posIndex === 5 || posIndex === 6) newY += rect.height / 2; // Middle Rows
        if (posIndex === 7 || posIndex === 8 || posIndex === 9) newY += rect.height;     // Bottom Rows

        var newAnchor = [newX, newY, 0];

        // 3. Compensation Math (Keep Layer in Visual Place)
        var curAnchor = layer.transform.anchorPoint.value;
        var delta = [newAnchor[0] - curAnchor[0], newAnchor[1] - curAnchor[1]];

        var curScale = layer.transform.scale.value;
        var curRot = layer.transform.rotation.value;

        // Convert Scale % to decimal factor
        var sX = curScale[0] / 100;
        var sY = curScale[1] / 100;

        // Apply Rotation
        var rad = curRot * (Math.PI / 180);
        var cos = Math.cos(rad);
        var sin = Math.sin(rad);

        // Rotate the delta offset
        var dX = delta[0] * sX;
        var dY = delta[1] * sY;

        var rotDX = (dX * cos) - (dY * sin);
        var rotDY = (dX * sin) + (dY * cos);

        var curPos = layer.transform.position.value;

        // Apply values
        if (layer.threeDLayer) {
            layer.transform.anchorPoint.setValue([newAnchor[0], newAnchor[1], curAnchor[2]]);
            layer.transform.position.setValue([curPos[0] + rotDX, curPos[1] + rotDY, curPos[2]]);
        } else {
            layer.transform.anchorPoint.setValue([newAnchor[0], newAnchor[1]]);
            layer.transform.position.setValue([curPos[0] + rotDX, curPos[1] + rotDY]);
        }
    }
    app.endUndoGroup();
}
// [APPEND TO BOTTOM OF host.jsx]

// 11. MOVE LAYER IN/OUT (INP / OUTP Buttons)
function moveLayerPoint(type) {
    app.beginUndoGroup("Sniprr Move " + type);
    var comp = app.project.activeItem;
    if (comp && comp.selectedLayers.length > 0) {
        var sel = comp.selectedLayers;
        var t = comp.time;

        for (var i = 0; i < sel.length; i++) {
            var layer = sel[i];

            if (type === 'in') {
                // Calculate difference between current InPoint and CTI
                var offset = t - layer.inPoint;
                // Move the layer by that amount
                layer.startTime += offset;
            }
            else if (type === 'out') {
                // Calculate difference between current OutPoint and CTI
                var offset = t - layer.outPoint;
                layer.startTime += offset;
            }
        }
    }
    app.endUndoGroup();
}

// 8. MOVE CTI (Frames)
function moveCTI(deltaFrames) {
    var comp = app.project.activeItem;
    if (comp && comp instanceof CompItem) {
        // Move Current Time Indicator
        comp.time += deltaFrames * comp.frameDuration;
    }
}

// 9. DELETE LAYERS
function deleteSelectedLayers() {
    app.beginUndoGroup("Sniprr Delete");
    var comp = app.project.activeItem;
    if (comp && comp.selectedLayers.length > 0) {
        var sel = comp.selectedLayers;
        for (var i = 0; i < sel.length; i++) {
            sel[i].remove();
        }
    }
    app.endUndoGroup();
}


function trimSelectedLayers(side) {
    app.beginUndoGroup("Sniprr Trim " + side);
    var comp = app.project.activeItem;
    if (comp && comp.selectedLayers.length > 0) {
        var sel = comp.selectedLayers;
        var t = comp.time;

        for (var i = 0; i < sel.length; i++) {
            var layer = sel[i];

            try {
                // TRIM LEFT ( [ ) -> Sets In Point
                // Goal: Layer starts at CTI.
                // Condition: CTI must be BEFORE the current Out Point.
                if (side === 'left') {
                    if (t < layer.outPoint) {
                        layer.inPoint = t;
                    }
                }
                // TRIM RIGHT ( ] ) -> Sets Out Point
                // Goal: Layer ends at CTI.
                // Condition: CTI must be AFTER the current In Point.
                else if (side === 'right') {
                    if (t > layer.inPoint) {
                        layer.outPoint = t;
                    }
                }
            } catch (e) {
                // Ignore errors (prevents crash if layer is locked/invalid)
            }
        }
    }
    app.endUndoGroup();
}
// 5. BLENDING MODE
function setBlendingMode(modeName) {
    app.beginUndoGroup("Sniprr Blend Mode");
    try {
        var comp = app.project.activeItem;
        if (comp && comp.selectedLayers.length > 0) {
            var sel = comp.selectedLayers;
            for (var i = 0; i < sel.length; i++) {
                if (modeName === "ADD") sel[i].blendingMode = BlendingMode.ADD;
                // You can add other modes here later (e.g., SCREEN, OVERLAY)
            }
        }
    } catch (err) { alert(err.toString()); }
    app.endUndoGroup();
}

// [APPEND TO BOTTOM OF host.jsx]

function unPrecompose() {
    app.beginUndoGroup("Sniprr Un-Precompose");
    
    var comp = app.project.activeItem;
    if (!(comp instanceof CompItem) || comp.selectedLayers.length !== 1) {
        alert("Please select exactly one Pre-comp layer to un-precompose.");
        app.endUndoGroup();
        return;
    }

    var layer = comp.selectedLayers[0];
    
    // Verify it is a pre-comp
    if (layer.source === null || !(layer.source instanceof CompItem)) {
        alert("Selected layer is not a Pre-composition.");
        app.endUndoGroup();
        return;
    }

    var precomp = layer.source;
    var startTimeOffset = layer.startTime;
    var layerIndex = layer.index;

    // 1. Open Precomp and Copy Layers
    precomp.openInViewer();
    var preLayers = precomp.layers;
    
    if (preLayers.length === 0) {
        // Empty comp, just delete the layer in main?
        comp.openInViewer();
        layer.remove();
        app.endUndoGroup();
        return;
    }

    // Select all layers inside precomp
    for (var i = 1; i <= preLayers.length; i++) {
        preLayers[i].selected = true;
    }
    
    // Copy to clipboard
    app.executeCommand(app.findMenuCommandId("Copy"));
    
    // Deselect to be clean
    for (var i = 1; i <= preLayers.length; i++) {
        preLayers[i].selected = false;
    }

    // 2. Paste in Main Comp
    comp.openInViewer(); // Switch back to main comp
    layer.selected = false; // Deselect the precomp layer so we don't paste *into* it or replace it depending on prefs

    app.executeCommand(app.findMenuCommandId("Paste"));

    // 3. Retime and Move Pasted Layers
    var pastedLayers = comp.selectedLayers;
    
    // We iterate backwards to maintain relative order when moving
    for (var i = 0; i < pastedLayers.length; i++) {
        var pLayer = pastedLayers[i];
        
        // Offset time by the Pre-comp's start time
        pLayer.startTime += startTimeOffset;
        
        // Move to the index where the Pre-comp was
        pLayer.moveBefore(layer);
    }
    
    // 4. Remove original Pre-comp layer
    layer.remove();

    app.endUndoGroup();
}

function importPastedImage(filePath, isShift) {
    // Convert the string passed from JS into a real boolean
    var placeOnTimeline = (isShift === true || isShift === "true");

    app.beginUndoGroup("Paste Image");
    try {
        var fileToImport = new File(filePath);
        if (!fileToImport.exists) {
            alert("Could not locate the pasted file.");
            return;
        }

        // 1. Import into Project Panel
        var importOptions = new ImportOptions(fileToImport);
        var importedItem = app.project.importFile(importOptions);

        // 2. If Shift was held, add to current timeline
        if (placeOnTimeline && app.project.activeItem && app.project.activeItem instanceof CompItem) {
            var comp = app.project.activeItem;
            var selectedLayers = comp.selectedLayers;
            
            // Add the image to the composition
            var newLayer = comp.layers.add(importedItem);

            // Move the start point of the image to the CTI (Playhead)
            newLayer.startTime = comp.time;

            // If a layer is selected, place the new image exactly ABOVE it
            if (selectedLayers.length > 0) {
                newLayer.moveBefore(selectedLayers[0]);
            }
        }
    } catch (e) {
        alert("Error pasting image to After Effects: " + e.toString());
    }
    app.endUndoGroup();
}

function applyExpression(exprType) {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        alert("Please select a composition.");
        return;
    }

    var layers = comp.selectedLayers;
    if (layers.length === 0) {
        alert("Please select a layer and highlight a property (e.g., Scale, Position).");
        return;
    }

    // Define the expression strings
    var exprString = "";
    
    if (exprType === "bounce") {
        // Updated expression linking 'amp' to the Slider Control
        // The try/catch ensures the expression won't break if the user accidentally deletes the slider
        exprString = "var sens = 1;\n" +
                     "try { sens = effect('Bounce Sensitivity')('Slider') / 100; } catch(e) {}\n" +
                     "amp = .04 * sens;\n" +
                     "freq = 1.8;\n" +
                     "decay = 3;\n" +
                     "n = 0;\n" +
                     "time_max = 3;\n\n" +
                     "if (numKeys > 0) {\n" +
                     "  n = nearestKey(time).index;\n" +
                     "  if (key(n).time > time) {\n" +
                     "    n--;\n" +
                     "  }\n" +
                     "}\n\n" +
                     "if (n == 0) {\n" +
                     "  t = 0;\n" +
                     "} else {\n" +
                     "  t = time - key(n).time;\n" +
                     "}\n\n" +
                     "if (n > 0 && t < time_max) {\n" +
                     "  v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);\n" +
                     "  easeFactor = easeOut(t, 0, time_max, 1, 0);\n" +
                     "  value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t) * easeFactor;\n" +
                     "} else {\n" +
                     "  value;\n" +
                     "}";
    } 
    else if (exprType === "wiggle") {
        // --- NEW: LINK WIGGLE TO DYNAMIC SLIDER CONTROLS ---
        exprString = "var freq = 2;\n" +
                     "var amp = 20;\n" +
                     "try { freq = effect('Wiggle Frequency')('Slider'); } catch(e) {}\n" +
                     "try { amp = effect('Wiggle Amplitude')('Slider'); } catch(e) {}\n" +
                     "wiggle(freq, amp);";
        groupTitle = "Apply Expression: Wiggle Control";
    }
    else if (exprType === "loop") {
        exprString = "loopOut('cycle');";
    } 
    else if (exprType === "spin") {
        exprString = "time * 150;";
    } 
    else if (exprType === "timer") {
        // --- UPDATED TEXT COUNTER/TIMER EXPRESSION ---
        exprString = "var num = 0;\n" +
                     "try {\n" +
                     "  num = effect('Timer Value')('Slider');\n" +
                     "} catch(e) {\n" +
                     "  num = value;\n" +
                     "}\n" +
                     "Math.round(num);";
        groupTitle = "Apply Expression: Value Counter";
    }

    app.beginUndoGroup("Apply Expression: " + exprType);
    var appliedCount = 0;

    // Loop through all selected layers and their highlighted properties
    for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        
        // --- NEW: Add the 'Bounce Sensitivity' Slider Control ---
        if (exprType === "bounce") {
            try {
                if (layer.property("Effects")) {
                    var sliderName = "Bounce Sensitivity";
                    var sliderEffect = layer.property("Effects").property(sliderName);
                    
                    // Only add the slider if it doesn't already exist on this layer
                    if (!sliderEffect) {
                        sliderEffect = layer.property("Effects").addProperty("ADBE Slider Control");
                        sliderEffect.name = sliderName;
                        sliderEffect.property("Slider").setValue(100); // Defaults to 100% sensitivity
                    }
                }
            } catch(err) {
                // Ignore layers that don't accept effects (like Lights/Cameras)
            }
        }
        
        if (exprType === "wiggle") {
            try {
                if (layer.property("Effects")) {
                    var freqName = "Wiggle Frequency";
                    var ampName = "Wiggle Amplitude";
                    
                    var freqSlider = layer.property("Effects").property(freqName);
                    if (!freqSlider) {
                        freqSlider = layer.property("Effects").addProperty("ADBE Slider Control");
                        freqSlider.name = freqName;
                        freqSlider.property("Slider").setValue(2); // Maps directly to original frequency
                    }
                    
                    var ampSlider = layer.property("Effects").property(ampName);
                    if (!ampSlider) {
                        ampSlider = layer.property("Effects").addProperty("ADBE Slider Control");
                        ampSlider.name = ampName;
                        ampSlider.property("Slider").setValue(20); // Maps directly to original amplitude
                    }
                }
            } catch(err) {}
        }


        if (exprType === "timer") {
            try {
                if (layer.property("Effects")) {
                    var timerSliderName = "Timer Value";
                    var timerSlider = layer.property("Effects").property(timerSliderName);
                    
                    if (!timerSlider) {
                        timerSlider = layer.property("Effects").addProperty("ADBE Slider Control");
                        timerSlider.name = timerSliderName;
                        
                        var sliderProp = timerSlider.property("Slider");
                        
                        // Add keyframe at layer's In Point with value 0
                        var startKeyIndex = sliderProp.addKey(layer.inPoint);
                        sliderProp.setValueAtKey(startKeyIndex, 0);
                        
                        // Add keyframe 2 seconds later with value 100
                        var endKeyIndex = sliderProp.addKey(layer.inPoint + 2.0);
                        sliderProp.setValueAtKey(endKeyIndex, 100);
                    }
                }
            } catch(err) {}
        }

        var props = layer.selectedProperties;

        if (exprType === "timer" && props.length === 0 && layer.property("Source Text")) {
            props = [layer.property("Source Text")];
        }
        
        for (var j = 0; j < props.length; j++) {
            // Check if the property is actually allowed to have an expression
            if (props[j].canSetExpression) {
                props[j].expression = exprString;
                appliedCount++;
            }
        }
    }

    // If the user selected a layer but didn't actually highlight a property
    if (appliedCount === 0) {
        alert("Please select a Text Layer to apply this counting animation.");
    }
    
    app.endUndoGroup();
}


// --- EASING COPIER TOOL ---
var sniprrCopiedEase = null; // Global variable to hold copied ease data

function sniprrCopyEase() {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return "ERROR: No composition selected.";

    var props = comp.selectedProperties;
    if (props.length === 0) return "ERROR: Please select a keyframe to copy its easing.";

    // Find the first selected property that has selected keyframes
    for (var i = 0; i < props.length; i++) {
        var prop = props[i];
        if (prop.canVaryOverTime && prop.selectedKeys.length > 0) {
            var keyIndex = prop.selectedKeys[0]; // Copy from the first selected keyframe
            
            try {
                var inEase = prop.keyInTemporalEase(keyIndex);
                var outEase = prop.keyOutTemporalEase(keyIndex);
                
                sniprrCopiedEase = { inEase: inEase, outEase: outEase };
                return "SUCCESS";
            } catch (err) {
                return "ERROR: Selected property does not support temporal easing.";
            }
        }
    }
    return "ERROR: No keyframes selected.";
}

function sniprrApplyEase() {
    if (!sniprrCopiedEase) return "ERROR: You haven't copied any easing yet!";
    
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return "ERROR: No composition selected.";

    app.beginUndoGroup("Sniprr Apply Easing");
    var props = comp.selectedProperties;
    var appliedCount = 0;

    for (var i = 0; i < props.length; i++) {
        var prop = props[i];
        if (prop.canVaryOverTime && prop.selectedKeys.length > 0) {
            for (var k = 0; k < prop.selectedKeys.length; k++) {
                var keyIndex = prop.selectedKeys[k];
                
                try {
                    // Determine how many dimensions this property has (e.g. Scale has 2 or 3, Rotation has 1)
                    var targetEase = prop.keyInTemporalEase(keyIndex);
                    var targetDim = targetEase.length;
                    
                    var newInEase = [];
                    var newOutEase = [];
                    
                    // Match the copied ease dimensions to the target property's dimensions
                    for(var dim = 0; dim < targetDim; dim++) {
                        var sourceIn = sniprrCopiedEase.inEase[Math.min(dim, sniprrCopiedEase.inEase.length - 1)];
                        var sourceOut = sniprrCopiedEase.outEase[Math.min(dim, sniprrCopiedEase.outEase.length - 1)];
                        
                        newInEase.push(new KeyframeEase(sourceIn.speed, sourceIn.influence));
                        newOutEase.push(new KeyframeEase(sourceOut.speed, sourceOut.influence));
                    }

                    prop.setTemporalEaseAtKey(keyIndex, newInEase, newOutEase);
                    appliedCount++;
                } catch(err) {
                    // Ignore properties that don't accept standard temporal easing
                }
            }
        }
    }
    app.endUndoGroup();
    
    if (appliedCount > 0) {
        return "SUCCESS:" + appliedCount; // Returns success and how many keys were affected
    } else {
        return "ERROR: Please select keyframes to apply the easing to.";
    }
}


// --- PRESET & QUICK EASING LOGIC ---

function sniprrApplyPresetEase(type) {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return "ERROR: No composition selected.";

    app.beginUndoGroup("Sniprr Preset Easing");
    var props = comp.selectedProperties;
    var appliedCount = 0;

    // Define standard preset curves (Speed, Influence)
    // Define standard preset curves (Speed = 0, Influence In, Influence Out)
    var presets = {
        "ease75":   { inSpeed: 0, inInf: 75,  outSpeed: 0, outInf: 75 },  // Keeps your Quick Graph working
        
        // 9 New Custom Grid Presets
        "p100_100": { inSpeed: 0, inInf: 100, outSpeed: 0, outInf: 100 }, // 1
        "p50_50":   { inSpeed: 0, inInf: 50,  outSpeed: 0, outInf: 50 },  // 2
        "p33_33":   { inSpeed: 0, inInf: 33,  outSpeed: 0, outInf: 33 },  // 3
        "p25_25":   { inSpeed: 0, inInf: 25,  outSpeed: 0, outInf: 25 },  // 4
        "p10_10":   { inSpeed: 0, inInf: 10,  outSpeed: 0, outInf: 10 },  // 5
        "p100_5":   { inSpeed: 0, inInf: 100, outSpeed: 0, outInf: 5 },   // 6
        "p5_100":   { inSpeed: 0, inInf: 5,   outSpeed: 0, outInf: 100 }, // 7
        "p75_33":   { inSpeed: 0, inInf: 75,  outSpeed: 0, outInf: 33 },  // 8
        "p33_75":   { inSpeed: 0, inInf: 33,  outSpeed: 0, outInf: 75 }   // 9
    };

    var p = presets[type];
    if (!p) return "ERROR: Invalid preset.";

    for (var i = 0; i < props.length; i++) {
        var prop = props[i];
        if (prop.canVaryOverTime && prop.selectedKeys.length > 0) {
            for (var k = 0; k < prop.selectedKeys.length; k++) {
                var keyIndex = prop.selectedKeys[k];
                try {
                    // Create Ease objects for this dimension
                    var easeInObj = new KeyframeEase(p.inSpeed, p.inInf);
                    var easeOutObj = new KeyframeEase(p.outSpeed, p.outInf);
                    
                    var targetDim = prop.keyInTemporalEase(keyIndex).length;
                    var newIn = [], newOut = [];
                    for(var dim = 0; dim < targetDim; dim++) {
                        newIn.push(easeInObj);
                        newOut.push(easeOutObj);
                    }
                    
                    prop.setTemporalEaseAtKey(keyIndex, newIn, newOut);
                    appliedCount++;
                } catch(err) { }
            }
        }
    }
    app.endUndoGroup();
    return appliedCount > 0 ? ("SUCCESS:" + appliedCount) : "ERROR: Select keyframes.";
}

// PURGE ALL MEMORY & DISK CACHE
// PURGE ALL MEMORY & DISK CACHE
// PURGE ALL MEMORY & DISK CACHE (NATIVE ADOBE DIALOG)
