'use babel'

import path from 'path';
import LineByLine from 'n-readlines';

class CreateQueue {
    constructor(root, files) {
        this.root = root;
        this.files = files;
    }

    createQueue(){
        let edges = this.createEdges(this.files);
        let queue = this.topologicalSort(edges);

        return [...new Set(queue.concat(this.files))];
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

    createEdges(files){
    	let edges = [];
    	let data = [];

    	for(i = 0; i < files.length; i++){
            let fpath = path.normalize(files[i]);
    		let a = this.scanFile(fpath);

    		data.push(a);

    		for(j = 0; j < i; j++){
    			let b = data[j];

    			if(a != b){
    				let id = b.useMods.filter(e => {
    					return a.defMods.includes(e);
    				});

    				let ids = b.useSubmods.filter(e => {
    					return a.defSubmods.some(elem => (elem.name == e.name && elem.ancestor == e.ancestor));
    				});

    				if(id.length || ids.length){
    					edges.push([a.path, b.path]);
    				}

    				let ir = b.defMods.filter(e => {
    					return a.useMods.includes(e);
    				});

    				let irs = b.defSubmods.filter(e => {
    					return a.useSubmods.some(elem => (elem.name == e.name && elem.mod_anc == e.mod_anc));
    				});

    				if(ir.length || irs.length){
    					edges.push([b.path, a.path]);
    				}
    			}
    		}
    	}

    	return edges;
    }

    scanFile(filePath){
        const fp = path.join(this.root, filePath)
    	const liner = new LineByLine(fp);

    	let line;
    	let lineNum = 0;

    	let usedModules = [];
    	let declaredModules = [];

    	let usedSubmodules = [];
    	let declaredSubmodules = [];

    	while (line = liner.next()) {
    		if(lineNum >= 0){
    			let linea = line.toString();
    			let comIndex = linea.indexOf('!');

    			let newLine = comIndex >= 0 ? linea.substring(0, comIndex) : linea;
    			let stmts = newLine.split(";");

    			for(stmt of stmts) {
    				let modstmt = stmt.replace(/[\r\t\n]/g, '').trim().toLowerCase();
    				if(modstmt.length > 0){
    					let use = modstmt.match(/use\s+(\w+)$/i);
    					if(use) usedModules.push(use[1]);

    					let module = modstmt.match(/module\s+(\w+)$/i);
    					if(module) declaredModules.push(module[1]);

    					let submodMatch = modstmt.match(/submodule\s*[(]\s*(?<umod>\w+)(?:\s*[:]\s*(?<usub>\w+))*\s*[)]\s*(?<name>\w+)$/i);
    					if(submodMatch){
    						let {umod, usub, name} = submodMatch.groups;

    						let entry = {
    							name:name,
    							mod_anc:umod
    						}

    						if(declaredSubmodules.indexOf(entry) == -1) {
    							declaredSubmodules.push(entry);
    						}

    						if(!usub){
    							usedModules.push(umod);
    						}else{
    							entry = {
    								name:usub,
    								mod_anc:umod
    							}

    							if(usedSubmodules.indexOf(entry) == -1) {
    								usedSubmodules.push(entry);
    							}
    						}
    					}
    				}

    			}
    		}

    		lineNum++;
    	}

    	return {
    		path: filePath,

    		useMods: [...new Set(usedModules)],
    		defMods: [...new Set(declaredModules)],

    		useSubmods: usedSubmodules,
    		defSubmods: declaredSubmodules,
    	};
    }
}

module.exports = CreateQueue;
