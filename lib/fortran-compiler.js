'use babel';

const { CompositeDisposable, Directory } = require('atom');
const child_process = require('child_process');
const path = require('path');
const $ = require('jquery');
const FConsole = require('./console-output.js');
const FProject = require('./project-info.js');

var config = {
    gfortranPath: {
        title: 'Path to gFortran Compiler',
        description: `This should be the full path to the gfortran.exe.`,
        type: 'string',
        default: 'gfortran',
        order: 1,
    },
    additionalArgs: {
        title: 'Additional Arguments When Calling the Compiler',
        description: `Put any additional arguments to the gfortran executable here. The
                    executable will be invoked with \`"\${gfortranPath}" \${additionalArgs} \${FILE.FORTRAN-EXT}\``,
        type: 'string',
        default: '',
        order: 2,
    },
    additionalArgsExec: {
        title: 'Additional Arguments When Calling the Linker',
        description: `Put any additional arguments to the gfortran executable here. The
                    executable will be invoked with \`"\${gfortranPath}" \${additionalArgs} \${OBJECT FILES CHAIN}\``,
        type: 'string',
        default: '',
        order: 2,
    },
    compileAndRun: {
        default: true,
        title: "Run after compile project",
        description: `Run program after compiling is done.`,
        type: "boolean"
    }
}

var fconsole = null;
var subscriptions = null;
var activeProject = null;
var savedFiles = [];
var toolBar = null;

function activate(state) {
    if(state.activeSaved) activeProject = new FProject(state.activeSaved);
    fconsole = new FConsole();
    subscriptions = new CompositeDisposable();

    update(atom.project.getPaths());

    subscriptions.add(atom.commands.add('atom-workspace', {
        'fortran-compiler:build': build,
        'fortran-compiler:rebuild': rebuild,
        'fortran-compiler:run': run,

        'fortran-compiler:make-active': setActiveProject,
        'fortran-compiler:remove-active': removeActiveProject
    }));

    subscriptions.add(atom.project.onDidChangePaths(update));
    subscriptions.add(atom.workspace.observeTextEditors(observe));
}

function deactivate() {
    subscriptions.dispose();
    fconsole.destroy();
    if (toolBar) {
        toolBar.removeItems();
        toolBar = null;
    }
}

function serialize() {
    return { activeSaved: activeProject ? activeProject.dir.getPath() : null }
}

function consumeToolBar(getToolBar) {
    toolBar = getToolBar('fortran-compiler');

    toolBar.addSpacer();

    toolBar.addButton({
        icon: 'gear',
        callback: 'fortran-compiler:build',
        tooltip: 'Compile And Run Fortran Project'
    });

    toolBar.addButton({
        icon: 'repo-sync',
        callback: 'fortran-compiler:rebuild',
        tooltip: 'Rebuild Fortran Project'
    });

    toolBar.addButton({
        icon: 'playback-play',
        callback: 'fortran-compiler:run',
        tooltip: 'Run Project Executable'
    });

    toolBar.addSpacer();
}


function setActiveProject(e){
    removeActiveProject();

    let element = $(e.target).closest('.project-root-header');
    let icon = $('<span>').addClass('factive icon icon-heart').attr('title', 'active fortran project');
    let dataPath = element.children('span').attr("data-path");

    element.addClass('active-fproject').append(icon);

    activeProject = new FProject(path.normalize(dataPath));
}

function removeActiveProject(e){
    $('.active-fproject').removeClass('active-fproject').children('.factive').remove();
    activeProject = null;
}

function update(paths){
    if(activeProject){
        if(paths.includes(activeProject.dir.getPath())){
            let icon = $('<span>').addClass('factive icon icon-heart').attr('title', 'active fortran project');
            let element = $('.project-root-header').filter(function(i) {
                let dp = $(this).children('span').attr('data-path');
                return path.normalize(dp) === activeProject.dir.getPath();
            });

            element.addClass('active-fproject').append(icon);
        }else{
            activeProject = null;
        }
    }
}

async function build(){
    if(!activeProject){
        activeError();
    }else {
        let res = await buildProject();
        if(res) run();
    }
}


function rebuild(){
    if(!activeProject)
        activeError();
    else{
        removeDir(path.join(activeProject.dir.getPath(), 'obj'));
        build();
    }
}

async function run(){
    if(!activeProject){
        activeError();
        return
    }

    try {
        if(!activeProject.objFilesIntegrity())
            await buildProject();

        if(!activeProject.binIntegrity())
            compileBin();

        runProjectExecutable();
    } catch (e) {
        return
    }
}

async function buildProject() {
    const CreateQueue = require('./compilationqueue.js');

    try{
        await activeProject.createSubDirs();
    }catch(e){
        atom.notifications.addError('fortran-compiler failed.', {detail: e});
        return
    }

    try{
        await Promise.all(saveModProjFiles());
    }catch(e){
        atom.notifications.addWarning('An error occured saving the files.', {detail: e});
    }

    if(!activeProject.files.length){
        atom.notifications.addError('No fortran files in this project.', {detail: "fortran-compiler package"});
        return
    }

    let filesToCompile = [...new Set([...savedFiles, ...activeProject.getNotCompiled()])];
    let compilation = new CreateQueue(activeProject.dir.getPath(), filesToCompile);
    let queue;

    try{
        queue = compilation.createQueue();
    }catch(e){
        atom.notifications.addWarning('It seems you have a circular dependency in Fortran files', {detail: e});
        return
    }

    if(!queue.length){
        atom.notifications.addInfo("Nothing to be done (all items are up-to-date).", {
            detail: "fortran-compiler package"
        });
    }else{
        try {
            compileFiles(queue);
            atom.notifications.addSuccess("Successful project compilation. All files was compiled");

        } catch (e) {
            let message = e.stderr;
            if (e.code == 127) message = "gfortran executable not found. Try setting the PATH in the fortran-compiler package settings menu.";
            atom.notifications.addError('Error compiling files.', {detail: e});
            return;
        }

        try {
            compileBin();
            atom.notifications.addSuccess("The executable was successfully compiled.");
        } catch (e) {
            atom.notifications.addError('Error compiling executable.', {detail: e});
            return
        }
    }

    savedFiles = [];
    return true;

}

function compileBin(){
    let compiler = atom.config.get('fortran-compiler.gfortranPath');
    let additionalArgs = atom.config.get('fortran-compiler.additionalArgsExec');
    let objs = createObjString(activeProject.files);
    let command = `${compiler} -o obj/bin/${activeProject.name} ${objs} ${additionalArgs}`;

    child_process.execSync(command, { cwd: activeProject.dir.getPath() });
}

function compileFile(relpath, opath){
    let compiler = atom.config.get('fortran-compiler.gfortranPath');
    let additionalArgs = atom.config.get('fortran-compiler.additionalArgs');
    let defaulArgs = "-J obj/ -Wall -g -c";
    let command = `${compiler} ${defaulArgs} ${additionalArgs} ${relpath} -o ${opath}`;

    child_process.execSync(command, {cwd: activeProject.dir.getPath()});
}

function compileFiles(queue){
    for (filein of queue) {
        let objpath = genobjpath(filein);
        compileFile(filein, objpath);
    }
}

function genobjpath(relpath){
    let rp = path.parse(relpath);
    let basename = rp.name;
    return path.join('obj', `${basename}.o`);
}

function createObjString(files){
    return files.map(e => `obj/${path.basename(e).replace(/[.][a-z0-9]+$/i, ".o")}`).join(" ");
}

function observe(editor){
    editor.onDidSave((save) => {
        let filePath = save.path;
        if(activeProject){
            if(activeProject.dir.contains(filePath) && FProject.isFortranFile(filePath)){
                let saved = path.normalize(atom.project.relativizePath(filePath)[1]);
                savedFiles.push(saved);
            }
        }
    });
}

function saveModProjFiles(){
    let promises = [];
    if(activeProject){
        let editors = atom.workspace.getTextEditors();
        for (editor of editors) {
            let fpath = editor.getPath();
            if(FProject.isFortranFile(fpath)){
                if(editor.isModified() && activeProject.dir.contains(fpath)){
                    promises.push(editor.save());
                }
            }
        }
    }

    return promises;
}

function removeDir(xpath){
	const fs = require('fs');

	if(!fs.existsSync(xpath)) return;

	let content = fs.readdirSync(xpath);
	for(e of content){
		let entry = path.join(xpath, e);
		let stat = fs.statSync(entry);

		if(stat.isFile()) {
            fs.unlinkSync(entry);
        }else{
			removeDir(entry);
        }
	}

	fs.rmdirSync(xpath);
}

function runProjectExecutable(){
    const readline = require('readline');

    fconsole.clear();
    fconsole.setTitle(activeProject.name)
    fconsole.size(100)

    let start = new Date()
    let child = activeProject.execute();

    readline.createInterface({
        input     : child.stdout,
        terminal  : false
    }).on('line', (line) => {
        fconsole.log(line);
    });

    readline.createInterface({
        input     : child.stderr,
        terminal  : false
    }).on('line', (line) => {
        fconsole.log(line);
    });

    child.on('close', (code, signal) => {
        let time = new Date() - start;
        fconsole.info({
            code: code,
            signal: signal
        }, time);
    });
}

function activeError(){
    atom.notifications.addError(
        `No Active Project Selected, Select as active a project first`, {
        detail: 'fortran-compiler package'
    });
}

export {config, activate, deactivate, serialize, consumeToolBar};
