var fs = require('fs');
var git = require('gift');
var moment = require('moment');
require('colors');

module.exports = History;

function History() {}

History.filePath = ".history.json";
History.bufferObject = {};

History.addObject = function(obj) {
  var object = obj;

  if (!fs.existsSync(History.filePath)) {
    fs.writeFileSync(History.filePath, JSON.stringify([]), 'utf8');
  }

  fs.readFile(History.filePath, 'utf8', function(err, data) {
    if (err) throw err;

    var deploys = JSON.parse(data);
    deploys.push(object);

    fs.writeFileSync(History.filePath, JSON.stringify(deploys, undefined, 4), 'utf8');
  });
};

History.flush = function() {
  History.bufferObject.deployDate = new Date();
  History.addObject(History.bufferObject);
};

History.output = function() {
  fs.readFile(History.filePath, 'utf8', function(err, rawData) {
    if (err) throw err;
    var data = JSON.parse(rawData);
    console.log("Your Local Deploy History");
    console.log("-------------------------");
    for (var i = data.length - 1; i >= 0; i--) {
      console.log(((i == data.length - 1) ? "> ".bold.green : "  ") +
        moment(data[i].deployDate).format('YYYY-MM-DD HH:mm:ss').blue +
        " - " + data[i].commitId.blue +
        " (mup version: " + data[i].version.blue +
        " branch: " + data[i].branch.blue + ")");
    }
  });
};