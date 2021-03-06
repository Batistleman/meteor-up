var nodemiral = require('nodemiral');
var path = require('path');
var fs = require('fs');
var rimraf = require('rimraf');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var uuid = require('uuid');
var format = require('util').format;
var extend = require('util')._extend;
var git = require('gift');
var history = require('./history');
require('colors');

module.exports = Actions;

function Actions(config, cwd, args) {
  this.cwd = cwd;
  this.config = config;
  this.args = args;
  this.sessionsMap = this._createSessionsMap(config);

  //get settings.json into env
  var setttingsJsonPath = path.resolve(this.cwd, 'settings.json');
  if(fs.existsSync(setttingsJsonPath)) {
    this.config.env['METEOR_SETTINGS'] = "'" + JSON.stringify(require(setttingsJsonPath)) + "'";
  }
}

Actions.prototype._createSessionsMap = function(config) {
  var sessionsMap = {};
  var options = {
    ssh: {'StrictHostKeyChecking': 'no', 'UserKnownHostsFile': '/dev/null'}
  };

  config.servers.forEach(function(server) {
    var host = server.host;
    var auth = {username: server.username};

    if(server.pem) {
      auth.pem = fs.readFileSync(path.resolve(server.pem), 'utf8');
    } else {
      auth.password = server.password;
    }

    if(server.sshOptions) {
      for(var key in server.sshOptions) {
        options.ssh[key] = server.sshOptions[key];
      }
    }

    if(!sessionsMap[server.os]) {
      sessionsMap[server.os] = {
        sessions: [],
        taskListsBuilder:require('./taskLists')(server.os)
      };
    }

    var session = nodemiral.session(host, auth, options);
    sessionsMap[server.os].sessions.push(session);
  });

  return sessionsMap;
};

var kadiraRegex = /^meteorhacks:kadira/m;
Actions.prototype._showKadiraLink = function() {
  var versionsFile = path.join(this.config.app.location, '.meteor/versions');
  if(fs.existsSync(versionsFile)) {
    var packages = fs.readFileSync(versionsFile, 'utf-8');
    var hasKadira = kadiraRegex.test(packages);
    if(!hasKadira) {
      console.log(
        "“ Checkout " + "Kadira".bold + "!"+
        "\n  It's the best way to monitor performance of your app."+
        "\n  Visit: " + "https://kadira.io/mup".underline + " ”\n"
      );
    }
  }
}

Actions.prototype.setup = function() {
  var self = this;
  if(this.config.app.type === "local")
    self._showKadiraLink();

  for(var os in self.sessionsMap) {
    var sessionsInfo = self.sessionsMap[os];
    var taskList = sessionsInfo.taskListsBuilder.setup(
      self.config.setupMongo, self.config.setupNode, self.config.nodeVersion,
      self.config.setupPhantom, self.config.appName);
    taskList.run(sessionsInfo.sessions);
  }
};

Actions.prototype.deploy = function() {
  var self = this;
  var buildLocation = path.resolve('/tmp', uuid.v4());
  var bundlePath = path.resolve(buildLocation, 'bundle.tar.gz');
  var commitId = null;

  if (this.config.app.type === "git") {
    var localFolder = path.resolve("./.local_app_directory/");
    self.config.app.location = path.resolve(localFolder, self.config.app.app_root);

    if (!fs.existsSync(localFolder)) {
      console.log("Cloning repo from " + self.config.app.repository.blue + " ...");
      git.clone(self.config.app.repository, localFolder, function(error, repo) {
        if (!error) {
          console.log("Done cloning.".green);
          syncAndCheckoutTree(repo);
        } else {
          console.error(erro.bold.red);
          console.error("An error occured".bold.red);
          process.exit(1);
        }
      });
    } else {
      syncAndCheckoutTree(git(localFolder));
    }
  } else {
    deployApplication();
  }

  function syncAndCheckoutTree(repo) {
    console.log("Syncing the repository to branch " + self.config.app.branch.blue + " ... ");
    history.bufferObject.branch = self.config.app.branch;

    repo.sync(self.config.app.branch, function(err) {
      if (err) {
        console.error("An error occured".bold.red);
        console.error(err);
      } else {
        if (self.args[3]) self.config.app.version = self.args[3];
        console.log("and version " + self.config.app.version.blue);
        history.bufferObject.version = self.config.app.version;

        checkoutRepository(repo);
      }
    });
  }

  function checkoutRepository(repo) {
    repo.checkout(self.config.app.version, function() {
      repo.current_commit(function(err, commit) {
        history.bufferObject.commitId = commit.id;
        console.log(" complete ".green + "(" + commit.id + ")\n");
        commitId = commit.id;
        deployApplication();
      });
    });
  }

  function deployApplication() {
    var vars = {
      stdout: "",
      stderr: "",
      error: ""
    };

    self._showKadiraLink();
    var options = {
      cwd: self.config.app.location,
    };
    // spawn inherits env vars from process.env
    // so we can simply set them like this
    process.env.BUILD_LOCATION = buildLocation;

    var buildScript = path.resolve(__dirname, 'build.sh');
    var deployCheckWaitTime = self.config.deployCheckWaitTime;
    var appName = self.config.appName;

    console.log('Building Started: ' + options.cwd);

    var bash = spawn("bash", [buildScript], options);
    bash.stdout.on('data', storeLastNChars(vars, "stdout", 1000));
    bash.stderr.on('data', storeLastNChars(vars, "stderr", 1000));
    bash.on('error', function(err) {
      vars.error = err.message;
    });
    bash.on('close', function(code) {
      //clear callback
      bash.stdout.removeAllListeners('data');
      bash.stderr.removeAllListeners('data');
      bash.removeAllListeners('error');
      bash.removeAllListeners('close');

      if (code != 0) {
        console.error(format('Bundling Error: code=%s, error:%s', code, vars.error));
        console.error('-------------------STDOUT-------------------'.bold);
        console.error(vars.stdout);
        console.error('-------------------STDERR-------------------'.bold.red);
        console.error(vars.stderr.red);
        process.exit(1);
      } else {
        for (var os in self.sessionsMap) {
          var sessionsInfo = self.sessionsMap[os];
          var taskList = sessionsInfo.taskListsBuilder.deploy(
            bundlePath, self.config.env,
            deployCheckWaitTime, appName, commitId);
          taskList.run(sessionsInfo.sessions, afterCompleted);
        }
      }
    });
  }

  function storeLastNChars(vars, field, limit, color) {
    return function(data) {
      vars[field] += data.toString();
      if(vars[field].length > 1000) {
        vars[field] = vars[field].substring(vars[field].length - 1000);
      }
    }
  }

  function afterCompleted(summeryMap) {
    if(self.config.app.type === "git") history.flush();
    rimraf.sync(buildLocation);
  }
};

Actions.prototype.reconfig = function() {
  var self = this;
  for(var os in self.sessionsMap) {
    var sessionsInfo = self.sessionsMap[os];
    var taskList = sessionsInfo.taskListsBuilder.reconfig(
      this.config.env, this.config.appName);
    taskList.run(sessionsInfo.sessions);
  }
};

Actions.prototype.logs = function() {
  var self = this;
  var tailOptions = process.argv.slice(3).join(" ");

  for(var os in self.sessionsMap) {
    var sessionsInfo = self.sessionsMap[os];
    sessionsInfo.sessions.forEach(function(session) {
      var hostPrefix = '[' + session._host + '] ';
      var options = {
        onStdout: function(data) {
          process.stdout.write(hostPrefix + data.toString());
        },
        onStderr: function(data) {
          process.stderr.write(hostPrefix + data.toString());
        }
      };

      if(os == 'linux') {
        var command = 'sudo tail ' + tailOptions + ' /var/log/upstart/' + self.config.appName + '.log';
      } else if(os == 'sunos') {
        var command = 'sudo tail ' + tailOptions +
          ' /var/svc/log/site-' + self.config.appName + '\\:default.log';
      }
      session.execute(command, options);
    });
  }

};

Actions.prototype.version = function() {
  switch (this.args[3]) {
    case "server":
      console.log("Server - todo");
      break;
    case "config":
      console.log("The Git Version in the config file is            " + this.config.app.version.green);
      console.log("The Git Branch in the config file is             " + this.config.app.branch.green);
      console.log("The Git remote directory in the config file is   " + this.config.app.repository.green);
      console.log("The Git root app directory in the config file is " + this.config.app.app_root.green);
      break;
    case "history":
      history.output();
      break;
    default:
      console.error("mup version can be used with:".bold.red);
      console.error(" * server  - gives you the deployed version on your server (by doing a check on the server)".red);
      console.error(" * config  - gives you the version, branch, location and app root in your config".red);
      console.error(" * history - gives you the history of your git deploys.".red);
      break;
  }
};

Actions.init = function() {
  var destMupJson = path.resolve('mup.json');
  var destSettingsJson = path.resolve('settings.json');

  if(fs.existsSync(destMupJson) || fs.existsSync(destSettingsJson)) {
    console.error('A Project Already Exists'.bold.red);
    process.exit(1);
  }

  var exampleMupJson = path.resolve(__dirname, '../example/mup.json');
  var exampleSettingsJson = path.resolve(__dirname, '../example/settings.json');

  copyFile(exampleMupJson, destMupJson);
  copyFile(exampleSettingsJson, destSettingsJson);

  console.log('Empty Project Initialized!'.bold.green);

  function copyFile(src, dest) {
    var content = fs.readFileSync(src, 'utf8');
    fs.writeFileSync(dest, content);
  }
};
