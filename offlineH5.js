#!/usr/bin/env node

/**
 * @file offlineh5.js
 * @author karos
 */

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
var glob = require('glob');

require('./lib/date.format');

var fileUtils = require('./lib/fileUtils');
var cp = fileUtils.cp;
var rmrf = fileUtils.rmrf;

var exists = fileUtils.exists;
var isFile = fileUtils.isFile;
var isDir = fileUtils.isDir;

var $ = path.resolve.bind(path);

(function() {
	program.version('0.0.5')
		.usage('A front end tool to make update bundle zip file')
		.option('-o, --outputPrefix <string>', 'Output prefix')
		.option('-z, --zipPrefix <string>', 'Zip name prefix. Example: if zipPrefix is "m" then the zip name will be m.update.zip and m.full.zip, otherwize will be update.zip and full.zip')
		.option('-f, --fromCommit <string>', 'From commit')
		.option('-t, --toCommit <string>', 'To commit. Default value is head commit if empty')
		.option('-r, --repository <string>', 'Repository URL')
		.option('-b, --branch <string>', 'Repository branch. Default value is "master" if empty')
		.option('-s, --subfolder <string>', 'Make diff according to subfolder of repository. Default value is "dist"')
		.option('-u, --username <string>', 'Git username')
		.option('-p, --password <string>', 'Git password')
		.parse(process.argv);

	var prefix = program.outputPrefix;
	var zipPrefix = program.zipPrefix;
	var fromCommit = program.fromCommit;
	var toCommit = program.toCommit;
	var repoUrl = program.repository;
	var branch = program.branch;
	var subfolder = program.subfolder;
	var username = program.username;
	var password = program.password;

	if (!repoUrl || repoUrl === '') {
		errlog('Missing parameter repository');
		return;
	}

	if (!repoUrl || repoUrl === '') {
		errlog('Missing parameter repository');
		return;
	}

	if (toCommit === fromCommit) {
		errlog('From commit is be able to equals to to commit');
		return;
	}

	prefix = prefix || '';
	zipPrefix = !!zipPrefix ?  zipPrefix + '.' : '';
	subfolder = subfolder || 'dist';

	// 时间戳
	var releaseTime = (new Date).format('yyyy_MM_dd_hh_mm_ss');
	// 发布目录名
	var releaseDir = 'Resource_' + releaseTime;

	infolog('repository path: ' + repoUrl);

	prefix = $(process.cwd(), prefix);
	prefix = $(prefix, releaseDir);

	try {
		if (fs.readdirSync(prefix).length) {
			errlog('dir ' + prefix + ' is NOT empty');
			return;
		}
	} catch (e) {
	}

	var localRepoDir = $(prefix, 'code');

	var cloneOptions = {
		'branch': !!branch ? branch : 'master',
		'username': username,
		'password': password
	};

	var commitInfo = {
		'update': {
			'fromCommit': '',
			'toCommit': '',
			'fromVersion': '',
			'toVersion': ''
		},
		'full':{
			'toCommit':'',
			'toVersion': ''
		}
	};

	new Promise(function (resolve, reject) {
		// clone 新版本
		infolog('Clone from repo url');

		return clone(repoUrl, localRepoDir, cloneOptions)
		.then(function(repository) {
      infolog('Git clone succeed');
			resolve(repository);
    }).catch(function(err) {
    	errlog('Git clone failed ' + err);
			reject();
    });

	})
	.then(function (repository) {
		// 如果 fromcommit 为空，直接跳过增量升级包流程
		if (!fromCommit) {
			return Promise.resolve(repository);
		}

		// 打增量压缩包
		infolog('Make update zip...');

		var outputUpdateFolder = path.join(path.dirname(localRepoDir), 'update');

		var fromPromise = getCommit(repository, fromCommit);
		var toPromise = !!toCommit ? getCommit(repository, toCommit) : getHeadCommit(repository);

		var allPromise = Promise.all([fromPromise, toPromise]);
   
		return allPromise
		.then(function(commits) {
			// 获取commits的版本号差别
			var versionJsonPath = path.join(subfolder, 'version.json');
			return Promise.all([getCommitBlobJson(commits[0], versionJsonPath), getCommitBlobJson(commits[1], versionJsonPath)])
			.then(function(versionJsons) {
				commitInfo.update.fromCommit = commits[0].id().tostrS();
				commitInfo.update.toCommit = commits[1].id().tostrS();

				commitInfo.update.fromVersion = versionJsons[0].version;
				commitInfo.update.toVersion = versionJsons[1].version;

				infolog('From commit: ' + commits[0].id().tostrS() + ' ' + commits[0].message());
				infolog('To commit: ' + commits[1].id().tostrS() + ' ' + commits[1].message());

				infolog('From version: ' + commitInfo.update.fromVersion);
				infolog('To verson: ' + commitInfo.update.toVersion);

				return commits;
			});
		})
		.then(function(commits) {
			return gitDiff(repository, commits[0], commits[1]);
		})
		.then(function(entrys) {
			var filteredEntrys = fileterEntrys(localRepoDir, subfolder, entrys);
			var allMd5Promises = calcMd5s(localRepoDir, filteredEntrys);

			return allMd5Promises.then(function(md5s) {
				var validate = buildValidate(filteredEntrys, md5s, subfolder);

				return Promise.resolve(validate);
			}).then(function(validate) {
				return writeConfigFile(commitInfo.update.toVersion, validate, outputUpdateFolder)
				.then(function() {
					return Promise.resolve(filteredEntrys);
				});
			});
		})
		.then(function(entrys) {
			return makePackage(localRepoDir, subfolder, entrys, outputUpdateFolder);
		})
		.then(function() {
			var outputZipPath = path.join(path.dirname(localRepoDir), zipPrefix + 'update_' + commitInfo.update.fromVersion + '_' + commitInfo.update.toVersion + '.zip');
			return zipCode(outputUpdateFolder, outputZipPath)
				.then(function() {
					rmrf(outputUpdateFolder);
					infolog('Make update zip end');
				});;
		})
		.then(function() {
			return Promise.resolve(repository);
		});

	}).then(function(repository) {
		// 打全量压缩包
		infolog('Make full zip...');
		var outputFullFolder = path.join(path.dirname(localRepoDir), 'full');

		return getHeadCommit(repository)
		.then(function(commit) {
			// 获取commits的版本号差别
			var versionJsonPath = path.join(subfolder, 'version.json');
			return getCommitBlobJson(commit, versionJsonPath)
			.then(function(versionJson) {
				commitInfo.full.toCommit = commit.id().tostrS();
				commitInfo.full.toVersion = versionJson.version;

				infolog('Full to commit: ' + commit.id().tostrS() + ' ' + commit.message());
				infolog('Full to verson: ' + commitInfo.full.toVersion);

				return commit;
			});
		})
		.then(function() {
			return findResourcePath(path.join(localRepoDir, subfolder));
		})
		.then(function(files) {
			var entrys = files.map(function(file) {
				return {path: file};
			});

			return Promise.resolve(entrys);
		})
		.then(function(entrys) {
			var filteredEntrys = fileterEntrys(localRepoDir, subfolder, entrys);
			var allMd5Promises = calcMd5s(localRepoDir, filteredEntrys);

			return allMd5Promises.then(function(md5s) {
				var validate = buildValidate(filteredEntrys, md5s, subfolder);

				return Promise.resolve(validate);
			}).then(function(validate) {
				return writeConfigFile(commitInfo.full.toVersion, validate, outputFullFolder)
				.then(function() {
					return Promise.resolve(filteredEntrys);
				});
			});
		})
		.then(function(entrys) {
			return makePackage(localRepoDir, subfolder, entrys, outputFullFolder);
		})
		.then(function() {
			var outputZipPath = path.join(path.dirname(localRepoDir), zipPrefix + 'full_' + commitInfo.full.toVersion + '.zip');
			return zipCode(outputFullFolder, outputZipPath)
				.then(function() {
					rmrf(outputFullFolder);
					infolog('Make full zip end');
				});
		});
	})
	.then(function() {
		// 清理临时文件
		rmrf(localRepoDir);
	})
	.then(function() {
		return writeCommitInfoFile(commitInfo, path.dirname(localRepoDir));
	})
	.then(function () {
		infolog('Build success');
	}, function (err) {
		errlog(err);
		errlog('Build error');
	});
})();

function clone(repoUrl, outPath, options) {
	// http://www.nodegit.org/api/cred/#usernameNew

	var cloneOptions = {};
	cloneOptions.checkoutBranch = options.branch;
	cloneOptions.fetchOpts = {
				callbacks: {
					certificateCheck: function() { return 1; },
					credentials: function(url) {
						infolog('Validate Credentials For Url: ' + url);
						return NodeGit.Cred.userpassPlaintextNew(options.username, options.password);
					},
					transferProgress: function(info) {
						infolog("Received Bytes: " + info.receivedBytes() / 1000.0 + "KB");
						infolog("Received Objects: " + info.receivedObjects() + " / " + info.totalObjects());
					}
				}
			};

	return NodeGit.Clone(repoUrl, outPath, cloneOptions);
}

function zipCode(codeBasePath, outputZipPath) {
	return new Promise(function (resolve, reject) {
		zip(codeBasePath, outputZipPath, function (err) {
			if(!!err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}

function makePackage(localRepoDir, subfolder, entrys, outputUpdateFolder) {
	return new Promise(function(resolve, reject) {
		entrys.forEach(function(entry, index) {
			infolog(entry.path);

			var sourceFile = entry.path;
			var sourceFilePath = path.resolve(localRepoDir, sourceFile);
			var distFile = sourceFile.substring(sourceFile.indexOf(subfolder) + subfolder.length + 1);
			var distFilePath = path.resolve(outputUpdateFolder, distFile);

			var err = cp(sourceFilePath, distFilePath);
			if (!!err) {
				reject(err);
				return;
			}
		});

		resolve();
	});
}

function fileterEntrys(localRepoDir, subfolder, entrys) {
		// 过滤文件
		var ignoreFiles = ['.gitlab-ci.yml', '.git', '.gitignore'];
		var filteredEntrys = entrys.filter(function(entry) {
			var sourceFile = entry.path;

			var sourceFilePath = path.resolve(localRepoDir, sourceFile);
			var baseName = path.basename(sourceFilePath);

			var isFileInSubFolder = sourceFile.indexOf(subfolder) > -1;
			var isIgnoreFile = ignoreFiles.indexOf(baseName) > -1;
			return isFileInSubFolder && isFile(sourceFilePath) && !isIgnoreFile;
		});

		return filteredEntrys;
}

function calcMd5s(localRepoDir, entrys) {
	// 对文件进行 md5
	var validate = {};
	var allMd5Promise = Promise.all(entrys.map(function(entry) {
		var sourceFile = entry.path;
		var sourceFilePath = path.resolve(localRepoDir, sourceFile);
		return md5OfFile(sourceFilePath);
	}));

	return allMd5Promise;
}

function findResourcePath(folder) {
	return new Promise(function(resolve, reject) {
		var absFolder = path.resolve(folder);
		var pattern = absFolder + '/**/*.{html,js,css,jpg,png,svg}';
	  var files = glob(pattern, {nodir: true}, function(error, files) {
			if (!error) {
				resolve(files);
			} else {
				reject(error);
			}
		});
	});
}

function readResourceVersion(localRepoDir, subfolder) {
	// 获取资源版本
	var version;
	try {
		var versionFilePath = path.join(localRepoDir, subfolder, 'version.json');
		var versionContent = fs.readFileSync(versionFilePath);
		var versionJson = JSON.parse(versionContent);
		version = versionJson.version;
	} catch (err) {
		version = '0.0.0';
	}

	return version;
}

function buildValidate(entrys, md5s, subfolder) {
	var validate = {};
	entrys.forEach(function(entry, index) {
		var sourceFile = entry.path;
		var distFile = sourceFile.substring(sourceFile.indexOf(subfolder) + subfolder.length + 1);

		validate[distFile] = md5s[index];
	});

	return validate;
}

function writeConfigFile(version, validate, writeConfigFileFolder) {
	// 生成update.json
	infolog('generate update.json...');
	// generate config json file
	var configJson = {
		'version' : version,
	};

	configJson.validate = validate;

	if(!isDir(writeConfigFileFolder)) {
		mkdirs(writeConfigFileFolder);
	}
	var configJsonPath = path.resolve(writeConfigFileFolder, 'config.json');
	var configStr = JSON.stringify(configJson, null, 4);

	return new Promise(function(resolve, reject) {
		fs.writeFile(configJsonPath, configStr, function(error) {
			if (!error) {
				resolve();
			} else {
				reject(error);
			}
		});
	});
}

function writeCommitInfoFile(commitInfo, fileFolder) {
	if(!isDir(fileFolder)) {
		mkdirs(fileFolder);
	}
	var configJsonPath = path.resolve(fileFolder, 'commitInfo.json');
	var configStr = JSON.stringify(commitInfo, null, 4);

	return new Promise(function(resolve, reject) {
		fs.writeFile(configJsonPath, configStr, function(error) {
			if (!error) {
				resolve();
			} else {
				reject(error);
			}
		});
	});
}

function getHeadCommit(repository) {
	return repository.getHeadCommit();
}

function getCommit(repository, commitId) {
	var oid = NodeGit.Oid.fromString(commitId);
	return repository.getCommit(oid);
}

function getCommitMessage(commit) {
		return commit.message();
}

function getCommitBlob(commit, path) {
	return commit.getEntry(path)
	.then(function(entry) {
		return entry.getBlob().then(function(blob) {
      blob.entry = entry;
      return blob;
    });
	});
}

function getCommitBlobString(commit, path) {
	return getCommitBlob(commit, path)
	.then(function(blob) {
		return Promise.resolve(String(blob));
	});
}

function getCommitBlobJson(commit, path) {
	return getCommitBlobString(commit, path)
	.then(function(string) {
		var json;
		try {
			json = JSON.parse(string);
		} catch (err) {
			json = {};
		}

		return Promise.resolve(json);
	});
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
