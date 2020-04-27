const { Directory, File, CompositeDisposable } = require('atom');
const path = require('path');
const child_process = require('child_process');
const readline = require('readline');
const DialogBox = require('./dialog-box.js')
const FConsole = require('./console-output.js');

var maxLines = 1000;

class FProject {
    constructor(root) {
        this.name = path.basename(root);
        this.dir = new Directory(root);
        this.subdirs = {
            obj: new Directory(path.join(root, 'obj')),
            bin: new Directory(path.join(root, 'bin'))
        }

        this.dialog = new DialogBox()
        this.console = new FConsole(maxLines);

        this.console.addButton({
            icon: 'gear',
            title: 'build and run',
            callback: () => { this.start() }
        })

        this.console.addButton({
            icon: 'sync',
            title: 'rebuild',
            callback: () => { this.rebuild() }
        })

        this.console.addButton({
            icon: 'playback-play',
            title: 'run',
            callback: () => { this.run() }
        })

        this.console.addButton({
            icon: 'primitive-square',
            title: 'stop',
            callback: () => { this.stop() }
        })

        this.console.setTitle(this.name)

        this.savedFiles = [];
        this.subscriptions = new CompositeDisposable();

        this.subscriptions.add(atom.workspace.observeTextEditors((e) => this.observe(e)));
        this.subprocess = null;
    }

    deactivate(){
        this.dialog.destroy();
        this.console.destroy();
        this.subscriptions.dispose();
    }

    get files(){
        return FProject.__gFF(this.dir);
    }

    async rebuild(){
        let text = `Rebuilding the project will cause the deleton of all object fles and building it from scratch.
        This acton might take a while, especially if your project contains more than a few files.

        Are you sure you want to rebuild the entire project?`

        try {
            let res = await this.dialog.confirm('icon-sync', text);
            if(res){
                removeDir(path.join(this.dir.getPath(), 'bin'));
                removeDir(path.join(this.dir.getPath(), 'obj'));
                this.start()
            }
        } catch (e) {
            atom.notifications.addFatalError(e);
            this.console.reset();
        }
    }

    run(){
        if(!this.binIntegrity()){
            this.savedFiles = this.files;
            this.start()
        }else{
            this.console.reset()
            this.runProjectExecutable()
        }
    }

    async start(){
        this.console.showLoading()
        await this.buildProject()
        this.console.hideLoading()
    }

    async buildProject(){
        const Queue = require('./compilationqueue.js');

        try{
            if(!await this.subdirs.bin.exists())
                await this.subdirs.bin.create()
            if(!await this.subdirs.obj.exists())
                await this.subdirs.obj.create()
        }catch(error){
            atom.notifications.addError('fortran-compiler failed. Subdirectories could not be created', {detail: error});
            return
        }

        try{
            await Promise.all(this.saveModProjFiles());
        }catch(e){
            atom.notifications.addWarning('An error occured saving the files.', {detail: e});
        }

        this.console.reset()

        if(!this.files.length){
            atom.notifications.addError(`No fortran files in the project ${this.name}.`, {detail: `fortran-compiler package`});
        }else{
            let savedFiles = this.savedFiles.filter(e => this.files.includes(e))
            let compilation = new Queue(this.dir.getPath());
            let filesNotCompiled = this.getNotCompiled();

            let modFiles = [...new Set([...savedFiles, ...filesNotCompiled])];
            let modFilesDeps = new Set();

            for(let mod of modFiles){
                for(let projFile of this.files){
                    if(mod !== projFile){
                        if(await compilation.isDependency(mod, projFile)){
                            modFilesDeps.add(projFile)
                        }
                    }
                }
            }

            let queue = null;
            try{
                let filesToCompile = [...new Set([...modFiles, ...modFilesDeps])];
                queue = await compilation.createQueue(filesToCompile);
            }catch(e){
                atom.notifications.addWarning('It seems you have a circular dependency in Fortran files', {detail: e});
                return
            }

            if(!queue.length){
                atom.notifications.addInfo("fortran-compiler package", {
                    detail: "Nothing to be done (all items are up-to-date)."
                });

                this.run()
            }else{
                var res = await this.compileFiles(queue);
                if(!res) {
                    atom.notifications.addError('Error compiling files, see log for details.');
                }else{
                    atom.notifications.addSuccess("Successful operation, all files was compiled.");
                    res = await this.compileBin()
                    if(!res) {
                        atom.notifications.addError('Error compiling executable.');
                    }else{
                        atom.notifications.addSuccess("Successful operation, executable compiled.");
                        this.savedFiles = [];
                        try {
                            this.runProjectExecutable()
                        } catch (error) {
                            atom.notifications.addError('', { detail: error });
                        }
                    }
                }
            }
        }
    }

    async compileBin(){
        let additionalArgs = atom.config.get('fortran-compiler.additionalArgsExec');
        let objs = this.createObjString(this.files);
        let command = `-o bin/${this.name} ${objs} ${additionalArgs}`;

        return await this.compiler(command);
    }

    async compileFile(relpath, opath){
        let additionalArgs = atom.config.get('fortran-compiler.additionalArgs');
        let defaulArgs = "-J obj/ -c";
        let command = `${defaulArgs} ${additionalArgs} ${relpath} -o ${opath}`;

        return await this.compiler(command);
    }

    async compileFiles(queue){
        for (let filein of queue) {
            let objpath = this.genobjpath(filein);
            if(!await this.compileFile(filein, objpath)) {
                return false
            }
        }

        return true
    }

    async compiler(command){
        let compiler = atom.config.get('fortran-compiler.gfortranPath');
        let args = command.split(' ').filter(e => e.length > 0);

        try{
            let child = child_process.spawn(compiler, args, {cwd: this.dir.getPath()});

            // readline.createInterface({
            //     input     : child.stdout,
            //     terminal  : false
            // }).on('line', (line) => {
            //     this.console.message(line);
            // });

            child.stdout.on('data', data => {
                this.console.message(data.toString())
            });

            // readline.createInterface({
            //     input     : child.stderr,
            //     terminal  : false
            // }).on('line', (line) => {
            //     this.console.message(line, getMessageType(line));
            // });

            child.stderr.on('data', data => {
                this.console.message(data.toString())
            });

            let succ = await promiseChildProcess(child);
            return succ;
        }catch(error){
            let message = error;
            if (error.code === "ENOENT") message = "gfortran executable not found. Try setting the PATH in the fortran-compiler package settings menu.";
            atom.notifications.addFatalError('Fortran-compiler package.', {detail: message});
            return false;
        }
    }

    runProjectExecutable(){
        let execute = atom.config.get('fortran-compiler.compileAndRun');
        if(!execute) return

        let start = new Date()
        // let child = this.execute();
        this.subprocess = this.execute();
        let errorLines = [];

        // readline.createInterface({
        //     input     : this.subprocess.stdout,
        //     terminal  : false
        // }).on('line', (line) => {
        //     if(!this.subprocess.killed){
        //         this.console.log(line);
        //     }
        // });

        this.subprocess.stdout.on('data', data => {
            this.console.log(data.toString())
        });

        readline.createInterface({
            input     : this.subprocess.stderr,
            terminal  : false
        }).on('line', (line) => {
            // this.console.log(line);
            errorLines.push(line)
        });

        // child.stderr.on('data', data => {
        //      errorLines.push(data)
        // });

        this.subprocess.on('close', (code, signal) => {
            let time = new Date() - start;

            errorLines.forEach( e => this.console.log(e) )

            this.console.info({
                code: code,
                signal: signal
            }, time);
        });
    }

    stop(){
        if(this.subprocess){
            this.subprocess.kill();
            this.console.clearQueue();
        }
    }

    genobjpath(relpath){
        let rp = path.parse(relpath);
        let basename = rp.name;
        return path.join('obj', `${basename}.o`);
    }

    createObjString(files){
        return files.map(e => `obj/${path.basename(e).replace(/[.][a-z0-9]+$/i, ".o")}`).join(" ");
    }

    observe(editor){
        const self = this;
        editor.onDidSave((save) => {
            let filePath = save.path;
            if(self.dir.contains(filePath) && FProject.isFortranFile(filePath)){
                let saved = path.normalize(atom.project.relativizePath(filePath)[1]);
                self.savedFiles.push(saved);
            }
        });
    }

    saveModProjFiles(){
        let promises = [];
        let editors = atom.workspace.getTextEditors();
        for (let editor of editors) {
            let fpath = editor.getPath();
            if(FProject.isFortranFile(fpath)){
                if(editor.isModified() && this.dir.contains(fpath)){
                    promises.push(editor.save());
                }
            }
        }

        return promises;
    }

    objFilesIntegrity(){
        if(!this.subdirs.obj.existsSync()) return false
        if(this.getNotCompiled().length > 0) return false

        return true;
    }

    binIntegrity(){
        if(!this.subdirs.bin.existsSync()) return false

        let binary = new File(path.join(this.subdirs.bin.getPath(), this.binName));
        if(!binary.existsSync()) return false

        return true;
    }

    getNotCompiled(){
        let ofiles = this.getObjFiles();
        let onames = ofiles.map(e => path.parse(e).name);
        let inter = this.files.filter(e => !onames.includes(path.parse(e).name));

        return inter;
    }

    getObjFiles(){
        return this.subdirs.obj.getEntriesSync().filter(e => path.extname(e.getBaseName())
               .match(/^(.o)$/i)).map(e => e.getBaseName());
    }

    execute(){
        let command = '';
        if(process.platform == 'win32')
            command = this.name;
        else if (['linux', 'darwin', 'freebsd'].includes(process.platform))
            command = `./${this.name}`

        return child_process.spawn(command, {
            cwd: this.subdirs.bin.getPath(),
            maxBuffer: undefined
        });
    }

    async createSubDirs(){
        await this.subdirs.obj.create();
        await this.subdirs.bin.create();
    }

    get binName(){
        let name = '';
        if(process.platform == 'win32')
            name = `${this.name}.exe`;
        else if (['linux', 'darwin', 'freebsd'].includes(process.platform))
            name = this.name;

        return name;
    }

    static __gFF(dir){
        let entries = dir.getEntriesSync();
        let paths = [];

        for (let entry of entries) {
            if(entry.isFile()) {
                if(FProject.isFortranFile(entry.getPath())){
                    let filePath = path.normalize(atom.project.relativizePath(entry.getPath())[1]);
                    paths.push(filePath);
                }
            }else{
                paths = paths.concat(FProject.__gFF(entry));
            }
        }

        return paths;
    }

    static isFortranFile(file){
        let ext = path.extname(file);
        return ext.match(/^(.f90|.f95|.f03|.f08|.for|.f)$/i);
    }
}

// function getMessageType(mssg){
//     let w = 'warning'
//     let e = 'error'
//
//     if(mssg.toLowerCase().substring(0, w.length) == w)
//         return 'text-warning';
//
//     if(mssg.toLowerCase().substring(0, e.length) == e)
//         return 'text-error';
// }

function promiseChildProcess(child) {
    return new Promise((resolve, reject) => {
        child.on('close', (code, signal) => {
            if(code === 0) resolve(true)
            else resolve(false)
        });

        child.on('error', reject);
    });
}

function removeDir(xpath){
	const fs = require('fs');

	if(!fs.existsSync(xpath)) return;

	let content = fs.readdirSync(xpath);
	for(let e of content){
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

module.exports = FProject;
