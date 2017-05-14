#!/usr/bin/env node

/**
 * @file index.js
 * @author karos
 */

//node index.js -p temp -r  http://gitl.leoao.com/center-front/leke-activity.git -f c3676bc41505d24297dcb735384084d766907248

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var util = require('util')

var Promise = require('promise');
var program = require('commander');
var mkdirs = require('node-mkdirs');
var NodeGit = require('nodegit');
var zip = require('zip-folder');
var gitDiff = require('./lib/diff');

require('./lib/date.format');

var fileUtils = require('./lib/fileUtils');
var cp = fileUtils.cp;
var rmrf = fileUtils.rmrf;

var exists = fileUtils.exists;
var isFile = fileUtils.isFile;
var isDir = fileUtils.isDir;

var $ = path.resolve.bind(path);

(function() {
	program.version('0.0.1')
		.usage('A front end tool to make update bundle zip file')
		.option('-p, --prefix <string>', 'Output prefix')
		.option('-f, --fromCommit <string>', 'from commit')
		.option('-t, --toCommit <string>', 'to commit')
		.option('-r, --repository <string>', 'Repository URL')
		.parse(process.argv);

	var prefix = program.prefix;
	var fromCommit = program.fromCommit;
	var toCommit = program.toCommit;
	var repoUrl = program.repository;

	if (!repoUrl || repoUrl === '') {
		errlog('Missing parameter repository');
		process.exit(1);
	}

	if (!fromCommit || fromCommit == '') {
		errlog('Missing parameter fromCommit');
		process.exit(1);
	}

	if (toCommit === fromCommit) {
		errlog('From commit is be able to equals to to commit');
		process.exit(1);
	}

	// 时间戳
	var releaseTime = (new Date).format('yyMMddhhmmss');
	// 发布目录名
	var releaseDir = 'pkg_from_' + fromCommit + '_to_' + (!!toCommit ? toCommit : 'head') + '_release_' + releaseTime;
	// 发布文件名
	var releaseFilename = releaseDir + '.zip';

	infolog('Release file name: ' + releaseFilename);
	infolog('repository path: ' + repoUrl);

	if (!prefix || prefix === '') {
		// 如果没有设置prefix，则使用当前目录
		prefix = './';
	}
	prefix = $(process.cwd(), prefix);
	prefix = $(prefix, releaseDir);

	try {
		if (fs.readdirSync(prefix).length) {
			errlog('dir ' + prefix + ' is NOT empty');
			process.exit(1);
		}
	} catch (e) {
	}

	var clonePath = $(prefix, 'code');
	var ignoreFiles = ['.gitlab-ci.yml', '.git', '.gitignore'];

	new Promise(function (resolve, reject) {
		// clone 新版本
		infolog('Clone from repo url');

		return clone(repoUrl, clonePath)
		.then(function(repository) {
      infolog('Git clone succeed');
			resolve(repository);
    })
    .catch(function(err) {
    	errlog('Git clone failed ' + err);
			reject();
    });

	}).then(function (repository) {
		// 打增量压缩包
		infolog('Make update zip');

		var fromPromise = getCommit(repository, fromCommit);
		var toPromise = !!toCommit ? getCommit(repository, toCommit) : getHeadCommit(repository);

		var allPromise = Promise.all([fromPromise, toPromise]);
   
		return allPromise
		.then(function(commits) {
			infolog('From commit: ' + commits[0].id().tostrS() + ' ' + commits[0].message());
			infolog('To commit: ' + commits[1].id().tostrS() + ' ' + commits[1].message());

			return gitDiff(repository, commits[0], commits[1]);
		})
		.then(function(entrys) {
			var outputZipPath = path.join(path.dirname(clonePath), 'update.zip');
			return makeUpdatePackage(clonePath, entrys, outputZipPath, function() {
				return ignoreFiles;
			})
		});

	}).then(function() {
		// 打全量压缩包
		infolog('make bundle...');

		var outputZipPath = path.join(path.dirname(clonePath), 'bundle.zip');
		return makeBundlePackage(clonePath, outputZipPath);
	})
	.then(function () {
		// 打发布压缩包
		infolog('build release bundle...');

		return new Promise(function (resolve, reject) {
			var releasePath = prefix;
			var outDir = $(prefix, '..');

			zip(releasePath, $(outDir, releaseFilename), function (err) {
				if (err) {
					reject();
					return;
				}

				rmrf(releasePath);
				resolve();
			});
		});
	}).then(function () {
		infolog('build success');
	}, function (err) {
		errlog(err);
		errlog('build error');
	});
})();

function clone(repoUrl, outPath) {
	// http://www.nodegit.org/api/cred/#usernameNew

	var cloneOptions = {};
	cloneOptions.checkoutBranch = "master";
	cloneOptions.fetchOpts = {
				callbacks: {
					certificateCheck: function() { return 1; },
					credentials: function(url) {
						infolog('Validate Credentials For Url: ' + url);
						return NodeGit.Cred.userpassPlaintextNew("likai", "welcome123");
					},
					transferProgress: function(info) {
						infolog("Received Bytes: " + info.receivedBytes() / 1000.0 + "KB");
						infolog("Received Objects: " + info.receivedObjects() + " / " + info.totalObjects());
					}
				}
			};

	return NodeGit.Clone(repoUrl, outPath, cloneOptions);
}

function makeBundlePackage(codeBasePath, outputZipPath, ignoreCallback) {
	infolog('zip files...');

	return new Promise(function (resolve, reject) {
		zip(codeBasePath, outputZipPath, function (err) {
			if(!!err) {
				reject(err);
			} else {
				var err = rmrf(codeBasePath);
				if (err) {
					reject(err);
					return;
				}
				resolve();
			}
		});
	});
}

function makeUpdatePackage(codeBasePath, entrys, outputZipPath, ignoreCallback) {
		var cdSourcePath = path.dirname(codeBasePath);
		var distBaseName = path.basename(outputZipPath, path.extname(outputZipPath));
		var configJsonPath = path.join(cdSourcePath, 'config.json');
		var distBasePath = path.join(cdSourcePath, distBaseName);

		console.log(distBasePath);

		var ignoreFiles = ignoreCallback() || [];

		var filteredEntrys = entrys.filter(function(entry) {
			var sourceFile = entry.path;
			var sourceFilePath = path.join(codeBasePath, sourceFile);
			var baseName = path.basename(sourceFilePath);

			var isIgnoreFile = ignoreFiles.indexOf(baseName) > -1;
			return isFile(sourceFilePath) && !isIgnoreFile;
		});

		var validate = {};
		var allMd5Promise = Promise.all(filteredEntrys.map(function(entry) {
			var sourceFile = entry.path;
			var sourceFilePath = path.join(codeBasePath, sourceFile);
			return md5OfFile(sourceFilePath);
		}));

		return allMd5Promise.then(function(md5s) {
			return new Promise(function(resolve, reject) {
				filteredEntrys.forEach(function(entry, index) {
					infolog(entry.path);

					var sourceFile = entry.path;
					var sourceFilePath = path.join(codeBasePath, sourceFile);
					var distFilePath = path.join(distBasePath, sourceFile);

					validate[sourceFile] = md5s[index];
					var err = cp(sourceFilePath, distFilePath);
					if (!!err) {
						reject(err);
						return;
					}
				});

				// generate config json file
				var configJson = {
					version : '1.0.0',
				};

				configJson.validate = validate;

				// 生成update.json
				infolog('generate update.json...');
				try {
					var configStr = JSON.stringify(configJson, null, 4);
					fs.writeFileSync(configJsonPath, configStr);
				} catch (err) {
					reject(err);
					return;
				}

				zip(distBasePath, outputZipPath, function (err) {
					if(!!err) {
						reject(err);
					} else {
						var err = rmrf(distBasePath);
						if (err) {
							reject(err);
							return;
						}
						resolve();
					}
				});
			});
		});
}

function getHeadCommit(repository) {
	return repository.getHeadCommit();
}

function getCommit(repository, commitId) {
	var oid = NodeGit.Oid.fromString(commitId);
	console.log(oid);
	console.log(repository);
	return repository.getCommit(oid);
}

function getCommitMessage(commit) {
		return commit.message();
}

function deepObject(object) {
	return util.inspect(object, {showHidden: false, depth: null});
}

function base64Encoded(string) {
	return new Buffer(string).toString("base64")
}

function base64Decoded(base64String) {
	return new Buffer(base64String).toString("utf-8")
}

function md5OfFile(filePath) {
	return new Promise(function (resolve, reject) {
		var rs = fs.createReadStream(filePath);
		var hash = crypto.createHash('md5');

		rs.on('data', hash.update.bind(hash));
		rs.on('end', function() {
			resolve(hash.digest('hex'));
		});
		rs.on('error', function(error) {
			reject(error);
		});
	});
}

function errlog() {
	var args = Array.prototype.slice.call(arguments, 0);

	if (typeof args[0] === 'string') {
		args[0] = '[BT ERROR] ' + args[0];
	}

	console.error.apply(console, args);
}

function infolog() {
	var args = Array.prototype.slice.call(arguments, 0);

	if (typeof args[0] === 'string') {
		args[0] = '[BT INFO] ' + args[0];
	}

	console.info.apply(console, args);
}
