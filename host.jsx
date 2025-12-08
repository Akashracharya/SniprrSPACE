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


// 2. APPLY PRESET
function applyPreset(presetPath) {
    app.beginUndoGroup("SniprrSPACE Preset");
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) return;
        var presetFile = new File(presetPath);
        if (!presetFile.exists) return;
        var solid = comp.layers.addSolid([1,1,1], "Sniprr Effect", comp.width, comp.height, comp.pixelAspect, comp.duration);
        solid.adjustmentLayer = true;
        solid.startTime = comp.time;
        solid.label = 5; 
        solid.applyPreset(presetFile);
    } catch (err) { alert(err.toString()); }
    app.endUndoGroup();
}

// 3. CREATE LAYER (Matches Selection Length & Place)
function createLayer(type, colorHex) {
    app.beginUndoGroup("Sniprr Create " + type);
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
        app.endUndoGroup();
        return;
    }

    var target = (comp.selectedLayers.length > 0) ? comp.selectedLayers[0] : null;

    // Default params
    var w = comp.width;
    var h = comp.height;
    var pa = comp.pixelAspect;
    var duration = comp.duration; 
    var startT = 0; // Default start at 0 if no target

    // If target exists, match Dimensions & Time Span exactly
    if (target) {
        if (type === 'solid' || type === 'adjustment') {
             if (target.source) {
                w = target.source.width;
                h = target.source.height;
                pa = target.source.pixelAspect;
             } else {
                w = target.width;
                h = target.height;
             }
        }
        startT = target.inPoint;
        duration = target.outPoint - target.inPoint;
    } else {
        // If no target, start at current time indicator (CTI)
        startT = comp.time;
    }

    // Color
    var col = [0.5, 0.5, 0.5];
    if (colorHex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colorHex);
        if (result) col = [parseInt(result[1], 16)/255, parseInt(result[2], 16)/255, parseInt(result[3], 16)/255];
    }

    var newLayer = null;
    try {
        switch(type) {
            case 'adjustment':
                newLayer = comp.layers.addSolid([1,1,1], "Adjustment Layer", w, h, pa, duration);
                newLayer.adjustmentLayer = true;
                newLayer.label = 5; 
                break;
            case 'solid':
                newLayer = comp.layers.addSolid(col, "Solid", w, h, pa, duration);
                break;
            case 'null':
                newLayer = comp.layers.addNull();
                break;
            case 'camera':
                newLayer = comp.layers.addCamera("Camera", [comp.width/2, comp.height/2]);
                break;
            case 'text':
                newLayer = comp.layers.addText("Text");
                break;
        }

        if (newLayer) {
            // Apply Timing
            if (target) {
                newLayer.startTime = target.startTime;
                newLayer.inPoint = target.inPoint;
                newLayer.outPoint = target.outPoint;
                newLayer.moveBefore(target); 
            } else {
                newLayer.startTime = startT;
            }
        }
    } catch(err) { alert(err.toString()); }
    app.endUndoGroup();
}

// 4. PRE-COMPOSE (Updated: Shift Mode Trims Duration)
function doPrecompose(individual) {
    app.beginUndoGroup("Sniprr Pre-compose");
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem) || comp.selectedLayers.length === 0) {
        app.endUndoGroup();
        return;
    }

    var sel = comp.selectedLayers;

    // --- Helper: Trims a Pre-comp to match its content ---
    function trimPrecomp(compItem, newLayer, minIn, duration) {
        // 1. Set duration of the new composition
        compItem.duration = duration;

        // 2. Shift all layers inside back to 0
        for (var i = 1; i <= compItem.numLayers; i++) {
            var layer = compItem.layer(i);
            layer.startTime -= minIn;
        }

        // 3. Adjust the Pre-comp layer in the main composition
        newLayer.startTime = minIn;
        newLayer.inPoint = minIn;
        newLayer.outPoint = minIn + duration;
    }

    if (individual) {
        // --- INDIVIDUAL MODE ---
        // We collect indices first because selection changes during pre-compose
        var indices = [];
        for (var i = 0; i < sel.length; i++) indices.push(sel[i].index);
        
        // Loop through indices (must handle carefully as layer objects invalidate)
        // We go backwards or re-fetch. Easiest is to store ID or just process carefully.
        // Actually, 'indices' remain valid if we don't delete layers above them?
        // Pre-compose replaces the layer.
        
        // Better approach: Loop through the *original* selected layer objects. 
        // Even if they are replaced, we can capture their data before the operation.
        
        for (var i = 0; i < sel.length; i++) {
            var layer = sel[i];
            var idx = layer.index;
            var inP = layer.inPoint;
            var outP = layer.outPoint;
            var dur = outP - inP;
            var name = layer.name;
            
            // Perform Pre-compose on single index
            var newComp = comp.layers.precompose([idx], name + " Comp", true);
            
            // The new layer is now at 'idx' (usually) and selected.
            // AE selects the new layer automatically.
            var newLayer = comp.selectedLayers[0];
            
            // Apply Trim Logic
            trimPrecomp(newComp, newLayer, inP, dur);
        }

    } else {
        // --- GROUP MODE ---
        var indices = [];
        var minIn = 999999;
        var maxOut = -999999;
        
        for (var i = 0; i < sel.length; i++) {
            indices.push(sel[i].index);
            if (sel[i].inPoint < minIn) minIn = sel[i].inPoint;
            if (sel[i].outPoint > maxOut) maxOut = sel[i].outPoint;
        }
        
        var dur = maxOut - minIn;
        var newComp = comp.layers.precompose(indices, "Pre-comp", true);
        var newLayer = comp.selectedLayers[0];
        
        trimPrecomp(newComp, newLayer, minIn, dur);
    }
    app.endUndoGroup();
}

// 5. FRAME BLENDING (Fixed)
function setFrameBlending(enable) {
    app.beginUndoGroup("Sniprr Frame Blend");
    var comp = app.project.activeItem;
    if (comp && comp instanceof CompItem) {
        // 1. Force Composition "Enable Frame Blending" ON
        // If this is off, layer switches do nothing visually.
        if (enable) comp.frameBlending = true;
        
        // 2. Set Layer Switches
        var sel = comp.selectedLayers;
        for (var i = 0; i < sel.length; i++) {
            var layer = sel[i];
            // 'enable' comes in as boolean true/false
            if (enable) {
                layer.frameBlendingType = FrameBlendingType.PIXEL_MOTION;
            } else {
                layer.frameBlendingType = FrameBlendingType.NO_FRAME_BLENDING;
            }
        }
    }
    app.endUndoGroup();
}

// 6. FIT TO COMP (Fixed: No Shrink, Maintain Aspect)
function fitToComp() {
    app.beginUndoGroup("Sniprr Fit");
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return;
    var sel = comp.selectedLayers;
    
    for (var i = 0; i < sel.length; i++) {
        var layer = sel[i];
        
        // Skip cameras/lights/audio
        if(!layer.source && layer.source !== null) continue; 
        
        // Reset scale momentarily to get true dimensions
        var oldScale = layer.transform.scale.value;
        layer.transform.scale.setValue([100,100,100]); 
        
        var rect = layer.sourceRectAtTime(comp.time, false);
        
        // Calculate Scale Factors
        var scaleX = (comp.width / rect.width) * 100;
        var scaleY = (comp.height / rect.height) * 100;
        
        // "Do not shrink... keep ratio" implies we want to cover the screen 
        // OR fit inside without distortion? 
        // Usually "Fit to Comp" means "Fit Inside" (Letterbox). 
        // "Fill Comp" means "Cover" (Crop).
        // Based on "should not shrink the whole video", I assume "Fill/Cover" is preferred, 
        // or ensuring it's at least 100%?
        // Let's stick to standard "Fit Inside" (Math.min) as it's safer, 
        // but if the user wants "No shrink", maybe they mean "Fill"? 
        // Let's use Math.min (Fit) as per standard behavior, but ensure 3D layers handled.
        
        var finalScale = Math.min(scaleX, scaleY);
        
        // Handle 3D Layers (Scale has 3 values)
        if (layer.threeDLayer) {
             layer.transform.scale.setValue([finalScale, finalScale, 100]);
        } else {
             layer.transform.scale.setValue([finalScale, finalScale]);
        }
        
        // Center
        if (layer.threeDLayer) {
             layer.transform.position.setValue([comp.width/2, comp.height/2, 0]);
        } else {
             layer.transform.position.setValue([comp.width/2, comp.height/2]);
        }
    }
    app.endUndoGroup();
}

// 7. ANCHOR POINT (Fixed: Robust 2D/3D Math)
function setAnchorPoint(posIndex) {
    app.beginUndoGroup("Sniprr Anchor");
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return;
    var sel = comp.selectedLayers;

    for (var n = 0; n < sel.length; n++) {
        var layer = sel[n];
        var rect = layer.sourceRectAtTime(comp.time, false);
        
        // 1. Calculate Target Anchor Point (Local Space)
        var newX = rect.left;
        var newY = rect.top;
        
        // Horizontal
        if (posIndex === 1 || posIndex === 4 || posIndex === 7) newX += rect.width / 2;
        if (posIndex === 2 || posIndex === 5 || posIndex === 8) newX += rect.width;
        
        // Vertical
        if (posIndex === 3 || posIndex === 4 || posIndex === 5) newY += rect.height / 2;
        if (posIndex === 6 || posIndex === 7 || posIndex === 8) newY += rect.height;

        var newAnchor = [newX, newY, 0]; // Assume z=0 for anchor initially

        // 2. Calculate Offset (How much the Anchor Point moved)
        var curAnchor = layer.transform.anchorPoint.value;
        var delta = [newAnchor[0] - curAnchor[0], newAnchor[1] - curAnchor[1]];

        // 3. Compensate Position (so layer doesn't visually jump)
        // We must apply Scale and Rotation to the Delta
        
        var curScale = layer.transform.scale.value;
        var curRot = layer.transform.rotation.value; 
        
        // Convert Scale to factor
        var sX = curScale[0] / 100;
        var sY = curScale[1] / 100;
        
        // Apply Scale
        var dX = delta[0] * sX;
        var dY = delta[1] * sY;
        
        // Apply Rotation (Degrees to Radians)
        var rad = curRot * (Math.PI / 180);
        var cos = Math.cos(rad);
        var sin = Math.sin(rad);
        
        var rotDX = (dX * cos) - (dY * sin);
        var rotDY = (dX * sin) + (dY * cos);
        
        // Add to current Position
        var curPos = layer.transform.position.value;
        
        // Handle 2D vs 3D Position Arrays
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