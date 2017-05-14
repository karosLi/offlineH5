var nodegit = require("nodegit");
var path = require("path");
var util = require('util');

// This code examines the diffs between a particular commit and all of its
// parents. Since this commit is not a merge, it only has one parent. This is
// similar to doing `git show`.

function deepObject(object) {
	return util.inspect(object, {showHidden: false, depth: null});
}

nodegit.Repository.open(path.resolve(__dirname, "./temp/bundle_c2_l1_release170512173736/2"))
.then(function(repo) {
  return repo.getCommit("9ea0026a3a022e0e3421b2f2796743f266e380e7");
})
.then(function(commit) {
  console.log("commit " + commit.sha());
  console.log("Author:", commit.author().name() +
    " <" + commit.author().email() + ">");
  console.log("Date:", commit.date());
  console.log("\n    " + commit.message());

  return commit.getDiff();
})
.done(function(diffList) {
  // console.log(diffList);
  diffList.forEach(function(diff) {
    // console.log(deepObject(diff));
    diff.patches().then(function(patches) {
      console.log("old path");
      patches.forEach(function(patch) {
        console.log(patch.oldFile().path());
        // patch.hunks().then(function(hunks) {
        //   hunks.forEach(function(hunk) {
        //     hunk.lines().then(function(lines) {
        //       console.log("diff", patch.oldFile().path(),
        //         patch.newFile().path());
        //       console.log(hunk.header().trim());
        //       lines.forEach(function(line) {
        //         console.log(String.fromCharCode(line.origin()) +
        //           line.content().trim());
        //       });
        //     });
        //   });
        // });
      });

      console.log("new path");
      patches.forEach(function(patch) {
        console.log(patch.newFile().path());
      });
    });
  });
});
