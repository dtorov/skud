

var controller = function(config,log,callback) {
	
	var name = config.name;
	
	log.app('controller driver start '+config.addr+':'+config.port);
	var self = this;
	
	var crc 			= require('crc');
	var connected = false;
	var tcpSock 		= require('net');
	var tcpClient  		= new tcpSock.Socket;
	var pSocket='';
	
	var lastSensorState = '';
	
	// шлагбаумы
	self.barrierOutside = {"state": "", "waitToClose": false, "waitToCloseFromOutside": false};
	self.barrierInside = {"state": "", "waitToClose": false, "waitToCloseFromOutside": false};
	
	function tcpConnect(){			
		pSocket = tcpClient.connect(config.port,config.addr);
	}
	
	// стартуем платформу
	tcpConnect();
	
	
	
	pSocket.on("connect",function(data){
		connected = true;
		log.skud(config.name + ': platform connected');
	});
	
	pSocket.on("data", function(data){
		callback(convertData(data));
		console.log(config.name+': '+ data);
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
				result.value = state[1]+state[0]+state[2];
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
				result.value = data[9];
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
						
			log.skud('Светофор на платформе '+name + ': ' + state);
			return 'ok';
		
	}
	
	// управление шлагбаумами
	self.barrierInside.toOpen = function (time){
		if(connected){
			setTimeout(function(){
				sendMessage(':01K04L62\r');
				log.skud(config.name+': Шлагбаум 2 открыт');
				self.barrierInside.state = 'open';
				},time);			
			return 'ok';
		}
	}

	self.barrierInside.toClose = function (time){
		if(connected){
			setTimeout(function(){
				sendMessage(':01K04H03\r');
				log.skud(config.name+': Шлагбаум 2 закрыт');
				self.barrierInside.state = 'closed';
				self.barrierInside.waitToClose = false;
				self.barrierInside.waitToCloseFromOutside = false;
				},time);
			
			return 'ok';
		}
	}

	self.barrierOutside.toOpen = function (time){
		if(connected){
			setTimeout(function(){
				sendMessage(':01K02Lc8\r');
				log.skud(config.name+': Шлагбаум 1 открыт');
				self.barrierOutside.state = 'open';
				},time);
				
			return 'ok';
		}
	}

	self.barrierOutside.toClose = function (time){
		if(connected){
			setTimeout(function(){
				sendMessage(':01K02Ha9\r');
				log.skud(config.name+': Шлагбаум 1 закрыт');
				self.barrierOutside.state = 'closed';
				self.barrierOutside.waitToClose = false;
				self.barrierOutside.waitToCloseFromOutside = false;
				},time);	
			
			return 'ok';
		}
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