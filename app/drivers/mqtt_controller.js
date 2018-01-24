'use strict';

var controller = function(config,log,callback) {

    var self = this;

    log.skud('MQTT controller driver start '+config.addr+':'+config.port, 1);

    var mqtt = require('mqtt')
    var client  = mqtt.connect({ host: config.addr, port: config.port })
    
    var topicName = '/dev/'+config.name;

    var lastMessageTime = Math.round(new Date().getTime() / 1000);
    var pingTime = 10000;

    client.on('connect', function () {
        client.subscribe(topicName)
      })
      
    client.on('message', function (topic, message) {
        // message is Buffer

        let messageIsJson = IsJsonString(message.toString());

        log.skud('MQTT: topic: '+topic +', message: '+ message.toString(),1);
        // проверить что за сообщение
        if(messageIsJson){
            if(JSON.parse(message.toString()).from == 'device'){
            lastMessageTime = Math.round(new Date().getTime() / 1000);
            callback(convertData(JSON.parse(message.toString())));
            }
        }
        
        //client.end()
      })

    var connected = true;
	var lastSensorState = '111';
	var name = config.name;

    // проверка на онлайн
    setInterval( function(){
        
        if((Math.round(new Date().getTime() / 1000) - lastMessageTime) >= pingTime/1000){
            if(connected) {log.skud(config.name + ': connection timeout')}
            connected = false
        } else {
            if(!connected) {log.skud(config.name + ': платформа подключена')}
            connected = true
        }
    }, pingTime);

	// шлагбаумы
	self.barrierOutside = {"state": "", "waitToCloseFromInside": false, "waitToCloseFromOutside": false};
    self.barrierInside = {"state": "", "waitToCloseFromInside": false, "waitToCloseFromOutside": false};
    
    // отправить сообщение на устройство - записать в топик
    function sendMessage(message){
        
        
		client.publish(topicName, JSON.stringify(message));
		
	}

    // подготовка данных для сервера
    function convertData(data){
        
        switch (data.type) {
            case 'sensor':
                lastSensorState = data.value;
                break;
            
            case 'card':
                // convert card
                
                break;
            
            default:
                break;
        }
        
        return data;
    }

    self.connectionState = function (){
		return connected;
	}
	
	self.getSensorsState = function (){
		return lastSensorState;
	}
	
	
	// управление светофорами - четыре сивола 0 или 1
	self.setLight = function (state){
        sendMessage({
            "from": 'server',
            "type": 'light',
            "state": state
        })
    }

    // управление шлагбаумами
	self.barrierInside.toOpen = function (time){
		if(connected){
			setTimeout(function(){
				sendMessage({
                    "from": 'server',
                    "type": 'barrier',
                    "device": 'b2',
                    "action": 'open'
                });
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
					sendMessage({
                        "from": 'server',
                        "type": 'barrier',
                        "device": 'b2',
                        "action": 'close'
                    });
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
				sendMessage({
                    "from": 'server',
                    "type": 'barrier',
                    "device": 'b1',
                    "action": 'open'
                });
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
					sendMessage({
                        "from": 'server',
                        "type": 'barrier',
                        "device": 'b1',
                        "action": 'close'
                    });
					log.skud(config.name+': шлагбаум 1 закрыт');
					self.barrierOutside.state = 'closed';
					self.barrierOutside.waitToCloseFromInside = false;
					self.barrierOutside.waitToCloseFromOutside = false;
				} else {log.skud(config.name+': шлагбаум 1 НЕ закрыт, т.к. нарушен периметр');}
				},time);	
			
			return 'ok';
		} else {return 'error'}
	}

    self.barrierOutside.toClose(100);
    self.barrierInside.toClose(200);
    
    // вспомогательные функции
    function IsJsonString(str) {
        try {
            JSON.parse(str);
        } catch (e) {
            return false;
        }
        return true;
    }

}

module.exports = controller;