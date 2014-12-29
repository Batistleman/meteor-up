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
        } else if(!mupJson.app && !mupJson.app_git) {
          mupErrorLog('Path to a local app directory or to a git location does not exist');
        } else if(!!mupJson.app && !!mupJson.app_git) {
          mupErrorLog('You specified boath app path and app_git configuration, please choose one method of both.');
        } else if(!!mupJson.app_git) {
          if(!mupJson.app_git.location) {
            mupErrorLog('No git location specified');
          } else if(!mupJson.app_git.version) {
            mupErrorLog('No git version specified');
          } else if(!mupJson.app_git.app_root) {
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

    //rewrite ~ with $HOME
    if(mupJson.app)
      mupJson.app = rewriteHome(mupJson.app);

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
