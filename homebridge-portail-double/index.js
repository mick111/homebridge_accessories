var rpio = require("rpio");
var Service, Characteristic, HomebridgeAPI;

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  HomebridgeAPI = homebridge;

  // Register accessory
  homebridge.registerAccessory(
    "homebridge-portail-double",
    "PortailDouble",
    PortailDouble
  );
};

// Accessory constructor
class PortailDouble {
  constructor(log, config) {
    this.log = log;
    this.name = config.name;

    this.GrandeOuverture_GPIO = config.GrandeOuverture_GPIO;
    this.PetiteOuverture_GPIO = config.PetiteOuverture_GPIO;
    this.Contact_GPIO = config.Contact_GPIO;

    rpio.open(this.GrandeOuverture_GPIO, rpio.OUTPUT, rpio.HIGH);
    rpio.open(this.PetiteOuverture_GPIO, rpio.OUTPUT, rpio.HIGH);
    rpio.open(this.Contact_GPIO, rpio.INPUT, rpio.PULL_UP);

    this.Contact_Value = rpio.read(this.Contact_GPIO);

    rpio.poll(this.Contact_GPIO, this.pollcb.bind(this));

    // Services instantiations

    // Information
    this.informationService = new Service.AccessoryInformation();
    this.informationService
      .setCharacteristic(Characteristic.Manufacturer, "MM Manufacturer")
      .setCharacteristic(Characteristic.Model, "MM Model")
      .setCharacteristic(Characteristic.SerialNumber, "MM SN");

    // Switch 1
    this.GrandeOuverture_SwitchService = new Service.Switch(
      "Grande Ouverture",
      "button1"
    );
    this.GrandeOuverture_SwitchService.getCharacteristic(Characteristic.On)
      .on("get", this.getGrandeOuverture_SwitchState.bind(this))
      .on("set", this.setGrandeOuverture_SwitchState.bind(this));

    // Switch 2
    this.PetiteOuverture_SwitchService = new Service.Switch(
      "Petite Ouverture",
      "button2"
    );
    this.PetiteOuverture_SwitchService.getCharacteristic(Characteristic.On)
      .on("get", this.getPetiteOuverture_SwitchState.bind(this))
      .on("set", this.setPetiteOuverture_SwitchState.bind(this));

    this.Contact_ContactSensorService = new Service.ContactSensor(
      "Contact Sensor",
      "contact"
    );
    this.Contact_ContactSensorService.getCharacteristic(
      Characteristic.ContactSensorState
    ).on("get", this.getContact_ContactSensorState.bind(this));
  }

  getGrandeOuverture_SwitchState(callback) {
    var onCommand = rpio.read(this.GrandeOuverture_GPIO);
    this.log(
      "Getting Grande ouverture state: %s %s",
      onCommand,
      onCommand == 0
    );
    callback(null, onCommand == 0);
  }
  setGrandeOuverture_SwitchState(value, callback) {
    this.log("Setting Grande ouverture state to %s", value);
    rpio.write(this.GrandeOuverture_GPIO, value ? rpio.LOW : rpio.HIGH);

    if (value) {
      var c = this.GrandeOuverture_SwitchService.getCharacteristic(
        Characteristic.On
      );
      setTimeout(c.setValue.bind(c, false), 500);
    }
    callback();
  }

  getPetiteOuverture_SwitchState(callback) {
    var onCommand = rpio.read(this.PetiteOuverture_GPIO);
    this.log(
      "Getting Petite ouverture state: %s %s",
      onCommand,
      onCommand == 0
    );
    callback(null, onCommand == 0);
  }
  setPetiteOuverture_SwitchState(value, callback) {
    this.log("Setting Petite ouverture state to %s", value);
    rpio.write(this.PetiteOuverture_GPIO, value ? rpio.LOW : rpio.HIGH);

    if (value) {
      var c = this.PetiteOuverture_SwitchService.getCharacteristic(
        Characteristic.On
      );
      setTimeout(c.setValue.bind(c, false), 500);
    }

    callback();
  }

  getContact_ContactSensorState(callback) {
    callback(null, this.Contact_Value);
  }

  getServices() {
    return [
      this.informationService,
      this.GrandeOuverture_SwitchService,
      this.PetiteOuverture_SwitchService,
      this.Contact_ContactSensorService,
    ];
  }

  pollcb(pin) {
    var value = rpio.read(pin);
    /*
     * Wait for a small period of time to avoid rapid changes which
     * can't all be caught with the 1ms polling frequency.
     * If the pin has not the same value after the wait then ignore it.
     */
    rpio.msleep(20);
    if (value != rpio.read(pin)) return;
    this.log("Contact on pin P%d has set to %s", pin, value);
    this.Contact_Value = value;
  }
}
