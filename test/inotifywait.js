/*jslint node: true, maxlen: 100, maxerr: 50, indent: 2 */
'use strict';

var expect      = require('chai').expect;
var INotifyWait = require('../index.js');
var uuid        = require('uuid');
var fs          = require('fs');
var mkdirp      = require('mkdirp');
var remove      = require('remove');
var touch       = require('touch');
var userid      = require("userid");

var fakeFile = '';
beforeEach(function(){
//  remove.removeSync(__dirname + '/data');
  fakeFile = generateFakeFile('fake1');
});

describe('inotifywait', function () {

  it('should tell when it is ready @1', function (done) {
    var w = new INotifyWait(__dirname + '/data');
    w.on('ready', function (p) {
      expect(p.pid, 'when inotifywait is ready, it should have a pid').to.be.numeric;
      w.close();
      done();
    });
  });

  it('should detect when a new file is added @2', function (done) {
    var f = '';
    var w = new INotifyWait(__dirname + '/data');
    w.on('add', function (name, stats) {
      expect(name).to.eql(f);
      expect(stats.isDir).to.eql(false);
      expect(stats.date).to.be.a('Date');
      expect(stats.date).to.be.lt(new Date());
      w.close();
      done();
    });
    w.on('ready', function () {
      f = generateFakeFile('fake2');
    });
  });

  it('should detect when a file is modified @3', function (done) {
    var w = new INotifyWait(__dirname + '/data');
    w.on('change', function (name) {
      expect(name).to.eql(fakeFile);
      w.close();
      done();
    });
    w.on('ready', function () {
      fs.writeFileSync(fakeFile, '...');
    });
  })

  it('should detect when a file is removed @4', function (done) {
    var w = new INotifyWait(__dirname + '/data');
    w.on('unlink', function (name, stats) {
      expect(name).to.eql(fakeFile);
      expect(stats.isDir).to.eql(false);
      w.close();
      done();
    });
    w.on('ready', function () {
      remove.removeSync(fakeFile);
    });
  })

  it('should detect when a folder is created @5', function (done) {
    var d = __dirname + '/data/lol';
    var w = new INotifyWait(__dirname + '/data', { watchDirectory: true });
    w.on('add', function (name, stats) {
      expect(name).to.eql(d);
      expect(stats.isDir).to.eql(true);
      w.close();
      done();
    });
    w.on('ready', function () {
      mkdirp.sync(d);
    });
  })

  it('should not detect when a folder is created if watchDirectory is false @6',
  function (done) {
    var d        = __dirname + '/data/lol2';
    var addEvent = false;

    var w = new INotifyWait(__dirname + '/data', { watchDirectory: false });
    w.on('add', function (name) {
      addEvent = true;
    });
    w.on('ready', function () {
      mkdirp.sync(d);
      // test the add event is not handled for directory creation
      setTimeout(function () {
        expect(addEvent).to.be.false;
        w.close();
        done();
      }, 100);
    });
  })

  it('should detect a new file in a new folder if recursive is true @7',
  function (done) {
    var d        = __dirname + '/data/lol3';
    var f        = __dirname + '/data/lol3/newfile';

    var w = new INotifyWait(__dirname + '/data', { recursive: true, watchDirectory: false });
    w.on('add', function (name) {
      //console.log(name);
      w.close();
      done();
    });
    w.on('ready', function () {
      mkdirp.sync(d);
      // wait few milliseconds before writing a file
      // so inotifywait can scan the new folder
      setTimeout(function () {
        fs.writeFileSync(f, '...');
      }, 0);
    });
  })

  it('should detect a new file in nested new folders if recursive is true @8',
  function (done) {
    var d        = __dirname + '/data/lol4/lol5';
    var f        = __dirname + '/data/lol4/lol5/newfile';

    var w = new INotifyWait(__dirname + '/data', { recursive: true, watchDirectory: false });
    w.on('add', function (name) {
      //console.log(name);
      w.close();
      done();
    });
    w.on('ready', function () {
      mkdirp.sync(d);
      // wait few milliseconds before writing a file
      // so inotifywait can scan the new folder
      setTimeout(function () {
        fs.writeFileSync(f, '...');
      }, 0);
    });
  });

  it('should receive a close event when inotifywait process is finished @9',
  function (done) {
    var w = new INotifyWait(__dirname + '/data');
    w.on('ready', function () {
      setTimeout(function () {
        w.close();
      }, 10);
    });
    w.on('close', function () {
       done();
    });
  });

  it('should receive a close event when inotifywait process is killed @10',
  function (done) {
    var w = new INotifyWait(__dirname + '/data');
    w.on('ready', function (p) {
      setTimeout(function () {
        p.kill();
      }, 10);
    });
    w.on('close', function () {
     done();
    });
  });

  it('should detect when a new symlink is added @11', function (done) {
    var f_id  = uuid.v1();
    var f_src = '/tmp/' + f_id;
    var f_dst = __dirname + '/data/' + f_id;
    fs.writeFileSync(f_src, 'fake data'); // create the file source
    var w = new INotifyWait(__dirname + '/data');
    w.on('add', function (name) {
      expect(name).to.eql(f_dst);
      w.close();
      done();
    });
    w.on('ready', function () {
      fs.symlinkSync(f_src, f_dst);
    });
  });

  it('should detect when a new hardlink is added @12', function (done) {
    var f_id  = uuid.v1();
    var f_src = '/tmp/' + f_id;
    var f_dst = __dirname + '/data/' + f_id;
    fs.writeFileSync(f_src, 'fake data'); // create the file source
    var w = new INotifyWait(__dirname + '/data');
    w.on('add', function (name) {
      expect(name).to.eql(f_dst);
      w.close();
      done();
    });
    w.on('ready', function () {
      fs.linkSync(f_src, f_dst);
    });
  });

  it('should detect when a new hardlink is touched @13a', function (done) {
    var f_id  = uuid.v1();
    var f_src = '/tmp/' + f_id;
    var f_dst = __dirname + '/data/' + f_id;
    //    console.log(f_dst);
    fs.writeFileSync(f_src, 'fake data'); // create the file source
    fs.linkSync(f_src, f_dst);            // create the hard link
    var w = new INotifyWait(__dirname + '/data', { touchGeneratesAttributes: true }); // newly is necessary to change default options
    w.on('attributes', function (name) { //newly prefered way is to emmit 'attributes' instead of 'change'
      expect(name).to.eql(f_dst);
      w.close();
      done();
    });
    w.on('ready', function () {
      touch.sync(f_dst); // touch the hard link
    });
  });
  it('should detect when a new hardlink is touched @13b', function (done) {
    var f_id  = uuid.v1();
    var f_src = '/tmp/' + f_id;
    var f_dst = __dirname + '/data/' + f_id;
    //    console.log(f_dst);
    fs.writeFileSync(f_src, 'fake data'); // create the file source
    fs.linkSync(f_src, f_dst);            // create the hard link
    var w = new INotifyWait(__dirname + '/data', /*{ touchGeneratesAttributes: false }*/); // default options for backward compatibility
    w.on('change', function (name) { //for backward compatibility is emitted 'change' instead of 'attributes'
      expect(name).to.eql(f_dst);
      w.close();
      done();
    });
    w.on('ready', function () {
      touch.sync(f_dst); // touch the hard link
    });
  });

  it('should detect 500 files change when they are touched @14a', function (done) {
    // create the 500 files
    remove.removeSync(__dirname + '/data');
    var files = [];
    for (var i = 0; i < 500 ; i++) {
      var id  = uuid.v4();
      var path = __dirname + '/data/' + id[0] + '/' + id[1] + '/' + id[2];
      mkdirp.sync(path);
      var file = path + '/' + id;
      fs.writeFileSync(file, '.');
      files.push(file);
    }
    // run inotifywait
    var nbNotify = 0;
    var w = new INotifyWait(__dirname + '/data', { touchGeneratesAttributes: true }); // newly is necessary to change default options
    w.on('attributes', function (name) { //newly prefered way is to emmit 'attributes' instead of 'change'
      nbNotify++;
      if (nbNotify == 500) {
        w.close();
        done();
      }
    });
    w.on('ready', function () {
      files.forEach(function (f) {
        touch.sync(f);
      });
    });
  });
  it('should detect 500 files change when they are touched @14b', function (done) {
    // create the 500 files
    remove.removeSync(__dirname + '/data');
    var files = [];
    for (var i = 0; i < 500 ; i++) {
      var id  = uuid.v4();
      var path = __dirname + '/data/' + id[0] + '/' + id[1] + '/' + id[2];
      mkdirp.sync(path);
      var file = path + '/' + id;
      fs.writeFileSync(file, '.');
      files.push(file);
    }
    // run inotifywait
    var nbNotify = 0;
    var w = new INotifyWait(__dirname + '/data', /*{ touchGeneratesAttributes: false }*/); // default options for backward compatibility
    w.on('change', function (name) { //for backward compatibility is emitted 'change' instead of 'attributes'
      nbNotify++;
      if (nbNotify == 500) {
        w.close();
        done();
      }
    });
    w.on('ready', function () {
      files.forEach(function (f) {
        touch.sync(f);
      });
    });
  });  
  
  it('should detect when a folder is removed @15', function (done) {
    var d = __dirname + '/data/lol';
    var w = new INotifyWait(__dirname + '/data', { watchDirectory: true });
    w.on('unlink', function (name, stats) {
      expect(name).to.eql(d);
      expect(stats.isDir).to.eql(true);
      w.close();
      done();
    });
    w.on('ready', function () {
      mkdirp.sync(d);
      setTimeout(function () {
        remove.removeSync(d);
      }, 10);
    });
  })
  it('should detect when a file is renamed @16', function (done) {
    var w = new INotifyWait(__dirname + '/data');
    const fakeFile2 = __dirname + '/data/fake2'
    w.on('move', function (nameFrom, nameTo, stats) {
      expect(nameFrom).to.eql(fakeFile);
      expect(nameTo).to.eql(fakeFile2);
      expect(stats.isDir).to.eql(false);
      w.close();
      done();
    });
    w.on('ready', function () {
      fs.renameSync(fakeFile, fakeFile2)
    });
  })
  
  it('should detect when a file is moved inside watched directory @17', function (done) {
    const movedFile = __dirname + '/data/subdir/fake1'
    mkdirp.sync(__dirname + '/data/subdir');
    var w = new INotifyWait(__dirname + '/data');
    w.on('move', function (nameFrom, nameTo, stats) {
      expect(nameFrom).to.eql(fakeFile);
      expect(nameTo).to.eql(movedFile);
      expect(stats.isDir).to.eql(false);
      w.close();
      done();
    });
    w.on('ready', function () {
      fs.renameSync(fakeFile, movedFile)
    });
  })
  it('should detect when a directory is renamed @18', function (done) {
    const origDir = __dirname + '/data/subdir'
    const renamedDir = __dirname + '/data/subdir2'
    mkdirp.sync(origDir);
    var w = new INotifyWait(__dirname + '/data', { watchDirectory: true });
    w.on('move', function (nameFrom, nameTo, stats) {
      expect(nameFrom).to.eql(origDir);
      expect(nameTo).to.eql(renamedDir);
      expect(stats.isDir).to.eql(true);
      w.close();
      done();
    });
    w.on('ready', function () {
      fs.renameSync(origDir, renamedDir)
    });
  })
  it('should detect when a directory is moved inside watched directory @19', function (done) {
    const origDir = __dirname + '/data/subdir'
    const origDir2 = __dirname + '/data/subdir2'
    const renamedDir = __dirname + '/data/subdir2/subdir'
    mkdirp.sync(origDir);
    mkdirp.sync(origDir2);
    var w = new INotifyWait(__dirname + '/data', { watchDirectory: true });
    w.on('move', function (nameFrom, nameTo, stats) {
      expect(nameFrom).to.eql(origDir);
      expect(nameTo).to.eql(renamedDir);
      expect(stats.isDir).to.eql(true);
      w.close();
      done();
    });
    w.on('ready', function () {
      fs.renameSync(origDir, renamedDir)
    });
  })
  
  it('should detect when date attributes of a file was changed  @20', function (done) {
    var w = new INotifyWait(__dirname + '/data');
    w.on('attributes', function (name, stats) {
      expect(name).to.eql(fakeFile);
      expect(stats.isDir).to.eql(false);
      w.close();
      done();
    });
    w.on('ready', function () {
      const time = new Date();
      fs.utimesSync(fakeFile, time, time);
    });
  })
  it('should detect when mode attributes of a file was changed  @21', function (done) {
    var w = new INotifyWait(__dirname + '/data');
    w.on('attributes', function (name, stats) {
      expect(name).to.eql(fakeFile);
      expect(stats.isDir).to.eql(false);
      w.close();
      done();
    });
    w.on('ready', function () {
      //initial mode of fakeFile is 664
      fs.chmodSync(fakeFile, 0o770)
    });
  })
  it('should detect when owner of a file was changed  @22', function (done) {
    const gid = (fs.statSync(fakeFile)).gid
    const uid = (fs.statSync(fakeFile)).uid
    var w = new INotifyWait(__dirname + '/data');
    w.on('attributes', function (name, stats) {
      expect(name).to.eql(fakeFile);
      expect(stats.isDir).to.eql(false);
      w.close();
      done();
    });
    w.on('ready', function () {
      //It is not possible to change owner without root with exception to change it to herself.
      //Next updates both uid and gid to the same value as it was before.
      fs.chownSync(fakeFile, uid, gid)
    });
  })
  it('should detect when group of a file was changed  @23', function (done) {
    // it is expected user running this test is in group sudo (see command id)
    const newGid = userid.gid("sudo") 
    const uid = (fs.statSync(fakeFile)).uid
    var w = new INotifyWait(__dirname + '/data');
    w.on('attributes', function (name, stats) {
      expect(name).to.eql(fakeFile);
      expect(stats.isDir).to.eql(false);
      w.close();
      done();
    });
    w.on('ready', function () {
      fs.chownSync(fakeFile, uid, newGid)
    });
  })

  it('should detect when date attributes of a directory was changed  @24', function (done) {
    const origDir = __dirname + '/data/subdir'
    mkdirp.sync(origDir);
    var w = new INotifyWait(__dirname + '/data', { watchDirectory: true });
    w.on('attributes', function (name, stats) {
      expect(name).to.eql(origDir);
      expect(stats.isDir).to.eql(true);
      w.close();
      done();
    });
    w.on('ready', function () {
      const time = new Date();
      fs.utimesSync(origDir, time, time);
    });
  })
  it('should detect when mode attributes of a directory was changed  @25', function (done) {
    const origDir = __dirname + '/data/subdir'
    mkdirp.sync(origDir);
    var w = new INotifyWait(__dirname + '/data', { watchDirectory: true });
    w.on('attributes', function (name, stats) {
      expect(name).to.eql(origDir);
      expect(stats.isDir).to.eql(true);
      w.close();
      done();
    });
    w.on('ready', function () {
      //initial mode of origDir is 775
      fs.chmodSync(origDir, 0o770)
    });
  })
  it('should detect when owner of a directory was changed  @26', function (done) {
    const origDir = __dirname + '/data/subdir'
    mkdirp.sync(origDir);
    const gid = (fs.statSync(origDir)).gid
    const uid = (fs.statSync(origDir)).uid
    var w = new INotifyWait(__dirname + '/data', { watchDirectory: true });
    w.on('attributes', function (name, stats) {
      expect(name).to.eql(origDir);
      expect(stats.isDir).to.eql(true);
      w.close();
      done();
    });
    w.on('ready', function () {
      //It is not possible to change owner without root with exception to change it to herself.
      //Next updates both uid and gid to the same value as it was before.
      fs.chownSync(origDir, uid, gid)
    });
  })
  it('should detect when group of a directory was changed  @27', function (done) {
    const origDir = __dirname + '/data/subdir'
    mkdirp.sync(origDir);
    // it is expected user running this test is in group sudo (see command id)
    const newGid = userid.gid("sudo")
    const uid = (fs.statSync(origDir)).uid
    var w = new INotifyWait(__dirname + '/data', { watchDirectory: true });
    w.on('attributes', function (name, stats) {
      expect(name).to.eql(origDir);
      expect(stats.isDir).to.eql(true);
      w.close();
      done();
    });
    w.on('ready', function () {
      fs.chownSync(origDir, uid, newGid)
    });
  })
  
  it('should detect when a file is moved from watched directory to outside @28', function (done) {
    const origFile = __dirname + '/data/file'
    const outsideDir = __dirname + '/data_outside'
    const movedFile = __dirname + '/data_outside/file'
    mkdirp.sync(outsideDir);
    fs.writeFileSync(origFile, '.');
    var w = new INotifyWait(__dirname + '/data', { watchDirectory: true });
    w.on('unlink', function (name, stats) {
      expect(name).to.eql(origFile);
      expect(stats.isDir).to.eql(false);
      w.close();
      remove.removeSync(outsideDir);
      done();
    });
    w.on('ready', function () {
      fs.renameSync(origFile, movedFile)
    });
  })
  it('should detect when a file is moved from outside to watched directory @29', function (done) {
    const origOutsideFile = __dirname + '/data_outside/file'
    const outsideDir = __dirname + '/data_outside'
    const movedFile = __dirname + '/data/file'
    mkdirp.sync(outsideDir);
    fs.writeFileSync(origOutsideFile, '.');
    var w = new INotifyWait(__dirname + '/data', /*{ watchDirectory: true }*/);
    w.on('add', function (name, stats) {
      expect(name).to.eql(movedFile);
      expect(stats.isDir).to.eql(false);
      w.close();
      remove.removeSync(outsideDir);
      done();
    });
    w.on('ready', function () {
      fs.renameSync(origOutsideFile, movedFile)
    });
  })
  it('should detect when a directory is moved from watched directory to outside @30', function (done) {
    const origDir = __dirname + '/data/subdir'
    const outsideDir = __dirname + '/data_outside'
    const movedOutsideDir = __dirname + '/data_outside/subdir'
    mkdirp.sync(origDir);
    mkdirp.sync(outsideDir);
    var w = new INotifyWait(__dirname + '/data', { watchDirectory: true });
    w.on('unlink', function (name, stats) {
      expect(name).to.eql(origDir);
      expect(stats.isDir).to.eql(true);
      w.close();
      remove.removeSync(outsideDir);
      done();
    });
    w.on('ready', function () {
      fs.renameSync(origDir, movedOutsideDir)
    });
  })
  it('should detect when a directory is moved from outside to watched directory @31', function (done) {
    const origOutsideDir = __dirname + '/data_outside/subdir'
    const outsideDir = __dirname + '/data_outside'
    const movedDir = __dirname + '/data/subdir'
    mkdirp.sync(outsideDir);
    mkdirp.sync(origOutsideDir);
    var w = new INotifyWait(__dirname + '/data', { watchDirectory: true });
    w.on('add', function (name, stats) {
      expect(name).to.eql(movedDir);
      expect(stats.isDir).to.eql(true);
      w.close();
      remove.removeSync(outsideDir);
      done();
    });
    w.on('ready', function () {
      fs.renameSync(origOutsideDir, movedDir)
    });
  })

  it('should detect when a file is moved from watched directory to outside and then back @32', function (done) {
    const origFile = __dirname + '/data/file'
    const outsideDir = __dirname + '/data_outside'
    const movedOutsideFile = __dirname + '/data_outside/file'
    mkdirp.sync(outsideDir);
    fs.writeFileSync(origFile, '.');
    var w = new INotifyWait(__dirname + '/data', { watchDirectory: true });
    w.on('ready', function () {
      fs.renameSync(origFile, movedOutsideFile)
    });
    w.on('unlink', function (name, stats) {
      expect(name).to.eql(origFile);
      expect(stats.isDir).to.eql(false);
      fs.renameSync(movedOutsideFile, origFile);
    });
    w.on('add', function (name, stats) {
      expect(name).to.eql(origFile);
      expect(stats.isDir).to.eql(false);
      w.close();
      remove.removeSync(outsideDir);
      done();
    });
  })
  it('should detect when a file is moved from outside to watched directory and then back @33', function (done) {
    const origOutsideFile = __dirname + '/data_outside/file'
    const outsideDir = __dirname + '/data_outside'
    const movedFile = __dirname + '/data/file'
    mkdirp.sync(outsideDir);
    fs.writeFileSync(origOutsideFile, '.');
    var w = new INotifyWait(__dirname + '/data', /*{ watchDirectory: true }*/);
    w.on('ready', function () {
      fs.renameSync(origOutsideFile, movedFile)
    });
    w.on('add', function (name, stats) {
      expect(name).to.eql(movedFile);
      expect(stats.isDir).to.eql(false);
      fs.renameSync(movedFile, origOutsideFile)
    });
    w.on('unlink', function (name, stats) {
      expect(name).to.eql(movedFile);
      expect(stats.isDir).to.eql(false);
      w.close();
      remove.removeSync(outsideDir);
      done();
    });
    
  })
  it('should detect when a directory is moved from watched directory to outside and then back @34', function (done) {
    const origDir = __dirname + '/data/subdir'
    const outsideDir = __dirname + '/data_outside'
    const movedOutsideDir = __dirname + '/data_outside/subdir'
    mkdirp.sync(origDir);
    mkdirp.sync(outsideDir);
    var w = new INotifyWait(__dirname + '/data', { watchDirectory: true });
    w.on('ready', function () {
      fs.renameSync(origDir, movedOutsideDir)
    });
    w.on('unlink', function (name, stats) {
      expect(name).to.eql(origDir);
      expect(stats.isDir).to.eql(true);
      fs.renameSync(movedOutsideDir, origDir)
    });
    w.on('add', function (name, stats) {
      expect(name).to.eql(origDir);
      expect(stats.isDir).to.eql(true);
      w.close();
      remove.removeSync(outsideDir);
      done();
    });
  })
  it('should detect when a directory is moved from outside to watched directory and then back @35', function (done) {
    const origOutsideDir = __dirname + '/data_outside/subdir'
    const outsideDir = __dirname + '/data_outside'
    const movedDir = __dirname + '/data/subdir'
    mkdirp.sync(outsideDir);
    mkdirp.sync(origOutsideDir);
    var w = new INotifyWait(__dirname + '/data', { watchDirectory: true });
    w.on('ready', function () {
      fs.renameSync(origOutsideDir, movedDir)
    });
    w.on('add', function (name, stats) {
      expect(name).to.eql(movedDir);
      expect(stats.isDir).to.eql(true);
      fs.renameSync(movedDir, origOutsideDir)
    });
    w.on('unlink', function (name, stats) {
      expect(name).to.eql(movedDir);
      expect(stats.isDir).to.eql(true);
      w.close();
      remove.removeSync(outsideDir);
      done();
    });
  })
  
  it.only('should detect when a file is renamed and then renamed again to original name @36', function (done) {
    const origFile = __dirname + '/data/file'
    const renamedFile = __dirname + '/data/file2'
    fs.writeFileSync(origFile, '.');
    let move_num = 0;
    var w = new INotifyWait(__dirname + '/data', { watchDirectory: true });
    w.on('ready', function () {
      fs.renameSync(origFile, renamedFile)
    });
    w.on('move', function (oldName, newName, stats) {
      if(move_num === 0) {
        expect(oldName).to.eql(origFile);
        expect(newName).to.eql(renamedFile);
        expect(stats.isDir).to.eql(false);
        move_num = 1;
        setTimeout(() => {
        fs.renameSync(renamedFile, origFile);
          return;
        }, 10)
      } else if(move_num === 1) {
        expect(oldName).to.eql(renamedFile);
        expect(newName).to.eql(origFile);
        expect(stats.isDir).to.eql(false);
        w.close();
        remove.removeSync(origFile);
        done();
      }      
    });   
  })
  
  
});

afterEach(function(){
  remove.removeSync(__dirname + '/data');
});

function generateFakeFile(name) {
  var path = __dirname + '/data';
  var file = path + '/' + name;

  mkdirp.sync(path);
  fs.writeFileSync(file, '.');
  return file;
}