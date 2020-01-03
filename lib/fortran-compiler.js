'use babel';

import path from 'path';
import child_process from 'child_process';
import util from 'util';
import { CompositeDisposable, Directory } from 'atom';
import CreateQueue from './compilationqueue.js';
import $ from 'jquery';

const execPromisify = util.promisify(child_process.exec);

export default {
    config: {
        gfortranPath: {
            title: 'Path to gFortran Compiler',
            description: `This should be the full path to the gfortran.exe.`,
            type: 'string',
            default: 'gfortran',
            order: 1,
        },
        additionalArgs: {
            title: 'Additional Arguments',
            description: `Put any additional arguments to the gfortran executable here. The
                        executable will be invoked with \`"\${gfortranPath}" . \${additionalArgs}\`, with the project
                        directory as the current working directory.`,
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
    },

    subscriptions: null,
    activeProjectPath: null,

    activate(state) {
        this.activeProjectPath = state.activeSaved;
        update.bind(this)(atom.project.getPaths());

        this.subscriptions = new CompositeDisposable();
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'fortran-compiler:run': () => run.bind(this)()
        }));

        this.subscriptions.add(atom.commands.add(".tree-view .project-root-header:not(.active-fproject)", {
            'fortran-compiler:make-active': (e) => setActiveProject.bind(this)(e)
        }));

        this.subscriptions.add(atom.commands.add(".tree-view .active-fproject", {
            'fortran-compiler:remove-active': (e) => removeActiveProject.bind(this)(e)
        }));

        this.subscriptions.add(atom.project.onDidChangePaths(update.bind(this)));
    },

    deactivate() {
        this.subscriptions.dispose();
    },

    serialize() {
        return {
          activeSaved: this.activeProjectPath
        }
    }
};

if(process.platform === 'linux'){
    module.export.config.terminalEmulator = {
        title: 'Run In Terminal Emulator',
        description: `When running your Love game, create a terminal emulator
        window, and show the output to that window.`,
        type: 'string',
        default: 'None',
        enum: ['None', 'iTerm2', 'uxterm (Linux)', 'Gnome terminal'],
        order: 3,
    }
}

function update(paths){
    let active = this.activeProjectPath;
    if(active){
        if(paths.includes(active)){
            let icon = $('<span>').addClass('factive icon icon-heart').attr('title', 'active fortran project');
            let element = $('.project-root-header').filter(function(i) {
                let dp = $(this).children('span').attr('data-path');
                return path.normalize(dp) === active;
            });

            element.addClass('active-fproject').append(icon);
        }else{
            this.activeProjectPath = null;
        }
    }
}

function setActiveProject(e){
    removeActiveProject();

    let element = $(e.target).closest('.project-root-header');
    let icon = $('<span>').addClass('factive icon icon-heart').attr('title', 'active fortran project');
    let dataPath = element.children('span').attr("data-path");
    let rootpath = path.normalize(dataPath);

    element.addClass('active-fproject').append(icon);

    this.activeProjectPath = rootpath;
}

function removeActiveProject(e){
    $('.active-fproject').removeClass('active-fproject').children('.factive').remove();
    this.activeProjectPath = null;
}

async function run() {
    let editor = atom.workspace.getActiveTextEditor();
    let root = this.activeProjectPath;
    let queue;

    if(!root){
        atom.notifications.addWarning('Select an active project folder first.', {
            detail: "fortran-compiler package"
        });

        return
    }

    let directory = getDirectory(root);
    let filesPath = getRecursively(directory);

    if(!filesPath.length){
        atom.notifications.addError('No fortran files in this project.', {
            detail: "fortran-compiler package"
        });

        return
    }

    let compilation = new CreateQueue(root, filesPath);

    try{
        queue = compilation.createQueue();
    }catch(e){
        atom.notifications.addWarning('It seems you have a circular dependency in Fortran files', {
            detail: e
        });
    }

    let { name } = path.parse(root);
    let succ = await projectCompile({ name: name, root: root, queue: queue });
    let execbin = atom.config.get('fortran-compiler.compileAndRun');

    if(succ){
        if(execbin) {
            let platform = process.platform;

            let binpath = path.join(root, 'obj/bin');
            let { dir } = path.parse(__dirname);
            let runner = path.join(dir, `/console_runner/${platform}/cb_console_runner`);

            if(platform === 'win32'){
                let command = `start cmd /C "${runner} ${name}"`
                child_process.exec(command, {cwd: binpath});

            }else if (platform === 'linuxs') {
                let command = `gnome-terminal -t ${name} -- ${runner} ${name}`
                child_process.spawn(command, {cwd: binpath});
            }
        }
    }
}

function compileFile(root, relpath, opath){
    let compiler = atom.config.get('fortran-compiler.gfortranPath');
    let additionalArgs = atom.config.get('fortran-compiler.additionalArgs');
    let defaulArgs = "-J obj\\ -Wall -g -c";
    let command = `${compiler} ${defaulArgs} ${additionalArgs} ${relpath} -o ${opath}`;

    return execPromisify(command, {cwd: root});
}

async function projectCompile(project){
    let root = project.root;
    let objdir = new Directory(path.join(root, 'obj'));
    let bindir = new Directory(path.join(root, 'obj', 'bin'));

    try {
        let objdirCreated = await objdir.create();
        let objs = '';

        for (filein of project.queue) {
            let objpath = getobjpath(filein);
            let {stdout, stderr} = await compileFile(root, filein, objpath);
            objs += `${objpath} `;
        }

        let bindirCreated = await bindir.create();
        let compiler = atom.config.get('fortran-compiler.gfortranPath');
        let command = `${compiler} -o obj/bin/${project.name} ${objs}`;

        let { stdout, stderr } = await execPromisify(command, { cwd: root });

        atom.notifications.addSuccess("Successful project compilation. All files was compiled");

        return true;

    } catch (err) {
        let message = err.stderr;
        if (err.code == 127) message = "gfortran executable not found. Try setting the PATH in the fortran-compiler package settings menu.";
        atom.notifications.addError('Error compiling files.', {
            detail: message
        });

        console.log(err);
        return false;
    }
}

function getDirectory(path){
    let dirs = atom.project.getDirectories();
    for (dir of dirs) {
        if(dir.realPath == path) return dir;
    }
}

function getRecursively(dir){
    var paths = [];
    let entries = dir.getEntriesSync();

    for (entry of entries) {
        if(entry.isFile()) {
            let ext = path.extname(entry.path).toLowerCase();
            if(ext.match(/^(.f90|.f95|.f03|.f08|.for|.f)$/)){
                paths.push(path.normalize(atom.project.relativizePath(entry.path)[1]));
            }
        }else{
            paths = paths.concat(getRecursively(entry));
        }
    }

    return paths;
}

function getobjpath(relpath){
    let rp = path.parse(relpath);
    //let dirname = rp.substring(0, rp.lastIndexOf('/'));
    let basename = rp.name;
    //return path.join('obj', dirname, `${basename}.o`);
    return path.join('obj', `${basename}.o`);
}
