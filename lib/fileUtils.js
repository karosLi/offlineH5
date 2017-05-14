var fs = require('fs');
var path = require('path');
var mkdirs = require('node-mkdirs');
var cpDir = require('copy-dir').sync;

function exists(path) {
	return fs.existsSync(path);
}

function isFile(path) {
	return exists(path) && fs.statSync(path).isFile();  
}

function isDir(path) {
	return exists(path) && fs.statSync(path).isDirectory();  
}

function rmrf(path) {
	try {
		if (isDir(path)) {
			var list = fs.readdirSync(path);
			
			if (!list || list.length === 0) {
				list = [];
			}

			fs.readdirSync(path).forEach(function (file, index) {
				var curPath = path + '/' + file;

				if (fs.lstatSync(curPath).isDirectory()) {
					 // recurse
					rmrf(curPath);
				} else {
					// delete file
					fs.unlinkSync(curPath);
				}
			});
			
			fs.rmdirSync(path);
		} else if (isFile(path)) {
			// delete file
			fs.unlinkSync(path);
		}
	} catch (e) {
		return e;
	}
}

function cpFile(sourcePath, destinationPath) {
	var source = fs.readFileSync(sourcePath);

	mkdirs(path.dirname(destinationPath));
	fs.writeFileSync(destinationPath, source);
}

function cp(src, dst) {
	try {
		if (isFile(src)) {
			cpFile(src, dst);
		} else if (isDir(src)) {
			cpDir(src, dst);
		}
	} catch (e) {
		console.log('cp error', e);
		return e;
	}
}

module.exports = {
	exists : exists,
	isFile : isFile,
	isDir : isDir,
	rmrf : rmrf,
	cp : cp,
};