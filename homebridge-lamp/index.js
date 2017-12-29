/*
  {
    "accessory": "LampGPIO",
    "name": "Lampe Cuisine",
    "On_BCM_GPIO": 2,
    "On_Command_Value": 19
  }
*/

var Service, Characteristic;
var Gpio = require('onoff').Gpio

module.exports = function(homebridge) {
  // Service and Characteristic are from hap-nodejs
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  // Register accessory
  homebridge.registerAccessory("homebridge-lamp-gpio", "LampGPIO", LampGPIO);
};


// Accessory constructor
function LampGPIO(log, config) {
  this.log = log;
  this.name = config.name;
  this.log("Creation of LampGPIO named " + this.name);

  // Get On command configuration
  var onCommandPin = config["On_BCM_GPIO"];
  this.log("Lamp Command Pin: " + onCommandPin);
  var onCommandValue = config['On_Command_Value'];
  this.log("Lamp Command value: " + onCommandValue);
  this.onCommandValueIsHigh = (onCommandValue == 0) ? 0 : 1;
  this.onCommandPort = new Gpio(onCommandPin, this.onCommandValueIsHigh ? 'low' : 'high');

  // Turn light off
  this.onCommandPort.writeSync(this.onCommandValueIsHigh ? 0 : 1);
  };

  LampGPIO.prototype = {
    getPowerState: function(callback) {
      this.log("Get powerstate");
      this.log(this.onCommandPort);
      var onCommand = this.onCommandPort.readSync();
      callback(null, onCommand == this.onCommandValueIsHigh);
    },
    setPowerState: function(powerOn, callback) {
      // Command update
      this.onCommandPort.writeSync(this.onCommandValueIsHigh ^ (powerOn ? 0 : 1));
      callback();
    },
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

      this.lightbulbService = new Service.Lightbulb(this.name);
      this.lightbulbService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getPowerState.bind(this))
      .on('set', this.setPowerState.bind(this));
      /*
      this.lightbulbService
      .addCharacteristic(new Characteristic.Brightness())
      .on('get', this.getBrightness.bind(this))
      .on('set', this.setBrightness.bind(this));
      */
      return [informationService, this.lightbulbService];
    }
  };
