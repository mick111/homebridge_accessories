/*
{
    "bridge": {
        "name": "HomeBridge",
        "username": "CC:22:3D:E3:CE:30",
        "port": 51826,
        "pin": "031-45-154"
    },

    "description": "",

    "accessories": [
        {
            "accessory": "Thermostat-DS18B20-GPIO",
            "name": "Thermostat Bedroom",
            "DS18B20": "28-0000063f4ead",
            "Heat_BCM_GPIO": 14,
            "Heat_Command_Value": 1,
            "minHeatingValue": 15,
            "maxHeatingValue": 23,
            "startHeatingValue": 20,
            "startHeatingState": "AUTO",
            "removeForceHeating": true,
            "removeForceCooling": true
        }
      ],

      "platforms": []
}

*/

var Service, Characteristic;
var ds18b20 = require('ds18b20');
var Gpio = require('onoff').Gpio

module.exports = function(homebridge) {
  // Service and Characteristic are from hap-nodejs
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  // Register accessory
  homebridge.registerAccessory("homebridge-thermostat-ds18b20-gpio", "Thermostat-DS18B20-GPIO", Thermostat);
};

// Accessory constructor
function Thermostat(log, config) {
  this.log = log;
  this.name = config.name;
  this.log("Creation of Thermostat named " + this.name);

  // Get thermometer sensor configuration
  this.ds18b20_device = config["DS18B20"];

  // Minimum heating value
  var minHeatingValue = config["minHeatingValue"];
  if (minHeatingValue) {
    this.minHeatingValue = minHeatingValue;
  } else {
    this.minHeatingValue = 10;
  }

  // Maximum heating value
  var maxHeatingValue = config["maxHeatingValue"];
  if (maxHeatingValue) {
    this.maxHeatingValue = maxHeatingValue;
  } else {
    this.maxHeatingValue = 30;
  }

  this.removeForceHeating = config.removeForceHeating;
  this.removeForceCooling = config.removeForceCooling;

  // Get Heat command configuration
  var heatCommandPin = config["Heat_BCM_GPIO"];
  this.log("Heat Command Pin: " + heatCommandPin);
  if (heatCommandPin) {
    var heatCommandValue = config['Heat_Command_Value'];
    this.log("Heat command value: " + heatCommandValue);
    this.heatCommandPort = new Gpio(heatCommandPin, 'out');
    this.heatCommandValueIsHigh = (heatCommandValue == 0) ? 0 : 1;
    // Turn heat off
    this.heatCommandPort.writeSync(this.heatCommandValueIsHigh ? 0 : 1);
  }

  //Characteristic.TemperatureDisplayUnits.CELSIUS = 0;
  //Characteristic.TemperatureDisplayUnits.FAHRENHEIT = 1;
  this.temperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS;
   
  this.temperature = 19;
  this.temperatureError = null;
  // The value property of CurrentHeatingCoolingState must be one of the following:
  //Characteristic.CurrentHeatingCoolingState.OFF = 0;
  //Characteristic.CurrentHeatingCoolingState.HEAT = 1;
  //Characteristic.CurrentHeatingCoolingState.COOL = 2;
  this.heatingCoolingState = Characteristic.CurrentHeatingCoolingState.OFF;
  this.targetTemperature = config.startHeatingValue || 20;
  this.heatingThreshold = 2;
  // The value property of TargetHeatingCoolingState must be one of the following:
  //Characteristic.TargetHeatingCoolingState.OFF = 0;
  //Characteristic.TargetHeatingCoolingState.HEAT = 1;
  //Characteristic.TargetHeatingCoolingState.COOL = 2;
  //Characteristic.TargetHeatingCoolingState.AUTO = 3;
  var startHeatingState = config.startHeatingState || "AUTO";
  this.targetHeatingCoolingState =
     startHeatingState == "AUTO" ?
          Characteristic.TargetHeatingCoolingState.AUTO :
          Characteristic.TargetHeatingCoolingState.OFF;

  // Temperature pooling
  this.temperaturePooling = config['temperaturePooling'];
  // Heating state pooling
  this.heatingCoolingStatePooling = config['heatingCoolingStatePooling'];

  // Update the temperature, indefinitely
  this.updateTemperature(this);
  // Update the heating state, indefinitely
  this.updateHeatingCoolingState(this);

  this.thermostatService = null;

  // To add hysteresis on commands
  this.isAutoHeating = false;
};

Thermostat.prototype = {
  updateTemperature: function(self) {
    // Read from device
    ds18b20.temperature(self.ds18b20_device, function(err, value) {
      // Program another read
      setTimeout(self.updateTemperature, self.temperaturePooling, self);

      self.temperatureError = err;
      if (err != null) {
        // Error during getting temperature
        self.log("Error while getting temperature", err);
        return;
      }
      // Update temperature
      self.temperature = value;
      // Update the Characteristic
      if (self.thermostatService) {
        self.thermostatService.getCharacteristic(Characteristic.CurrentTemperature)
        .setValue(value);
      }
    });
  },
  updateHeatingCoolingState: function(self) {
    // Read from device
    var heatCommand = self.heatCommandPort.readSync();
    // Update temperature
    self.heatingCoolingState = (heatCommand == self.heatCommandValueIsHigh) ? Characteristic.TargetHeatingCoolingState.HEAT : Characteristic.TargetHeatingCoolingState.OFF;
    // Update the Characteristic
    if (self.thermostatService) {
      self.thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .setValue(self.heatingCoolingState);
    }
    setTimeout(self.updateHeatingCoolingState, self.heatingCoolingStatePooling, self);
  },
  updateTargetState:function(self) {
    // Force update the Characteristic
    self.thermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
    .setValue(self.targetHeatingCoolingState);
  },
  updateTargetTemperature:function(self) {
    // Force update the Characteristic
    if (self.thermostatService) {
      self.log("self.targetTemperature" + self.targetTemperature);
      self.thermostatService.getCharacteristic(Characteristic.TargetTemperature)
      .setValue(self.targetTemperature);
    }
  },

  // Write to GPIO accurate value for heating
  heatOnOff: function(on) {
    this.heatCommandPort.writeSync(this.heatCommandValueIsHigh ^ (on ? 0 : 1));
  },

  // Query temperature and take action
  takeAction: function(callback, self) {
    switch (self.targetHeatingCoolingState) {
      case Characteristic.TargetHeatingCoolingState.COOL:
      case Characteristic.TargetHeatingCoolingState.HEAT:
      case Characteristic.TargetHeatingCoolingState.OFF:
        self.heatOnOff(Characteristic.TargetHeatingCoolingState.HEAT == self.targetHeatingCoolingState);
        break;
      case Characteristic.TargetHeatingCoolingState.AUTO:
        // Take correct action according to temperature and targetTemperature
        var newTargetTemperature = self.targetTemperature + (self.isAutoHeating ? 0.5 : -0.5);
        self.heatOnOff(self.temperature < newTargetTemperature);
        self.isAutoHeating = self.temperature < newTargetTemperature;
        // Will takeAction in (self.temperaturePooling / 2), as we are in AUTO mode
        setTimeout(self.takeAction, self.temperaturePooling / 2, null, self);
        break;
      default:
        break;
    }
    if (callback) { callback(); }
  },

  identify: function(callback) {
    this.log("Identify requested!");
    callback(null);
  },

  // Characteristic.CurrentHeatingCoolingState
  getCurrentHeatingCoolingState: function(callback) {
    callback(null, this.heatingCoolingState);
  },
  setCurrentHeatingCoolingState: function(value, callback) {
    this.heatingCoolingState = value;
    callback(null);
  },

  // Characteristic.TargetHeatingCoolingState
  getTargetHeatingCoolingState: function(callback) {
    callback(null, this.targetHeatingCoolingState);
  },
  setTargetHeatingCoolingState: function(value, callback) {
    this.targetHeatingCoolingState = value;
    this.takeAction(callback, this);
  },

  // Characteristic.CurrentTemperature
  getCurrentTemperature: function(callback) {
    callback(this.temperatureError, this.temperature);
  },

  // Characteristic.TargetTemperature
  getTargetTemperature: function(callback) {
    callback(null, this.targetTemperature);
  },
  setTargetTemperature: function(value, callback) {
    this.targetTemperature = Math.min(this.maxHeatingValue, value);
    callback();
  },

  // Characteristic.TemperatureDisplayUnits
  getTemperatureDisplayUnits: function(callback) {
    callback(null, this.temperatureDisplayUnits);
  },
  setTemperatureDisplayUnits: function(value, callback) {
    // Update the unit in the instance variable
    this.temperatureDisplayUnits = value;
    callback();
  },

  getServices: function() {
    var informationService = new Service.AccessoryInformation();
    informationService
    .setCharacteristic(Characteristic.Manufacturer, "MM Manufacturer")
    .setCharacteristic(Characteristic.Model, "MM Model")
    .setCharacteristic(Characteristic.SerialNumber, "MM SN");

    var thermostatService = new Service.Thermostat(this.name);
    // Characteristics
    thermostatService
    .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
    .on('get', this.getCurrentHeatingCoolingState.bind(this))
    .on('set', this.setCurrentHeatingCoolingState.bind(this));

    var valValues = [
      Characteristic.TargetHeatingCoolingState.OFF,
      Characteristic.TargetHeatingCoolingState.HEAT,
      Characteristic.TargetHeatingCoolingState.COOL,
      Characteristic.TargetHeatingCoolingState.AUTO];
    if (this.removeForceCooling == true) {
      valValues.splice(2, 1);
    }
    if (this.removeForceHeating == true) {
      valValues.splice(1, 1);
    }
    thermostatService
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .on('get', this.getTargetHeatingCoolingState.bind(this))
      .on('set', this.setTargetHeatingCoolingState.bind(this))
      .setProps({
        format: Characteristic.Formats.UINT8,
        maxValue: 3,
        minValue: 0,
        validValues: valValues,
        perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
      });
    thermostatService
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.getCurrentTemperature.bind(this));
      thermostatService
      .getCharacteristic(Characteristic.TargetTemperature)
      .on('get', this.getTargetTemperature.bind(this))
      .on('set', this.setTargetTemperature.bind(this))
      .setProps({
        format: Characteristic.Formats.FLOAT,
        unit: Characteristic.Units.CELSIUS,
        maxValue: this.maxHeatingValue,
        minValue: this.minHeatingValue,
        minStep: 0.1,
        perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
      });
    thermostatService
    .getCharacteristic(Characteristic.TemperatureDisplayUnits)
    .on('get', this.getTemperatureDisplayUnits.bind(this))
    .on('set', this.setTemperatureDisplayUnits.bind(this));
    this.thermostatService = thermostatService;
    return [informationService, thermostatService];
  }
};
