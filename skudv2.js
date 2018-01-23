
var path            = require('path'); // модуль для парсинга пути

var request 		= require('request');

// конфиг приложения
var config 			= require('./config.json');

// подключаем логгинг
//var log 			= require('./app/log.js');
var log = {};

var fs 				= require('fs');

var Datastore 		= require('nedb')
  , logDb = new Datastore({ filename: './log/log.db', autoload: true });
//============== REST by Express
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io 	= require('socket.io')(http);
app.use(express.static(path.join(__dirname, "public")));

		// === запись в лог событий приложения
		log.app = function (message, detail) {	
			let d = new Date();
			let recordDate = ''+d.getFullYear()+''+(d.getMonth()+1)+''+d.getDate()+' '+d.getHours()+':'+d.getMinutes()+':'+d.getSeconds();
			let logLine = recordDate+' # '+message+'\n';
			fs.appendFile(config.appLogFile, logLine, function (err) {
				  if (err) throw err;
				});
			io.emit('log',logLine);
			if(detail !== undefined){
				logDb.insert({"date": recordDate, "message": message, "detail": detail}, function (err, newDoc) {   
					
				});	
			}
			console.log(logLine);
		}
		
		// === запись в лог событий СКУД
		log.skud = function (message,detail) {	
			let d = new Date();
			let recordDate = ''+d.getFullYear()+''+(d.getMonth()+1)+''+d.getDate()+' '+d.getHours()+':'+d.getMinutes()+':'+d.getSeconds();
			let logLine = recordDate+' # '+message+'\n';
			fs.appendFile(config.skudLogFile, logLine, function (err) {
				  if (err) throw err;
				});
				io.emit('log',logLine);
			if(detail !== undefined){
				logDb.insert({"date": recordDate, "message": message, "detail": detail}, function (err, newDoc) {   
					
				});	
			}
			console.log(logLine);
		}
//log.app('App start', config);
//log.skud('App start');
//log.skud('config: \n' + JSON.stringify(config, null, 2));



// создаём объекты - карты
var cards = {};

// читаем карты
var cardsDatastore 	= require('nedb')
  , cardsDb = new cardsDatastore({ filename: './db/cards.db', autoload: true });
  
function Card(cardConfig){
	var self = this;
	
	let id = cardConfig.id,
		role = cardConfig.role || 'temp',
		state = cardConfig.state,
		name = cardConfig.name;


	self.update = function(ca){
		role = ca.role;
		state = ca.state;
		name = ca.name;
		// and save it to db
		cardsDb.update({ id: ca.id }, { $set: {'role': role, 'state': state, 'name': name}}, {}, function (err, numReplaced) {
			// numReplaced = 1
			log.skud('card update: '+JSON.stringify(ca,2));
		  });
	}

	self.role = function(){
		return role;
	}



	
} 

// load users
cardsDb.find({}, function (err, list) {
	for(let i = 0; i < list.length; i++){
		cards[list[i].id] = new Card(list[i]);
	}
	//console.log(JSON.stringify(cards))
});

// добавлени карты или ее изменение если она существует
function addOrUpdateCard(newCard) {
	console.log('addOrUpdateCard' + newCard);
	// card = {"id": "147,15084","role": "guard", "state": true, "name": "Торов"}
	if(newCard.id in cards){
			// update
		cards[newCard.id].update(newCard);
			
	} else {
			// new card, add
		cards[newCard.id] = new Card(newCard);	
		cardsDb.insert(newCard, function (err, newDoc) {
			log.skud('new card: ' + JSON.stringify(newCard,2));
		});	
	}
}

function removeCard(cardId){
	if(cardId in cards){
			// remove	
		delete cards[cardId];
		cardsDb.remove({ id: cardId }, { multi: true }, function (err, numRemoved) {
			log.skud('удалена карта: ' + cardId);
		  });	
	} else {

	}
};

// Создаём объекты - платформы
var platforms = {};
// 
function Platform(pConfig){
	var self = this;
	
	
	var connected = false,
		lastSensorsState = '',
		lastWeight = '';
	
	// load platform driver
	var platformDriver = require('./app/drivers/'+pConfig.driver+'_controller.js');
	var pDriver = new platformDriver(pConfig,log,actionOnData);

	// load weight driver
	if(pConfig.weightTerminal){
		var weightDriver = require('./app/drivers/'+pConfig.weightTerminal.driver+'_weight.js');
		var wDriver = new weightDriver(pConfig.weightTerminal, log, actionOnWeight);
	}
	
	self.actionTest = function (data){
		actionOnData(data);
	}

	function actionOnData(data){
		//  result = {
		//	"type": "", // sensor|card
		//	"value": "", // 000 - если датчики - то три символа
		//	"readerId": "" // только если карта
		//	};
		switch(data.type){
			case 'sensor':
				log.skud(pConfig.name + ': sensors: '+data.value);
				lastSensorsState = data.value;
				console.log('sensor value '+data.value);
			break
			case 'card':
			console.log('card');
				log.skud(pConfig.name + ': reader: '+data.readerId + ', card: '+data.value);
				if(data.value in cards){ // если карта есть базе
						// отправка карты наверх
					if(pConfig.cardBehavior[cards[data.value].role()].sendEvent){
						sendCardTo1c(pConfig.name,data.readerId,data.value);
					}
						// action on card
					pConfig.cardBehavior[cards[data.value].role()].actions.forEach(function (singleAction, i, arr) {
						if(data.readerId == singleAction.reader){
							switch(singleAction.type){
								case 'barrier':
									self.barrierAction(singleAction.barrier,singleAction.action);									
								break
								case 'scoreBoard':
									sendTextToScoreboard(pConfig.name,singleAction.device,singleAction.text);
								break
								case 'sendWeight':
								break
								case 'setLight':
								break
							}
						}
					});

					

				} else {			
					// карты нет в базе, шлём наверх
					sendCardTo1c(pConfig.name,data.readerId,data.value);
					log.skud(pConfig.name+','+data.readerId+': новая карта ' + data.value);
				}
				
			break
			case 'light':
			console.log('light');
			break
			case 'barrier':
			console.log('barrier');
			break
			default:
				log.app(pConfig.name + ': unknown data from callback : ' + data);
			break
		}
		console.log(pConfig.name + ': ' + JSON.stringify(data,2));
		//io.emit('log',{for: 'everyone' , platform: pConfig.name, data: data});
		io.emit('state',{platform: pConfig.name, data: data});
	}
	
	function actionOnWeight(data){
		// data - вес, 4 символа		
		lastWeight = data;
		//sendWeightTo1C(pConfig.name,card,weight)
		//io.emit('weight',{for: 'everyone' , platform: pConfig.name, data: {type: "weight", value: lastWeight}})
	}
	
	self.startWeighting = function(){
		wDriver.startWeighting();
	}
	
	self.setLight = function(state){
		if(pDriver.connectionState()){
			return pDriver.setLight(state);
		} else {return 'platformConnectionError';}
	}
	
	self.barrierAction = function(barrier,action){
		if(pConfig.devices[barrier]){
			if(pDriver.connectionState()){
				let result = '';
				switch (barrier){
					case 'b1': if(action == 'open'){result = pDriver.barrierOutside.toOpen(0);} else {result = pDriver.barrierOutside.toClose(0);}
					break
					case 'b2': if(action == 'open'){result = pDriver.barrierInside.toOpen(0)} else {result = pDriver.barrierInside.toClose(0)}
					break
					default:
						result = 'barrier unknown command ';
					break
				}
				return result;
				
			} else {return 'platformConnectionError';}
		} else {
			return 'no such barrier!';
		}
	}
	
	self.getLastSensorsState = function(){
		return lastSensorsState;
	}
	
	self.getLastWeight = function(){
		return lastWeight;
	}
}

// основная генерация объектов-платформ
for (var p in config.platforms) {
	//console.log(p + ' loaded');
	
	platforms[p] = new Platform(config.platforms[p]);

	//console.log(platforms[p]);
	
}



// светофоры
// http://127.0.0.1:4468/setlight?pname=lab&state=1111
app.get('/setlight', function (req, res) {
	let CheckQuery = checkQuery(req.query, ['pname','state']);
	if(CheckQuery == 'ok'){
		
		let commandResult = platforms[req.query.pname].setLight(req.query.state);	
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.send(commandResult);
	} else {
		log.skud(CheckQuery);
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.send(CheckQuery);
	}
});

// rest для шлагбаумов
// http://127.0.0.1:4468/barrier?pname=lab&b=b1&action=open&key=key
app.get('/barrier', function (req, res) {
	let CheckQuery = checkQuery(req.query, ['pname','b','action']);
	if(CheckQuery == 'ok'){
		let commandResult = platforms[req.query.pname].barrierAction(req.query.b,req.query.action);	
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.send(commandResult);

		let authLine = '';
		if(req.query.user != undefined){authLine = ',user: '+req.query.user;}
		log.skud(req.query.pname+ ': barrier action from rest: '+req.query.pname+'.'+req.query.b+'-'+req.query.action+authLine+' Result: '+commandResult);
	} else {
		log.skud(CheckQuery);
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.send(CheckQuery);
	}	
});

app.get('/actiontest', function (req, res) {
	let data = JSON.parse(req.query.data);
	platforms[req.query.pname].actionTest(data);
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.send(data);
});

// rest для получения веса
// http://127.0.0.1:4468/getweight?pname=lab&key=key
app.get('/getweight', function (req, res) {
	let CheckQuery = checkQuery(req.query, ['pname']);
	if(CheckQuery == 'ok'){
		log.skud(req.query.pname+ ': Запрошен вес ');
		let result = {};
		//console.log(config.platforms[req.query.pname].weightTerminal);
		if((req.query.pname in config.platforms) && config.platforms[req.query.pname].weightTerminal){
			
			result.sensors = platforms[req.query.pname].getLastSensorsState();// состояние датчиков
			result.error = false;
			platforms[req.query.pname].startWeighting();
			setTimeout(function(){
				res.setHeader('Access-Control-Allow-Origin', '*');
				result.weight = platforms[req.query.pname].getLastWeight();
				if(result.weight == 'connectionError'){
					result.error = 'connectionError';
					res.send(result);
					log.skud(req.query.pname+ ': connectionError');
				} else {
					res.send(result);
					log.skud(req.query.pname+ ': отдан вес: ' + result.weight+', sensors: '+result.sensors);
				}
				
				}, 1000);
				
		} else {
			res.send('{"error": "platformNameError"}');
			log.skud(req.query.pname+ ': platformNameError');
		}	
	} else {
		log.skud(CheckQuery);
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.send(CheckQuery);
	}
});

// rest для получения значения датчиков
// http://127.0.0.1:4468/getsensors?pname=lab&key=key
app.get('/getsensors', function (req, res) {
	let CheckQuery = checkQuery(req.query, ['pname']);
	if(CheckQuery == 'ok'){
		log.skud(req.query.pname+ ': Запрошено значение датчиков ');
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.send(platforms[req.query.pname].getLastSensorsState());// состояние датчиков	
	} else {
		log.skud(CheckQuery);
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.send(CheckQuery);
	}
});

// конфиг
app.get('/config/get', function (req, res) {
	//console.log('root request');
	let CheckQuery = checkQuery(req.query, []);
	if(CheckQuery == 'ok'){
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.send(config);
	} else {
		log.skud(CheckQuery);
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.send(CheckQuery);
	}
});

// список карт
app.get('/card/getlist', function (req, res) {
	//console.log('root request');
	let CheckQuery = checkQuery(req.query, []);
	if(CheckQuery == 'ok'){
		res.setHeader('Access-Control-Allow-Origin', '*');
		let cardList = []
		cardsDb.find({}, function (err, list) {
			for(let i = 0; i < list.length; i++){
				cardList.push([list[i].id,list[i].role,list[i].status,list[i].name]);
			}
			res.send(JSON.stringify(cardList));

		});
		
	} else {
		log.skud(CheckQuery);
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.send(CheckQuery);
	}
});

//http://127.0.0.1:4468/card/add?key=key&card={"id": "079,50225","role": "regular", "state": true, "name": "M5"}
app.get('/card/add', function (req, res) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	let CheckQuery = checkQuery(req.query, ['card']);
	if(CheckQuery == 'ok'){
		addOrUpdateCard(JSON.parse(req.query.card));
		console.log(req.card);
		res.send('ok');
	} else {
		log.skud(CheckQuery);
		
		res.send(CheckQuery);
	}
});

//http://127.0.0.1:4468/card/release?key=key&card=id
app.get('/card/release', function (req, res) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	let CheckQuery = checkQuery(req.query, ['card']);
	if(CheckQuery == 'ok'){
		removeCard(req.query.card);
		console.log(req.query.card);
		res.send('ok');
	} else {
		log.skud(CheckQuery);
		
		res.send(CheckQuery);
	}
});

// сообщения на табло
// http://127.0.0.1:4468/scoreboard/send?pname=lab&sbname=sb3&message=привет&key=key
app.get('/scoreboard/send', function (req, res) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	let CheckQuery = checkQuery(req.query, ['pname','sbname','message']);
	if(CheckQuery == 'ok'){
		res.send(sendTextToScoreboard(req.query.pname, req.query.sbname, req.query.message));
		
	} else {
		log.skud(CheckQuery);
		
		res.send(CheckQuery);
	}
});

app.get('/', function (req, res) {
	//console.log('root request');
	res.sendFile(__dirname + '/index.html');
});

http.listen(config.appTCPPort, function(){
    log.app('Express server listening on port '+config.appTCPPort);
});


// проверка правильности REST запроса и авторизации
function checkQuery(query, values){
	
	for(let i=0; i < values.length; i++){
		if(values[i] in query){} else {return 'error in query params';}
	}
	
	if(('key' in query) && query.key == config.restKey){} else {return 'auth error'}
	
	return 'ok';
}
// 

// socket io
io.on('connection', function(socket){
	console.log('a web user connected');
	//io.emit('platforms', { for: 'everyone' , config: config.platforms});
	io.emit('platforms', {config: config.platforms});
  });

//======================== Отправка данных 1С
//sendCardTo1c(platform,ReaderId,serialN+','+cardN);
function sendCardTo1c(pname,reader,card){
	let requestLine = 'http://'+config.management.addr+'/event?pname='+pname+'&reader='+reader+'&id='+card;
	request(requestLine, function (error, response, body) {
						  //console.log('error:', error); // Print the error if one occurred
						  //console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
						  
						  log.skud('Отправлено в 1С: '+requestLine);
						});
	
}
// для автоматической отправки веса в 1С
function sendWeightTo1C(pname,card,weight){
	let requestLine = 'http://'+config.management.addr+'/event?pname='+pname+'&weight='+weight+'&id='+card;
	request(requestLine, function (error, response, body) {
						  //console.log('error:', error); // Print the error if one occurred
						  //console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
						  
						  log.skud('Отправлено в 1С: '+requestLine);
						});
}

function sendTextToScoreboard(pname,sbname,message){
	let sbSrv = 'http://'+config.platforms[pname].scoreBoardService.addr+':'+config.platforms[pname].scoreBoardService.port+'/tablo/settext';
	let sbJSON = {
		"dev": config.platforms[pname].devices[sbname],
		"text":message,
		"parameters": {"FontNo": "5","Align": "0","Opt": "0","Speed": "3","Color": "1","EffNo": "0","EffRep": "5","PhaseTime": "25"}
	}
	log.skud('Вывод на табло '+ sbname+' текст: '+ message);	
	request({
		url: sbSrv,
		method: "POST",
		json: true,
		headers: {
			'content-type': 'application/json',
		},
		body: sbJSON
	},function(err, result, body){
		return 'ok';			
	});
}
//if(platforms['lab'].barrierInside !== undefined){console.log(platforms['lab'].barrierInside.state);}

//console.log(platforms['weight'].connectionState());
setTimeout(function(){
		//console.log(platforms['weight'].connectionState());
		},1000);

