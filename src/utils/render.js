var async = require('async');
var render = require('consolidate').handlebars.render;

module.exports = function (/* options */) {
  return function (files, metalsmith, done) {
    var keys = Object.keys(files);
    var metadata = metalsmith.metadata();

    async.each(keys, run, done);

    function run (file, done) {
      var str = files[file].contents.toString();
      render(str, metadata, function (err, res) {
        if (err) {
          return done(err);
        }
        files[file].contents = new Buffer(res);
        done();
      });
    }
  };
};
