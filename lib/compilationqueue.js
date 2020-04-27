'use babel'

const path = require('path');

class Queue {
    constructor(root) {
        this.root = root;
    }

    async createQueue(files){
        let edges = await this.createEdges(files);
        let queue = this.topologicalSort(edges);

        return [...new Set(queue.concat(files))];
    }

    topologicalSort(edges) {
    	let nodes   = {};
    	let sorted  = [];
    	let visited = {};

    	let Node = function(id) {
    		this.id = id;
    		this.afters = [];
    	}

    	edges.forEach(function(v) {
    		let from = v[0], to = v[1];
    		if (!nodes[from]) nodes[from] = new Node(from);
    		if (!nodes[to]) nodes[to]     = new Node(to);
    		nodes[from].afters.push(to);
    	});

    	Object.keys(nodes).forEach(function visit(idstr, ancestors) {
    		let node = nodes[idstr];
    		let id   = node.id;

    		if (visited[idstr]) return;
    		if (!Array.isArray(ancestors)) ancestors = [];

    		ancestors.push(id);
    		visited[idstr] = true;

    		node.afters.forEach(function(afterID) {
    			if (ancestors.indexOf(afterID) >= 0)
    				throw new Error('closed chain : ' +  afterID + ' is in ' + id);

    			visit(afterID.toString(), ancestors.map(function(v) { return v }));
    		});

    		sorted.unshift(id);
    	});

    	return sorted;
    }

    async createEdges(files){
    	var edges = [];
    	for(i = 0; i < files.length; i++){
    		for(j = 0; j < i; j++){
                let a = path.normalize(files[i]);
                let b = path.normalize(files[j]);

				if(await this.isDependency(a, b)){
					edges.push([a, b]);
				}

                if(await this.isDependency(b, a)){
					edges.push([b, a]);
				}
    		}
    	}

    	return edges;
    }

    scanFile(fpath){
        const fs = require('fs');
        const fp = path.join(this.root, fpath)
        const self = this;

    	return new Promise((resolve, reject) => {
    		fs.readFile(fp, (err, data) => {
    			if(err) return reject(err);

    			let processedFile = self.processFile(data);

    			let uModRE = /^use\s+(\w+)/gmi;
    			let dModRE = /^module\s+(\w+)/gmi;
    			let subModRE = /^submodule\s*[(]\s*(?<mod>\w+)(?:\s*[:]\s*(?<sub>\w+))*\s*[)]\s*(?<name>\w+)/gmi;

    			let usedMods = []
    			let defMods = []
    			let defSubs = []
    			let usedSubs = []

                let match;

    			while (match = uModRE.exec(processedFile)) {
    				usedMods.push(match[1]);
    			}

    			while (match = dModRE.exec(processedFile)) {
    				defMods.push(match[1]);
    			}

    			while (match = subModRE.exec(processedFile)) {
    				let {mod, sub, name} = match.groups;

    				let entry = {name:name, anc:mod}
    				if(!defSubs.some(e => e.anc === entry.anc && e.name === entry.name)){
    					defSubs.push(entry)
    				}

    				if(!sub){
    					usedMods.push(mod);
    				}else{
    					let entry = {name:sub, anc:mod}
    					if(!usedSubs.some(e => e.anc === entry.anc && e.name === entry.name)){
    						usedSubs.push(entry)
    					}
    				}
    			}

    			resolve({
    				path: fpath,

    				useMods: [...new Set(usedMods)],
    				defMods: [...new Set(defMods)],

    				useSubmods: usedSubs,
    				defSubmods: defSubs,
    			});
    		});

    	});
    }

    processFile(buffer){
    	var fileString = buffer.toString();
    	var arr = fileString.replace(/\t|\r/g, '').split(/\n|[;]/g).filter(e => e.length && e.charAt(0) !== '!').map(e => e.trim());
    	for(let i = 0; i < arr.length; i++){
    		let ins = arr[i];
    		if(ins.charAt(ins.length - 1) === '&'){
    			arr[i] = ins.substring(0, ins.length - 1) + (arr[i+1] || '');
    			arr.splice(i+1, 1)
    		}
    	}

    	return arr.join('\n');
    }

    async isDependency(file, dep){
        let infoA = await this.scanFile(file)
        let infoB = await this.scanFile(dep)
        let a = infoB.useMods.some(e => infoA.defMods.includes(e));
        let b = infoB.useSubmods.some(e => infoA.defSubmods.some(elem => (elem.name == e.name && elem.anc == e.anc)));

        return a || b;
    }
}

module.exports = Queue;
