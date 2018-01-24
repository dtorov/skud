'use strict';

// ++++++++++ подключение внешних библиотек и функционала
// конфиг приложения
var config 			= require('./config.json');

// подключаем логгинг
var log = {};
var fs 				= require('fs');
var Datastore 		= require('nedb')
  , logDb = new Datastore({ filename: './log/log.db', autoload: true });

// debug
var debugMode = true;  

// MQTT Server start

var mqttDriver  	= require('./app/mqtt');
var mqttServer 		= new mqttDriver(config,log);

//============== REST and ...
var path            = require('path'); // модуль для парсинга пути
var request 		= require('request');
var express 		= require('express');
var app 			= express();
var http 			= require('http').Server(app);
var io 				= require('socket.io')(http);
app.use(express.static(path.join(__dirname, "public")));

// ++++++++++++ Работа с log
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
		log.skud = function (message, forDebug) {	
			if(forDebug == undefined || (forDebug && debugMode)){
			let d = new Date();
			let recordDate = ''+d.getFullYear()+''+(d.getMonth()+1)+''+d.getDate()+' '+d.getHours()+':'+d.getMinutes()+':'+d.getSeconds();
			let logLine = recordDate+' # '+message+'\n';
			
			fs.appendFile(config.skudLogFile, logLine, function (err) {
				  if (err) throw err;
				});
			
			io.emit('log',logLine);
			
			logDb.insert({"date": recordDate, "message": message}, function (err, newDoc) {   
					
				});	
			
			console.log(logLine);
			}
			
		}
		

// ------------ Работа с log

// ++++++++++++ Работа с картами 	

	// создаём объекты - карты
	var cards = {};

	// читаем карты
	var cardsDatastore 	= require('nedb')
	, cardsDb = new cardsDatastore({ filename: './db/cards.db', autoload: true });
	
	// Объект - карта
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

		self.name = function(){
			return name;
		}
		
	} 

	// load users
	cardsDb.find({}, function (err, list) {
		for(let i = 0; i < list.length; i++){
			cards[list[i].id] = new Card(list[i]);
		}
	});

	// добавлени карты или ее изменение если она существует
	function addOrUpdateCard(newCard) {
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
			return {"result": "ok"}
		} else {
			return {"result": "unknown card"}
		}
	};

// ------------ Работа с картами

// ++++++++++++ Работа с платформами
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

		// ++++++++ Реакция платформы на события внутри платформы
			function actionOnData(data){
				//  data = {
				//	"type": "", // sensor|card
				//	"value": "", // 000 - если датчики - то три символа
				//	"readerId": "" // только если карта
				//	};
				switch(data.type){
					case 'sensor':
						log.skud(pConfig.name + ': sensors: '+data.value,1);
						lastSensorsState = data.value;
						//console.log('sensor value '+data.value);
						// отправить собщение в io в канал sensors
						//io.emit('state', data);
						// ++++++++ когда машина въехала или выехала закрыть шлагбаумы
							if(lastSensorsState == '101') {
								// машина стоит на платформе
								self.setLight('0000');
								if(pDriver.barrierOutside.waitToCloseFromOutside) { pDriver.barrierOutside.toClose(15000)}
								if(pDriver.barrierInside.waitToCloseFromOutside) { pDriver.barrierInside.toClose(15000)}
							} 

							if(lastSensorsState == '111') {
								// машина выехала с платформы
								self.setLight('1001');
								if(pDriver.barrierOutside.waitToCloseFromInside) { pDriver.barrierOutside.toClose(15000)}
								if(pDriver.barrierInside.waitToCloseFromInside) { pDriver.barrierInside.toClose(15000)}
							}
						// --------- когда машина въехала или выехала закрыть шлагбаумы
					break
					case 'card':
						

						let role = 'unknown';

						if(data.value in cards){ // если карта есть базе
							role = cards[data.value].role();
							log.skud(pConfig.name + ': reader: '+data.readerId + ', card: '+data.value + ', роль: '+role+', назначена: '+cards[data.value].name());	
							} else {			
								// карты нет в базе, шлём наверх
								log.skud(pConfig.name+': reader: '+data.readerId+', неизвестная карта: ' + data.value);
								role = 'unknown';
							}
							
							if(pConfig.cardBehavior[role].sendEvent){
								sendCardTo1c(pConfig.name,data.readerId,data.value);
							}
								// action on card
							pConfig.cardBehavior[role].actions.forEach(function (singleAction, i, arr) {
								if(('r'+data.readerId) == singleAction.reader){
									doSingleAction(singleAction,data.value);
								}
							});					
					break
					case 'light':
						log.skud('data in, light', 1);
					break
					case 'button':
						log.skud('data in, button', 1);
					break
					case 'barrier':						
						log.skud('barrier data: '+ data.value,1);
					break
					default:
						log.app(pConfig.name + ': unknown data from callback : ' + data);
					break
				}
				log.skud(pConfig.name + ': ' + JSON.stringify(data,2),1);
				//io.emit('log',{for: 'everyone' , platform: pConfig.name, data: data});
				io.emit('state',{platform: pConfig.name, data: data});
			}		
		// -------- Реакция платформы на события

		// ++++++++ Реакция платформы на REST и другие внешние события события
			self.externalAction = function(data){
				// data = {
				//	"action": "letIn", // letIn/letOut - выпустить или впустить на территорию
				//
				// }
				log.skud('eternal: '+JSON.stringify(data)+' '+pConfig.externalEvents.length,1)
				pConfig.externalEvents.forEach (function (singleAction, i, arr){
					log.skud('i: '+i+' '+JSON.stringify(singleAction),1)
					if(data.action == singleAction.extaction){
						
						log.skud(pConfig.name+', внешнее действие: '+singleAction.type, 1);
						doSingleAction(singleAction);
					}
				});
			}
		// -------- Реакция платформы на REST события

		function doSingleAction	(singleAction,card){
			switch(singleAction.type){
				case 'barrier':
					if(card !== undefined){
						log.skud(pConfig.name+': шлагбаум '+singleAction.device+': '+JSON.stringify(singleAction)+', карта: '+card);
					} else {
						log.skud(pConfig.name+': шлагбаум '+singleAction.device+': '+JSON.stringify(singleAction)+', REST');
					}
					self.barrierAction(singleAction.device,singleAction.action,0,!!singleAction.waitToCloseFromInside,!!singleAction.waitToCloseFromOutside);									
				break
				case 'scoreBoard':
					if(singleAction.text == 'weight'){
						self.startWeighting();
						setTimeout(() => {
							sendTextToScoreboard(pConfig.name, singleAction.device, 'Вес: '+lastWeight);
						}, 1000);
					} else {
						sendTextToScoreboard(pConfig.name, singleAction.device, singleAction.text);
					}
					
				break
				case 'sendWeight':
					self.startWeighting();
					setTimeout(() => {
						sendWeightTo1C(pConfig.name, card, lastWeight, lastSensorsState);
					}, 1000);
				break
				case 'setLight':
					self.setLight(singleAction.state);
				break

			}
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
		
		self.barrierAction = function(barrier, action, time, waitFromInside, waitFromOutside){
			if(pConfig.devices[barrier]){
				if(pDriver.connectionState()){
					let result = '';
					let waitTime = !!time ? time : 0;
					switch (barrier){
						case 'b1':  if(action == 'switch'){
										pDriver.barrierOutside.state == 'open' ? action = 'close' : action = 'open';
									}
									if(action == 'open'){
										result = pDriver.barrierOutside.toOpen(0);
										if(result == 'ok'){ 
											pDriver.barrierOutside.waitToCloseFromOutside = !!waitFromOutside || pDriver.barrierOutside.waitToCloseFromOutside;
											pDriver.barrierOutside.waitToCloseFromInside = !!waitFromInside || pDriver.barrierOutside.waitToCloseFromInside; 
										}
									} else {result = pDriver.barrierOutside.toClose(waitTime);}
						break
						case 'b2':  if(action == 'switch'){
										pDriver.barrierInside.state == 'open' ? action = 'close' : action = 'open';
									}
									if(action == 'open'){
										result = pDriver.barrierInside.toOpen(0);
										if(result == 'ok'){ 
											pDriver.barrierInside.waitToCloseFromOutside = !!waitFromOutside || pDriver.barrierInside.waitToCloseFromOutside;
											pDriver.barrierInside.waitToCloseFromInside = !!waitFromInside || pDriver.barrierInside.waitToCloseFromInside; 
										}
									} else {result = pDriver.barrierInside.toClose(waitTime)}
						break
						default:
							result = 'barrier unknown command ';
						break
					}
					return JSON.stringify({"result": result});
					
				} else {return JSON.stringify({"result": "platformConnectionError"})}
			} else {
				return JSON.stringify({"result": "no such barrier!"});
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
		platforms[p] = new Platform(config.platforms[p]);	
	}

// ------------ Работа с платформами

// ++++++++++++ REST Интерфейсы
	// проверка статуса приложения
	app.get('/status', function (req, res) {
		let CheckQuery = checkQuery(req.query, []);
		if(CheckQuery == 'ok'){
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.send(JSON.stringify({"result": "ok"}));
		} else {
			log.skud(CheckQuery);
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.send(CheckQuery);
		}
	});

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

		// костыль
		if(req.query.pname == undefined){
			req.query.pname = 'weight';
			req.query.key = "YJuVnDXz4tEmmIQp0PnhTbbxbKC6TtA9nkTclA4B5RUVRcQHByhQB1kSrv1QJjqL";	
			req.query.b = req.query.id;		
		}

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
						result.result = 'connectionError';
						res.send(JSON.stringify(result));
						log.skud(req.query.pname+ ': connectionError');
					} else {
						result.result = 'ok';
						res.send(JSON.stringify(result));
						log.skud(req.query.pname+ ': отдан вес: ' + result.weight+', sensors: '+result.sensors);
					}
					
					}, 1000);
					
			} else {
				res.send(JSON.stringify({"result": "error", "error": "platformNameError"}));
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
			let reply = {
				"result": "ok",
				"sensors": platforms[req.query.pname].getLastSensorsState()
			}
			res.send(JSON.stringify(reply));// состояние датчиков	
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
				let reply = {
					"result": "ok",
					"cardlist": cardList
				}
				res.send(JSON.stringify(reply));

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
			let reply = {
				"result": "ok"
			}
			res.send(JSON.stringify(reply));
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
			res.send(JSON.stringify(removeCard(req.query.card)));
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
			res.send(JSON.stringify(sendTextToScoreboard(req.query.pname, req.query.sbname, req.query.message)));
			
		} else {
			log.skud(CheckQuery);
			
			res.send(CheckQuery);
		}
	});

	app.get('/event', function (req, res) {
		//console.log('root request');

		// КОстыль, обработка старых запров
		if(req.query.checkpoint != undefined){
			req.query.pname = req.query.checkpoint;
			req.query.key = "YJuVnDXz4tEmmIQp0PnhTbbxbKC6TtA9nkTclA4B5RUVRcQHByhQB1kSrv1QJjqL";
			if(req.query.direction == 'in'){
				req.query.data = JSON.stringify({"action": "letIn"})
			} else {
				req.query.data = JSON.stringify({"action": "letOut"})
			}
			log.skud('V1 action: '+ JSON.stringify(req.query),1);
		}

		let CheckQuery = checkQuery(req.query, ['pname', 'data']);
		//let CheckQuery = 'ok';
		if(CheckQuery == 'ok'){
			platforms[req.query.pname].externalAction(JSON.parse(req.query.data));
			res.setHeader('Access-Control-Allow-Origin', '*');
			let reply = {
				"result": "ok"
			}
			res.send(JSON.stringify(reply));
		} else {
			log.skud(CheckQuery);
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.send(CheckQuery);
		}
	});

	// для тестирования actions

	app.get('/actiontest1', function (req, res) {
		let data = JSON.parse(req.query.data);
		platforms[req.query.pname].actionTest(data);
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.send(data);
	});

	app.get('/actiontest', function (req, res) {
		//console.log('root request');
		//let CheckQuery = checkQuery(req.query, ['pname', 'data']);
		let CheckQuery = 'ok';
		if(CheckQuery == 'ok'){
			platforms[req.query.pname].actionTest(JSON.parse(req.query.data));
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.send('ok');
		} else {
			log.skud(CheckQuery);
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.send(CheckQuery);
		}
	});

	// включение/отключение отладки
	app.get('/debug', function (req, res) {
		//console.log('root request');
		//let CheckQuery = checkQuery(req.query, ['pname', 'data']);
		let CheckQuery = 'ok';
		res.setHeader('Access-Control-Allow-Origin', '*');
		if(CheckQuery == 'ok'){
			if(debugMode){
				res.send('now debug OFF');
				debugMode = false;
				log.skud('debug is OFF');
			} else {
				res.send('now debug ON');
				debugMode = true;
				log.skud('debug is ON');
			}		
		} else {
			log.skud(CheckQuery);
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.send(CheckQuery);
		}
	});

// ------------ REST Интерфейсы

app.get('/', function (req, res) {
	//console.log('root request');
	res.sendFile(__dirname + '/index.html');
});

http.listen(config.appTCPPort, function(){
    log.app('Express server listening on port '+config.appTCPPort);
});


// ++++++++++++ проверка правильности REST запроса и авторизации
	function checkQuery(query, values){
		
		for(let i=0; i < values.length; i++){
			if(values[i] in query){} else {
				log.skud('REST error in query params: '+JSON.stringify(query));
				return JSON.stringify({"result": "error in query params"});
			}
		}
		
		if(('key' in query) && query.key == config.restKey){} else {	
			log.skud('REST auth errors: '+JSON.stringify(query));
			return JSON.stringify({"result": "auth error"});
		}
		return 'ok';
	}
// ------------ проверка правильности REST запроса и авторизации

// socket io
	io.on('connection', function(socket){
		log.skud('web user connected',1);
		//io.emit('platforms', { for: 'everyone' , config: config.platforms});
		io.emit('platforms', {config: config.platforms});
	});

// ++++++++++++ Отправка данных в 1С
	//sendCardTo1c(platform,ReaderId,serialN+','+cardN);
	function sendCardTo1c(pname,reader,card){
		let requestLine = 'http://'+config.management.addr+'/event?pname='+pname+'&reader='+reader+'&id='+card;
		request(requestLine, function (error, response, body) {
							//console.log('error:', error); // Print the error if one occurred
							//console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
							
							log.skud('Отправлено в 1С: '+requestLine,1);
							});
		V1sendCardTo1c(pname,reader,card);
	}
	// для автоматической отправки веса в 1С
	function sendWeightTo1C(pname,card,weight,sensors){
		let requestLine = 'http://'+config.management.addr+'/event?pname='+pname+'&weight='+weight+'&id='+card+'&sensors='+sensors;
		request(requestLine, function (error, response, body) {
							//console.log('error:', error); // Print the error if one occurred
							//console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
							
							log.skud(pname+': отправлен вес: '+weight+', карта: '+card+', датчики: '+sensors);
							log.skud(pname+': '+requestLine,1);
							});
		V1sendWeightTo1C(card,weight)
	}

// ------------ Отправка данных в 1С
	
// ++++++++++++ Табло
	function sendTextToScoreboard(pname,sbname,message){
		let sbSrv = 'http://'+config.platforms[pname].scoreBoardService.addr+':'+config.platforms[pname].scoreBoardService.port+'/tablo/settext';
		let sbJSON = {
			"dev": config.platforms[pname].devices[sbname],
			"text":message,
			"parameters": {"FontNo": "5","Align": "0","Opt": "0","Speed": "3","Color": "1","EffNo": "0","EffRep": "5","PhaseTime": "25"}
		}
		log.skud(pname + ': Вывод на табло '+ sbname+' текст: '+ message);	
		request({
			url: sbSrv,
			method: "POST",
			json: true,
			headers: {
				'content-type': 'application/json',
			},
			body: sbJSON
		},function(err, result, body){
			return {"result": "ok"};			
		});
	}

// ------------ Табло


setTimeout(function(){
		//console.log(platforms['weight'].connectionState());
		},1000);


// заглушки для тестирования
//======================== Отправка данных 1С
//sendCardTo1c(platform,ReaderId,serialN+','+cardN);
	function V1sendCardTo1c(point,reader,card){
		let requestLine = 'http://192.168.1.109/niva_elevator/hs/rav_nais/event?reader='+V1getReaderIdFor1C(point,reader)+'&id='+card.split(',')[1];
		request(requestLine, function (error, response, body) {
							//console.log('error:', error); // Print the error if one occurred
							//console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
							
							log.skud('V1 Отправлено в 1С: '+requestLine,1);
							});
		
	}
// для автоматической отправки веса в 1С
	function V1sendWeightTo1C(card,weight){
		let requestLine = 'http://192.168.1.109/niva_elevator/hs/rav_nais/event?weight='+weight+'&id='+card.split(',')[1];
		request(requestLine, function (error, response, body) {
							//console.log('error:', error); // Print the error if one occurred
							//console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
							
							log.skud('V1 Отправлено в 1С: '+requestLine,1);
							});
	}

// === отпределение номера считывателя для 1С
	function V1getReaderIdFor1C(point, id){
		let idFor1C = 0;
		switch(point){
			case 'lab': 
				if(id == '1'){idFor1C = 2;}
				if(id == '2'){idFor1C = 1;}
			break
			case 'weight': 
				if(id == '1'){idFor1C = 4;}
				if(id == '2'){idFor1C = 5;}
				if(id == '2'){idFor1C = 6;}
				if(id == '3'){idFor1C = 7;}			
			break
		}
		return idFor1C;
	};