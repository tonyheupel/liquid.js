global = window;

var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var res = mod._cached ? mod._cached : mod();
    return res;
}

require.paths = [];
require.modules = {};
require.extensions = [".js",".coffee"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        var y = cwd || '.';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = x + '/package.json';
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key)
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

require.define = function (filename, fn) {
    var dirname = require._core[filename]
        ? ''
        : require.modules.path().dirname(filename)
    ;
    
    var require_ = function (file) {
        return require(file, dirname)
    };
    require_.resolve = function (name) {
        return require.resolve(name, dirname);
    };
    require_.modules = require.modules;
    require_.define = require.define;
    var module_ = { exports : {} };
    
    require.modules[filename] = function () {
        require.modules[filename]._cached = module_.exports;
        fn.call(
            module_.exports,
            require_,
            module_,
            module_.exports,
            dirname,
            filename
        );
        require.modules[filename]._cached = module_.exports;
        return module_.exports;
    };
};

if (typeof process === 'undefined') process = {};

if (!process.nextTick) process.nextTick = (function () {
    var queue = [];
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;
    
    if (canPost) {
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);
    }
    
    return function (fn) {
        if (canPost) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        }
        else setTimeout(fn, 0);
    };
})();

if (!process.title) process.title = 'browser';

if (!process.binding) process.binding = function (name) {
    if (name === 'evals') return require('vm')
    else throw new Error('No such module')
};

if (!process.cwd) process.cwd = function () { return '.' };

require.define("path", function (require, module, exports, __dirname, __filename) {
    function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
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
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
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


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

});

require.define("/node_modules/liquid.coffee", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Liquid;

  Liquid = require('liquid-node');

  Liquid.Partial = require('liquid-partial');

  Liquid.Partial.registerTemplates = function(rootElement) {
    var addIfLiquid, script, scripts, _i, _len, _results;
    if (rootElement == null) rootElement = document;
    scripts = rootElement.getElementsByTagName('script');
    if (!(scripts && scripts.length)) return;
    addIfLiquid = function(script) {
      if (script.type === 'text/liquid') {
        return Liquid.Partial.registerTemplate(script.id, script.innerHTML);
      }
    };
    _results = [];
    for (_i = 0, _len = scripts.length; _i < _len; _i++) {
      script = scripts[_i];
      _results.push(addIfLiquid(script));
    }
    return _results;
  };

  module.exports = Liquid;

}).call(this);

});

require.define("/node_modules/liquid-node/package.json", function (require, module, exports, __dirname, __filename) {
    module.exports = {"main":"./lib/index.js"}
});

require.define("/node_modules/liquid-node/lib/index.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Liquid, customError, util,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Liquid = require("./liquid");

  util = require("util");

  customError = function(name, inherit) {
    var error;
    if (inherit == null) inherit = global.Error;
    error = function(message) {
      this.name = name;
      this.message = message;
      if (global.Error.captureStackTrace) {
        return global.Error.captureStackTrace(this, arguments.callee);
      }
    };
    util.inherits(error, inherit);
    error.prototype = inherit.prototype;
    return error;
  };

  Liquid.Error = customError("Error");

  ["ArgumentError", "ContextError", "FilterNotFound", "FilterNotFound", "FileSystemError", "StandardError", "StackLevelError", "SyntaxError"].forEach(function(className) {
    return Liquid[className] = customError("Liquid." + className, Liquid.Error);
  });

  Liquid.Helpers = require("./liquid/helpers");

  Liquid.Drop = require("./liquid/drop");

  Liquid.Strainer = require("./liquid/strainer");

  Liquid.Context = require("./liquid/context");

  Liquid.Tag = require("./liquid/tag");

  Liquid.Block = require("./liquid/block");

  Liquid.Document = require("./liquid/document");

  Liquid.Variable = require("./liquid/variable");

  Liquid.Template = require("./liquid/template");

  Liquid.StandardFilters = require("./liquid/standard_filters");

  Liquid.Condition = require("./liquid/condition");

  Liquid.ElseCondition = (function(_super) {

    __extends(ElseCondition, _super);

    ElseCondition.name = 'ElseCondition';

    function ElseCondition() {
      return ElseCondition.__super__.constructor.apply(this, arguments);
    }

    ElseCondition.prototype["else"] = function() {
      return true;
    };

    ElseCondition.prototype.evaluate = function() {
      return true;
    };

    return ElseCondition;

  })(Liquid.Condition);

  Liquid.Template.registerFilter(Liquid.StandardFilters);

  require("./liquid/tags/assign");

  require("./liquid/tags/capture");

  require("./liquid/tags/comment");

  require("./liquid/tags/decrement");

  require("./liquid/tags/for");

  require("./liquid/tags/if");

  require("./liquid/tags/ifchanged");

  require("./liquid/tags/increment");

  require("./liquid/tags/raw");

  require("./liquid/tags/unless");

  module.exports = Liquid;

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Liquid;

  module.exports = Liquid = (function() {

    Liquid.name = 'Liquid';

    function Liquid() {}

    Liquid.log = function() {
      if (typeof debug === "undefined" || debug === null) return;
      try {
        return console.log.apply(console, arguments);
      } catch (e) {
        return console.log("Failed to log. %s", e);
      }
    };

    Liquid.FilterSeparator = /\|/;

    Liquid.ArgumentSeparator = /,/;

    Liquid.FilterArgumentSeparator = /\:/;

    Liquid.VariableAttributeSeparator = /\./;

    Liquid.TagStart = /\{\%/;

    Liquid.TagEnd = /\%\}/;

    Liquid.VariableSignature = /\(?[\w\-\.\[\]]\)?/;

    Liquid.VariableSegment = /[\w\-]/;

    Liquid.VariableStart = /\{\{/;

    Liquid.VariableEnd = /\}\}/;

    Liquid.VariableIncompleteEnd = /\}\}?/;

    Liquid.QuotedString = /"[^"]*"|'[^']*'/;

    Liquid.QuotedFragment = RegExp("" + Liquid.QuotedString.source + "|(?:[^\\s,\\|'\"]|" + Liquid.QuotedString.source + ")+");

    Liquid.StrictQuotedFragment = /"[^"]+"|'[^']+'|[^\s|:,]+/;

    Liquid.FirstFilterArgument = RegExp("" + Liquid.FilterArgumentSeparator.source + "(?:" + Liquid.StrictQuotedFragment.source + ")");

    Liquid.OtherFilterArgument = RegExp("" + Liquid.ArgumentSeparator.source + "(?:" + Liquid.StrictQuotedFragment.source + ")");

    Liquid.SpacelessFilter = RegExp("^(?:'[^']+'|\"[^\"]+\"|[^'\"])*" + Liquid.FilterSeparator.source + "(?:" + Liquid.StrictQuotedFragment.source + ")(?:" + Liquid.FirstFilterArgument.source + "(?:" + Liquid.OtherFilterArgument.source + ")*)?");

    Liquid.Expression = RegExp("(?:" + Liquid.QuotedFragment.source + "(?:" + Liquid.SpacelessFilter.source + ")*)");

    Liquid.TagAttributes = RegExp("(\\w+)\\s*\\:\\s*(" + Liquid.QuotedFragment.source + ")");

    Liquid.AnyStartingTag = /\{\{|\{\%/;

    Liquid.PartialTemplateParser = RegExp("" + Liquid.TagStart.source + ".*?" + Liquid.TagEnd.source + "|" + Liquid.VariableStart.source + ".*?" + Liquid.VariableIncompleteEnd.source);

    Liquid.TemplateParser = RegExp("(" + Liquid.PartialTemplateParser.source + "|" + Liquid.AnyStartingTag.source + ")");

    Liquid.VariableParser = RegExp("\\[[^\\]]+\\]|" + Liquid.VariableSegment.source + "+\\??");

    return Liquid;

  })();

}).call(this);

});

require.define("util", function (require, module, exports, __dirname, __filename) {
    // only implement inherits since it seems to be the most commonly used
  this.inherits = function (ctor, superCtor) {
    ctor.super_ = superCtor;
    ctor.prototype = Object.create(superCtor.prototype, { 
  	constructor: { 
  	  value: ctor, 
  	  enumerable: false, 
        writable: true, 
  	  configurable: true 
  	} 
    });
  };

});

require.define("/node_modules/liquid-node/lib/liquid/helpers.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var futures,
    __slice = Array.prototype.slice;

  futures = require("futures");

  module.exports = {
    unfuture: function(future, options) {
      var callback, callbackResult, singleFuture, _unfuture;
      if (options == null) options = {};
      if (options instanceof Function) {
        options = {
          callback: options
        };
      }
      callback = options.callback;
      if (!((future != null ? future.isFuture : void 0) != null)) {
        if (callback) {
          callbackResult = callback(null, future);
          return module.exports.unfuture(callbackResult);
        } else {
          return future;
        }
      } else {
        singleFuture = futures.future();
        _unfuture = function(future) {
          return future.when(function() {
            var args, err, result;
            err = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
            try {
              if (err) {
                callback.apply(null, arguments);
                return singleFuture.deliver.apply(singleFuture, arguments);
              } else if (args[0] && (args[0].isFuture != null)) {
                return _unfuture(args[0]);
              } else if (callback) {
                result = callback.apply(null, arguments);
                if ((result != null ? result.isFuture : void 0) != null) {
                  callback = null;
                  return _unfuture(result);
                } else {
                  return singleFuture.deliver(err, result);
                }
              } else {
                return singleFuture.deliver.apply(singleFuture, arguments);
              }
            } catch (e) {
              console.log("Couldn't unfuture: %s\n%s", e, e.stack);
              return singleFuture.deliver(e);
            }
          });
        };
        _unfuture(future);
        return singleFuture;
      }
    },
    scan: function(string, regexp, globalMatch) {
      var result, _scan;
      if (globalMatch == null) globalMatch = false;
      result = [];
      _scan = function(s) {
        var l, match;
        match = regexp.exec(s);
        if (match) {
          if (match.length === 1) {
            result.push(match[0]);
          } else {
            result.push(match.slice(1));
          }
          l = match[0].length;
          if (globalMatch) l = 1;
          if (match.index + l < s.length) {
            return _scan(s.substring(match.index + l));
          }
        }
      };
      _scan(string);
      return result;
    },
    functionName: function(f) {
      var _ref;
      if (f.__name__) return f.__name__;
      if (f.name) return f.name;
      return (_ref = f.toString().match(/\W*function\s+([\w\$]+)\(/)) != null ? _ref[1] : void 0;
    }
  };

}).call(this);

});

require.define("/node_modules/liquid-node/node_modules/futures/package.json", function (require, module, exports, __dirname, __filename) {
    module.exports = {"main":"index.js"}
});

require.define("/node_modules/liquid-node/node_modules/futures/index.js", function (require, module, exports, __dirname, __filename) {
    /*jslint browser: true, devel: true, debug: true, es5: true, onevar: true, undef: true, nomen: true, eqeqeq: true, plusplus: true, bitwise: true, regexp: true, newcap: true, immed: true, strict: true */
(function () {
  "use strict";

  var modulepath;

  function upgradeMessage() {
    var msg = "You have upgraded to Futures 2.x. See http://github.com/coolaj86/futures for details.";
    console.log(msg);
    throw new Error(msg);
  }

  module.exports = {
    promise: upgradeMessage,
    subscription: upgradeMessage,
    synchronize: upgradeMessage,
    whilst: upgradeMessage,
    future: require('future'),
    forEachAsync: require('forEachAsync'),
    sequence: require('sequence'),
    join: require('join'),
    asyncify: require('asyncify'),
    loop: require('loop'),
    chainify: require('chainify')
  };
}());

});

require.define("/node_modules/liquid-node/node_modules/futures/node_modules/future/package.json", function (require, module, exports, __dirname, __filename) {
    module.exports = {"main":"future.js"}
});

require.define("/node_modules/liquid-node/node_modules/futures/node_modules/future/future.js", function (require, module, exports, __dirname, __filename) {
    (function () {
  "use strict";

  var MAX_INT = Math.pow(2,52);

  function isFuture(obj) {
    return obj instanceof future;
  }

  function futureTimeout(time) {
    this.name = "FutureTimeout";
    this.message = "timeout " + time + "ms";
  }



  function future(global_context) {
    var everytimers = {},
      onetimers = {},
      index = 0,
      deliveries = 0,
      time = 0,
      fulfilled,
      data,
      timeout_id,
      //asap = false,
      asap =  true,
      passenger,
      self = this;

    // TODO change `null` to `this`
    global_context = ('undefined' === typeof global_context ? null : global_context);


    function resetTimeout() {
      if (timeout_id) {
        clearTimeout(timeout_id);
        timeout_id = undefined;
      }

      if (time > 0) {
        timeout_id = setTimeout(function () {
          self.deliver(new futureTimeout(time));
          timeout_id = undefined;
        }, time);
      }
    }



    self.isFuture = isFuture;

    self.setContext = function (context) {
      global_context = context;
    };

    self.setTimeout = function (new_time) {
      time = new_time;
      resetTimeout();
    };



    self.errback = function () {
      if (arguments.length < 2) {
        self.deliver.call(self, arguments[0] || new Error("`errback` called without Error"));
      } else {
        self.deliver.apply(self, arguments);
      }
    };



    self.callback = function () {
      var args = Array.prototype.slice.call(arguments);

      args.unshift(undefined);
      self.deliver.apply(self, args);
    };



    self.callbackCount = function() {
      return Object.keys(everytimers).length;
    };



    self.deliveryCount = function() {
      return deliveries;
    };



    self.setAsap = function(new_asap) {
      if (undefined === new_asap) {
        new_asap = true;
      }
      if (true !== new_asap && false !== new_asap) {
        throw new Error("Future.setAsap(asap) accepts literal true or false, not " + new_asap);
      }
      asap = new_asap;
    };



    // this will probably never get called and, hence, is not yet well tested
    function cleanup() {
      var new_everytimers = {},
        new_onetimers = {};

      index = 0;
      Object.keys(everytimers).forEach(function (id) {
        var newtimer = new_everytimers[index] = everytimers[id];

        if (onetimers[id]) {
          new_onetimers[index] = true;
        }

        newtimer.id = index;
        index += 1;
      });

      onetimers = new_onetimers;
      everytimers = new_everytimers;
    }



    function findCallback(callback, context) {
      var result;
      Object.keys(everytimers).forEach(function (id) {
        var everytimer = everytimers[id];
        if (callback === everytimer.callback) {
          if (context === everytimer.context || everytimer.context === global_context) {
            result = everytimer;
          }
        }
      });
      return result;
    }



    self.hasCallback = function () {
      return !!findCallback.apply(self, arguments);
    };



    self.removeCallback = function(callback, context) {
      var everytimer = findCallback(callback, context);
      if (everytimer) {
        delete everytimers[everytimer.id];
        onetimers[everytimer.id] = undefined;
        delete onetimers[everytimer.id];
      }

      return self;
    };



    self.deliver = function() {
      if (fulfilled) {
        throw new Error("`Future().fulfill(err, data, ...)` renders future deliveries useless");
      }
      var args = Array.prototype.slice.call(arguments);
      data = args;

      deliveries += 1; // Eventually reaches `Infinity`...

      Object.keys(everytimers).forEach(function (id) {
        var everytimer = everytimers[id],
          callback = everytimer.callback,
          context = everytimer.context;

        if (onetimers[id]) {
          delete everytimers[id];
          delete onetimers[id];
        }

        // TODO
        callback.apply(context, args);
        /*
        callback.apply(('undefined' !== context ? context : newme), args);
        context = newme;
        context = ('undefined' !== global_context ? global_context : context)
        context = ('undefined' !== local_context ? local_context : context)
        */
      });

      if (args[0] && "FutureTimeout" !== args[0].name) {
        resetTimeout();
      }

      return self;
    };



    self.fulfill = function () {
      if (arguments.length) {
        self.deliver.apply(self, arguments);
      } else {
        self.deliver();
      }
      fulfilled = true;
    };



    self.whenever = function (callback, local_context) {
      var id = index,
        everytimer;

      if ('function' !== typeof callback) {
        throw new Error("Future().whenever(callback, [context]): callback must be a function.");
      }

      if (findCallback(callback, local_context)) {
        // TODO log
        throw new Error("Future().everytimers is a strict set. Cannot add already subscribed `callback, [context]`.");
        return;
      }

      everytimer = everytimers[id] = {
        id: id,
        callback: callback,
        context: (null === local_context) ? null : (local_context || global_context)
      };

      if (asap && deliveries > 0) {
        // doesn't raise deliver count on purpose
        everytimer.callback.apply(everytimer.context, data);
        if (onetimers[id]) {
          delete onetimers[id];
          delete everytimers[id];
        }
      }

      index += 1;
      if (index >= MAX_INT) {
        cleanup(); // Works even for long-running processes
      }

      return self;
    };



    self.when = function (callback, local_context) {
      // this index will be the id of the everytimer
      onetimers[index] = true;
      self.whenever(callback, local_context);

      return self;
    };


    //
    function privatize(obj, pubs) {
      var result = {};
      pubs.forEach(function (pub) {
        result[pub] = function () {
          obj[pub].apply(obj, arguments);
          return result;
        };
      });
      return result;
    }

    passenger = privatize(self, [
      "when",
      "whenever"
    ]);

    self.passable = function () {
      return passenger;
    };

  }

  function Future(context) {
    // TODO use prototype instead of new
    return (new future(context));
  }

  Future.isFuture = isFuture;
  module.exports = Future;
}());

});

require.define("/node_modules/liquid-node/node_modules/futures/node_modules/forEachAsync/package.json", function (require, module, exports, __dirname, __filename) {
    module.exports = {"main":"forEachAsync.js"}
});

require.define("/node_modules/liquid-node/node_modules/futures/node_modules/forEachAsync/forEachAsync.js", function (require, module, exports, __dirname, __filename) {
    (function () {
  "use strict";

  var Sequence = require('sequence');

  function forEachAsync(arr, callback) {
    var sequence = Sequence();

    function handleItem(item, i, arr) {
      sequence.then(function (next) {
        callback(next, item, i, arr);
      });
    }

    arr.forEach(handleItem);

    return sequence;
  }

  module.exports = forEachAsync;
}());

});

require.define("/node_modules/liquid-node/node_modules/futures/node_modules/sequence/package.json", function (require, module, exports, __dirname, __filename) {
    module.exports = {"main":"sequence.js"}
});

require.define("/node_modules/liquid-node/node_modules/futures/node_modules/sequence/sequence.js", function (require, module, exports, __dirname, __filename) {
    (function () {
  "use strict";

  function isSequence(obj) {
    return obj instanceof sequence;
  }

  function sequence(global_context) {
    var self = this,
      waiting = true,
      data,
      stack = [];

    global_context = global_context || null;

    function next() {
      var args = Array.prototype.slice.call(arguments),
        seq = stack.shift(); // BUG this will eventually leak

      data = arguments;

      if (!seq) {
        // the chain has ended (for now)
        waiting = true;
        return;
      }

      args.unshift(next);
      seq.callback.apply(seq.context, args);
    }

    function then(callback, context) {
      if ('function' !== typeof callback) {
        throw new Error("`Sequence().then(callback [context])` requires that `callback` be a function and that `context` be `null`, an object, or a function");
      }
      stack.push({
        callback: callback,
        context: (null === context ? null : context || global_context),
        index: stack.length
      });

      // if the chain has stopped, start it back up
      if (waiting) {
        waiting = false;
        next.apply(null, data);
      }

      return self;
    }

    self.next = next;
    self.then = then;
  }

  function Sequence(context) {
    // TODO use prototype instead of new
    return (new sequence(context));
  }
  Sequence.isSequence = isSequence;
  module.exports = Sequence;
}());

});

require.define("/node_modules/liquid-node/node_modules/futures/node_modules/join/package.json", function (require, module, exports, __dirname, __filename) {
    module.exports = {"main":"join.js"}
});

require.define("/node_modules/liquid-node/node_modules/futures/node_modules/join/join.js", function (require, module, exports, __dirname, __filename) {
    (function () {
  "use strict";

  var Future = require('future');

  function isJoin(obj) {
    return obj instanceof join;
  }

  function join(global_context) {
    var self = this,
      data = [],
      ready = [],
      subs = [],
      promise_only = false,
      begun = false,
      updated = 0,
      join_future = Future(global_context);

    global_context = global_context || null;

    function relay() {
      var i;
      if (!begun || updated !== data.length) {
        return;
      }
      updated = 0;
      join_future.deliver.apply(join_future, data);
      data = Array(data.length);
      ready = Array(ready.length);
      //for (i = 0; i < data.length; i += 1) {
      //  data[i] = undefined;
      //}
    }

    function init() {
      var type = (promise_only ? "when" : "whenever");

      begun = true;
      data = Array(subs.length);
      ready = Array(subs.length);

      subs.forEach(function (sub, id) {
        sub[type](function () {
          var args = Array.prototype.slice.call(arguments);
          data[id] = args;
          if (!ready[id]) {
            ready[id] = true;
            updated += 1;
          }
          relay();
        });
      });
    }

    self.deliverer = function () {
      var future = Future();
      self.add(future);
      return future.deliver;
    };
    self.newCallback = self.deliverer;

    self.when = function () {
      if (!begun) {
        init();
      }
      join_future.when.apply(join_future, arguments);
    };

    self.whenever = function () {
      if (!begun) {
        init();
      }
      join_future.whenever.apply(join_future, arguments);
    };

    self.add = function () {
      if (begun) {
        throw new Error("`Join().add(Array<future> | subs1, [subs2, ...])` requires that all additions be completed before the first `when()` or `whenever()`");
      }
      var args = Array.prototype.slice.call(arguments);
      if (0 === args.length) {
        return self.newCallback();
      }
      args = Array.isArray(args[0]) ? args[0] : args;
      args.forEach(function (sub) {
        if (!sub.whenever) {
          promise_only = true;
        }
        if (!sub.when) {
          throw new Error("`Join().add(future)` requires either a promise or future");
        }
        subs.push(sub);
      });
    };
  }

  function Join(context) {
    // TODO use prototype instead of new
    return (new join(context));
  }
  Join.isJoin = isJoin;
  module.exports = Join;
}());

});

require.define("/node_modules/liquid-node/node_modules/futures/node_modules/asyncify/package.json", function (require, module, exports, __dirname, __filename) {
    module.exports = {"main":"asyncify.js"}
});

require.define("/node_modules/liquid-node/node_modules/futures/node_modules/asyncify/asyncify.js", function (require, module, exports, __dirname, __filename) {
    (function () {
  "use strict";

  var Future = require('future');

  function asyncify(doStuffSync, context) {
    var future = Future(),
      passenger = future.passable();

    future.setAsap(false);

    function doStuff() {
      var self = ('undefined' !== typeof context ? context : this),
        err,
        data;

      future.setContext(self);

      try {
        data = doStuffSync.apply(self, arguments);
      } catch(e) {
        err = e;
      }

      future.deliver(err, data);

      return passenger;
    }

    doStuff.when = passenger.when;
    doStuff.whenever = passenger.whenever;

    return doStuff;
  }

  module.exports = asyncify;
}());

});

require.define("/node_modules/liquid-node/node_modules/futures/node_modules/loop/package.json", function (require, module, exports, __dirname, __filename) {
    module.exports = {"main":"loop.js"}
});

require.define("/node_modules/liquid-node/node_modules/futures/node_modules/loop/loop.js", function (require, module, exports, __dirname, __filename) {
    (function () {
  "use strict";

  var Future = require('future');

  function MaxCountReached(max_loops) {
      this.name = "MaxCountReached";
      this.message = "Loop looped " + max_loops + " times";
  }

  function timestamp() {
    return (new Date()).valueOf();
  }

  function loop(context) {
    var self = this,
      future = Future(),
      min_wait = 0,
      count = 0,
      max_loops = 0,
      latest,
      time,
      timed_out,
      timeout_id,
      data,
      callback;

    self.setMaxLoop = function (new_max) {
      max_loops = new_max;
      return self;
    };



    self.setWait = function (new_wait) {
      min_wait = new_wait;
      return self;
    };



    self.setTimeout = function (new_time) {
      if (time) {
        throw new Error("Can't set timeout, the loop has already begun!");
      }
      time = new_time;
      var timeout_id = setTimeout(function () {
        timed_out = true;
        future.deliver(new Error("LoopTimeout"));
      }, time);

      future.when(function () {
        clearTimeout(timeout_id);
      });
      return self;
    };



    function runAgain() {
      var wait = Math.max(min_wait - (timestamp() - latest), 0);
      if (isNaN(wait)) {
        wait = min_wait;
      }

      if (timed_out) {
        return;
      }
      if (max_loops && count >= max_loops) {
        future.deliver(new MaxCountReached(max_loops));
        return;
      }

      data.unshift(next);
      setTimeout(function () {
        latest = timestamp();
        try {
          callback.apply(context, data);
          count += 1;
        } catch(e) {
          throw e;
        }
      }, wait);
    }



    function next() {
      // dirty hack to turn arguments object into an array
      data = Array.prototype.slice.call(arguments);
      if ("break" === data[0]) {
        data.shift();
        future.deliver.apply(future, data);
        return;
      }
      runAgain();
    }



    self.run = function (doStuff) {
      // dirty hack to turn arguments object into an array
      data = Array.prototype.slice.call(arguments);
      callback = doStuff;
      data[0] = undefined;
      next.apply(self, data);
      return self;
    };



    self.when = future.when;
    self.whenever = future.whenever;

  }



  function Loop(context) {
    // TODO use prototype instead of new
    return (new loop(context));
  }
  module.exports = Loop;
}());

});

require.define("/node_modules/liquid-node/node_modules/futures/node_modules/chainify/package.json", function (require, module, exports, __dirname, __filename) {
    module.exports = {"main":"chainify.js"}
});

require.define("/node_modules/liquid-node/node_modules/futures/node_modules/chainify/chainify.js", function (require, module, exports, __dirname, __filename) {
    (function () {
  "use strict";

  var Future = require('future'),
    Sequence = require('sequence');

  // This is being saved in case I later decide to require future-functions
  // rather than always passing `next`
  function handleResult(next, result) {
    // Do wait up; assume that any return value has a callback
    if ('undefined' !== typeof result) {
      if ('function' === typeof result.when) {
        result.when(next);
      } else if ('function' === typeof result) {
        result(next);
      } else {
        next(result);
      }
    }
  }

  /**
   * Async Method Queing
   */
  function Chainify(providers, modifiers, consumers, context, params) {
    var Model = {};

    if ('undefined' === typeof context) {
      context = null;
    }

    /**
     * Create a method from a consumer
     * These may be promisable (validate e-mail addresses by sending an e-mail)
     * or return synchronously (selecting a random number of friends from contacts)
     */
    function methodify(provider, sequence) {
      var methods = {};

      function chainify_one(callback, is_consumer) {
        return function () {
          var params = Array.prototype.slice.call(arguments);

          sequence.then(function() {
            var args = Array.prototype.slice.call(arguments)
              , args_params = []
              , next = args.shift();

            args.forEach(function (arg) {
              args_params.push(arg);
            });
            params.forEach(function (param) {
              args_params.push(param);
            });
            params = undefined;

            if (is_consumer) {
              // Don't wait up, just keep on truckin'
              callback.apply(context, args_params);
              next.apply(null, args);
            } else {
              // Do wait up
              args_params.unshift(next);
              callback.apply(context, args_params);
            }

            // or
            // handleResult(next, result)
          });
          return methods;
        };
      }

      Object.keys(modifiers).forEach(function (key) {
        methods[key] = chainify_one(modifiers[key]);
      });

      Object.keys(consumers).forEach(function (key) {
        methods[key] = chainify_one(consumers[key], true);
      });

      return methods;
    }

    /**
     * A model might be something such as Contacts
     * The providers might be methods such as:
     * all(), one(id), some(ids), search(key, params), search(func), scrape(template)
     */
    function chainify(provider, key) {
      return function () {
        var args = Array.prototype.slice.call(arguments),
          future = Future(),
          sequence = Sequence();

        // provide a `next`
        args.unshift(future.deliver);
        provider.apply(context, args);

        sequence.then(future.when);

        return methodify(providers[key], sequence);
      };
    }

    Object.keys(providers).forEach(function (key) {
      Model[key] = chainify(providers[key], key);
    });

    return Model;
  }

  module.exports = Chainify;
}());

});

require.define("/node_modules/liquid-node/lib/liquid/drop.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Drop, _,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  _ = require("underscore")._;

  module.exports = Drop = (function() {

    Drop.name = 'Drop';

    function Drop() {}

    Drop.extend = function(impl) {
      var Droplet, klass;
      return klass = Droplet = (function(_super) {

        __extends(Droplet, _super);

        Droplet.name = 'Droplet';

        function Droplet() {
          return Droplet.__super__.constructor.apply(this, arguments);
        }

        return Droplet;

      })(Drop);
    };

    Drop.prototype.hasKey = function(key) {
      return true;
    };

    Drop.prototype.invokeDrop = function(methodOrKey) {
      if (methodOrKey && methodOrKey !== '' && (this[methodOrKey] != null)) {
        if (typeof this[methodOrKey] === "function") {
          return this[methodOrKey].call(this);
        }
      } else {
        return this.beforeMethod(methodOrKey);
      }
    };

    Drop.prototype.beforeMethod = function(method) {
      return;
    };

    Drop.prototype.get = function(methodOrKey) {
      return invokeDrop(methodOrKey);
    };

    Drop.prototype.toLiquid = function() {
      return this;
    };

    return Drop;

  })();

}).call(this);

});

require.define("/node_modules/liquid-node/node_modules/underscore/package.json", function (require, module, exports, __dirname, __filename) {
    module.exports = {"main":"underscore.js"}
});

require.define("/node_modules/liquid-node/node_modules/underscore/underscore.js", function (require, module, exports, __dirname, __filename) {
    //     Underscore.js 1.2.4
//     (c) 2009-2012 Jeremy Ashkenas, DocumentCloud Inc.
//     Underscore is freely distributable under the MIT license.
//     Portions of Underscore are inspired or borrowed from Prototype,
//     Oliver Steele's Functional, and John Resig's Micro-Templating.
//     For all details and documentation:
//     http://documentcloud.github.com/underscore

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `global` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var slice            = ArrayProto.slice,
      unshift          = ArrayProto.unshift,
      toString         = ObjProto.toString,
      hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) { return new wrapper(obj); };

  // Export the Underscore object for **Node.js** and **"CommonJS"**, with
  // backwards-compatibility for the old `require()` API. If we're not in
  // CommonJS, add `_` to the global object.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else if (typeof define === 'function' && define.amd) {
    // Register as a named module with AMD.
    define('underscore', function() {
      return _;
    });
  } else {
    // Exported as a string, for Closure Compiler "advanced" mode.
    root['_'] = _;
  }

  // Current version.
  _.VERSION = '1.2.4';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, l = obj.length; i < l; i++) {
        if (i in obj && iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      for (var key in obj) {
        if (hasOwnProperty.call(obj, key)) {
          if (iterator.call(context, obj[key], key, obj) === breaker) return;
        }
      }
    }
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results[results.length] = iterator.call(context, value, index, list);
    });
    if (obj.length === +obj.length) results.length = obj.length;
    return results;
  };

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError('Reduce of empty array with no initial value');
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var reversed = _.toArray(obj).reverse();
    if (context && !initial) iterator = _.bind(iterator, context);
    return initial ? _.reduce(reversed, iterator, memo, context) : _.reduce(reversed, iterator);
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, iterator, context) {
    var result;
    any(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(iterator, context);
    each(obj, function(value, index, list) {
      if (iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    each(obj, function(value, index, list) {
      if (!iterator.call(context, value, index, list)) results[results.length] = value;
    });
    return results;
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, iterator, context) {
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(iterator, context);
    each(obj, function(value, index, list) {
      if (!(result = result && iterator.call(context, value, index, list))) return breaker;
    });
    return result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, iterator, context) {
    iterator || (iterator = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(iterator, context);
    each(obj, function(value, index, list) {
      if (result || (result = iterator.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if a given value is included in the array or object using `===`.
  // Aliased as `contains`.
  _.include = _.contains = function(obj, target) {
    var found = false;
    if (obj == null) return found;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    found = any(obj, function(value) {
      return value === target;
    });
    return found;
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    return _.map(obj, function(value) {
      return (_.isFunction(method) ? method || value : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, function(value){ return value[key]; });
  };

  // Return the maximum element or (element-based computation).
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj)) return Math.max.apply(Math, obj);
    if (!iterator && _.isEmpty(obj)) return -Infinity;
    var result = {computed : -Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed >= result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj)) return Math.min.apply(Math, obj);
    if (!iterator && _.isEmpty(obj)) return Infinity;
    var result = {computed : Infinity};
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      computed < result.computed && (result = {value : value, computed : computed});
    });
    return result.value;
  };

  // Shuffle an array.
  _.shuffle = function(obj) {
    var shuffled = [], rand;
    each(obj, function(value, index, list) {
      if (index == 0) {
        shuffled[0] = value;
      } else {
        rand = Math.floor(Math.random() * (index + 1));
        shuffled[index] = shuffled[rand];
        shuffled[rand] = value;
      }
    });
    return shuffled;
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, iterator, context) {
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value : value,
        criteria : iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria, b = right.criteria;
      return a < b ? -1 : a > b ? 1 : 0;
    }), 'value');
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = function(obj, val) {
    var result = {};
    var iterator = _.isFunction(val) ? val : function(obj) { return obj[val]; };
    each(obj, function(value, index) {
      var key = iterator(value, index);
      (result[key] || (result[key] = [])).push(value);
    });
    return result;
  };

  // Use a comparator function to figure out at what index an object should
  // be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator) {
    iterator || (iterator = _.identity);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >> 1;
      iterator(array[mid]) < iterator(obj) ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely convert anything iterable into a real, live array.
  _.toArray = function(iterable) {
    if (!iterable)                return [];
    if (iterable.toArray)         return iterable.toArray();
    if (_.isArray(iterable))      return slice.call(iterable);
    if (_.isArguments(iterable))  return slice.call(iterable);
    return _.values(iterable);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    return _.toArray(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head`. The **guard** check allows it to work
  // with `_.map`.
  _.first = _.head = function(array, n, guard) {
    return (n != null) && !guard ? slice.call(array, 0, n) : array[0];
  };

  // Returns everything but the last entry of the array. Especcialy useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if ((n != null) && !guard) {
      return slice.call(array, Math.max(array.length - n, 0));
    } else {
      return array[array.length - 1];
    }
  };

  // Returns everything but the first entry of the array. Aliased as `tail`.
  // Especially useful on the arguments object. Passing an **index** will return
  // the rest of the values in the array from that index onward. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = function(array, index, guard) {
    return slice.call(array, (index == null) || guard ? 1 : index);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, function(value){ return !!value; });
  };

  // Return a completely flattened version of an array.
  _.flatten = function(array, shallow) {
    return _.reduce(array, function(memo, value) {
      if (_.isArray(value)) return memo.concat(shallow ? value : _.flatten(value));
      memo[memo.length] = value;
      return memo;
    }, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator) {
    var initial = iterator ? _.map(array, iterator) : array;
    var result = [];
    _.reduce(initial, function(memo, el, i) {
      if (0 == i || (isSorted === true ? _.last(memo) != el : !_.include(memo, el))) {
        memo[memo.length] = el;
        result[result.length] = array[i];
      }
      return memo;
    }, []);
    return result;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays. (Aliased as "intersect" for back-compat.)
  _.intersection = _.intersect = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.indexOf(other, item) >= 0;
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = _.flatten(slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.include(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var args = slice.call(arguments);
    var length = _.max(_.pluck(args, 'length'));
    var results = new Array(length);
    for (var i = 0; i < length; i++) results[i] = _.pluck(args, "" + i);
    return results;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i, l;
    if (isSorted) {
      i = _.sortedIndex(array, item);
      return array[i] === item ? i : -1;
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item);
    for (i = 0, l = array.length; i < l; i++) if (i in array && array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item) {
    if (array == null) return -1;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) return array.lastIndexOf(item);
    var i = array.length;
    while (i--) if (i in array && array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var len = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(len);

    while(idx < len) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Binding with arguments is also known as `curry`.
  // Delegates to **ECMAScript 5**'s native `Function.bind` if available.
  // We check for `func.bind` first, to fail fast when `func` is undefined.
  _.bind = function bind(func, context) {
    var bound, args;
    if (func.bind === nativeBind && nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Bind all of an object's methods to that object. Useful for ensuring that
  // all callbacks defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length == 0) funcs = _.functions(obj);
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return hasOwnProperty.call(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(func, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time.
  _.throttle = function(func, wait) {
    var context, args, timeout, throttling, more;
    var whenDone = _.debounce(function(){ more = throttling = false; }, wait);
    return function() {
      context = this; args = arguments;
      var later = function() {
        timeout = null;
        if (more) func.apply(context, args);
        whenDone();
      };
      if (!timeout) timeout = setTimeout(later, wait);
      if (throttling) {
        more = true;
      } else {
        func.apply(context, args);
      }
      whenDone();
      throttling = true;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds.
  _.debounce = function(func, wait) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      var later = function() {
        timeout = null;
        func.apply(context, args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      return memo = func.apply(this, arguments);
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return function() {
      var args = [func].concat(slice.call(arguments, 0));
      return wrapper.apply(this, args);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    if (times <= 0) return func();
    return function() {
      if (--times < 1) { return func.apply(this, arguments); }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = nativeKeys || function(obj) {
    if (obj !== Object(obj)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in obj) if (hasOwnProperty.call(obj, key)) keys[keys.length] = key;
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    return _.map(obj, _.identity);
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        if (source[prop] !== void 0) obj[prop] = source[prop];
      }
    });
    return obj;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      for (var prop in source) {
        if (obj[prop] == null) obj[prop] = source[prop];
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function.
  function eq(a, b, stack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the Harmony `egal` proposal: http://wiki.ecmascript.org/doku.php?id=harmony:egal.
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a._chain) a = a._wrapped;
    if (b._chain) b = b._wrapped;
    // Invoke a custom `isEqual` method if one is provided.
    if (a.isEqual && _.isFunction(a.isEqual)) return a.isEqual(b);
    if (b.isEqual && _.isFunction(b.isEqual)) return b.isEqual(a);
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = stack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (stack[length] == a) return true;
    }
    // Add the first object to the stack of traversed objects.
    stack.push(a);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          // Ensure commutative equality for sparse arrays.
          if (!(result = size in a == size in b && eq(a[size], b[size], stack))) break;
        }
      }
    } else {
      // Objects with different constructors are not equivalent.
      if ('constructor' in a != 'constructor' in b || a.constructor != b.constructor) return false;
      // Deep compare objects.
      for (var key in a) {
        if (hasOwnProperty.call(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = hasOwnProperty.call(b, key) && eq(a[key], b[key], stack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (hasOwnProperty.call(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    stack.pop();
    return result;
  }

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (hasOwnProperty.call(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType == 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Is a given variable an arguments object?
  _.isArguments = function(obj) {
    return toString.call(obj) == '[object Arguments]';
  };
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && hasOwnProperty.call(obj, 'callee'));
    };
  }

  // Is a given value a function?
  _.isFunction = function(obj) {
    return toString.call(obj) == '[object Function]';
  };

  // Is a given value a string?
  _.isString = function(obj) {
    return toString.call(obj) == '[object String]';
  };

  // Is a given value a number?
  _.isNumber = function(obj) {
    return toString.call(obj) == '[object Number]';
  };

  // Is the given value `NaN`?
  _.isNaN = function(obj) {
    // `NaN` is the only value for which `===` is not reflexive.
    return obj !== obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value a date?
  _.isDate = function(obj) {
    return toString.call(obj) == '[object Date]';
  };

  // Is the given value a regular expression?
  _.isRegExp = function(obj) {
    return toString.call(obj) == '[object RegExp]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  // Run a function **n** times.
  _.times = function (n, iterator, context) {
    for (var i = 0; i < n; i++) iterator.call(context, i);
  };

  // Escape a string for HTML interpolation.
  _.escape = function(string) {
    return (''+string).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g,'&#x2F;');
  };

  // Add your own custom functions to the Underscore object, ensuring that
  // they're correctly added to the OOP wrapper as well.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name){
      addToWrapper(name, _[name] = obj[name]);
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = idCounter++;
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /.^/;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(str, data) {
    var c  = _.templateSettings;
    var tmpl = 'var __p=[],print=function(){__p.push.apply(__p,arguments);};' +
      'with(obj||{}){__p.push(\'' +
      str.replace(/\\/g, '\\\\')
         .replace(/'/g, "\\'")
         .replace(c.escape || noMatch, function(match, code) {
           return "',_.escape(" + code.replace(/\\'/g, "'") + "),'";
         })
         .replace(c.interpolate || noMatch, function(match, code) {
           return "'," + code.replace(/\\'/g, "'") + ",'";
         })
         .replace(c.evaluate || noMatch, function(match, code) {
           return "');" + code.replace(/\\'/g, "'")
                              .replace(/[\r\n\t]/g, ' ')
                              .replace(/\\\\/g, '\\') + ";__p.push('";
         })
         .replace(/\r/g, '\\r')
         .replace(/\n/g, '\\n')
         .replace(/\t/g, '\\t')
         + "');}return __p.join('');";
    var func = new Function('obj', '_', tmpl);
    if (data) return func(data, _);
    return function(data) {
      return func.call(this, data, _);
    };
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // The OOP Wrapper
  // ---------------

  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.
  var wrapper = function(obj) { this._wrapped = obj; };

  // Expose `wrapper.prototype` as `_.prototype`
  _.prototype = wrapper.prototype;

  // Helper function to continue chaining intermediate results.
  var result = function(obj, chain) {
    return chain ? _(obj).chain() : obj;
  };

  // A method to easily add functions to the OOP wrapper.
  var addToWrapper = function(name, func) {
    wrapper.prototype[name] = function() {
      var args = slice.call(arguments);
      unshift.call(args, this._wrapped);
      return result(func.apply(_, args), this._chain);
    };
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    wrapper.prototype[name] = function() {
      var wrapped = this._wrapped;
      method.apply(wrapped, arguments);
      var length = wrapped.length;
      if ((name == 'shift' || name == 'splice') && length === 0) delete wrapped[0];
      return result(wrapped, this._chain);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    wrapper.prototype[name] = function() {
      return result(method.apply(this._wrapped, arguments), this._chain);
    };
  });

  // Start chaining a wrapped Underscore object.
  wrapper.prototype.chain = function() {
    this._chain = true;
    return this;
  };

  // Extracts the result from a wrapped and chained object.
  wrapper.prototype.value = function() {
    return this._wrapped;
  };

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/strainer.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Strainer, _;

  _ = require("underscore")._;

  module.exports = Strainer = (function() {

    Strainer.name = 'Strainer';

    function Strainer(context) {
      this.context = context;
    }

    Strainer.globalFilter = function(filter) {
      return _.extend(Strainer.prototype, filter);
    };

    Strainer.create = function(context) {
      return new Strainer(context);
    };

    return Strainer;

  })();

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/context.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Context, Liquid, futures, _,
    __slice = Array.prototype.slice;

  Liquid = require("../liquid");

  _ = require("underscore")._;

  futures = require("futures");

  module.exports = Context = (function() {

    Context.name = 'Context';

    function Context(environments, outerScope, registers, rethrowErrors) {
      if (environments == null) environments = {};
      if (outerScope == null) outerScope = {};
      if (registers == null) registers = {};
      if (rethrowErrors == null) rethrowErrors = false;
      this.environments = _.flatten([environments]);
      this.scopes = [outerScope || {}];
      this.registers = registers;
      this.errors = [];
      this.rethrowErrors = rethrowErrors;
      this.strainer = Liquid.Strainer.create(this);
      this.squashInstanceAssignsWithEnvironments();
    }

    Context.prototype.addFilters = function(filters) {
      var _this = this;
      filters = _([filters]).chain().flatten().compact().value();
      return filters.forEach(function(filter) {
        if (!(filter instanceof Object)) {
          throw new Error("Expected Object but got: " + (typeof filter));
        }
        return _.extend(_this.strainer, filter);
      });
    };

    Context.prototype.handleError = function(e) {
      this.errors.push(e);
      if (this.rethrowErrors) throw e;
      if (e instanceof Liquid.SyntaxError) {
        return "Liquid syntax error: " + e.message;
      } else {
        return "Liquid error: " + e.message;
      }
    };

    Context.prototype.invoke = function() {
      var args, f, method;
      method = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      if (this.strainer[method] != null) {
        f = this.strainer[method];
        return f.apply(this.strainer, args);
      } else {
        return args != null ? args[0] : void 0;
      }
    };

    Context.prototype.push = function(newScope) {
      if (newScope == null) newScope = {};
      Liquid.log("SCOPE PUSH");
      this.scopes.unshift(newScope);
      if (this.scopes.length > 100) throw new Error("Nesting too deep");
    };

    Context.prototype.merge = function(newScope) {
      if (newScope == null) newScope = {};
      return _(this.scopes[0]).extend(newScope);
    };

    Context.prototype.pop = function() {
      Liquid.log("SCOPE POP");
      if (this.scopes.length <= 1) throw new Error("ContextError");
      return this.scopes.shift();
    };

    Context.prototype.lastScope = function() {
      return this.scopes[this.scopes.length - 1];
    };

    Context.prototype.stack = function(newScope, f) {
      var popLater, result,
        _this = this;
      if (newScope == null) newScope = {};
      popLater = false;
      try {
        if (arguments.length < 2) {
          f = newScope;
          newScope = {};
        }
        this.push(newScope);
        result = f();
        if (futures.future.isFuture(result)) {
          popLater = true;
          result.when(function() {
            return _this.pop();
          });
        }
        return result;
      } finally {
        if (!popLater) this.pop();
      }
    };

    Context.prototype.clearInstanceAssigns = function() {
      return this.scopes[0] = {};
    };

    Context.prototype.set = function(key, value) {
      Liquid.log("[SET] %s %j", key, value);
      return this.scopes[0][key] = value;
    };

    Context.prototype.get = function(key) {
      var value;
      value = this.resolve(key);
      Liquid.log("[GET] %s %j", key, value);
      return value;
    };

    Context.prototype.hasKey = function(key) {
      return !!this.resolve(key);
    };

    Context.Literals = {
      'null': null,
      'nil': null,
      '': null,
      'true': true,
      'false': false,
      'empty': function(v) {
        return !v || v.length === 0;
      },
      'blank': function(v) {
        return !v || v.length === 0;
      }
    };

    Context.prototype.resolve = function(key) {
      var hi, lo, match;
      if (_(Liquid.Context.Literals).keys().indexOf(key) >= 0) {
        return Liquid.Context.Literals[key];
      } else {
        if (match = /^'(.*)'$/.exec(key)) {
          return match[1];
        } else if (match = /^"(.*)"$/.exec(key)) {
          return match[1];
        } else if (match = /^(\d+)$/.exec(key)) {
          return Number(match[1]);
        } else if (match = /^\((\S+)\.\.(\S+)\)$/.exec(key)) {
          lo = Number(resolve(match[1]));
          return hi = Number(resolve(match[2]));
        } else if (match = /^(\d[\d\.]+)$/.exec(key)) {
          return Number(match[1]);
        } else {
          return this.variable(key);
        }
      }
    };

    Context.prototype.findVariable = function(key) {
      var delivered, f, result, scope, variable,
        _this = this;
      scope = _(this.scopes).detect(function(s) {
        return typeof s.hasOwnProperty === "function" ? s.hasOwnProperty(key) : void 0;
      });
      variable = null;
      scope || (scope = _(this.environments).detect(function(e) {
        return variable = _this.lookupAndEvaluate(e, key);
      }));
      scope || (scope = this.environments[this.environments.length - 1] || this.scopes[this.scopes.length - 1]);
      variable || (variable = this.lookupAndEvaluate(scope, key));
      f = futures.future();
      delivered = false;
      result = null;
      Liquid.Helpers.unfuture(variable, function(err, variable) {
        result = _this.liquify(variable);
        f.deliver(err, result);
        return delivered = true;
      });
      if (delivered) {
        return result;
      } else {
        return f;
      }
    };

    Context.prototype.variable = function(markup) {
      var delivered, firstPart, future, iterator, mapper, match, object, parts, squareBracketed, unfuture,
        _this = this;
      future = futures.future();
      unfuture = Liquid.Helpers.unfuture;
      parts = Liquid.Helpers.scan(markup, Liquid.VariableParser);
      squareBracketed = /^\[(.*)\]$/;
      firstPart = parts.shift();
      if (match = squareBracketed.exec(firstPart)) firstPart = match[1];
      object = this.findVariable(firstPart);
      if (parts.length === 0) return object;
      delivered = false;
      mapper = function(part, next) {
        if (object === null) return next();
        return unfuture(object, function(err, unfuturedObject) {
          var bracketMatch;
          object = _this.liquify(unfuturedObject);
          if (object === null) return next();
          bracketMatch = squareBracketed.exec(part);
          if (bracketMatch) part = _this.resolve(bracketMatch[1]);
          return unfuture(part, function(err, part) {
            var isArrayAccess, isObjectAccess, isSpecialAccess;
            isArrayAccess = _.isArray(object) && _.isNumber(part);
            isObjectAccess = _.isObject(object) && (part in object);
            if (isArrayAccess || isObjectAccess) {
              return unfuture(_this.lookupAndEvaluate(object, part), function(err, result) {
                object = _this.liquify(result);
                return next();
              });
            } else {
              isSpecialAccess = !bracketMatch && object && (_.isArray(object) || _.isString(object)) && ["size", "first", "last"].indexOf(part) >= 0;
              if (isSpecialAccess) {
                object = (function() {
                  switch (part) {
                    case "size":
                      return this.liquify(object.length);
                    case "first":
                      return this.liquify(object[0]);
                    case "last":
                      return this.liquify(object[object.length - 1]);
                    default:
                      return this.liquify(object);
                  }
                }).call(_this);
                return next();
              } else {
                object = null;
                return next();
              }
            }
          });
        });
      };
      iterator = function(index) {
        try {
          return mapper(parts[index], function(err) {
            index += 1;
            if (index < parts.length) {
              return iterator(index);
            } else {
              delivered = true;
              return future.deliver(null, object);
            }
          });
        } catch (e) {
          object = null;
          delivered = true;
          return future.deliver("Couldn't walk variable: " + markup, object);
        }
      };
      iterator(0);
      if (delivered) {
        return object;
      } else {
        return future;
      }
    };

    Context.prototype.lookupAndEvaluate = function(obj, key) {
      var value;
      value = obj[key];
      if (_.isFunction(value)) {
        return obj[key] = value.length === 0 ? value.call(obj) : value.call(obj, this);
      } else {
        return value;
      }
    };

    Context.prototype.squashInstanceAssignsWithEnvironments = function() {
      var lastScope,
        _this = this;
      lastScope = this.lastScope();
      return _(lastScope).chain().keys().forEach(function(key) {
        return _(_this.environments).detect(function(env) {
          if (_(env).keys().indexOf(key) >= 0) {
            lastScope[key] = _this.lookupAndEvaluate(env, key);
            return true;
          }
        });
      });
    };

    Context.prototype.liquify = function(object) {
      if (object == null) return object;
      if (typeof object.toLiquid === "function") {
        object = object.toLiquid();
      } else {
        true;

      }
      if (object instanceof Liquid.Drop) object.context = this;
      return object;
    };

    return Context;

  })();

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/tag.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Tag;

  module.exports = Tag = (function() {

    Tag.name = 'Tag';

    function Tag(tagName, markup, tokens, template) {
      this.tagName = tagName;
      this.markup = markup;
      this.template = template;
      this.parse(tokens);
    }

    Tag.prototype.parse = function(tokens) {};

    Tag.prototype.name = function() {
      var tagName, _ref;
      tagName = (_ref = /^function (\w+)\(/.exec(this.constructor.toString())) != null ? _ref[1] : void 0;
      tagName || (tagName = 'UnknownTag');
      return tagName.toLowerCase();
    };

    Tag.prototype.render = function() {
      return "";
    };

    return Tag;

  })();

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/block.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Block, Liquid, futures, util, _,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Liquid = require("../liquid");

  _ = require("underscore")._;

  futures = require("futures");

  util = require("util");

  module.exports = Block = (function(_super) {

    __extends(Block, _super);

    Block.name = 'Block';

    function Block() {
      return Block.__super__.constructor.apply(this, arguments);
    }

    Block.IsTag = RegExp("^" + Liquid.TagStart.source);

    Block.IsVariable = RegExp("^" + Liquid.VariableStart.source);

    Block.FullToken = RegExp("^" + Liquid.TagStart.source + "\\s*(\\w+)\\s*(.*)?" + Liquid.TagEnd.source + "$");

    Block.ContentOfVariable = RegExp("^" + Liquid.VariableStart.source + "(.*)" + Liquid.VariableEnd.source + "$");

    Block.prototype.parse = function(tokens) {
      var match, tag, token;
      this.nodelist || (this.nodelist = []);
      while (this.nodelist.length > 0) {
        this.nodelist.pop();
      }
      while (tokens.length > 0) {
        token = tokens.shift();
        if (Block.IsTag.test(token)) {
          if (match = Block.FullToken.exec(token)) {
            if (this.blockDelimiter() === match[1]) {
              this.endTag();
              return;
            }
            if (tag = Liquid.Template.tags[match[1]]) {
              this.nodelist.push(new tag(match[1], match[2], tokens, this.template));
            } else {
              this.unknownTag(match[1], match[2], tokens);
            }
          } else {
            throw new Liquid.SyntaxError("Tag '" + token + "' was not properly terminated with regexp: " + Liquid.TagEnd.inspect);
          }
        } else if (Block.IsVariable.test(token)) {
          this.nodelist.push(this.createVariable(token));
        } else if (token === '') {} else {
          this.nodelist.push(token);
        }
      }
      return this.assertMissingDelimitation();
    };

    Block.prototype.endTag = function() {};

    Block.prototype.unknownTag = function(tag, params, tokens) {
      switch (tag) {
        case 'else':
          throw new Liquid.SyntaxError("" + (this.blockName()) + " tag does not expect else tag");
          break;
        case 'end':
          throw new Liquid.SyntaxError("'end' is not a valid delimiter for " + (this.blockName()) + " tags. use " + (this.blockDelimiter()));
          break;
        default:
          throw new Liquid.SyntaxError("Unknown tag '" + tag + "'");
      }
    };

    Block.prototype.blockDelimiter = function() {
      return "end" + (this.blockName());
    };

    Block.prototype.blockName = function() {
      return this.tagName;
    };

    Block.prototype.createVariable = function(token) {
      var match, _ref;
      match = (_ref = Liquid.Block.ContentOfVariable.exec(token)) != null ? _ref[1] : void 0;
      if (match) return new Liquid.Variable(match);
      throw new Liquid.SyntaxError("Variable '" + this.token + "' was not properly terminated with regexp: " + Liquid.Block.VariableEnd.inspect);
    };

    Block.prototype.render = function(context) {
      return this.renderAll(this.nodelist, context);
    };

    Block.prototype.assertMissingDelimitation = function() {
      throw new Liquid.SyntaxError("" + (this.blockName()) + " tag was never closed");
    };

    Block.prototype.renderAll = function(list, context) {
      var delivered, futureResult, result;
      result = [];
      delivered = false;
      futureResult = futures.future();
      futures.forEachAsync(list, function(next, token) {
        var rendered;
        try {
          if (token.render) {
            rendered = token.render(context);
            if (futures.future.isFuture(rendered)) {
              return rendered.when(function(err, rendered) {
                result.push(rendered);
                return next();
              });
            } else {
              result.push(rendered);
              return next();
            }
          } else {
            result.push(token);
            return next();
          }
        } catch (e) {
          context.handleError(e);
          return futureResult.deliver(e);
        }
      }).then(function() {
        delivered = true;
        result = result.join("");
        return futureResult.deliver(null, result);
      });
      if (delivered) {
        return result;
      } else {
        return futureResult;
      }
    };

    return Block;

  })(require("./tag"));

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/document.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Liquid,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  module.exports = Liquid = (function(_super) {

    __extends(Liquid, _super);

    Liquid.name = 'Liquid';

    function Liquid(tokens, template) {
      this.template = template;
      this.parse(tokens);
    }

    Liquid.prototype.blockDelimiter = function() {
      return [];
    };

    Liquid.prototype.assertMissingDelimitation = function() {};

    return Liquid;

  })(require("./block"));

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/variable.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Liquid, Variable, futures, _,
    __slice = Array.prototype.slice;

  Liquid = require("../liquid");

  _ = require("underscore")._;

  futures = require("futures");

  module.exports = Variable = (function() {

    Variable.name = 'Variable';

    Variable.FilterParser = RegExp("(?:" + Liquid.FilterSeparator.source + "|(?:\\s*(?!(?:" + Liquid.FilterSeparator.source + "))(?:" + Liquid.QuotedFragment.source + "|\\S+)\\s*)+)");

    function Variable(markup) {
      var filters, match, match2,
        _this = this;
      this.markup = markup;
      this.name = null;
      this.filters = [];
      if (match = RegExp("\\s*(" + Liquid.QuotedFragment.source + ")(.*)").exec(this.markup)) {
        this.name = match[1];
        if (match2 = RegExp("" + Liquid.FilterSeparator.source + "\\s*(.*)").exec(match[2])) {
          filters = Liquid.Helpers.scan(match2[1], Liquid.Variable.FilterParser);
          _(filters).forEach(function(f) {
            var filterargs, filtername, match3;
            if (match3 = /\s*(\w+)/.exec(f)) {
              filtername = match3[1];
              filterargs = Liquid.Helpers.scan(f, RegExp("(?:" + Liquid.FilterArgumentSeparator.source + "|" + Liquid.ArgumentSeparator.source + ")\\s*(" + Liquid.QuotedFragment.source + ")"));
              filterargs = _(filterargs).flatten();
              return _this.filters.push([filtername, filterargs]);
            }
          });
        }
      }
    }

    Variable.prototype.render = function(context) {
      var mapper,
        _this = this;
      if (this.name == null) return '';
      mapper = function(output, filter) {
        var counter, dependencies, execute, filterargs, result, waitingFor;
        filterargs = _(filter[1]).map(function(a) {
          return context.get(a);
        });
        dependencies = [output].concat(__slice.call(filterargs));
        waitingFor = _(dependencies).select(function(o) {
          return (o != null ? o.isFuture : void 0) != null;
        });
        execute = function() {
          try {
            return context.invoke.apply(context, [filter[0], output].concat(__slice.call(filterargs)));
          } catch (e) {
            if (!(e instanceof Liquid.FilterNotFound)) throw e;
            throw new Liquid.FilterNotFound("Error - filter '" + filter[0] + "' in '" + _this.markup + "' could not be found.");
          }
        };
        if (waitingFor.length > 0) {
          counter = waitingFor.length;
          result = futures.future();
          dependencies.forEach(function(k, i) {
            if ((k != null ? k.isFuture : void 0) == null) return;
            return k.when(function(err, r) {
              if (i === 0) {
                output = r;
              } else {
                filterargs[i - 1] = r;
              }
              counter -= 1;
              if (counter === 0) {
                return Liquid.Helpers.unfuture(execute(), function() {
                  return result.deliver.apply(result, arguments);
                });
              }
            });
          });
          return result;
        } else {
          return execute();
        }
      };
      return Liquid.Helpers.unfuture(context.get(this.name), function(err, value) {
        return Liquid.Helpers.unfuture(_(_this.filters).inject(mapper, value), function(err, value) {
          if (value instanceof Liquid.Drop) {
            if (typeof value.toString === "function") {
              value.context = context;
              return value.toString();
            } else {
              return "Liquid.Drop";
            }
          } else {
            return value;
          }
        });
      });
    };

    return Variable;

  })();

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/template.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Liquid, _,
    __slice = Array.prototype.slice;

  Liquid = require("../liquid");

  _ = require("underscore")._;

  module.exports = Liquid.Template = (function() {

    Template.name = 'Template';

    Template.tags = {};

    Template.registerTag = function(name, klass) {
      return this.tags[name.toString()] = klass;
    };

    Template.registerFilter = function(obj) {
      Liquid.Strainer.globalFilter(obj);
      return 123123123123;
    };

    Template.parse = function(source) {
      var template;
      template = new Liquid.Template();
      template.parse(source);
      return template;
    };

    function Template() {
      this.registers = {};
      this.assigns = {};
      this.instanceAssigns = {};
      this.errors = [];
    }

    Template.prototype.parse = function(source) {
      this.root = new Liquid.Document(this.tokenize(source), this);
      return this;
    };

    Template.prototype.render = function() {
      var args, context, last, options, result;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      if (this.root == null) return "";
      context = (function() {
        if (args[0] instanceof Liquid.Context) {
          return args.shift();
        } else if (args[0] instanceof Object) {
          return new Liquid.Context([args.shift(), this.assigns], this.instanceAssigns, this.registers, this.rethrowErrors);
        } else if (!(args[0] != null)) {
          return new Liquid.Context(this.assigns, this.instanceAssigns, this.registers, this.rethrowErrors);
        } else {
          throw new Error("Expect Hash or Liquid::Context as parameter");
        }
      }).call(this);
      last = args[args.length - 1];
      if (last instanceof Object && ((last.registers != null) || (last.filters != null))) {
        options = args.pop();
        if (options.registers) _.merge(this.registers, options.registers);
        if (options.filters) context.addFilters(options.filters);
      } else if (last instanceof Object) {
        context.addFilters(args.pop());
      }
      try {
        result = this.root.render(context);
        return (typeof result.join === "function" ? result.join() : void 0) || result;
      } finally {
        this.errors = context.errors;
      }
    };

    Template.prototype.renderOrRaise = function() {
      var args;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      this.rethrowErrors = true;
      return this.render.apply(this, args);
    };

    Template.prototype.tokenize = function(source) {
      var tokens;
      if (source.source != null) source = source.source;
      if (source.toString().length === 0) return [];
      tokens = source.split(Liquid.TemplateParser);
      if (tokens[0] && tokens[0].length === 0) tokens.shift();
      return tokens;
    };

    return Template;

  })();

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/standard_filters.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var toNumber, toString, _;

  _ = require("underscore")._;

  toNumber = function(input) {
    return Number(input);
  };

  toString = function(input) {
    if (!input) return;
    if (_.isString(input)) {
      return input;
    } else if (typeof input.toString === "function") {
      return input.toString();
    } else {
      return Object.prototype.toString.call(input);
    }
  };

  module.exports = {
    size: function(input) {
      return input.length;
    },
    downcase: function(input) {
      return toString(input).toLowerCase();
    },
    upcase: function(input) {
      return toString(input).toUpperCase();
    },
    append: function(input, other) {
      return [toString(input), toString(other)].join();
    },
    prepend: function(input, other) {
      return [toString(other), toString(input)].join();
    },
    empty: function(input) {
      if (!input) return true;
      if (input.length == null) return false;
      return true;
    },
    truncate: function(input, length, truncateString) {
      var l;
      if (length == null) length = 50;
      if (truncateString == null) truncateString = '...';
      input = toString(input);
      truncateString = toString(truncateString);
      if (input == null) return;
      if (!input.slice) return;
      length = toNumber(length);
      l = length - truncateString.length;
      if (l < 0) l = 0;
      if (input.length > length) {
        return input.slice(0, l + 1 || 9e9) + truncateString;
      } else {
        return input;
      }
    },
    truncatewords: function(input, words, truncateString) {
      var l, wordlist;
      if (words == null) words = 15;
      if (truncateString == null) truncateString = '...';
      input = toString(input);
      if (input == null) return;
      if (!input.slice) return;
      wordlist = input.split(" ");
      words = toNumber(words);
      l = words - 1;
      if (l < 0) l = 0;
      if (wordlist.length > l) {
        return wordlist.slice(0, l + 1 || 9e9).join(" ") + truncateString;
      } else {
        return input;
      }
    },
    split: function(input, pattern) {
      input = toString(input);
      if (!input) return;
      return input.split(pattern);
    },
    join: function(input, glue) {
      if (glue == null) glue = ' ';
      return _(input).flatten().join(glue);
    },
    first: function(array) {
      if (array.length > 0) {
        return array[0];
      } else {
        return null;
      }
    },
    last: function(array) {
      if (array.length > 0) {
        return array[array.length - 1];
      } else {
        return null;
      }
    },
    plus: function(input, operand) {
      return toNumber(input) + toNumber(operand);
    },
    minus: function(input, operand) {
      return toNumber(input) - toNumber(operand);
    },
    times: function(input, operand) {
      return toNumber(input) * toNumber(operand);
    },
    dividedBy: function(input, operand) {
      return toNumber(input) / toNumber(operand);
    },
    modulo: function(input, operand) {
      return toNumber(input) % toNumber(operand);
    }
  };

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/condition.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Condition;

  module.exports = Condition = (function() {

    Condition.name = 'Condition';

    Condition.operators = {
      '==': function(cond, left, right) {
        return cond.equalVariables(left, right);
      },
      '!=': function(cond, left, right) {
        return !cond.equalVariables(left, right);
      },
      '<>': function(cond, left, right) {
        return !cond.equalVariables(left, right);
      },
      '<': function(cond, left, right) {
        return left < right;
      },
      '>': function(cond, left, right) {
        return left > right;
      },
      '<=': function(cond, left, right) {
        return left <= right;
      },
      '>=': function(cond, left, right) {
        return left >= right;
      },
      'contains': function(cond, left, right) {
        if (left && right) {
          return left.indexOf(right) >= 0;
        } else {
          return false;
        }
      }
    };

    Condition.prototype.operators = function() {
      return Liquid.Condition.operators;
    };

    function Condition(left, operator, right) {
      this.left = left;
      this.operator = operator;
      this.right = right;
      this.childRelation = null;
      this.childCondition = null;
    }

    Condition.prototype.evaluate = function(context) {
      var LiquidContext, result, unfuture,
        _this = this;
      LiquidContext = require("./context");
      context || (context = new LiquidContext());
      result = this.interpretCondition(this.left, this.right, this.operator, context);
      unfuture = require("./helpers").unfuture;
      switch (this.childRelation) {
        case "or":
          return unfuture(result, function(err, result) {
            if (result) return result;
            return unfuture(_this.childCondition.evaluate(context));
          });
        case "and":
          return unfuture(result, function(err, result) {
            if (!result) return result;
            return unfuture(_this.childCondition.evaluate(context));
          });
        default:
          return result;
      }
    };

    Condition.prototype.or = function(childCondition) {
      this.childCondition = childCondition;
      return this.childRelation = "or";
    };

    Condition.prototype.and = function(childCondition) {
      this.childCondition = childCondition;
      return this.childRelation = "and";
    };

    Condition.prototype.attach = function(attachment) {
      this.attachment = attachment;
      return attachment;
    };

    Condition.prototype["else"] = function() {
      return false;
    };

    Condition.prototype.inspect = function() {
      return "<Condition [" + ([this.left, this.operator, this.right].join(' ')) + "], attachment: " + this.attachment + ">";
    };

    Condition.prototype.equalVariables = function(left, right) {
      return left === right;
    };

    Condition.prototype.interpretCondition = function(left, right, op, context) {
      var operation, unfuture,
        _this = this;
      if (op == null) return context.get(left);
      operation = Condition.operators[op];
      if (operation == null) throw new Error("Unknown operator " + op);
      left = context.get(left);
      right = context.get(right);
      unfuture = require("./helpers").unfuture;
      return unfuture(left, function(err, left) {
        return unfuture(right, function(err, right) {
          return operation(_this, left, right);
        });
      });
    };

    return Condition;

  })();

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/tags/assign.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Liquid,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Liquid = require("../../liquid");

  Liquid.Assign = (function(_super) {
    var Syntax, SyntaxHelp;

    __extends(Assign, _super);

    Assign.name = 'Assign';

    SyntaxHelp = "Syntax Error in 'assign' - Valid syntax: assign [var] = [source]";

    Syntax = RegExp("((?:" + Liquid.VariableSignature.source + ")+)\\s*=\\s*((?:" + Liquid.QuotedFragment.source + "))");

    function Assign(tagName, markup, tokens) {
      var match;
      if (match = Syntax.exec(markup)) {
        this.to = match[1];
        this.from = match[2];
      } else {
        throw new Liquid.SyntaxError(SyntaxHelp);
      }
      Assign.__super__.constructor.apply(this, arguments);
    }

    Assign.prototype.render = function(context) {
      var value,
        _this = this;
      value = context.get(this.from);
      return Liquid.Helpers.unfuture(value, function(err, value) {
        Liquid.log("" + _this.from + " -> " + _this.to + ": %j", value);
        context.lastScope()[_this.to] = value;
        return '';
      });
    };

    return Assign;

  })(require("../tag"));

  Liquid.Template.registerTag('assign', Liquid.Assign);

  module.exports = Liquid.Assign;

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/tags/capture.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Liquid,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Liquid = require("../../liquid");

  Liquid.Capture = (function(_super) {
    var Syntax, SyntaxHelp;

    __extends(Capture, _super);

    Capture.name = 'Capture';

    Syntax = /(\w+)/;

    SyntaxHelp = "Syntax Error in 'capture' - Valid syntax: capture [var]";

    function Capture(tagName, markup, tokens) {
      var match;
      match = Syntax.exec(markup);
      if (match) {
        this.to = match[1];
      } else {
        throw new Liquid.SyntaxError(SyntaxHelp);
      }
      Capture.__super__.constructor.apply(this, arguments);
    }

    Capture.prototype.render = function(context) {
      var output;
      output = Capture.__super__.render.apply(this, arguments);
      context.lastScope()[this.to] = output;
      return "";
    };

    return Capture;

  })(require("../block"));

  Liquid.Template.registerTag('capture', Liquid.Capture);

  module.exports = Liquid.Capture;

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/tags/comment.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Liquid,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Liquid = require("../../liquid");

  Liquid.Comment = (function(_super) {

    __extends(Comment, _super);

    Comment.name = 'Comment';

    function Comment() {
      return Comment.__super__.constructor.apply(this, arguments);
    }

    Comment.prototype.render = function() {
      return "";
    };

    return Comment;

  })(require("../block"));

  Liquid.Template.registerTag("comment", Liquid.Comment);

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/tags/decrement.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Liquid,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Liquid = require("../../liquid");

  Liquid.Decrement = (function(_super) {

    __extends(Decrement, _super);

    Decrement.name = 'Decrement';

    function Decrement(tagName, markup, tokens) {
      this.variable = markup.trim();
      Decrement.__super__.constructor.apply(this, arguments);
    }

    Decrement.prototype.render = function(context) {
      var value, _base, _name;
      value = (_base = context.environments[0])[_name = this.variable] || (_base[_name] = 0);
      value = value - 1;
      context.environments[0][this.variable] = value;
      return value.toString();
    };

    return Decrement;

  })(require("../tag"));

  Liquid.Template.registerTag("decrement", Liquid.Decrement);

  module.exports = Liquid.Decrement;

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/tags/for.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Liquid, futures, _,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Liquid = require("../../liquid");

  _ = require("underscore")._;

  futures = require("futures");

  Liquid.For = (function(_super) {
    var Syntax, SyntaxHelp;

    __extends(For, _super);

    For.name = 'For';

    SyntaxHelp = "Syntax Error in 'for loop' - Valid syntax: for [item] in [collection]";

    Syntax = RegExp("(\\w+)\\s+in\\s+((?:" + Liquid.QuotedFragment.source + ")+)\\s*(reversed)?");

    function For(tagName, markup, tokens) {
      var match,
        _this = this;
      match = Syntax.exec(markup);
      if (match) {
        this.variableName = match[1];
        this.collectionName = match[2];
        this.name = "" + match[1] + "=" + match[2];
        this.reversed = match[3];
        this.attributes = {};
        Liquid.Helpers.scan(markup, Liquid.TagAttributes).forEach(function(key, value) {
          return _this.attributes[key] = value;
        });
      } else {
        throw new Liquid.SyntaxError(SyntaxHelp);
      }
      this.nodelist = this.forBlock = [];
      For.__super__.constructor.apply(this, arguments);
    }

    For.prototype.unknownTag = function(tag, markup, tokens) {
      if (tag !== "else") return For.__super__.unknownTag.apply(this, arguments);
      return this.nodelist = this.elseBlock = [];
    };

    For.prototype.render = function(context) {
      var _base,
        _this = this;
      (_base = context.registers)["for"] || (_base["for"] = {});
      return Liquid.Helpers.unfuture(context.get(this.collectionName), function(err, collection) {
        var from, length, limit, segment, to;
        if (err) return futures.future().deliver(err);
        if (!(collection && collection.forEach)) return _this.renderElse(context);
        from = _this.attributes.offset === "continue" ? Number(context.registers["for"][_this.name]) || 0 : Number(context[_this.attributes.offset]) || 0;
        limit = context[_this.attributes.limit];
        to = limit ? Number(limit) + from : null;
        segment = _this.sliceCollectionUsingEach(collection, from, to);
        if (segment.length === 0) return _this.renderElse(context);
        if (_this.reversed) segment = _.reverse(segment);
        length = segment.length;
        context.registers["for"][_this.name] = from + segment.length;
        return context.stack(function() {
          var chunks, result;
          result = futures.future();
          chunks = [];
          futures.forEachAsync(segment, function(next, item, index) {
            var chunk;
            try {
              context.set(_this.variableName, item);
              context.set("forloop", {
                name: _this.name,
                length: length,
                index: index + 1,
                index0: index,
                rindex: length - index,
                rindex0: length - index - 1,
                first: index === 0,
                last: index === length - 1
              });
              chunk = _this.renderAll(_this.forBlock, context);
              return Liquid.Helpers.unfuture(chunk, function(err, chunk) {
                if (err) {
                  console.log("for-loop-item failed: %s %s", err, err.stack);
                  return next();
                } else {
                  chunks[index] = chunk;
                  return next();
                }
              });
            } catch (e) {
              console.log("for-loop failed: %s %s", e, e.stack);
              return result.deliver(e);
            }
          }).then(function() {
            return result.deliver(null, chunks.join(""));
          });
          return result;
        });
      });
    };

    For.prototype.sliceCollectionUsingEach = function(collection, from, to) {
      var index, segments, yielded,
        _this = this;
      segments = [];
      index = 0;
      yielded = 0;
      _(collection).detect(function(item) {
        if (to && to <= index) {
          true;

        }
        if (from <= index) segments.push(item);
        index += 1;
        return false;
      });
      return segments;
    };

    For.prototype.renderElse = function(context) {
      if (this.elseBlock) {
        return this.renderAll(this.elseBlock, context);
      } else {
        return "";
      }
    };

    return For;

  })(require("../block"));

  Liquid.Template.registerTag("for", Liquid.For);

  module.exports = Liquid.For;

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/tags/if.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var If, Liquid, futures, _,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; },
    __slice = Array.prototype.slice;

  Liquid = require("../../liquid");

  _ = (require("underscore"))._;

  futures = require("futures");

  module.exports = If = (function(_super) {
    var ExpressionsAndOperators, Syntax, SyntaxHelp;

    __extends(If, _super);

    If.name = 'If';

    SyntaxHelp = "Syntax Error in tag 'if' - Valid syntax: if [expression]";

    Syntax = RegExp("(" + Liquid.QuotedFragment.source + ")\\s*([=!<>a-z_]+)?\\s*(" + Liquid.QuotedFragment.source + ")?");

    ExpressionsAndOperators = RegExp("(?:\\b(?:\\s?and\\s?|\\s?or\\s?)\\b|(?:\\s*(?!\\b(?:\\s?and\\s?|\\s?or\\s?)\\b)(?:" + Liquid.QuotedFragment.source + "|\\S+)\\s*)+)");

    function If(tagName, markup, tokens) {
      this.blocks = [];
      this.pushBlock('if', markup);
      If.__super__.constructor.apply(this, arguments);
    }

    If.prototype.unknownTag = function(tag, markup, tokens) {
      if (["elsif", "else"].indexOf(tag) >= 0) {
        return this.pushBlock(tag, markup);
      } else {
        return If.__super__.unknownTag.apply(this, arguments);
      }
    };

    If.prototype.render = function(context) {
      var _this = this;
      return context.stack(function() {
        var blockToRender, result;
        result = futures.future();
        blockToRender = null;
        futures.forEachAsync(_this.blocks, function(next, block, index) {
          if (blockToRender) {
            return next();
          } else {
            return Liquid.Helpers.unfuture(block.evaluate(context), function(err, ok) {
              if (err) return result.deliver(err);
              if (block.negate) ok = !ok;
              if (ok) blockToRender = block;
              return next();
            });
          }
        }).then(function() {
          var rendered;
          if (blockToRender) {
            rendered = _this.renderAll(blockToRender.attachment, context);
            return Liquid.Helpers.unfuture(rendered, function() {
              var args;
              args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
              return result.deliver.apply(result, args);
            });
          } else {
            return result.deliver(null, "");
          }
        });
        return result;
      });
    };

    If.prototype.pushBlock = function(tag, markup) {
      var block, condition, expressions, match, newCondition, operator;
      block = (function() {
        if (tag === "else") {
          return new Liquid.ElseCondition();
        } else {
          expressions = Liquid.Helpers.scan(markup, ExpressionsAndOperators);
          expressions = expressions.reverse();
          match = Syntax.exec(expressions.shift());
          if (!match) throw new Liquid.SyntaxError(SyntaxHelp);
          condition = (function(func, args, ctor) {
            ctor.prototype = func.prototype;
            var child = new ctor, result = func.apply(child, args);
            return typeof result === "object" ? result : child;
          })(Liquid.Condition, match.slice(1, 4), function() {});
          while (expressions.length > 0) {
            operator = String(expressions.shift()).trim();
            match = Syntax.exec(expressions.shift());
            if (!match) throw new SyntaxError(SyntaxHelp);
            newCondition = (function(func, args, ctor) {
              ctor.prototype = func.prototype;
              var child = new ctor, result = func.apply(child, args);
              return typeof result === "object" ? result : child;
            })(Liquid.Condition, match.slice(1, 4), function() {});
            newCondition[operator].call(newCondition, condition);
            condition = newCondition;
          }
          return condition;
        }
      })();
      this.blocks.push(block);
      return this.nodelist = block.attach([]);
    };

    return If;

  })(require("../block"));

  Liquid.Template.registerTag("if", If);

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/tags/ifchanged.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Liquid, futures,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Liquid = require("../../liquid");

  futures = require("futures");

  Liquid.Ifchanged = (function(_super) {

    __extends(Ifchanged, _super);

    Ifchanged.name = 'Ifchanged';

    function Ifchanged() {
      return Ifchanged.__super__.constructor.apply(this, arguments);
    }

    Ifchanged.prototype.render = function(context) {
      var _this = this;
      return context.stack(function() {
        var rendered;
        rendered = _this.renderAll(_this.nodelist, context);
        return Liquid.Helpers.unfuture(rendered, function(err, output) {
          if (err) return futures.future().deliver(err);
          if (output !== context.registers["ifchanged"]) {
            context.registers["ifchanged"] = output;
            return output;
          } else {
            return "";
          }
        });
      });
    };

    return Ifchanged;

  })(require("../block"));

  Liquid.Template.registerTag("ifchanged", Liquid.Ifchanged);

  module.exports = Liquid.Ifchanged;

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/tags/increment.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Liquid,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Liquid = require("../../liquid");

  Liquid.Increment = (function(_super) {

    __extends(Increment, _super);

    Increment.name = 'Increment';

    function Increment(tagName, markup, tokens) {
      this.variable = markup.trim();
      Increment.__super__.constructor.apply(this, arguments);
    }

    Increment.prototype.render = function(context) {
      var value, _base, _name;
      value = (_base = context.environments[0])[_name = this.variable] || (_base[_name] = 0);
      context.environments[0][this.variable] = value + 1;
      return value.toString();
    };

    return Increment;

  })(require("../tag"));

  Liquid.Template.registerTag("increment", Liquid.Increment);

  module.exports = Liquid.Increment;

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/tags/raw.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Liquid,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Liquid = require("../../liquid");

  Liquid.Raw = (function(_super) {

    __extends(Raw, _super);

    Raw.name = 'Raw';

    function Raw() {
      return Raw.__super__.constructor.apply(this, arguments);
    }

    Raw.prototype.parse = function(tokens) {
      var match, token;
      this.nodelist || (this.nodelist = []);
      while (nodelist.length() > 0) {
        this.nodelist.pop();
      }
      while (tokens.length > 0) {
        token = token.shift();
        match = Liquid.FullToken.exec(token);
        if (match && this.blockDelimiter() === match[1]) {
          this.endTag();
          return;
        }
      }
      if (token.length !== 0) return this.nodelist.push(token);
    };

    return Raw;

  })(require("../block"));

  Liquid.Template.registerTag("raw", Liquid.Raw);

  module.exports = Liquid.Raw;

}).call(this);

});

require.define("/node_modules/liquid-node/lib/liquid/tags/unless.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Liquid, Unless,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Liquid = require("../../liquid");

  module.exports = Unless = (function(_super) {

    __extends(Unless, _super);

    Unless.name = 'Unless';

    function Unless() {
      return Unless.__super__.constructor.apply(this, arguments);
    }

    Unless.prototype.render = function(context) {
      this.blocks[0].negate = true;
      return Unless.__super__.render.call(this, context);
    };

    return Unless;

  })(require("./if"));

  Liquid.Template.registerTag("unless", Unless);

}).call(this);

});

require.define("/node_modules/liquid-partial/package.json", function (require, module, exports, __dirname, __filename) {
    module.exports = {"main":"./index.js"}
});

require.define("/node_modules/liquid-partial/index.js", function (require, module, exports, __dirname, __filename) {
    module.exports = require('./lib/partial')
});

require.define("/node_modules/liquid-partial/lib/partial.js", function (require, module, exports, __dirname, __filename) {
    (function() {
  var Liquid,
    __hasProp = Object.prototype.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor; child.__super__ = parent.prototype; return child; };

  Liquid = require('liquid-node');

  Liquid.Partial = (function(_super) {
    var Syntax, SyntaxHelp;

    __extends(Partial, _super);

    Partial.name = 'Partial';

    Syntax = RegExp("(" + Liquid.QuotedFragment.source + ")");

    SyntaxHelp = "Syntax Error in 'partial' - Valid syntax: partial id";

    function Partial(tagName, markup, tokens) {
      var match;
      match = Syntax.exec(markup);
      if (match) {
        this.id = match[1];
      } else {
        throw new Liquid.SyntaxError(SyntaxHelp);
      }
      Partial.__super__.constructor.apply(this, arguments);
    }

    Partial.prototype.render = function(context) {
      if (!Liquid.Partial.Templates[this.id]) {
        throw new Error("No template found with id '" + this.id + "'");
      }
      return Liquid.Partial.Templates[this.id].render(context);
    };

    return Partial;

  })(Liquid.Tag);

  Liquid.Partial.clearTemplates = function() {
    return Liquid.Partial.Templates = {};
  };

  Liquid.Partial.registerTemplate = function(id, template) {
    if (!id) throw new Error('id must be defined');
    if (typeof template === 'string') template = Liquid.Template.parse(template);
    if (!Liquid.Partial.Templates) Liquid.Partial.Templates = {};
    return Liquid.Partial.Templates[id] = template;
  };

  Liquid.Template.registerTag('partial', Liquid.Partial);

  module.exports = Liquid.Partial;

}).call(this);

});
