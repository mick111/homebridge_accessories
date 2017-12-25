/*
  {
    "accessory": "SwitchGPIO",
    "name": "Interrupteur",
    "retryCount": 10,
    "temporaryOnTimeMS": 2000,
    "onCommandValue": 1,
    "BCM_GPIO": 20
  }
*/

var Service, Characteristic;
var Gpio = require('onoff').Gpio

var RETRY_COUNT = 10;

module.exports = function(homebridge) {
    // Service and Characteristic are from hap-nodejs
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    // Register accessory
    homebridge.registerAccessory("homebridge-switch-gpio", "SwitchGPIO", SwitchGPIO);
};


function forceRead(retryCount, gpio) {
    var val;
    for (var i = 0; i < retryCount; i++) {
        val = gpio.readSync();
        if (typeof val == 'number') {
            break;
        }
    }
    return val;
}

// Accessory constructor
function SwitchGPIO(log, config) {
	this.log = log;
	this.name = config.name;
  this.log("New SwitchGPIO named " + this.name);

  // Get command configuration
  this.pinId = config.BCM_GPIO;
  this.retryCount = config.retryCount || RETRY_COUNT;
  this.temporaryOn = config.temporaryOnTimeMS;
  this.onCommandValueIsHigh = (config.onCommandValue == 0) ? 0 : 1;

  this.gpio = new Gpio(this.pinId, this.onCommandValueIsHigh ? 'low' : 'high');
  // Turn switch off
  this.gpio.writeSync(this.onCommandValueIsHigh ? 0 : 1);
}

SwitchGPIO.prototype = {
  setGPIO: function(self, switchState){
    self.onCommandPort.writeSync(self.onCommandValueIsHigh ^ (switchState ? 0 : 1));
    self.switchService.getCharacteristic(Characteristic.On).setValue(switchState);
  },
  getSwitchState: function(callback) {
    this.log("Get On State of port " + this.onCommandPort);
    var onCommand = forceRead(retryCount, this.onCommandPort);
    callback(null, onCommand == this.onCommandValueIsHigh);
  },
  setSwitchState: function(powerOn, callback) {
    // Command update
    this.setGPIO(powerOn);
    if (powerOn && this.temporaryOn != undefined) {
      setTimeout(this.setGPIO, this.temporaryOn, this, false);
    }
    callback();
  },
  // Identificator
  identify: function(callback) {
    this.log("Identify requested!");
    callback(null);
  },
  getServices: function() {
    var informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "MM Manufacturer")
      .setCharacteristic(Characteristic.Model, "MM Model")
      .setCharacteristic(Characteristic.SerialNumber, "MM SN");

    this.switchService = new Service.Switch(this.name);
    this.switchService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getSwitchState.bind(this))
        .on('set', this.setSwitchState.bind(this));
    return [informationService, this.switchService];
  }
};
