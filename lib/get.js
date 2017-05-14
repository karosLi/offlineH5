'use strict';

var Git = require('nodegit');

module.exports = function(repo, option){
    if (option == null){
        return repo.getBranchCommit('master');
    }
    option = option || {};
    if (option instanceof Git.Commit){
        return Promise.resolve(option);
    }
    if (option instanceof Git.Oid){
        return repo.getCommit(option);
    }

    return Promise.resolve({
        'branch': option.branch || 'master',
        'commit': option.commit || option || 'HEAD'
    })
    .then(function(o){
        if (typeof o.commit != 'string'){
            return repo.getBranchCommit(o.branch);
        }
        if (o.commit.length == 40){
            return repo.getCommit(o.commit);
        }
        return repo.getCommit(o.commit)
        .catch(function(){
            return Git.AnnotatedCommit.fromRevspec(repo, o.commit)
            .then(function(annotatedCommit){
                return annotatedCommit.id();
            })
            .then(function(id){
                return repo.getCommit(id);
            });
        });
    });
};
