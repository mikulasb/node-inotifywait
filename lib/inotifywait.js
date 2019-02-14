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
const eMove = 512
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

  self.currentEvents = {};

  self.runProcess = function () {

    var args = [
      (self.options.recursive ? '-r' : ''),
      '--format',
      '{ "type": "%e", "file": "%w%f", "date": "%T" }',
      '--timefmt',
      '%s',
      '-m'
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
        	
          event.type.forEach((eventType) => {
          	console.log(`eventType: ${eventType}`)
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
        			 pattern |= eMove
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
                console.error(`Received unknown event: ${eventType}`)
        		}
          })
        	 
        	 eventsPatterns[event.file] = pattern
        	 console.log(`Updated pattern: ${pattern}`)
       	 if (pattern & eClose) {
       	 	console.log(`Pattern after eClose: ${pattern}`)
       	 	console.log('')
        	 }
        	 
        	 

          const createdFilePattern = eCreate | eOpen | eModify | eCloseWrite | eClose
          //console.log(`created file pattern: ${createdFilePattern}`)
          //console.log(`pattern & createdFilePattern: ${pattern & createdFilePattern}`)
          //console.log(`pattern & createdFilePattern - createdFilePattern: ${pattern & createdFilePattern - createdFilePattern}`)
          //const sameBits = pattern & createdFilePattern
          //console.log(typeof sameBits)
          //console.log(typeof createdFilePattern)
        	 if ((pattern & createdFilePattern) - createdFilePattern === 0) { //additional events allowed 
        	 	console.log('created file')
        	 	self.emit('add', event.file, stats)
        	 	delete eventsPatterns[event.file]
        	 	return
        	 }
        	 
        	 const changedFilePattern = eOpen | eAttrib | eCloseWrite | eClose
          if ((pattern & changedFilePattern) - changedFilePattern === 0) { //additional events allowed 
        	 	console.log('changed file')
        	 	self.emit('change', event.file, stats)
        	 	delete eventsPatterns[event.file]
        	 	return
        	 }
        	 
          const changedFilePattern3 = eOpen | eModify | eCloseWrite | eClose
          if ((pattern & changedFilePattern3) - changedFilePattern3 === 0) { //additional events allowed 
        	 	console.log('changed file 3')
        	 	self.emit('change', event.file, stats)
        	 	delete eventsPatterns[event.file]
        	 	return
        	 }
        	 
        	 const deletedFilePattern4 = eDelete
          if ((pattern & deletedFilePattern4) - deletedFilePattern4 === 0) { //additional events allowed 
        	 	console.log('deleted file 4')
        	 	self.emit('unlink', event.file, stats)
        	 	delete eventsPatterns[event.file]
        	 	return
        	 }
        	 
        	 const createdDirectoryPattern5 = eIsDir | eCreate | eOpen | eAccess | eCloseNowrite | eClose
        	 if ((pattern & createdDirectoryPattern5) - createdDirectoryPattern5 === 0) { //additional events allowed 
        	 	console.log('created directory 5')
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
                  console.log('created symlink or hardlink 11/12')
                  self.emit('add', event.file, stats);
                  return
                }
              })
        	 }
        	 
        	 const movedFromPattern = eMovedFrom
        	 if ((pattern & movedFromPattern) - movedFromPattern === 0) { //additional events allowed 
        	   self.currentEvents['moved_from'] = event.file
        	   return
        	 }
        	 const movedToPattern = eMovedTo
        	 if ((pattern & movedToPattern) - movedToPattern === 0) { //additional events allowed 
        	   if (self.currentEvents['moved_from']) {
              if (!isDir) {
                self.emit('move', self.currentEvents['moved_from'], event.file, stats)
                delete self.currentEvents['moved_from']
                return
              } 
            }
        	 }
            

/*
          if (event.type.indexOf('OPEN') != -1) {
            if (self.currentEvents[event.file] != 'add') {
              self.currentEvents[event.file] = 'open'
              return
            }  
          } else if (event.type.indexOf('ATTRIB') != -1) {
              if (self.currentEvents[event.file] != 'open' &&
              self.currentEvents[event.file] != 'add') {
                self.emit('attributes', event.file, stats)
                delete self.currentEvents[event.file]
                return
              }
              if (self.currentEvents[event.file] == 'open') {
                self.currentEvents[event.file] = 'open_attributes'
              }
          }    
              
          if (event.type.indexOf('CREATE') != -1) {
            if (isDir) {
              self.emit('add', event.file, stats);
            } else {
              self.currentEvents[event.file] = 'add';
              fs.lstat(event.file, function (err, lstats) {
                if (!err && !lstats.isDirectory() && (lstats.isSymbolicLink() || lstats.nlink > 1)) {
                  // symlink and hard link does not receive any CLOSE event
                  self.emit('add', event.file, stats);
                  delete self.currentEvents[event.file];
                }
              });
            }
          }          
*/          
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
