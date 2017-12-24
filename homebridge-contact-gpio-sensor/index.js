var Service;
var Characteristic;
var HomebridgeAPI;
var Gpio = require('onoff').Gpio;
var inherits = require('util').inherits;
var exec = require('child_process').exec;

var RETRY_COUNT = 10;
var HOLDOFF_MS = 1000;

function translate(value, contactValue) {
    if (value === contactValue) {
        // circuit is closed
        return Characteristic.ContactSensorState.CONTACT_DETECTED;
    } else {
        // circuit is open
        return Characteristic.ContactSensorState.CONTACT_NOT_DETECTED;
    }
}

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

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    HomebridgeAPI = homebridge;

    //console.log(Service.ContactSensor);
    homebridge.registerAccessory("homebridge-contact-gpio-sensor", "ContactGPIOSensor", ContactGPIOSensor);
};

function ContactGPIOSensor(log, config) {
    var self = this;
    this.log = log;
    this.name = config.name;
    this.pinId = config.BCM_GPIO;
    this.retryCount = config.retryCount || RETRY_COUNT;
    this.holdoffMS = config.holdoffMS || HOLDOFF_MS;

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

    // To count the number of times the contact has been opened
    this.changesCounter = 0;
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

    // Binding Characteristics
    this.service.getCharacteristic(Characteristic.ContactSensorState)
      .on('get', this.getState.bind(this));
    this.service.getCharacteristic(TimesOpened)
      .on('get', this.getTimesOpened.bind(this));

    // To release the GPIO when exiting
    process.on('SIGINT', function () {
        self.contactSensor.unexport();
    });

    this.currentGpioValue = forceRead(this.retryCount, this.contactSensor);
    this.lastCallerIdentifier = Date.now();

    // Watch any changes events
    this.contactSensor.watch(function(err, value) {
      // To prevent glitches, we make delayed calls to processChange
      // with caller identifier (based on timestamp)
      // If a change has been observed before scheduled self.processChange has been invoked
      // the scheduled self.processChange will be invalidated.
      self.lastCallerIdentifier = Date.now();
      setTimeout(self.processChange, self.holdoffMS, self, self.lastCallerIdentifier);
    });
}

// Process changes events
ContactGPIOSensor.prototype.processChange = function(self, callerIdentifier) {
    if (self.lastCallerIdentifier != callerIdentifier) {
      // Ignore if it is not the last caller identifier
      self.log("Ignoring because " + callerIdentifier + " is not the last caller identifier " + self.lastCallerIdentifier);
      return;
    }

    // Readback GPIO value
    gpioValue = forceRead(self.retryCount, self.contactSensor);
    if (gpioValue == self.currentGpioValue) {
      // Ok, we consider that it was nothing
      self.log("Ignoring because " + gpioValue + " does not differ from last value " + self.currentGpioValue);
      return;
    }

    // Change! we have to inform the whole world
    self.changesCounter++;
    self.currentGpioValue = gpioValue;
    self.log('Changes counter ' + self.changesCounter);
    self.service.getCharacteristic(self.characteristic_times_opened)
         .setValue(Math.floor(self.changesCounter/2));
    self.service.getCharacteristic(Characteristic.ContactSensorState)
         .setValue(translate(gpioValue, self.contactValue));
};

ContactGPIOSensor.prototype.getState = function(callback) {
  // Force reading state
  var val = forceRead(this.retryCount, this.contactSensor);
  callback(null, translate(val, this.contactValue));
};

ContactGPIOSensor.prototype.getTimesOpened = function(callback) {
    callback(null, Math.floor(this.changesCounter/2));
};

ContactGPIOSensor.prototype.getServices = function() {
    return [this.service];
};
