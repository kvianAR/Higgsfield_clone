/* CINQRA offline handoff. Execute in Premiere Pro's ExtendScript host. */
(function () {
    if (!app.project || !app.project.path) { alert('Open or save a Premiere Pro project before importing CINQRA media.'); return; }
    var selected = File.openDialog('Select downloaded CINQRA media to import', '*.*', true);
    if (!selected || selected.length === 0) return;
    var paths = [];
    for (var i = 0; i < selected.length; i++) paths.push(selected[i].fsName);
    try {
        var success = app.project.importFiles(paths, true, app.project.rootItem, false);
        alert(success ? 'CINQRA: imported selected media into the project bin.' : 'Premiere Pro could not import the selected files. Check their formats.');
    } catch (error) { alert('CINQRA import failed: ' + error.toString()); }
}());
