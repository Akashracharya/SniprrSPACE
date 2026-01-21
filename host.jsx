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
function applyPreset(presetPath) {
    app.beginUndoGroup("Sniprr Apply Preset");

    try {
        var comp = app.project.activeItem;

        // --- CHECKS ---
        if (!comp || !(comp instanceof CompItem)) {
            alert("SniprrError: No Composition Active.");
            return;
        }

        // We need to read the tags BEFORE deciding if we need a selected layer
        var presetFile = new File(presetPath);
        if (!presetFile.exists) {
            presetFile = new File(decodeURIComponent(presetPath));
            if (!presetFile.exists) {
                alert("File not found: " + presetPath);
                return;
            }
        }

        // --- 1. CLEAN & DECODE NAME ---
        var decodedName = decodeURIComponent(presetFile.name);
        var nameLower = decodedName.toLowerCase();
        var layerName = decodedName
            .replace(/\.ffx$/i, "")         // Remove extension
            .replace(/\[.*?\]/g, "")        // Remove [adj], [10f], etc.
            .replace(/\s+/g, " ")           // Collapse double spaces
            .replace(/^\s+|\s+$/g, '');     // Trim start/end spaces

        // --- 2. PARSE TAGS ---
        var isFull  = /\[\s*full\s*\]/i.test(nameLower); // [full]
        var isNull  = /\[\s*null\s*\]/i.test(nameLower);
        var isSolid = /\[\s*(s|sol|solid|white|flash)\s*\]/i.test(nameLower);
        var isBlack = /\[\s*(black|shadow)\s*\]/i.test(nameLower);
        var isCentered = /\[\s*(c|center|trans)\s*\]/i.test(nameLower);

        var customDuration = null;
        var durationMatch = nameLower.match(/\[\s*(\d+)\s*(f|s)\s*\]/i);

        if (durationMatch) {
            var val = parseInt(durationMatch[1], 10);
            var unit = durationMatch[2];
            if (unit === 's') customDuration = val;
            else if (unit === 'f') customDuration = val * comp.frameDuration;
        }

        // [EDITED: New Logic for Selection vs Global]
        var targets = comp.selectedLayers;
        var runGlobal = false;

        // If nothing is selected...
        if (targets.length === 0) {
            if (isFull) {
                // ...but it is [full], enable Global Mode
                runGlobal = true; 
            } else {
                alert("SniprrError: No Layer Selected.\nPlease select a layer");
                return; 
            }
        }

        // Define how many times to loop
        var loopCount = runGlobal ? 1 : targets.length;

        // --- 3. EXECUTE ---
        for (var i = 0; i < loopCount; i++) {
            
            // [EDITED: Handle null target if global]
            var targetLayer = runGlobal ? null : targets[i];

            // A. Calculate Duration & Start Time
            var finalDuration = 0;
            var startTime = 0;

            if (isFull) {
                // [full] -> Cover entire composition 0 to End
                startTime = 0;
                finalDuration = comp.duration;
            } 
            else {
                // Standard Logic (Requires targetLayer)
                if (customDuration !== null) {
                    finalDuration = customDuration;
                } else {
                    // Default: Full Clip
                    finalDuration = targetLayer.outPoint - targetLayer.inPoint;
                    if (isCentered) finalDuration = 1.0;
                }

                // Calculate Start Time based on target
                if (isCentered) {
                    startTime = targetLayer.inPoint - (finalDuration / 2);
                } else {
                    startTime = targetLayer.inPoint;
                }
            }

            // Move CTI
            comp.time = startTime;

            // B. Create Layer
            var newLayer;
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
                newLayer = comp.layers.addSolid([1, 1, 1], layerName, comp.width, comp.height, comp.pixelAspect);
                newLayer.adjustmentLayer = true;
                newLayer.label = 8;
            }

            // [EDITED: Placement Logic]
            // If we have a target, go above it. If Global, go to top of stack.
            if (targetLayer) {
                newLayer.moveBefore(targetLayer);
            } else {
                newLayer.moveToBeginning();
            }

            // Apply Preset
            try { newLayer.applyPreset(presetFile); } catch (e) { }

            // C. FORCE PROPERTIES
            newLayer.name = layerName;
            newLayer.inPoint = startTime;
            newLayer.outPoint = startTime + finalDuration;
        }

    } catch (err) {
        alert("Error: " + err.toString());
    }

    app.endUndoGroup();
}
// 3. CREATE LAYER (Fixed: Naming applied to Source & Layer)
function createLayer(type, colorHex, userLabel) {
    app.beginUndoGroup("Sniprr Create " + type);
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        app.endUndoGroup();
        return;
    }

    var target = (comp.selectedLayers.length > 0) ? comp.selectedLayers[0] : null;

    // 1. Determine Dimensions & Time
    var w = comp.width;
    var h = comp.height;
    var pa = comp.pixelAspect;
    var duration = comp.duration;
    var startT = (target) ? target.inPoint : comp.time;
    if (target) duration = target.outPoint - target.inPoint;

    // 2. Resolve Name
    // If userLabel is empty, use a Type-specific default
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
                // Pass finalName to addSolid so the Project Item is named correctly
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
                // FIX: Open Native "New Camera" Dialog to show options
                var countBefore = comp.numLayers;
                app.executeCommand(app.findMenuCommandId("Camera..."));

                // If user clicked "OK" (layer count increased), grab the new camera
                if (comp.numLayers > countBefore) {
                    newLayer = comp.selectedLayers[0];

                    // If the user typed a specific name in the panel, use it.
                    // If the panel input was empty (using default "Camera"), 
                    // we keep the name they chose in the dialog.
                    if (userLabel && userLabel !== "") {
                        newLayer.name = finalName;
                    }

                    // Prevent the code below from overwriting the name again if we just handled it
                    finalName = newLayer.name;
                }
                break;

            case 'text':
                // Pass finalName as the source text content
                newLayer = comp.layers.addText(finalName);
                break;
        }

        if (newLayer) {
            // Force Layer Name (Ensures Timeline name matches input)
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
        }
    } catch (err) { alert(err.toString()); }
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
function fitToComp() {
    app.beginUndoGroup("Sniprr Fit");

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

        // Skip locked layers
        if (layer.locked) continue;

        // Skip cameras & lights
        if (layer instanceof CameraLayer || layer instanceof LightLayer) continue;

        // Reset scale to get true dimensions
        layer.transform.scale.setValue(layer.threeDLayer ? [100, 100, 100] : [100, 100]);

        var rect = layer.sourceRectAtTime(t, false);
        if (!rect || rect.width === 0 || rect.height === 0) continue;

        // Aspect ratios
        var layerAR = rect.width / rect.height;
        var compAR = comp.width / comp.height;

        var scale;

        // Decide fit based on dominant dimension
        if (layerAR > compAR) {
            // Wider → fit by width
            scale = (comp.width / rect.width) * 100;
        } else {
            // Taller → fit by height
            scale = (comp.height / rect.height) * 100;
        }

        // Apply scale
        if (layer.threeDLayer) {
            layer.transform.scale.setValue([scale, scale, 100]);
        } else {
            layer.transform.scale.setValue([scale, scale]);
        }

        // Center layer
        if (layer.threeDLayer) {
            layer.transform.position.setValue([comp.width / 2, comp.height / 2, 0]);
        } else {
            layer.transform.position.setValue([comp.width / 2, comp.height / 2]);
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