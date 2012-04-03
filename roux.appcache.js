var fs = require("fs");
var noop = function() {};
var stat = fs.lstatSync;
var normalize = require("path").normalize;


// define global variables
global.umecob = require('umecob');
global.$ = function(){};
global.location = { pathname: __dirname, search: "" };
global.window = {};
global.document = {};


module.exports = function(Publics) {

  global.Roux = Publics;

  /**
   * application caching
   **/
  Publics.getAppCache = function(pubdirs, options) {
    var paths = Publics.getPublicPaths(pubdirs, options);
    var lines = [];
    lines.push("CACHE MANIFEST");
    lines.push("#" + new Date().getTime());
    lines.push("CACHE:");
    paths.forEach(function(path) {
      lines.push(path);
    });
    if (options.qs) {
      paths.forEach(function(path) {
        lines.push(Roux.addNoCacheParams(path, options.qs));
      });
    }
    if (Array.isArray(options.network)) {
      lines.push("NETWORK:");
      options.network.forEach(function(path) {
        lines.push(path);
      });
    }
    return lines.join("\n");
  };

  Publics.getPublicPaths = function(pubdirs, options) {
    options || (options = {});
    var controller = options.controller || "controller.js";

    Publics.init("/");

    var jsdir = options.jsdir;

    // get js files
    var jsfiles = require('fs').readdirSync(jsdir);

    // require matched js files
    for (var i=0, l = jsfiles.length; i<l; i++) {
      var jsfile = jsfiles[i];
      if (jsfile.match(controller)) {
        try {
          // console.log("file", jsfile);
          require(normalize(jsdir + "/" + jsfile));
        }
        catch (e) {
          if (e.type == "not_defined") {
            // console.log("unDef", e.arguments[0]);
            global[e.arguments[0]] = {};
            i--;
          }
          else if (e.type == "property_not_function") {
            // console.log("notFunc", e.arguments[0]);
            global[e.arguments[0]] = noop;
            i--;
          }
          else {
            // console.log("uncaught", e.type)
          }
        }
      }
    }

    var ret = Roux.getPaths();

    // get public files
    if (pubdirs) {
      Object.keys(pubdirs).forEach(function(actualDir) {
        var prefix = pubdirs[actualDir];
        walk(actualDir, prefix, ret);
      });
    }

    return ret.filter(function(v) {
      return v.slice(-9) != ".appcache";
    });
  };
};

function walk(path, prefix, arr) {
  arr || (arr = []);
  if (stat(path).isDirectory()) {
    fs.readdirSync(path).forEach(function(name) {
      walk(path + "/" + name, prefix + "/" + name, arr);
    });
  }
  else {
    arr.push(normalize(prefix));
  }
  return arr;
}
