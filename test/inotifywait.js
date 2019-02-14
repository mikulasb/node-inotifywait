/*jslint node: true, maxlen: 100, maxerr: 50, indent: 2 */
'use strict';

var expect      = require('chai').expect;
var INotifyWait = require('../index.js');
var uuid        = require('uuid');
var fs          = require('fs');
var mkdirp      = require('mkdirp');
var remove      = require('remove');
var touch       = require('touch');

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

    var w = new INotifyWait(__dirname + '/data', { recursive: true });
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

    var w = new INotifyWait(__dirname + '/data', { recursive: true });
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

  it('should detect when a new hardlink is touched @13', function (done) {
    var f_id  = uuid.v1();
    var f_src = '/tmp/' + f_id;
    var f_dst = __dirname + '/data/' + f_id;
    //    console.log(f_dst);
    fs.writeFileSync(f_src, 'fake data'); // create the file source
    fs.linkSync(f_src, f_dst);            // create the hard link
    var w = new INotifyWait(__dirname + '/data');
    w.on('change', function (name) {
      expect(name).to.eql(f_dst);
      w.close();
      done();
    });
    w.on('ready', function () {
      touch.sync(f_dst); // touch the hard link
    });
  });

  it.skip('should detect 500 files change when they are touched @14', function (done) { //test pass but too many logged lines
    
    // create the 100 files
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
    var w = new INotifyWait(__dirname + '/data');
    w.on('change', function (name) {
      nbNotify++;
      if (nbNotify == 500) {
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
  /*
  it('should detect when a file is moved @17', function (done) { //TODO
  })
  it('should detect when a directory is renamed @18', function (done) { //TODO
  })
  it('should detect when a directory is moved @19', function (done) { //TODO
  })
  
  it('should detect when date attributes of a file was changed  @20', function (done) { //TODO
  })
  it('should detect when mode attributes of a file was changed  @21', function (done) { //TODO
  })
  it('should detect when owner of a file was changed  @22', function (done) { //TODO
  })
  it('should detect when group of a file was changed  @23', function (done) { //TODO
  })
  
  it('should detect when date attributes of a directory was changed  @20', function (done) { //TODO
  })
  it('should detect when mode attributes of a directory was changed  @21', function (done) { //TODO
  })
  it('should detect when owner of a file was directory  @22', function (done) { //TODO
  })
  it('should detect when group of a file was directory  @23', function (done) { //TODO
  })
  */
});

afterEach(function(){
  remove.removeSync(__dirname + '/data');
});

function generateFakeFile(name) {
  //var id = uuid.v4();
  var path = __dirname + '/data'; // + id[0] + '/' + id[1] + '/' + id[2];
  var file = path + '/' + name;

  mkdirp.sync(path);
  //console.log(path + ' created [' + i + ']');
  fs.writeFileSync(file, '.');
  //console.log(file + ' created [' + i + ']');
  return file;
}