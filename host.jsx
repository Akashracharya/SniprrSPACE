// 1. IMPORT MEDIA (SFX, VFX, GFX)
function importFile(filePath) {
    app.beginUndoGroup("SniprrSPACE Import");
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            alert("Please select a Composition.");
            return;
        }

        var io = new ImportOptions(new File(filePath));
        var importedItem = app.project.importFile(io);
        
        var layer = comp.layers.add(importedItem);
        layer.startTime = comp.time;
        
        // Auto-label colors
        if (filePath.match(/\.(mp3|wav)$/i)) layer.label = 11; // Orange for SFX
        else layer.label = 9; // Blue for video

    } catch (err) {
        // alert(err.toString());
    }
    app.endUndoGroup();
}

// 2. APPLY PRESET (Specific to Presets tab)
function applyPreset(presetPath) {
    app.beginUndoGroup("SniprrSPACE Preset");
    try {
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            alert("Please select a Composition.");
            return;
        }

        var presetFile = new File(presetPath);
        if (!presetFile.exists) return;

        // Create Adjustment Layer
        var solid = comp.layers.addSolid([1,1,1], "Sniprr Effect", comp.width, comp.height, comp.pixelAspect, comp.duration);
        solid.adjustmentLayer = true;
        solid.startTime = comp.time;
        solid.label = 5; // Purple for effects
        
        // Apply the .ffx file
        solid.applyPreset(presetFile);

    } catch (err) {
        alert("Error applying preset: " + err.toString());
    }
    app.endUndoGroup();
}