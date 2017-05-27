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
            "accessory": "LampGPIO",
            "name": "Lampe Cuisine",
            "onCommandPin": 27,
            "manualButtonPin": 28,
            "onCommandValue": 1
        }
      ],

      "platforms": []
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
	var onCommandPin = config["onCommandPin"];
	this.log("Lamp Command Pin: " + onCommandPin);
    var onCommandValue = config['onCommandValue'];
    this.log("Lamp Command value: " + onCommandValue);
    this.onCommandValueIsHigh = (onCommandValue == 0) ? 0 : 1;
    this.onCommandPort = new Gpio(onCommandPin, this.onCommandValueIsHigh ? 'low' : 'high');
    // Turn light off
    this.onCommandPort.writeSync(this.onCommandValueIsHigh ? 0 : 1);
    if ("manualButtonPin" in config) {
    // Manual Button Pin
	var manualButtonPin = config["manualButtonPin"];
    this.log("Manual Button Pin: " + manualButtonPin);
    this.manualButtonPin = new Gpio(manualButtonPin, 'in', 'rising');
    var self = this;
    this.manualButtonActive = true;
    this.manualButtonPin.watch(function(err, value) {
	self.log("self.manualButtonActive is");
	self.log(self.manualButtonActive);
	if (self.manualButtonActive) {
		self.log("self.manualButtonActive to false");
		self.manualButtonActive = false;
        	var onCommand = self.onCommandPort.readSync();
        	self.onCommandPort.writeSync(onCommand ? 0 : 1);
		setTimeout(function() { 
			self.log("Set active true"); self.manualButtonActive = true;}, 1000);
	}
    });
    }
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
        //this.log("Heat will be put", on ? "ON" : "OFF", "by setting GPIO to", this.onCommandValueIsHigh ^ (on ? 0 : 1));
        this.onCommandPort.writeSync(this.onCommandValueIsHigh ^ (powerOn ? 0 : 1));
        callback();
    },
    identify: function(callback) {
		this.log("Identify requested!");
		callback(); // success
	},
	//Start
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
