'use strict';

var mqttServer = function(config,log) {

    console.log('MQTT starting...');

var mosca = require('mosca');

var ascoltatore = {
  //using ascoltatore
  type: 'mongo',
  url: 'mongodb://localhost:27017/mqtt',
  pubsubCollection: 'ascoltatori',
  mongo: {}
};

var settings = {
  port: 1883,
  backend: ascoltatore
};

var server = new mosca.Server(settings);

server.on('clientConnected', function(client) {
    log.skud('client connected ' + client.id,1);
});

// fired when a message is received
server.on('published', function(packet, client) {
  log.skud('MQTTServer: ',1);
  log.skud(packet.payload.toString(),1);
});

server.on('ready', setup);

// fired when the mqtt server is ready
function setup() {
  log.skud('Mosca MQTT server is up and running');
}

}

module.exports = mqttServer;