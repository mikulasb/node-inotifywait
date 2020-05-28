/*jslint node: true, maxlen: 100, maxerr: 50, indent: 2 */
'use strict';

var fs           = require('fs');
var util         = require('util');
var spawn        = require('child_process').spawn;
var Lazy         = require('lazy');
var EventEmitter = require('events').EventEmitter;
var path         = require("path");

let eventsPatterns = {}
const emptyPattern = 0
// elements for evens:
const eAccess = 1
const eModify = 2
const eAttrib = 4
const eCloseWrite = 8
const eCloseNowrite = 16
const eClose = 32
const eOpen = 64
const eMovedTo = 128
const eMovedFrom = 256
//const eMove = 512 // not used in newer versions
const eCreate = 1024
const eDelete = 2048
const eDeleteSelf = 4096
const eUnmount = 8192
const eIsDir = 16384

// Constructor
var INotifyWait = function(wpath, options) {
  var self = this;

  self.wpath = wpath;

  self.options = mixin({
    bin: 'inotifywait',
    recursive: true,
    watchDirectory: false,
    excludes: [],
    files: [],
    events: [],
    spawnArgs: {}
  }, options);

  self.eventMovedFromPath = ''
  self.eventMovedFromStat = {}
   

  self.runProcess = function () {

    var args = [
      //'--quiet',
      (self.options.recursive ? '-r' : ''),
      '--format',
      '{ "type": "%e", "file": "%w%f", "date": "%T" }',
      '--timefmt',
      '%s',
      '--monitor',
      '--exclude',
      '^.*/$'  // without this export is each directory name read twice (once without ending slash and once with ending slash)
    ];

    // having --exclude
    if(self.options.excludes.length > 0) {
      self.options.excludes.forEach(function(item){
          args.push("--exclude");
          args.push(item);
      });
    }

    // having @
    if(self.options.files.length > 0) {
      self.options.files.forEach(function(item){
          args.push("@" + item);
      });
    }

    // having --event
    if(self.options.events.length > 0) {
      self.options.events.forEach(function (item) {
        args.push("--event");
        args.push(item);
      });
    }

    //add path
    args.push(wpath);


    // run inotifywait command in background
    self.inwp = spawn(self.options.bin, args, self.options.spawnArgs);
    self.inwp.on('close', function (err) {
      self.inwp = null;
      self.emit('close', err);
    });
    self.inwp.on('error', function (err) {
      self.emit('error', err);
    });

    self.missingMovedToTimeoutMilliseconds = 1 //for sure, but it works also with 0
    self.missingMovedToTimeoutId = 0
    self.missingMovedTo = function () {
      //console.log('missingMovedTo')
      self.emit('unlink', self.eventMovedFromPath, self.eventMovedFromStat)
      delete eventsPatterns[self.eventMovedFromPath]
    }

    // parse stdout of the inotifywatch command
    Lazy(self.inwp.stdout)
        .lines
        .map(String)
        .map(function (line) {
          try {
            return JSON.parse(line);
          } catch (err) {
            self.emit('error', new Error( err + ' -> ' + line));
            return { type: '', file: '' , date: new Date()};
          }
        })
        .map(function (event) {
          event.type = event.type.split(',');
          // Unix Epoch * 1000 = JavaScript Epoch
          event.date = new Date(event.date * 1000);
          return event;
        })
        .forEach(function (event) {

          //self.emit('error', event)  //TODO FIXME
          // console.log(JSON.stringify(event, null, 2))
          // event looks like:
          // {
          //   "type": [
          //     "CREATE"
          //   ],
          // "file": "/home/mikulas/Documents/inotifywait_github/node-inotifywait/test/data/fake2",
          // "date": "2019-02-12T21:51:38.000Z"
          // }

          // skip directories ?
          var isDir = (event.type.indexOf('ISDIR') != -1);
          if (isDir && !self.options.watchDirectory) {
            return;
          }

          var stats = {isDir: isDir, date: event.date};

          if (!eventsPatterns[event.file]) {
            eventsPatterns[event.file] = emptyPattern
          }

          let pattern = eventsPatterns[event.file]
          //console.log(`Previous pattern: ${pattern}`)
          //console.log(event.file)

          event.type.forEach((eventType) => {
            //console.log(`eventType: ${eventType}`)
            switch(eventType) {
              case 'ACCESS':
                pattern |= eAccess
                break
              case 'MODIFY':
                pattern |= eModify
                break
              case 'ATTRIB':
                pattern |= eAttrib
                break
              case 'CLOSE_WRITE':
                pattern |= eCloseWrite
                break
              case 'CLOSE_NOWRITE':
                pattern |= eCloseNowrite
                break
              case 'CLOSE':
                pattern |= eClose
                break
              case 'OPEN':
                pattern |= eOpen
                break
              case 'MOVE':
                //pattern |= eMove // eMove is not used in newer versions; Also possible case 'MOVE_SELF' is ignored.
                break
              case 'MOVE_SELF':
                break
              case 'MOVED_TO':
                pattern |= eMovedTo
                break
              case 'MOVED_FROM':
                pattern |= eMovedFrom
                break
              case 'CREATE':
                pattern |= eCreate
                break
              case 'DELETE':
                pattern |= eDelete
                break
              case 'DELETE_SELF':
                pattern |= eDeleteSelf
                break
              case 'UNMOUNT':
                pattern |= eUnmount
                break
              case 'ISDIR':
                pattern |= eIsDir
                break
              default:
                self.emit('error', `Received unknown event: ${eventType}`)
                // console.error(`Received unknown event: ${eventType}`)
            }
          })

          eventsPatterns[event.file] = pattern
          // console.log(`Updated pattern: ${pattern}`)
          if (pattern & eClose) {
            // console.log(`Pattern after eClose: ${pattern}`)
            // console.log('')
          }

          const movedToPattern = eMovedTo
          if (self.eventMovedFromPath
            && !(pattern & movedToPattern)) {
            clearTimeout(self.missingMovedToTimeoutId)
            self.missingMovedTo()
          }

          const createdFilePattern = eCreate | eOpen | eModify | eCloseWrite | eClose
          if ((pattern & createdFilePattern) - createdFilePattern === 0) { //additional events allowed
            // console.log('created file')
            self.emit('add', event.file, stats)
            delete eventsPatterns[event.file]
            return
          }

          const createdFilePatternB = eCreate | eOpen | eAttrib | eCloseWrite | eClose
          if ((pattern & createdFilePatternB) - createdFilePatternB === 0) { //additional events allowed
            // console.log('created file B')
            self.emit('add', event.file, stats)
            delete eventsPatterns[event.file]
            return
          }

          const attributesPattern = eAttrib //cases as with chmod, chown, chgrp
          const noattributesPattern = eOpen | eCreate | eModify  //eModify is maybe not necessary
          if (((pattern & attributesPattern) - attributesPattern === 0)
            && (pattern & noattributesPattern) === 0) { //additional events allowed
            //console.log('attributes changed')
            self.emit('attributes', event.file, stats)
            delete eventsPatterns[event.file]
            return
          }

          const attributesPatternB = eOpen | eAttrib | eCloseWrite | eClose //case as with changed modification date time (touch -d '2 hours ago' filename)
          const noattributesPatternB = eCreate
          if (((pattern & attributesPatternB) - attributesPatternB === 0)
            && (pattern & noattributesPatternB) === 0) { //additional events allowed
            // console.log('attributes changed')
            if(self.options.touchGeneratesAttributes) {
              self.emit('attributes', event.file, stats)
            } else {
              self.emit('change', event.file, stats) // for backwards compatibility with old versions
            }
            delete eventsPatterns[event.file]
            return
          }

          const changedFilePattern = eOpen | eAttrib | eCloseWrite | eClose  //TODO + NOT eCreate
          if ((pattern & changedFilePattern) - changedFilePattern === 0) { //additional events allowed
            // console.log('changed file')
            self.emit('change', event.file, stats)
            delete eventsPatterns[event.file]
            return
          }

          const changedFilePattern3 = eOpen | eModify | eCloseWrite | eClose  //TODO + NOT eCreate
          if ((pattern & changedFilePattern3) - changedFilePattern3 === 0) { //additional events allowed
            // console.log('changed file 3')
            self.emit('change', event.file, stats)
            delete eventsPatterns[event.file]
            return
          }

          const deletedFilePattern4 = eDelete
          if ((pattern & deletedFilePattern4) - deletedFilePattern4 === 0) { //additional events allowed
            // console.log('deleted file or directory 4')
            self.emit('unlink', event.file, stats)
            delete eventsPatterns[event.file]
            return
          }

          const createdDirectoryPattern5 = eIsDir | eCreate | eOpen | eAccess | eCloseNowrite | eClose
          if ((pattern & createdDirectoryPattern5) - createdDirectoryPattern5 === 0) { //additional events allowed
            // console.log('created directory 5')
            self.emit('add', event.file, stats)
            delete eventsPatterns[event.file]
            return
          }

          const possibleSymlinkOrHardlinkPattern = eCreate
          const noSymlinkOrHardlinkPattern = eIsDir
          if (((pattern & possibleSymlinkOrHardlinkPattern) - possibleSymlinkOrHardlinkPattern === 0)
            && (pattern & noSymlinkOrHardlinkPattern) === 0) {
              fs.lstat(event.file, function (err, lstats) {
                if (!err && !lstats.isDirectory() && (lstats.isSymbolicLink() || lstats.nlink > 1)) {
                  // symlink and hard link does not receive any CLOSE event
                  // console.log('created symlink or hardlink 11/12')
                  self.emit('add', event.file, stats);
                  delete eventsPatterns[event.file]
                  return
                }
              })
          }

          const movedFromPattern = eMovedFrom
          if ((pattern & movedFromPattern) - movedFromPattern === 0) { //eIsDir is optional; additional events allowed
            //console.log('eMovedFrom')
            self.eventMovedFromPath = event.file
            self.eventMovedFromStat = stats

            self.missingMovedToTimeoutId = setTimeout(() => {
              //For case of missing following eMovedTo:
              self.missingMovedTo()
            }, self.missingMovedToTimeoutMilliseconds)

            return
          }
          if ((pattern & movedToPattern) - movedToPattern === 0) { //eIsDir is optional; additional events allowed
            if (self.eventMovedFromPath) {
              clearTimeout(self.missingMovedToTimeoutId)
              //console.log('eMovedTo')
              self.emit('move', self.eventMovedFromPath, event.file, stats)
              delete self.eventMovedFromPath
              delete eventsPatterns[event.file]
              return
            } else {
              //Missing eMovedFrom:
              self.emit('add', event.file, stats)
              delete eventsPatterns[event.file]
              return
            }
          }

          // for sure remove last event of already emitted pattern
          if (((pattern & eCloseNowrite) + (pattern & eCloseWrite) + (pattern & eClose)) > 0) { //additional events allowed
            delete eventsPatterns[event.file]
            return
          }

        });


    // parse stderr of the inotifywatch command
    Lazy(self.inwp.stderr)
        .lines
        .map(String)
        .forEach(function (line) {
          if (/^Watches established/.test(line)) {
            // tell when the watch is ready
            self.emit('ready', self.inwp);
          } else if (/^Setting up watches/.test(line)) {
            // ignore this message
          } else {
            self.emit('error', new Error(line));
          }
        });

    // Maybe it's not this module job to trap the SIGTERM event on the process
    // ======>
    // check if the nodejs process is killed
    // then kill inotifywait shell command
    // process.on('SIGTERM', function () {
    //   if (self.inwp) {
    //     self.inwp.kill();
    //   }
    // });

  };

  self.runProcess();
}

INotifyWait.prototype = Object.create(EventEmitter.prototype);

INotifyWait.prototype.close = function (cb) {
  // if already killed
  if (!this.inwp) {
    if (cb) {
      this.removeAllListeners(); // cleanup
      return cb(null);
    }
    return;
  }
  // if not already killed
  this.on('close', function (err) {
    this.removeAllListeners(); // cleanup
    if (cb) {
      return cb(err);
    }
  });
  this.inwp.kill();
};

module.exports = INotifyWait;

/**
 *  Mixing object properties.
 */
var mixin = function() {
  var mix = {};
  [].forEach.call(arguments, function(arg) {
    for (var name in arg) {
      if (arg.hasOwnProperty(name)) {
        mix[name] = arg[name];
      }
    }
  });
  return mix;
};