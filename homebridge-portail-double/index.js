/*
  {
    "accessory": "PortailDouble",
    "name": "Portail",
    "retryCount": 10,

    "GrandeOuverture_BCM_GPIO": 2,
    "GrandeOuverture_temporaryOnTimeMS": 2000,
    "GrandeOuverture_onCommandValue": 1,

    "OuverturePieton_BCM_GPIO": 3,
    "OuverturePieton_temporaryOnTimeMS": 2000,
    "OuverturePieton_onCommandValue": 1,

    "Contact_BCM_GPIO": 20,
    "Contact_holdoffMS" : 1000,
    "Contact_closedGpioValue": 1
  }
*/

var Service;
var Characteristic;
var HomebridgeAPI;
var Gpio = require('onoff').Gpio;
var inherits = require('util').inherits;
var exec = require('child_process').exec;

var RETRY_COUNT = 10;
var HOLDOFF_MS = 1000;

module.exports = function(homebridge) {
    // Service and Characteristic are from hap-nodejs
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    HomebridgeAPI = homebridge;

    // Register accessory
    homebridge.registerAccessory("homebridge-portail-double", "PortailDouble", PortailDouble);
};

// Accessory constructor
function PortailDouble(log, config) {
	this.log = log;
	this.name = config.name;
  this.log("New PortailDouble named " + this.name);

  // Get configuration
  this.retryCount = config.retryCount || RETRY_COUNT;

  this.GrandeOuverture_BCM_GPIO = config.GrandeOuverture_BCM_GPIO;
  this.GrandeOuverture_temporaryOnTimeMS = config.GrandeOuverture_temporaryOnTimeMS;
  this.GrandeOuverture_onCommandValue = config.GrandeOuverture_onCommandValue;

  this.OuverturePieton_BCM_GPIO = config.OuverturePieton_BCM_GPIO;
  this.OuverturePieton_temporaryOnTimeMS = config.OuverturePieton_temporaryOnTimeMS;
  this.OuverturePieton_onCommandValue = config.OuverturePieton_onCommandValue;

  this.Contact_BCM_GPIO = config.Contact_BCM_GPIO;
  if (typeof config.Contact_holdoffMS == 'number') {
      this.Contact_holdoffMS = config.Contact_holdoffMS;
  } else {
      this.Contact_holdoffMS = 1000;
  }
  if (typeof config.Contact_closedGpioValue == 'number') {
      this.Contact_closedGpioValue = config.Contact_closedGpioValue;
  } else {
      this.Contact_closedGpioValue = 1;
  }
  exec('gpio -g mode ' + this.Contact_BCM_GPIO + ' up', function (error, stdout, stderr) {
       if (error !== null) {
       log('exec error: ' + error);
       }
  });
  this.Contact_gpio = new Gpio(this.Contact_BCM_GPIO, 'in', 'both');
  this.Contact_updateValue();

  this.GarageDoor_lastTargetDoorRequest = (this.toCurrentDoorState() == Characteristic.CurrentDoorState.CLOSED) ?
    Characteristic.TargetDoorState.CLOSED :
    Characteristic.TargetDoorState.OPEN

  this.Contact_changesCounter = 0;
  // Watch any contact changes events
  this.Contact_gpio.watch((function(err, value) {
    // To prevent glitches, we make delayed calls to Contact_processGPIOWatch
    // with caller identifier (based on timestamp)
    // If a change has been observed before scheduled this.Contact_processGPIOWatch has been invoked
    // the scheduled this.Contact_processGPIOWatch will be invalidated.
    this.Contact_lastCallerIdentifier = Date.now();
    this.log("Change detected to " + value + " invoking in " + this.Contact_holdoffMS + "ms processChange with " + this.Contact_lastCallerIdentifier);
    setTimeout(this.Contact_processGPIOWatch.bind(this), this.Contact_holdoffMS, this.Contact_lastCallerIdentifier);
  }).bind(this));

  this.GrandeOuverture_onCommandValueIsHigh = (config.GrandeOuverture_onCommandValue == 0) ? 0 : 1;
  this.GrandeOuverture_gpio = new Gpio(config.GrandeOuverture_BCM_GPIO, this.GrandeOuverture_onCommandValueIsHigh ? 'low' : 'high');

  this.OuverturePieton_onCommandValueIsHigh = (config.OuverturePieton_onCommandValue == 0) ? 0 : 1;
  this.OuverturePieton_gpio = new Gpio(config.OuverturePieton_BCM_GPIO, this.OuverturePieton_onCommandValueIsHigh ? 'low' : 'high');

  // Turn switches off
  this.setGrandeOuverture_GPIO(false);
  this.setOuverturePieton_GPIO(false);

  // To release the GPIOs when exiting
  process.on('SIGINT', this.unexportAll.bind(this));
}

SwitchGPIO.prototype = {
  unexportAll: function () {
      this.Contact_gpio.unexport();
      this.GrandeOuverture_gpio.unexport();
      this.OuverturePieton_gpio.unexport();
  },
  forceRead: function(gpio) {
      var val;
      for (var i = 0; i < this.retryCount; i++) {
          val = gpio.readSync();
          if (typeof val == 'number') {
              break;
          }
      }
      return val;
  },
  toCurrentDoorState: function() {
    return (this.Contact_currentGpioValue === this.Contact_closedGpioValue) ?
         Characteristic.CurrentDoorState.CLOSED :
         Characteristic.CurrentDoorState.OPEN;
  },

  // Identificator
  identify: function(callback) {
    this.log("Identifcation requested!");
    callback(null);
  },

  setGPIOs: function(switchState) {
    this.setGrandeOuverture_GPIO(switchState);
    this.setOuverturePieton_GPIO(switchState);
  },

  setGrandeOuverture_GPIO: function(switchState) {
    this.GrandeOuverture_gpio.writeSync(this.GrandeOuverture_onCommandValueIsHigh ^ (switchState ? 0 : 1));
  },
  getGrandeOuverture_SwitchState: function(callback) {
    var onCommand = this.forceRead(this.GrandeOuverture_gpio);
    callback(null, onCommand == this.GrandeOuverture_onCommandValueIsHigh);
  },
  setGrandeOuverture_SwitchState: function(powerOn, callback) {
    // Command update
    this.setGrandeOuverture_GPIO(powerOn);
    if (powerOn && (this.GrandeOuverture_temporaryOnTimeMS != undefined)) {
      var c = this.GrandeOuverture_SwitchService.getCharacteristic(Characteristic.On);
      setTimeout(c.setValue.bind(c, false), this.GrandeOuverture_temporaryOnTimeMS);
    }
    callback();
  },

  setOuverturePieton_GPIO: function(switchState) {
    this.OuverturePieton_gpio.writeSync(this.OuverturePieton_onCommandValueIsHigh ^ (switchState ? 0 : 1));
  },
  getOuverturePieton_SwitchState: function(callback) {
    var onCommand = this.forceRead(this.OuverturePieton_gpio);
    callback(null, onCommand == this.OuverturePieton_onCommandValueIsHigh);
  },
  setOuverturePieton_SwitchState: function(powerOn, callback) {
    // Command update
    this.setOuverturePieton_GPIO(powerOn);
    if (powerOn && (this.OuverturePieton_temporaryOnTimeMS != undefined)) {
      var c = this.OuverturePieton_SwitchService.getCharacteristic(Characteristic.On);
      setTimeout(c.setValue.bind(c, false), this.OuverturePieton_temporaryOnTimeMS);
    }
    callback();
  },

  Contact_updateValue = function() {
    this.Contact_currentGpioValue = this.forceRead(this.Contact_gpio);
  }
  Contact_processGPIOWatch = function(callerIdentifier) {
      if (this.Contact_lastCallerIdentifier != callerIdentifier) {
        // Ignore if it is not the last caller identifier
        this.log("Ignoring because " + callerIdentifier + " is not the last caller identifier " + this.Contact_lastCallerIdentifier);
        return;
      }

      // Readback GPIO value, to see if there is actually some changes
      gpioValue = this.forceRead(this.Contact_gpio);
      if (gpioValue == this.Contact_currentGpioValue) {
        // Ok, we consider that it was nothing
        this.log("Ignoring because " + gpioValue + " does not differ from last value " + this.Contact_currentGpioValue);
        return;
      }

      // Change to be considered
      this.Contact_changesCounter++;
      this.Contact_currentGpioValue = gpioValue;
      this.log('Changes counter ' + this.Contact_changesCounter);
      this.GarageDoorOpenerService.getCharacteristic(Characteristic.CurrentDoorState)
        .setValue(this.toCurrentDoorState());
      // self.service.getCharacteristic(self.characteristic_times_opened)
      //      .setValue(Math.floor(self.changesCounter/2));
      // self.service.getCharacteristic(Characteristic.ContactSensorState)
      //
  },

  // Characteristic.CurrentDoorState.OPEN = 0;
  // Characteristic.CurrentDoorState.CLOSED = 1;
  // Characteristic.CurrentDoorState.OPENING = 2;
  // Characteristic.CurrentDoorState.CLOSING = 3;
  // Characteristic.CurrentDoorState.STOPPED = 4;
  getCurrentDoorState: function(callback) {
    // Update the current GPIO value
    this.Contact_updateValue();
    return callback(null, this.toCurrentDoorState());
  },

  // Characteristic.TargetDoorState.OPEN = 0;
  // Characteristic.TargetDoorState.CLOSED = 1;
  setTargetDoorState: function(targetState, callback) {
    // Update the current GPIO value
    this.Contact_updateValue();

    if ((this.toCurrentDoorState() == Characteristic.CurrentDoorState.OPEN) &&
        (targetState == Characteristic.TargetDoorState.CLOSED)) {
      this.GrandeOuverture_SwitchService.getCharacteristic(Characteristic.On)
        .setValue(true);
      // Maybe check in 1 minute that it has been obstructed.
    }
    if ((this.toCurrentDoorState() == Characteristic.CurrentDoorState.CLOSED) &&
        (targetState == Characteristic.TargetDoorState.OPEN)) {
      this.GrandeOuverture_SwitchService.getCharacteristic(Characteristic.On)
        .setValue(true);
    }
    this.GarageDoor_lastTargetDoorRequest = targetState;
    return callback(null);
  },
  getTargetDoorState: function(callback) {
    return callback(null, this.GarageDoor_lastTargetDoorRequest);
  },

  getServices: function() {
    var informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "MM Manufacturer")
      .setCharacteristic(Characteristic.Model, "MM Model")
      .setCharacteristic(Characteristic.SerialNumber, "MM SN");

    this.GarageDoorOpenerService = new Service.GarageDoorOpener("Portail");
    // Required Characteristics
        // Characteristic.CurrentDoorState : [READ]
        // Characteristic.ObstructionDetected : [READ]
        // Characteristic.TargetDoorState : [READ / WRITE]

    this.GarageDoorOpenerService
        .getCharacteristic(Characteristic.CurrentDoorState)
        .on('get', this.getCurrentDoorState.bind(this));
    this.GarageDoorOpenerService
        .getCharacteristic(Characteristic.ObstructionDetected)
        .on('get', function(callback) { return callback(null, false); });
    this.GarageDoorOpenerService
        .getCharacteristic(Characteristic.TargetDoorState)
        .on('get', this.getTargetDoorState.bind(this))
        .on('set', this.setTargetDoorState.bind(this));

    this.GrandeOuverture_SwitchService = new Service.Switch("Grande Ouverture");
    this.GrandeOuverture_SwitchService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getGrandeOuverture_SwitchState.bind(this))
        .on('set', this.setGrandeOuverture_SwitchState.bind(this));

    this.OuverturePieton_SwitchService = new Service.Switch("Ouverture Piéton");
    this.OuverturePieton_SwitchService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getOuverturePieton_SwitchState.bind(this))
        .on('set', this.setOuverturePieton_SwitchState.bind(this));
    return [informationService,
      this.GrandeOuverture_SwitchService,
      this.OuverturePieton_SwitchService,
      this.GarageDoorOpenerService];
  }
};