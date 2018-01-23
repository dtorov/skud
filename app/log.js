var fs 				= require('fs');

var Datastore 		= require('nedb')
  , logDb = new Datastore({ filename: './log/log.db', autoload: true });
  
// конфиг приложения
var config 		= require('../config.json');

// === запись в лог событий приложения
var app = function (message, detail) {	
	let d = new Date();
	let recordDate = ''+d.getFullYear()+''+(d.getMonth()+1)+''+d.getDate()+' '+d.getHours()+':'+d.getMinutes()+':'+d.getSeconds();
	let logLine = recordDate+' : '+message+'\n';
	fs.appendFile(config.appLogFile, logLine, function (err) {
		  if (err) throw err;
		});
	if(detail !== undefined){
		logDb.insert({"date": recordDate, "message": message, "detail": detail}, function (err, newDoc) {   
			
		});	
	}
	console.log(logLine);
}

// === запись в лог событий СКУД
var skud = function (message,detail) {	
	let d = new Date();
	let recordDate = ''+d.getFullYear()+''+(d.getMonth()+1)+''+d.getDate()+' '+d.getHours()+':'+d.getMinutes()+':'+d.getSeconds();
	let logLine = recordDate+' : '+message+'\n';
	fs.appendFile(config.skudLogFile, logLine, function (err) {
		  if (err) throw err;
		});
	if(detail !== undefined){
		logDb.insert({"date": recordDate, "message": message, "detail": detail}, function (err, newDoc) {   
			
		});	
	}
	console.log(logLine);
}

module.exports.app = app;
module.exports.skud = skud;