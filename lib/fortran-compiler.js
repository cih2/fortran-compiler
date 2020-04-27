'use babel';

const { CompositeDisposable } = require('atom');
const path = require('path');
const $ = require('jquery');
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

var subscriptions = null;
var activeProject = null;
var toolBar = null;

function activate(saved) {
    if(saved.path)
        activeProject = new FProject(saved.path);

    subscriptions = new CompositeDisposable();

    update(atom.project.getPaths());

    subscriptions.add(atom.commands.add('atom-workspace', {
        'fortran-compiler:build': build,
        'fortran-compiler:rebuild': rebuild,
        'fortran-compiler:run': run,
        'fortran-compiler:stop': stop,

        'fortran-compiler:make-active': setActiveProject,
        'fortran-compiler:remove-active': removeActiveProject
    }));

    subscriptions.add(atom.project.onDidChangePaths(update));
}

function deactivate() {
    subscriptions.dispose();

    if (toolBar) {
        toolBar.removeItems();
        toolBar = null;
    }

    if(activeProject){
        activeProject.deactivate()
        activeProject = null;
    }
}

function serialize() {
    return { path: activeProject !== null ? activeProject.dir.getPath() : null }
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

    toolBar.addButton({
        icon: 'primitive-square',
        callback: 'fortran-compiler:stop',
        tooltip: 'Stop Project Executable'
    });

    toolBar.addSpacer();
}

function setActiveProject(e){
    if(activeProject) removeActiveProject();

    let element = $(e.target).closest('.project-root-header');
    let icon = $('<span>').addClass('factive icon icon-star').attr('title', 'active fortran project');
    let dataPath = element.children('span').attr("data-path");

    element.addClass('active-fproject').append(icon);

    activeProject = new FProject(path.normalize(dataPath));
}

function removeActiveProject(e){
    $('.active-fproject').removeClass('active-fproject').children('.factive').remove();
    activeProject.deactivate();
    activeProject = null;
}

function update(paths){
    if(activeProject){
        if(paths.includes(activeProject.dir.getPath())){
            waitElement('.project-root-header', () => {
                let icon = $('<span>').addClass('factive icon icon-star').attr('title', 'active fortran project');
                let element = $('.project-root-header').filter(function(i) {
                    let dp = $(this).children('span').attr('data-path');
                    return path.normalize(dp) === activeProject.dir.getPath();
                });
                element.addClass('active-fproject').append(icon);
            });
        }else{
            activeProject = null;
        }
    }
}

function build(){
    if(!activeProject){
        activeError();
    }else {
        activeProject.start()
    }
}


function rebuild(){
    if(!activeProject)
        activeError();
    else{
        activeProject.rebuild()
    }
}

function run(){
    if(!activeProject){
        activeError();
    }else{
        activeProject.run()
    }
}

function stop(){
    if(!activeProject){
        activeError();
    }else{
        activeProject.stop()
    }
}

function activeError(){
    atom.notifications.addError(
        `No Active Project Selected, Select as active a project first`, {
        detail: 'fortran-compiler package'
    });
}

function waitElement(selector, callback, timer=100, count=0){
    if($(selector).length){
        callback()
    }else{
        if(count < 30){
            setTimeout(() => {
                count++
                waitElement(selector, callback, timer)
            }, timer)
        }
    }
}

export {config, activate, deactivate, serialize, consumeToolBar};
