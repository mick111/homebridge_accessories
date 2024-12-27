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

    rpio.open(this.GrandeOuverture_GPIO, rpio.OUTPUT, rpio.HIGH);
    rpio.open(this.PetiteOuverture_GPIO, rpio.OUTPUT, rpio.HIGH);

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

  getServices() {
    return [
      this.informationService,
      this.GrandeOuverture_SwitchService,
      this.PetiteOuverture_SwitchService,
    ];
  }
}
