'use babel';

import path from 'path';
import child_process from 'child_process';
import util from 'util';
import { CompositeDisposable, Directory } from 'atom';
import CreateQueue from './compilationqueue.js';
import FConsole from './console-output.js';
import $ from 'jquery';
import readline from 'readline';

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
        this.console = new FConsole();

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
        this.console.destroy();
    },

    serialize() {
        return {
          activeSaved: this.activeProjectPath
        }
    }
};

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

            let binpath = path.join(root, 'obj/bin', name);
            let runner = path.join(__dirname, "console-runner.js");

            this.console.setTitle(name)
            this.console.clear();
            this.console.size(100)

            runBin.bind(this)(binpath);
        }
    }
}

function compileFile(root, relpath, opath){
    let compiler = atom.config.get('fortran-compiler.gfortranPath');
    let additionalArgs = atom.config.get('fortran-compiler.additionalArgs');
    let defaulArgs = "-J obj\\ -Wall -g -c";
    let command = `${compiler} ${defaulArgs} ${additionalArgs} ${relpath} -o ${opath}`;

    return child_process.execSync(command, {cwd: root});
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
            let stdout = compileFile(root, filein, objpath);
            objs += `${objpath} `;
        }

        let bindirCreated = await bindir.create();
        let compiler = atom.config.get('fortran-compiler.gfortranPath');
        let command = `${compiler} -o obj/bin/${project.name} ${objs}`;

        let stdout = child_process.execSync(command, { cwd: root });

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
    let basename = rp.name;
    return path.join('obj', `${basename}.o`);
}

function runBin(binFullPath){
    const fconsole = this.console;
    let bin = path.parse(binFullPath)
    let start = new Date()
    let command = '';

    if(process.platform == 'win32')
        command = bin.name;
    else if (['linux', 'darwin', 'freebsd'].includes(process.platform))
        command = `./${bin.name}`

    let child = child_process.spawn(command, {
        cwd: bin.dir,
        maxBuffer: undefined
    });

    readline.createInterface({
        input     : child.stdout,
        terminal  : false
    }).on('line', function(line) {
        fconsole.log(line);
    });

    let stderr = '';
    child.stderr.on('data', (data) => {
        stderr = data;
    });

    child.on('close', (code) => {
        if(stderr.length) this.console.log(stderr.toString());
        let time = new Date() - start;

        this.console.info(code, time);
    });
}
