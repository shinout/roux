/**
 * Roux
 **/
var Roux =
(function($, umecob) {

  function RouxScope(data, env, evts) {
    this.data  = data;
    this.env   = env;
    this._evts = evts || {};
  }

  RouxScope.prototype.emit = function() {
    var args = Array.prototype.slice.call(arguments);
    var evtname = args.shift();
    this._emit(evtname, args, true);
  };

  RouxScope.prototype.emitSync = function() {
    var args = Array.prototype.slice.call(arguments);
    var evtname = args.shift();
    this._emit(evtname, args);
  };

  RouxScope.prototype._emit = function(evtname, args, async) {
    De&&bug("emitting", evtname);
    var fnlist = this._evts[evtname];
    if (!Array.isArray(fnlist)) {
      De&&bug("event is not registered", evtname);
      return;
    }
    if (async) {
      var self = this;
      fnlist.forEach(function(fn) {
        setTimeout(function() { fn.apply(self, args) });
      });
    }
    else {
      fnlist.forEach(function(fn) { fn.apply(self, args) });
    }
  };


  var De = true;
  var bug = function() {
    var args = Array.prototype.slice.call(arguments);
    var name = args.shift();
    if (!args.length) console.log(name);
    args.forEach(function(arg) { console.log(name, arg) });
  };

  var Deferred = umecob.Umecob.Deferred;
  var Publics  = {}; // public methods
  var Methods  = {}; // private methods
  var Utils    = {}; // utility functions

  var beforeInits = [];

  var self = {       // states (private properties) of this singleton object
    basePath        : '/',         // root dir
    viewPath        : '/views',    // resource root
    cssPath         : '/css',      // css root
    partialPath     : '/partials', // css root
    selector        : 'div.roux',  // selector for roux tags
    rouxLink        : 'a.rxlink',  // selector for roux tags
    rootName        : 'root',      // name of the root node
    nodeNames       : null,        // node names
    rouxes          : [],          // current roux jq objects
    currentIdx      : 0,           // current depth
    currentPath     : '',          // current path from basepath
    currentParams   : {},          // current parameters
    rules           : {},          // rule of fetching resources and data
    firstView       : true,        // when first view, true
    initialized     : false,       // initialized or not
    gotResources    : {},          // already fetched resources 
    errorFlag       : null,        // error flag
    env             : null,        // value from $d

    defaultContents : {},          // default contents. querystring => [contents1, contents2...]
    defaultState    : null,        // default state (path, params)

    // get current node name (dep: nodeNames)
    getCurrentName : function() {
      var ret = self.nodeNames[self.currentIdx]; 
      Utils.assert(ret);
      return ret;
    },

    // get next node name (dep: nodeNames)
    getNextName : function(_default) {
      return self.nodeNames[self.currentIdx + 1] || _default;
    },

    // get current URL (dep: currentPath)
    getCurrentURL : function() {
      return Utils.getURLByPaths(self.basePath, self.currentPath, self.currentParams);
    },

    // get current directory (from basePath)
    getCurrentDir: function() {
      var lastIdx = self.currentPath.lastIndexOf('/');
      return self.currentPath.slice(0, lastIdx);
    },

    // get URL by type (dep: nodeNames)
    getResourceURL : function(type, name, standardPath) {
      // var nextName = self.getNextName();
      // Utils.assert(nextName);
      name = name || self.nodeNames.slice(1, self.currentIdx+1+1).join('/');
      var url = Utils.normalizePath(standardPath + '/' + name + '.' + type);
      return Utils.addNoCacheParams(De, url);
      if (De) url += "?" + new Date().getTime().toString();
      // todo path parameter
    },

    // get rule
    getRule : function(path) {
      if (path == null) path = self.nodeNames.slice(1, self.currentIdx+1).join('/');
      // if root, path is empty if path is originally null
      if (!path) path = "/";
      if (!self.rules[path]) self.rules[path] = {path: path};
      return self.rules[path];
    },

    // get rule by Idx
    getRuleByIdx : function(idx, nodeNames) {
      if (!nodeNames) nodeNames = self.nodeNames;
      var path = path = nodeNames.slice(1, idx+1).join('/');
      // if root, path is empty if path is originally null
      if (!path) path = "/";
      if (!self.rules[path]) self.rules[path] = {path: path};
      return self.rules[path];
    },

    // url rewriter (can be customized)
    rewrite  : function(URL) { return URL },
  };


  /**
   * initialize
   **/
  Publics.init = function(basePath, options, $d) {
    $(function() {
      De&&bug("set visibility of body HIDDEN");
      $('body').css("visibility", "hidden")
    });

    var rawPath = location.pathname;
    options || (options = {});
    De = options.debug;
    De && setInterval(function(){ console.log(".") }, 2000);

    umecob.use({compiler: 'jsp', binding: 'jquery'});

    // base path
    basePath = Utils.normalizePath(basePath.trim());
    if (basePath.charAt(basePath.length-1) == '/') {
      basePath = basePath.slice(0, -1);
    }
    Utils.assert(rawPath.indexOf(basePath) == 0);
    self.basePath = basePath;

    // resource paths
    ["viewPath", "cssPath", "partialPath"].forEach(function(subpath) {
      if (typeof options[subpath] != 'string') {
        options[subpath] = Utils.normalizePath(self.basePath + '/' + self[subpath]);
      }
      else if (options[subpath].charAt(0) != '/') {
        options[subpath] = Utils.normalizePath(self.basePath + '/' + options[subpath]);
      }
      Utils.assert(options[subpath].charAt(0) == '/');
      self[subpath] = Utils.normalizePath(options[subpath]);
    });


    // selector
    if (typeof options.selector == 'string') self.selector = options.selector;

    // root name
    if (typeof options.rootName == 'string') self.rootName = options.rootName;

    var idx = rawPath.indexOf(self.basePath);
    if (self.basePath == "/") {
      var currentPath = rawPath;
    }
    else {
      var currentPath = (idx == -1) ? "/" : rawPath.slice(idx+self.basePath.length);
    }

    De&&bug("first currentPath", currentPath);

    // node names
    Methods.updateNodeNames(currentPath);

    // current path, params
    self.currentPath = currentPath;
    self.currentParams = Utils.parseQuery(location.search);

    // set the initial state
    self.defaultState = {
      params : self.currentParams,
      path   : self.currentPath
    };

    // on domready
    var $body = $("body");

    var afterPrepared = function(v) {
      if (v) self.env = v[0];
      De&&bug("env", self.env);

      $(self.rouxLink).live("click", function(evt) {
        De&&bug("rouxLink is clicked");
        var href = $(this).attr("href");
        var urlInfo = href.split("?");
        var query = Utils.parseQuery(urlInfo[1]);
        Publics.moveTo(urlInfo[0], query);
        return false;
      });

      De&&bug("init => getContents");
      var rootScope = new RouxScope({}, self.env, {});
      Methods.getContents($(self.selector), {scope: rootScope});
      // Methods.getContents($(self.selector), {data: xxx});
    };

    if ($d && $d.next) {
      var $domready = new Deferred();
      $(function() { $domready.call() });
      Deferred.parallel([$d, $domready]).next(afterPrepared);
    }
    else $(afterPrepared);

    // on popstate
    var firstPopState = true;
    window.onpopstate = function(evt) {
      if (firstPopState) {
        firstPopState = false;
        return;
      }
      var page = evt.state || self.defaultState;
      if (!page) return;

      Publics.moveTo(page.path, page.params, {backward: true});
    }


    self.initialized = true;

    De&&bug("beforeInits", beforeInits);

    beforeInits.forEach(function(args) {
      De&&bug("execute Roux.set() and Roux.moveTo() called before initialization");
      var method = args.shift();
      Publics[method].apply(Publics, args);
    });
  };


  /**
   * move to the given cpath (cpath: path from basePath)
   **/
  Publics.moveTo = function(cpath, params, options) {
    options || (options = {});
    params || (params = {});
    Utils.assert(typeof cpath == 'string');

    // if external site, redirect
    if (cpath.indexOf('http') == 0) {
      location.href = cpath;
      return;
    }

    cpath = Utils.normalizePath(cpath);

    // if relative path
    if (cpath.charAt(0) != '/') cpath = Utils.normalizePath(self.getCurrentDir() + '/' + cpath);

    // if errorFlag, redirect
    if (self.errorFlag) {
      location.href = self.basePath + cpath;
      return;
    }

    // prev info
    var prevIdx = self.currentIdx;
    var prevNodeNames = self.nodeNames;
    Methods.updateNodeNames(cpath);

    var isSameParam = Utils.compareParams(params, self.currentParams);


    // get new index
    self.currentIdx = 0;
    if (isSameParam) {
      for (var i=0,l=prevNodeNames.length; i<l; i++) {
        if (prevNodeNames[i] != self.nodeNames[i]) {
          break;
        }
        self.currentIdx = i;
      }
    }
    De&&bug("leaving ", prevIdx + " to " + self.currentIdx);

    // leave events
    for (var i = prevIdx, l = self.currentIdx; i>l; i--) {
      De&&bug("leaving", i);
      // leave event!
      var cRule = self.getRuleByIdx(i, prevNodeNames);
      De&&bug("leaving rule", cRule);
      var leave = cRule.leave;
      if (leave) {
        leave.call(cRule._scope, self.currentParams);
      }
    }

    // when exactly matched to prev path
    // if ( isSameParam
    //   && self.nodeNames.length-1 == self.currentIdx       // if current index is last position of nodeNames
    //   && prevNodeNames.length == self.nodeNames.length) { // if prev node num == current node num
    //   return true;
    // }


    // save previous state
    if (!options.backward) {
      var funcname = (options.replace) ? 'replaceState' : 'pushState';
      history[funcname](
        {
          path  : cpath,
          params: params
        },
        null, // title
        Utils.getURLByPaths(self.basePath, cpath, params)
      );
    }

    self.currentPath   = cpath;
    self.currentParams = params;
    self.rouxes        = self.rouxes.slice(0, self.currentIdx+1);
    
    De&&bug("moveTo => getContents");
    Methods.getContents(self.rouxes[self.currentIdx]);
    return self.currentPath;
  };


  /**
   * set distinations
   **/
  Publics.set = function(path, obj) {
    if (!self.initialized) {
      // De&&bug("Roux.set() : pushing to beforeInits", path);
      beforeInits.push(["set", path, obj]);
      return;
    }
    Utils.assert(self.initialized, 
      'first you have to initialize Roux with Roux.init() before Roux.set()');
    Utils.assert(typeof path == 'string');
    path = Utils.getNodeNamesByPath(path).join('/'); // get joined path without nodeNames
    switch (typeof obj) {
    case "object" : break;
    case "function":
      obj = {data: obj};
      break;
    default:
      return;
    }
    var rule = self.getRule(path);
    ['data', 'redirect', 'load', 'visit', 'leave'].forEach(function(name) {
      if (typeof obj[name] == "function") rule[name] = obj[name];
      delete obj[name];
    });

    ['css', 'html'].forEach(function(name) {
      if (typeof obj[name] == "string") rule[name] = obj[name];
      delete obj[name];
    });

    if (typeof obj._default == "string") {
      rule._default = (obj._default.charAt(0) == "/") ? obj._default.slice(1) : obj._default;
      delete obj._default;
    }

    if ("title" in obj) {
      rule.title = obj.title;
      delete obj.title;
    }

    ['partials'].forEach(function(name) {
      if (typeof obj[name] == "object") rule[name] = obj[name];
      delete obj[name];
    });

    // others are events
    if (!rule._evts) rule._evts = {};

    Object.keys(obj).forEach(function(evtname) {
      if (typeof obj[evtname] != "function") return;
      if (!rule._evts[evtname]) rule._evts[evtname] = [];
      rule._evts[evtname].push(obj[evtname]);
    });
  };


  /**
   * set nodeNames (dep: currentPath)
   **/
  Methods.updateNodeNames = function(cpath) {
    self.nodeNames = Utils.getNodeNamesByPath(cpath, self.rootName);
  };

  /**
   * make <body> visible 
   **/
  Methods.show = function(trans) {
    De&&bug("showing", self.currentPath);
    De&&bug("IDX", self.currentIdx, self.nodeNames);
    De&&bug("IDX", self.nodeNames.slice(1, 2 + self.currentIdx));
    var rule = self.getRule();
    De&&bug("rule", rule);

    if (typeof trans != "function") trans = Utils.show; // transition function
    trans($(self.selector));

    if (self.firstView) {
       De&&bug("set visibility of body VISIBLE");
      $('body').css("visibility", "visible");
      self.firstView = false;
    }
  };

  /**
   * get contents and insert into $roux
   **/
  Methods.getContents = function($roux, options) {
    options || (options = {});
    self.rouxes[self.currentIdx] = $roux;

    var trans = options.trans;
    var rule = self.getRule();

    // if getContents is called from getContents,
    De&&bug("options.scope", options.scope);
    if (options.scope) {
      if (rule.load && !rule._loaded) {
        rule.load.call(options.scope, self.currentParams);
        rule._loaded = true;
      }
      if (rule.visit) {
        rule.visit.call(options.scope, self.currentParams);
      }
    }

    // if no roux found, show and end getting contents.
    if (!$roux || !$roux.length) {
      De&&bug("NO ROUX FOUND");
      return Methods.show(trans);
    }

    // get default contents list by querystring
    var qs = Utils.getQuery(self.currentParams);
    if (!self.defaultContents[qs]) {
      self.defaultContents[qs] = [];
    }
    var defaultContents = self.defaultContents[qs];

    // get div
    var roux  = $roux.get(0);
    De&&bug("set visibility of roux HIDDEN");
    $roux.css("visibility", "hidden");

    var nextName = self.getNextName();

    // if no nextname, show and end getting contents.
    if (!nextName) {
      if (!rule._default) {
        var defaultHTML = defaultContents[self.currentIdx];
        if (defaultHTML) $roux.html(defaultHTML);
        De&&bug("NO NEXT NAME");
        return Methods.show(trans);
      }
      else {
        self.currentPath = Utils.normalizePath(self.currentPath + "/" + rule._default);
        Methods.updateNodeNames(self.currentPath);
        nextName = rule._default;
      }
    }

    /////////////////////// --------- NEXT RULE ----------  //////////////////////

    var nRule = self.getRuleByIdx(self.currentIdx+1); // get next rule
    De&&bug("next rule", nRule);

    var rouxId = "roux_" + nextName + "_in_" + self.getCurrentName();
    var dataToTpl = {
      rouxId: rouxId,
      sel: '#' + rouxId,
      params: self.currentParams,
      tpls : {}
    };

    var nScope = new RouxScope(dataToTpl, self.env, nRule._evts);
    De&&bug("next scope", nScope);

    nRule._scope = nScope; // for "leave" event

    // redirect check
    if (typeof nRule.redirect == "function") {
      var result = nRule.redirect.call(nScope, self.currentParams);
      if (result === false || result === undefined) {
        // no redirection
      }
      if (typeof result == "string") {
        return Publics.moveTo(result, null, {replace: true});
      }
      else if (Array.isArray(result)) {
        return Publics.moveTo(result[0], result[1], {replace: true});
      }
      else if (result === true) {
        return Publics.moveTo('/', null, {replace: true});
      }
    }
   
    // prepare id, data, urls for each template (css, partials, html)


    var htmlURL = self.getResourceURL("html", nRule.html, self.viewPath);
    var cssURL  = self.getResourceURL("css", nRule.css, self.cssPath);

    // get CSS
    if (!self.gotResources[cssURL]) {
      umecob({name: "roux", tpl_id: cssURL, data: dataToTpl})
      .next(function(css) {
        var styletag = $("head>style");
        if (styletag.length) {
          styletag.append(css);
        }
        else {
          if (!self.gotResources[cssURL]) $("head").append('<style>'+ css +'</style>');
          self.gotResources[cssURL] = 1;
        }
      });
    }

    // get partial templates
    var $d = new Deferred();

    if (nRule.partials) {
      var partialNames = Object.keys(nRule.partials);
      var count = partialNames.length;

      partialNames.forEach(function(name) {
        var tplURL = Utils.addNoCacheParams(De, nRule.partials[name]);

        if (self.gotResources[tplURL]) {
          dataToTpl.tpls[name]  = self.gotResources[tplURL];
          if (--count == 0) setTimeout(function() { $d.call() }, 0);
        }

        $.ajax({
          dataType : "text",
          url      : self.partialPath + "/" + tplURL + ".html",
          error : function() {
            De&&bug("ajax error", arguments);
            if (--count == 0) $d.call();
          },
          success : function(tpl, type, xhr) {
            dataToTpl.tpls[name]  = tpl;
            self.gotResources[tplURL]  = tpl;
            if (--count == 0) $d.call();
            // De&&bug("template(" + tplURL +")", tpl)
          }
        });
      });
    }
    else {
      setTimeout(function() { $d.call() }, 0);
    }

    defaultContents[self.currentIdx] = roux.innerHTML; // set default contents

    // get HTML
    $d.next(function() {
      var getter = nRule.data, $data = null;
      if (getter instanceof Deferred) {
        $data = getter.call(nScope, dataToTpl)
        .next(function(d) {
          for (var i in d) dataToTpl[i] = d[i];
          return dataToTpl;
        });
      }
      else {
        $data = dataToTpl;
        if (typeof getter == "function") {
          var _d = getter.call(nScope, dataToTpl);
          for (var i in _d) $data[i] = _d[i];
        }
        else {
          for (var i in getter) $data[i] = getter[i];
        }
      }

      umecob({
        name   : "roux",
        tpl_id : htmlURL,
        data   : $data
      })
      .next(function(html) {
        $roux.html(Utils.getDivStr(rouxId, html));
        var $sub = $('#' + rouxId + ' ' + self.selector);
        self.currentIdx++;
        De&&bug("get NEXT HTML=> getContents");
        Methods.getContents($sub, {scope : nScope});
      })
      .error(function(e) {
        self.showNotFound("ajax error", e);
        var path = path = self.nodeNames.slice(1, self.currentIdx+2).join('/');
        delete self.rules[path];
        return;
      });
    })
    .error(function(e) {
      self.showNotFound("error during data fetching", e);
    });
  };

  self.showNotFound = function(msg, e) {
    self.errorFlag = true;
    De&&bug(msg, e.stack);
    $("body").html("<h1>404 NOT FOUND " + (De ? "(" + msg + "<br>" + e.stack +")" : "")).css("visibility", "visible");
  };


  /**
   * get div tag with id
   **/
  Utils.getDivStr = function(id, txt) {
    if (!txt) txt = "";
    return '<div id="' + id + '">' + txt + '</div>';
  };


  /**
   * assert
   **/
  Utils.assert = function() {
    var args = Array.prototype.slice.call(arguments);
    var torf = args.shift();
    if (torf) return;
    args.unshift('[Roux.js]');
    var err = args.join(" ");
    if (!err) err = "(undocumented error)";
    throw new Error(err);
  };


  /**
   * normalize path
   **/
  Utils.normalizeArray = function(parts, allowAboveRoot) {
    // if the path tries to go above the root, `up` ends up > 0
    var up = 0;
    for (var i = parts.length - 1; i >= 0; i--) {
      var last = parts[i];
      if (last == '.') {
        parts.splice(i, 1);
      } else if (last === '..') {
        parts.splice(i, 1);
        up++;
      } else if (up) {
        parts.splice(i, 1);
        up--;
      }
    }

    // if the path is allowed to go above the root, restore leading ..s
    if (allowAboveRoot) {
      for (; up--; up) {
        parts.unshift('..');
      }
    }

    return parts;
  };

  /**
   * get URL by paths (basepath, currentpath)
   **/
  Utils.getURLByPaths = function(bpath, cpath, params) {
    var query = Utils.getQuery(params);
    if (query) query = '?' + query;
    return Utils.normalizePath(bpath + cpath + query);
  }


  /**
   * normalize paths
   **/
  Utils.normalizePath = function(path) {
    var isAbsolute = path.charAt(0) === '/',
        trailingSlash = path.slice(-1) === '/';

    // Normalize the path
    path = Utils.normalizeArray(path.split('/').filter(function(p) {
      return !!p;
    }), !isAbsolute).join('/');

    if (!path && !isAbsolute) {
      path = '.';
    }
    if (path && trailingSlash) {
      path += '/';
    }

    return (isAbsolute ? '/' : '') + path;
  };


  /**
   * get querystring from hash
   **/
  Utils.getQuery = function(obj) {
    var sep = '&';
    var eq  = '=';
    obj = (obj === null) ? undefined : obj;

    switch (typeof obj) {
      case 'object':
        return Object.keys(obj).map(function(k) {
          if (Array.isArray(obj[k])) {
            return obj[k].map(function(v) {
              return Utils.escape(k) +
                     eq +
                     Utils.escape(v);
            }).join(sep);
          } else {
            return Utils.escape(k) +
                   eq +
                   Utils.escape(obj[k]);
          }
        }).join(sep);

      default:
        return '';
    }
  };

  /**
   * encodeURI
   **/
  Utils.escape = function(v) {
    return encodeURIComponent(Utils.stringifyPrimitive(v));
  };
  
  /**
   * stringify
   **/
  Utils.stringifyPrimitive = function(v) {
    switch (typeof v) {
      case 'string':
        return v;

      case 'boolean':
        return v ? 'true' : 'false';

      case 'number':
        return isFinite(v) ? v : '';

      default:
        return '';
    }
  };

  /**
   * get object from a query string
   **/
  Utils.parseQuery = function(qs) {
    var sep = '&';
    var eq = '=';
    var obj = {};

    if (typeof qs !== 'string' || qs.length === 0) {
      return obj;
    }
    if (qs.charAt(0) == '?') qs = qs.slice(1);

    qs.split(sep).forEach(function(kvp) {
      var x = kvp.split(eq);
      var k = decodeURIComponent(x[0]);
      var v = decodeURIComponent(x.slice(1).join(eq));

      if (!Object.hasOwnProperty(obj, k)) {
        obj[k] = v;
      } else if (!Array.isArray(obj[k])) {
        obj[k] = [obj[k], v];
      } else {
        obj[k].push(v);
      }
    });

    return obj;
  };

  /**
   * compare two params object and return true if equivalent
   **/
  Utils.compareParams = function(p1, p2) {
    // compare params
    var pnames1 = Object.keys(p1);
    var pnames2 = Object.keys(p2);
    if (pnames1.length != pnames2.length) return false;

    return pnames1.every(function(k) {
      return p1[k] === p2[k];
    });
  };

  /**
   * $.show
   **/
  Utils.show = function($el) {
    De&&bug("set visibility of roux VISIBLE");
    $el.css("visibility", "visible");
  };

  Utils.addNoCacheParams = function(debug, url) {
    if (!debug) return url;
    return url + "?" + new Date().getTime().toString();
  };

  /**
   * split path and get node names
   **/
  Utils.getNodeNamesByPath = function(cpath, rootName) {
    cpath = Utils.normalizePath(cpath);
    Utils.assert(cpath.charAt(0) == '/');
    var nodeNames = cpath.slice(1).split('/').filter(function(v) { return v.trim().length });
    if (rootName != null) nodeNames.unshift(rootName);

    return nodeNames;
  };

  function arrayize(v) {
    return (Array.isArray(v)) ? v : [v];
  }

  return Publics;
})(jQuery, umecob);
