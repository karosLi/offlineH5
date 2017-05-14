# 静态资源打包工具（ypackr）使用说明

## 综述

ypackr 是专为移动 app 混合开发设计的 web 静态资源打包工具。

ypackr 通过比较两个 svn 版本的区别（目前还不支持 git），将静态资源项目打包为全量更新包、增量更新包，以及线上资源目录，同时生成版本信息 update.json。

## 运行环境

* ypackr 基于 nodejs 实现，使用前请先安装 nodejs。
* ypackr 依赖的 npm 模块需要联网安装，请确保连入互联网。
* ypackr 依赖 svn 命令行工具，使用前请安装 svn 并确保环境变量 Path 中有相关目录。
* ypackr 没有 svn 账户设置入口，使用前请确保 svn 已经保存了可用的账户名。
* ypackr 为命令行工具，使用前请确保环境变量 Path 中有 ypackr 根目录。

## 安装

```
npm install -g ypackr
```

## 命令参数

ypackr 命令格式如下：

```
ypackr -p=${prefix} -c=${currentVersion} -l=${lastVersion} -r=${repositoryURL}
```

其中：

* prefix 为输出目录，如果不设置，则输出于当前目录。
* currentVersion 为当前发布版本的 svn 版本号。
* lastVersion 为上一个版本的 svn 版本号。
* repositoryURL 为 svn 版本库地址。

## 输出

ypackr 输出为一个 zip 压缩包，其中有如下文件或目录：

* bundle.zip 新发布版本的全量更新包。
* patch.zip 增量更新包，其中有新增和改动过的文件。
* web 线上资源目录，供客户端或浏览器在不使用缓存时直接访问。
* update.json 版本信息文件，其中以 json 格式记录了新版本和上一个版本的版本号。
