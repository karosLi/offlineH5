# offlineH5
A front end tool to make update bundle zip file

## install
```
sudo install -g offlineh5
```

## usage
```
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
```
