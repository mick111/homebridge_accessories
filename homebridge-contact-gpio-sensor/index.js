var Service;
var Characteristic;
var HomebridgeAPI;
var Gpio = require('onoff').Gpio;
var inherits = require('util').inherits;
var exec = require('child_process').exec;

var RETRY_COUNT = 10;

function translate(value, contactValue) {
    var val;
    if (value === contactValue) {
        // circuit is closed
        val = Characteristic.ContactSensorState.CONTACT_DETECTED;
    } else {
        // circuit is open
        val = Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
    }
    return val;
}


module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    HomebridgeAPI = homebridge;
    
    //console.log(Service.ContactSensor);
    homebridge.registerAccessory("homebridge-contact-gpio-sensor", "ContactGPIOSensor", ContactGPIOSensor);
};

function ContactGPIOSensor(log, config) {
    var that = this;
    this.log = log;
    this.name = config.name;
    this.pinId = config.pinId;
    this.retryCount = config.retryCount || RETRY_COUNT;
    
    log(config.contactValue)
    if (typeof config.contactValue == 'number') {
        this.contactValue = config.contactValue;
    } else {
        this.contactValue = 1;
    }
    
    exec('gpio -g mode ' + this.pinId + ' up', function (error, stdout, stderr) {
         if (error !== null) {
         log('exec error: ' + error);
         }
         });
    
    this.contactSensor = new Gpio(this.pinId, 'in', 'both');
    this.openedCounter = 0;
    
    TimesOpened = function () {
        Characteristic.call(this, 'Times Opened', 'E863F129-079E-48FF-8F27-9C2605A29F52');
        this.setProps({
                      format: Characteristic.Formats.UINT8,
                      minValue: 0,
                      minStep: 1,
                      perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
                      });
        this.value = this.getDefaultValue();
    };
    inherits(TimesOpened, Characteristic);
    TimesOpened.UUID = 'E863F129-079E-48FF-8F27-9C2605A29F52';
    
    this.characteristic_times_opened = TimesOpened;
    
    // Contact Sensor Service
    this.service = new Service.ContactSensor(this.name);
    this.service.addOptionalCharacteristic(TimesOpened);
    
    this.service.getCharacteristic(Characteristic.ContactSensorState)
    .on('get', this.getState.bind(this));
    
    this.service.getCharacteristic(TimesOpened)
    .on('get', this.getOpenedCounter.bind(this));
    
    this.contactSensor.watch(function(err, value) {
        that.openedCounter++;
        that.log('opened counter ' + that.openedCounter);
        that.service.getCharacteristic(that.characteristic_times_opened)
             .setValue(Math.floor(that.openedCounter/2));
        that.service.getCharacteristic(Characteristic.ContactSensorState)
             .setValue(translate(value, that.contactValue));
    });
    
    process.on('SIGINT', function () {
               that.contactSensor.unexport();
               });
}

ContactGPIOSensor.prototype.getState = function(callback) {
    var val;
    for (var i = 0; i < this.retryCount; i++) {
        val = this.contactSensor.readSync();
        if (typeof val == 'number') {
            break;
        }
    }
    callback(null, translate(val, this.contactValue));
};

ContactGPIOSensor.prototype.getOpenedCounter = function(callback) {
    callback(null, Math.floor(this.openedCounter/2));
};

ContactGPIOSensor.prototype.getServices = function() {
    return [this.service];
};
