
var weightTerminal = function(config,log,callback) {
	
	log.skud(': weightTerminal driver start ');
	var self = this;
	
	var connected = false;
	var tcpSock 		= require('net');
	var tcpClient  		= new tcpSock.Socket;
	var tSocket='';
	var lastWeight = '';
	
	function tcpConnect(){				
		tSocket = tcpClient.connect(config.port,config.addr);		
	}
	
	// стартуем весы
	tcpConnect();
	
	sendMessage = function(message){
		tSocket.write(message);
	}
	
	self.startWeighting = function(){
		if(connected){
			sendMessage('GW\n');
		} else {
			callback('connectionError');
		}
	}
	
	self.getWeight = function(){
		return lastWeight;
	}
	
	tSocket.on("connect",function(data){
		connected = true;
		log.skud('weightTerminal '+config.addr+' connected');
	});
	
	tSocket.on("data", function(data){
    //actionOnData('weight',data);
		lastWeight = data.slice(4);
		callback(lastWeight.toString('utf8'));
	});

	tSocket.on('error', function(er) {
	  log.skud('weightTerminal connection error: ' + er);
	  callback('connectionError');
	  connected = false;
	  setTimeout(function(){
			tcpConnect();
		}, 10000);
	});
	
	
}

module.exports = weightTerminal;