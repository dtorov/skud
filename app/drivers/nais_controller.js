'use strict';

var controller = function(config,log,callback) {
	
	var self = this;

	log.app('controller driver start '+config.addr+':'+config.port);

	var crc 			= require('crc');	
	var tcpSock 		= require('net');
	var tcpClient  		= new tcpSock.Socket;
	var pSocket='';
	
	var connected = false;
	var lastSensorState = '111';
	var name = config.name;

	// шлагбаумы
	self.barrierOutside = {"state": "", "waitToCloseFromInside": false, "waitToCloseFromOutside": false};
	self.barrierInside = {"state": "", "waitToCloseFromInside": false, "waitToCloseFromOutside": false};
	
	function tcpConnect(){			
		pSocket = tcpClient.connect(config.port,config.addr);
	}
	
	// стартуем платформу
	tcpConnect();
		
	pSocket.on("connect",function(data){
		connected = true;
		log.skud(config.name + ': платформа подключена');
	});
	
	pSocket.on("data", function(data){
		callback(convertData(data));
		log.skud(config.name+': '+ data,1);
	});
	
	pSocket.on("error", function(err){    
		log.skud(config.name + ': platform connection error: '+err);
		connected = false;
		  setTimeout(function(){
				tcpConnect();
			}, 10000);
	});
	
	function sendMessage(message){
		
		pSocket.write(message);
		
	}	
	
	// 
	function convertData(data){
		let result = {
			"type": "", // sensor|card
			"value": "", // 000 - если датчики - то три символа
			"readerId": "" // только если карта
			};
			
		data = ''+data;
		
		switch (data[3]){
			case 's':
			case 'S': // пришло регулярное обновление значения датчиков
				let state = '';
				state = Number(data[5]).toString(2);
				if(state.length <2){
					state = '00' + state;
					} else {if(state.length < 3){state = '0' + state;}}
				result.type = 'sensor';
				result.value = ''+state[2]+state[0]+state[1];
				lastSensorState = result.value;	
			break;			
			case 'W': // пришла метка
				let serialN = ''+parseInt(data[12]+data[13], 16);
				if(serialN.length == 2) {serialN = '0' + serialN;}
				let cardN = ''+parseInt(data[10]+data[11]+data[8]+data[9], 16);
				if(cardN.length == 4) {cardN = '0' + cardN;}
				let ReaderId = ''+data[4]+data[5]+data[6]+data[7];
				result.type = 'card';
				result.value = serialN+','+cardN;
				result.readerId = getReaderId(ReaderId);
				
			break;
			case 'R':
			// светофоры
				result.type = 'light';
				
			break
			case 'K':		
			// шлагбаумы
				result.type = 'barrier';
				//result.value = data[9];
				switch(data[9]){
					case 'F':
					result.value = 'barrier closed';
					break
					case '7':
					result.value = 'barrier opened';
					break
				}
			break
			default:
				result.type = 'unknown';
			break
		}
		return result;
	}
	

	
	self.connectionState = function (){
		return connected;
	}
	
	self.getSensorsState = function (){
		return lastSensorState;
	}
	
	
	// управление светофорами - четыре сивола 0 или 1
	self.setLight = function (state){
		
			function getState(st){
				if(st == '1'){return 'H';} else {return 'L';}
			}
			let commandLine = '';
			// state - четыре символа, 1 - зелёный, 0 - красный по порядку датчиков. 
			if(config.devices.tl1){
				commandLine = ':01R01'+getState(state[0])+getCRC(':01R01'+getState(state[0]))+'\r';
				sendMessage(commandLine);
			}
			if(config.devices.tl2){
				commandLine = ':01R02'+getState(state[1])+getCRC(':01R02'+getState(state[1]))+'\r';
				sendMessage(commandLine);
			}
			if(config.devices.tl3){
				commandLine = ':01R03'+getState(state[2])+getCRC(':01R03'+getState(state[2]))+'\r';
				sendMessage(commandLine);
			}
			if(config.devices.tl4){
				commandLine = ':01R04'+getState(state[3])+getCRC(':01R04'+getState(state[3]))+'\r';
				sendMessage(commandLine);
			}
						
			log.skud(config.name+': светофоры : ' + state,1);
			return JSON.stringify({"result": "ok"});
		
	}
	
	// управление шлагбаумами
	self.barrierInside.toOpen = function (time){
		if(connected){
			setTimeout(function(){
				sendMessage(':01K04L62\r');
				log.skud(config.name+': шлагбаум 2 открыт');
				self.barrierInside.state = 'open';
				},time);			
			return 'ok';
		} else {return 'error'}
	}

	self.barrierInside.toClose = function (time){
		if(connected){
			setTimeout(function(){
				if(lastSensorState[2] == '1'){
					sendMessage(':01K04H03\r');
					log.skud(config.name+': шлагбаум 2 закрыт');
					self.barrierInside.state = 'closed';
					self.barrierInside.waitToCloseFromInside = false;
					self.barrierInside.waitToCloseFromOutside = false;
				} else {log.skud(config.name+': шлагбаум 2 НЕ закрыт, т.к. нарушен периметр');}
				},time);
			
			return 'ok';
		} else {return 'error'}
	}

	self.barrierOutside.toOpen = function (time){
		if(connected){
			setTimeout(function(){
				sendMessage(':01K02Lc8\r');
				log.skud(config.name+': шлагбаум 1 открыт');
				self.barrierOutside.state = 'open';
				},time);
				
			return 'ok';
		} else {return 'error'}
	}

	self.barrierOutside.toClose = function (time){
		if(connected){		
			setTimeout(function(){
				if(lastSensorState[0] == '1'){
					sendMessage(':01K02Ha9\r');
					log.skud(config.name+': шлагбаум 1 закрыт');
					self.barrierOutside.state = 'closed';
					self.barrierOutside.waitToCloseFromInside = false;
					self.barrierOutside.waitToCloseFromOutside = false;
				} else {log.skud(config.name+': шлагбаум 1 НЕ закрыт, т.к. нарушен периметр');}
				},time);	
			
			return 'ok';
		} else {return 'error'}
	}
	// вспомогательные функции
	function getReaderId(id) {
		let n = '';
		switch(id){
			case '0101': n = '1'; break;
			case '0201': n = '2'; break;
			case '0301': n = '3'; break;
		}	
		return n;
	}
	
	// === расчет контрольной суммы для контроллера наис
	function getCRC(line){
		let crcL = crc.crc81wire(line).toString(16);
		if(crcL.length == 1){return '0'+crcL;} else {return crcL;}
	}
	
	self.barrierOutside.toClose(100);
	self.barrierInside.toClose(200);
	
	
	
}

module.exports = controller;