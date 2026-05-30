const fs = require('fs');
const pathModule = require('path');
const child_process = require('child_process');
const os = require('os');

// =============================================================================
// AlphaTrade FS Patch — Bulletproof Mapped Drive Support
// =============================================================================
// 1. Translates non-standard EISDIR/EPERM/UNKNOWN errors during fs.readlink
//    on mapped Windows directories/files to standard EINVAL.
// 2. Patches fs.realpath to handle Windows mapped drive resolver crashes.
// 3. Redirects Next.js telemetry/trace logs to a local OS temporary folder,
//    preventing EPERM file-locking crashes on Windows mapped network drives.
// 4. Automatically propagates to all child processes and worker threads.
// =============================================================================

const tempTracePath = pathModule.join(os.tmpdir(), 'alphatrade-next-trace');

function redirectPath(path) {
  if (typeof path === 'string' && (
    path.endsWith('\\.next\\trace') || 
    path.endsWith('/.next/trace') || 
    path.endsWith('.next/trace') || 
    path.endsWith('.next\\trace')
  )) {
    return tempTracePath;
  }
  return path;
}

// Intercept critical fs methods to redirect trace logs away from the mapped drive
const originalOpen = fs.open;
fs.open = function (path, flags, mode, callback) {
  const cb = typeof mode === 'function' ? mode : (typeof flags === 'function' ? flags : callback);
  const m = typeof mode === 'function' ? undefined : mode;
  const f = typeof flags === 'function' ? undefined : flags;
  return originalOpen.call(fs, redirectPath(path), f, m, cb);
};

const originalOpenSync = fs.openSync;
fs.openSync = function (path, flags, mode) {
  return originalOpenSync.call(fs, redirectPath(path), flags, mode);
};

if (fs.promises && fs.promises.open) {
  const originalPromisesOpen = fs.promises.open;
  fs.promises.open = function (path, flags, mode) {
    return originalPromisesOpen.call(fs.promises, redirectPath(path), flags, mode);
  };
}

const pathTargets = [
  'stat', 'statSync', 'unlink', 'unlinkSync', 
  'writeFile', 'writeFileSync', 'readFile', 'readFileSync'
];
pathTargets.forEach(method => {
  if (fs[method]) {
    const original = fs[method];
    fs[method] = function(path, ...args) {
      return original.call(fs, redirectPath(path), ...args);
    };
  }
});

if (fs.promises) {
  const promiseTargets = ['stat', 'unlink', 'writeFile', 'readFile'];
  promiseTargets.forEach(method => {
    if (fs.promises[method]) {
      const original = fs.promises[method];
      fs.promises[method] = function(path, ...args) {
        return original.call(fs.promises, redirectPath(path), ...args);
      };
    }
  });
}

function translateError(err, path) {
  if (err && (err.code === 'EISDIR' || err.code === 'UNKNOWN' || err.code === 'EPERM' || err.code === 'ENOTDIR')) {
    const newErr = new Error(`EINVAL: invalid argument, readlink '${path}'`);
    newErr.code = 'EINVAL';
    newErr.errno = -4071;
    return newErr;
  }
  return err;
}

const originalReadlink = fs.readlink;
fs.readlink = function (path, options, callback) {
  const cb = typeof options === 'function' ? options : callback;
  const opts = typeof options === 'function' ? {} : options;
  
  return originalReadlink(path, opts, (err, linkString) => {
    if (err) {
      return cb(translateError(err, path));
    }
    cb(null, linkString);
  });
};

const originalReadlinkSync = fs.readlinkSync;
fs.readlinkSync = function (path, options) {
  try {
    return originalReadlinkSync(path, options);
  } catch (err) {
    throw translateError(err, path);
  }
};

if (fs.promises && fs.promises.readlink) {
  const originalPromisesReadlink = fs.promises.readlink;
  fs.promises.readlink = async function (path, options) {
    try {
      return await originalPromisesReadlink(path, options);
    } catch (err) {
      throw translateError(err, path);
    }
  };
}

// =============================================================================
// fs.realpath & fs.realpathSync patches for Windows Mapped/Virtual Drives
// =============================================================================
// If realpath fails due to EPERM/UNKNOWN/EISDIR/ENOTDIR, we fall back to
// resolving the path using path.resolve. This prevents Webpack resolver crashes.
// =============================================================================

const originalRealpath = fs.realpath;
fs.realpath = function (path, options, callback) {
  const cb = typeof options === 'function' ? options : callback;
  const opts = typeof options === 'function' ? {} : options;
  
  return originalRealpath(path, opts, (err, resolvedPath) => {
    if (err && (err.code === 'EISDIR' || err.code === 'UNKNOWN' || err.code === 'EPERM' || err.code === 'ENOTDIR')) {
      return cb(null, pathModule.resolve(path));
    }
    if (err) {
      return cb(err);
    }
    cb(null, resolvedPath);
  });
};

const originalRealpathSync = fs.realpathSync;
fs.realpathSync = function (path, options) {
  try {
    return originalRealpathSync(path, options);
  } catch (err) {
    if (err && (err.code === 'EISDIR' || err.code === 'UNKNOWN' || err.code === 'EPERM' || err.code === 'ENOTDIR')) {
      return pathModule.resolve(path);
    }
    throw err;
  }
};

if (fs.promises && fs.promises.realpath) {
  const originalPromisesRealpath = fs.promises.realpath;
  fs.promises.realpath = async function (path, options) {
    try {
      return await originalPromisesRealpath(path, options);
    } catch (err) {
      if (err && (err.code === 'EISDIR' || err.code === 'UNKNOWN' || err.code === 'EPERM' || err.code === 'ENOTDIR')) {
        return pathModule.resolve(path);
      }
      throw err;
    }
  };
}

// Propagate patch to all child worker threads/processes
const patchPath = pathModule.resolve(__dirname, 'patch-fs.js');

const originalSpawn = child_process.spawn;
child_process.spawn = function (command, args, options) {
  if (command === 'node' || command === process.execPath) {
    if (Array.isArray(args)) {
      const idx = args.indexOf('-r');
      if (idx === -1) {
        args.unshift('-r', patchPath);
      }
    }
  }
  return originalSpawn.apply(this, arguments);
};

const originalFork = child_process.fork;
child_process.fork = function (modulePath, args, options) {
  const opts = options || {};
  opts.execArgv = opts.execArgv || [...process.execArgv];
  if (!opts.execArgv.includes(patchPath)) {
    opts.execArgv.push('-r', patchPath);
  }
  return originalFork.call(this, modulePath, args, opts);
};

// Monkey patch worker_threads to propagate the patch-fs loader to Webpack and Next workers
try {
  const worker_threads = require('worker_threads');
  const originalWorker = worker_threads.Worker;
  if (originalWorker) {
    class PatchedWorker extends originalWorker {
      constructor(filename, options) {
        const opts = options || {};
        opts.execArgv = opts.execArgv || [...process.execArgv];
        if (!opts.execArgv.includes(patchPath)) {
          opts.execArgv.push('-r', patchPath);
        }
        super(filename, opts);
      }
    }
    worker_threads.Worker = PatchedWorker;
  }
} catch (e) {
  // worker_threads not supported or failed to patch
}

console.log('[AlphaTrade FS Patch] Filesystem readlink, realpath, and worker_threads patches active.');

