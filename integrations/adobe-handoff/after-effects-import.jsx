/* CINQRA offline handoff. Run from After Effects File > Scripts > Run Script File. */
(function () {
    var selected = File.openDialog('Select downloaded CINQRA media to import', '*.*', true);
    if (!selected || selected.length === 0) return;
    if (!app.project) app.newProject();
    app.beginUndoGroup('Import CINQRA media');
    var imported = 0;
    var errors = [];
    try {
        for (var i = 0; i < selected.length; i++) {
            try { app.project.importFile(new ImportOptions(selected[i])); imported++; }
            catch (error) { errors.push(selected[i].name + ': ' + error.toString()); }
        }
    } finally { app.endUndoGroup(); }
    alert('CINQRA: imported ' + imported + ' file(s).' + (errors.length ? '\n\nCould not import:\n' + errors.join('\n') : ''));
}());
