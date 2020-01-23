const path = require('path');
const { Directory, File } = require('atom');
const child_process = require('child_process');

class FProject {
    constructor(root) {
        this.name = path.basename(root);
        this.dir = new Directory(root);
        this.subdirs = {
            obj: new Directory(path.join(root, 'obj')),
            bin: new Directory(path.join(root, 'obj', 'bin'))
        }
    }

    get files(){
        return FProject.__gFF(this.dir);
    }

    objFilesIntegrity(){
        if(!this.subdirs.obj.existsSync()) return false
        if(this.getNotCompiled().length > 0) return false
        // let filesToCompile = [...new Set([...savedFiles, ...inter])];
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

module.exports = FProject;
