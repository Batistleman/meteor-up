var cjson = require('cjson');
var path = require('path');
var fs = require('fs');
var helpers = require('./helpers');

require('colors');

exports.read = function() {
  var mupJsonPath = path.resolve('mup.json');
  if(fs.existsSync(mupJsonPath)) {
    var mupJson = cjson.load(mupJsonPath);

    //validating servers
    if(!mupJson.servers || mupJson.servers.length == 0) {
      mupErrorLog('Server information does not exist');
    } else {
      mupJson.servers.forEach(function(server) {
        if(!server.host) {
          mupErrorLog('Server host does not exist');
        } else if(!server.username) {
          mupErrorLog('Server username does not exist');
        } else if(!server.password && !server.pem) {
          mupErrorLog('Server password or pem does not exist');
        } else if(!mupJson.app) {
          mupErrorLog('Path to app does not exist');
        } else if(mupJson.app && mupJson.app.type === "git") {
          if(!mupJson.app.repository) {
            mupErrorLog('No git repository specified');
          } else if(!mupJson.app.branch) {
            mupErrorLog('No git branch specified');
          } else if(!mupJson.app.version) {
            mupErrorLog('No git version specified');
          } else if(!mupJson.app.app_root) {
            mupErrorLog('No app root in git configuration specified');
          }
        }

        server.os = server.os || "linux";

        if(server.pem) {
          server.pem = rewriteHome(server.pem);
        } else {
          //hint mup bin script to check whether sshpass installed or not
          mupJson._passwordExists = true;
        }
      });
    }

    //legacy compatibility
    if(mupJson.app && !mupJson.app.type){
      //rewrite ~ with $HOME
      var location = rewriteHome(mupJson.app);
      mupJson.app = {};
      mupJson.app.location = location;
      mupJson.app.type = "local";
    }

    //initialize options
    mupJson.env = mupJson.env || {};
    if(typeof mupJson.setupNode === "undefined") {
      mupJson.setupNode = true;
    }
    if(typeof mupJson.setupPhantom === "undefined") {
      mupJson.setupPhantom = true;
    }
    mupJson.meteorBinary = (mupJson.meteorBinary) ? getCanonicalPath(mupJson.meteorBinary) : 'meteor';
    if(typeof mupJson.appName === "undefined") {
      mupJson.appName = "meteor";
    }

    return mupJson;
  } else {
    console.error('mup.json file does not exist!'.red.bold);
    helpers.printHelp();
    process.exit(1);
  }
};

function rewriteHome(location) {
  return location.replace('~', process.env.HOME);
}

function mupErrorLog(message) {
  var errorMessage = 'Invalid mup.json file: ' + message;
  console.error(errorMessage.red.bold);
  process.exit(1);
}

function getCanonicalPath(location) {
  var localDir = path.resolve(__dirname, location);
  if(fs.existsSync(localDir)) {
    return localDir;
  } else {
    return path.resolve(rewriteHome(location));
  }
}
