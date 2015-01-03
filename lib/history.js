var nodemiral = require('nodemiral');
var path = require('path');
var fs = require('fs');
var rimraf = require('rimraf');
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var uuid = require('uuid');
var format = require('util').format;
var extend = require('util')._extend;
var git  = require('gift');
var moment = require('moment');
require('colors');

module.exports = Hist;

function Hist() {
}

Hist.filePath = ".history.json";
Hist.bufferObject = {};

Hist.addObject = function(obj) {
	var object = obj;
	Hist.exists(function(){
		fs.readFile(Hist.filePath, 'utf8', function (err, data) {
		    if (err) throw err;

		    var deploys = JSON.parse(data);
		    deploys.push(object);

		    fs.writeFile(Hist.filePath, JSON.stringify(deploys, undefined, 4), function(err) {
		        if (err) throw err;
		    });
	    });
	})
};

Hist.getData = function(callback){
	fs.readFile(Hist.filePath, 'utf8', function (err, data) {
		if (err) throw err;
		callback(JSON.parse(data));
	});
};

Hist.flush = function(){
    Hist.bufferObject.deployDate = new Date();
	Hist.addObject(Hist.bufferObject);
};

Hist.exists = function(callback){
	fs.exists(Hist.filePath, function(exists) {
      	if (!exists) {
      		fs.writeFile(Hist.filePath, JSON.stringify([]), function(err) {
		        if (err) throw err;
		        console.log('New file created.'.green);
		        callback();
		    });
      	}
      	else
      		callback();
  	});
};

Hist.output = function(){
	Hist.getData(function(data){
		console.log("Your Local Deploy History");
      	console.log("-------------------------");
      	for (var i = data.length - 1; i >= 0; i--) {
			console.log( ((i == data.length - 1) ? "> ".bold.green : "  ") + 
				moment(data[i].deployDate).format('YYYY-MM-DD HH:mm:ss').blue + 
				" - " + data[i].commitId.blue + 
				" (mup version: " + data[i].version.blue + 
				" branch: " + data[i].branch.blue +  ")");
		};
	});
}