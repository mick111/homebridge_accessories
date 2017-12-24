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
            "heatCommandValue": 1
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

    // Get Heat command configuration
	var heatCommandPin = config["Heat_BCM_GPIO"];
	this.log("Heat Command Pin: " + heatCommandPin);
    if (heatCommandPin) {
        var heatCommandValue = config['heatCommandValue'];
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
	this.targetTemperature = 21;
	this.heatingThreshold = 2;
	// The value property of TargetHeatingCoolingState must be one of the following:
	//Characteristic.TargetHeatingCoolingState.OFF = 0;
	//Characteristic.TargetHeatingCoolingState.HEAT = 1;
	//Characteristic.TargetHeatingCoolingState.COOL = 2;
	//Characteristic.TargetHeatingCoolingState.AUTO = 3;
	this.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.OFF;

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
    updateTemperature: function(object) {
        // Read from device
        ds18b20.temperature(object.ds18b20_device, function(err, value) {
            // Program another read
            setTimeout(object.updateTemperature, object.temperaturePooling, object);

            object.temperatureError = err;
            if (err != null) {
                // Error during getting temperature
                object.log("Error while getting temperature", err);
                return;
            }
            // Update temperature
            object.temperature = value;
            // Update the Characteristic
            if (object.thermostatService) {
                object.thermostatService.getCharacteristic(Characteristic.CurrentTemperature).setValue(value);
            }
        });
    },
    updateHeatingCoolingState: function(object) {
        // Read from device
        var heatCommand = object.heatCommandPort.readSync();
        // Update temperature
        object.heatingCoolingState = (heatCommand == object.heatCommandValueIsHigh) ? Characteristic.TargetHeatingCoolingState.HEAT : Characteristic.TargetHeatingCoolingState.OFF;
        // Update the Characteristic
        if (object.thermostatService) {
            object.thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).setValue(object.heatingCoolingState);
        }
        setTimeout(object.updateHeatingCoolingState, object.heatingCoolingStatePooling, object);
    },
    updateTargetState:function(object) {
        // Force update the Characteristic
        object.thermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .setValue(object.targetHeatingCoolingState);
    },
    heatOnOff: function(on) {
        // Command update
        //this.log("Heat will be put", on ? "ON" : "OFF", "by setting GPIO to", this.heatCommandValueIsHigh ^ (on ? 0 : 1));
        this.heatCommandPort.writeSync(this.heatCommandValueIsHigh ^ (on ? 0 : 1));
    },
    // Query temperature and take action
    takeAction: function(callback, object) {
		//object.log("takeAction");
        switch (object.targetHeatingCoolingState) {
            case Characteristic.TargetHeatingCoolingState.COOL:
                object.log("COOL is not supported. Returning to OFF.");
                object.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.OFF;
                setTimeout(object.updateTargetState, 0.2, object);
                // Fall Through
            case Characteristic.TargetHeatingCoolingState.OFF:
            case Characteristic.TargetHeatingCoolingState.HEAT:
                object.heatOnOff(Characteristic.TargetHeatingCoolingState.HEAT == object.targetHeatingCoolingState);
                break;
            case Characteristic.TargetHeatingCoolingState.AUTO:
                // Take correct action according to temperature and targetTemperature
                var newTargetTemperature = object.targetTemperature + (object.isAutoHeating ? 0.5 : -0.5);
                object.heatOnOff(object.temperature < newTargetTemperature);
                object.isAutoHeating = object.temperature < newTargetTemperature;
                // Will takeAction in (object.temperaturePooling / 2), as we are in AUTO mode
                setTimeout(object.takeAction, object.temperaturePooling / 2, null, object);
        }
        if (callback) { callback(null); }

    },
	//Start
	identify: function(callback) {
		this.log("Identify requested!");
		callback(null);
	},
	// Required
	getCurrentHeatingCoolingState: function(callback) {
		//this.log("getCurrentHeatingCoolingState from this.heatingCoolingState");
        callback(null, this.heatingCoolingState); // success
	},
	setCurrentHeatingCoolingState: function(value, callback) {
		//this.log("setCurrentHeatingCoolingState:", value);
		var error = null;
        /*
        if (value == Characteristic.TargetHeatingCoolingState.COOL) {
            this.log("COOL is not supported. Returning to OFF.");
            value = Characteristic.TargetHeatingCoolingState.OFF;
    		error = new Error("COOL is not supported. Returning to OFF.");
        }*/
		this.heatingCoolingState = value;
		callback(error);
	},
	getTargetHeatingCoolingState: function(callback) {
        //this.log("getTargetHeatingCoolingState:", this.targetHeatingCoolingState);
		var error = null;
		callback(error, this.targetHeatingCoolingState);
	},
	setTargetHeatingCoolingState: function(value, callback) {
		//this.log("setTargetHeatingCoolingState from/to:", this.targetHeatingCoolingState, value);
		this.targetHeatingCoolingState = value;
        this.takeAction(callback, this);
		// callback is called in the takeAction
	},
	getCurrentTemperature: function(callback) {
		//this.log("getCurrentTemperature from previously read data", this.temperatureError, this.temperature);
        callback(this.temperatureError, this.temperature);
	},
	getTargetTemperature: function(callback) {
		//this.log("getTargetTemperature. Target temperature is %s", this.targetTemperature);
        callback(null, this.targetTemperature); // success
	},
	setTargetTemperature: function(value, callback) {
		//this.log("setTargetTemperature. Target temperature set to " + value + ". (was " + this.targetTemperature + ")");
        this.targetTemperature = value;
		callback(null); // success
	},
	getTemperatureDisplayUnits: function(callback) {
		//this.log("getTemperatureDisplayUnits:", this.temperatureDisplayUnits);
		var error = null;
		callback(error, this.temperatureDisplayUnits);
	},
	setTemperatureDisplayUnits: function(value, callback) {
		//this.log("setTemperatureDisplayUnits from %s to %s", this.temperatureDisplayUnits, value);
		this.temperatureDisplayUnits = value;
		var error = null;
		callback(error);
	},
    getServices: function() {
    	var informationService = new Service.AccessoryInformation();
    	informationService
    		.setCharacteristic(Characteristic.Manufacturer, "MM Manufacturer")
    		.setCharacteristic(Characteristic.Model, "MM Model")
    		.setCharacteristic(Characteristic.SerialNumber, "MM SN");

        var thermostatService = new Service.Thermostat(this.name);
    	// Required Characteristics
    	thermostatService
    		.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
    		.on('get', this.getCurrentHeatingCoolingState.bind(this))
    		.on('set', this.setCurrentHeatingCoolingState.bind(this));
    	thermostatService
    		.getCharacteristic(Characteristic.TargetHeatingCoolingState)
    		.on('get', this.getTargetHeatingCoolingState.bind(this))
    		.on('set', this.setTargetHeatingCoolingState.bind(this));
    	thermostatService
    		.getCharacteristic(Characteristic.CurrentTemperature)
    		.on('get', this.getCurrentTemperature.bind(this));
    	thermostatService
    		.getCharacteristic(Characteristic.TargetTemperature)
    		.on('get', this.getTargetTemperature.bind(this))
    		.on('set', this.setTargetTemperature.bind(this));
    	thermostatService
    		.getCharacteristic(Characteristic.TemperatureDisplayUnits)
    		.on('get', this.getTemperatureDisplayUnits.bind(this))
    		.on('set', this.setTemperatureDisplayUnits.bind(this));
        this.thermostatService = thermostatService;
		return [informationService, thermostatService];
    }
};
