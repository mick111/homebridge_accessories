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
    this.Contact_closedValueIsHigh = config.Contact_closedValueIsHigh;

    rpio.open(this.GrandeOuverture_GPIO, rpio.OUTPUT, rpio.HIGH);
    rpio.open(this.PetiteOuverture_GPIO, rpio.OUTPUT, rpio.HIGH);
    rpio.open(this.Contact_GPIO, rpio.INPUT, rpio.PULL_UP);

    this.updateStateFromGPIO();
    this.GarageDoor_targetDoorState = this.GarageDoor_currentDoorState;

    // Polling for Input changes
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
      .onGet(this.getGrandeOuverture_SwitchState.bind(this))
      .onSet(this.setGrandeOuverture_SwitchState.bind(this));

    // Switch 2
    this.PetiteOuverture_SwitchService = new Service.Switch(
      "Petite Ouverture",
      "button2"
    );
    this.PetiteOuverture_SwitchService.getCharacteristic(Characteristic.On)
      .onGet(this.getPetiteOuverture_SwitchState.bind(this))
      .onSet(this.setPetiteOuverture_SwitchState.bind(this));

    // Contact
    this.Contact_ContactSensorService = new Service.ContactSensor(
      "Contact Sensor",
      "contact"
    );
    this.Contact_ContactSensorService.getCharacteristic(
      Characteristic.ContactSensorState
    ).onGet(this.getContact_ContactSensorState.bind(this));

    // Garage Door
    this.GarageDoorOpenerService = new Service.GarageDoorOpener("Portail");
    // Required Characteristics
    // Characteristic.CurrentDoorState : [READ]
    this.GarageDoorOpenerService.getCharacteristic(
      Characteristic.CurrentDoorState
    ).onGet(this.getCurrentDoorState.bind(this));

    // Characteristic.TargetDoorState : [READ / WRITE]
    this.GarageDoorOpenerService
      .getCharacteristic(this.api.hap.Characteristic.TargetDoorState)
      .onGet(this.getTargetDoorState.bind(this))
      .onSet(this.setTargetDoorState.bind(this));

    // Return always false for Obstruction
    // Characteristic.ObstructionDetected : [READ]
    this.GarageDoorOpenerService.getCharacteristic(
      Characteristic.ObstructionDetected
    ).onGet(function (callback) {
      return callback(null, false);
    });
  }

  getGrandeOuverture_SwitchState(callback) {
    var onCommand = rpio.read(this.GrandeOuverture_GPIO);
    this.log.debug(
      "Getting Grande ouverture state: %s %s",
      onCommand,
      onCommand == 0
    );
    callback(null, onCommand == 0);
  }
  setGrandeOuverture_SwitchState(value, callback) {
    this.log.debug("Setting Grande ouverture state to %s", value);
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
    this.log.debug(
      "Getting Petite ouverture state: %s %s",
      onCommand,
      onCommand == 0
    );
    callback(null, onCommand == 0);
  }
  setPetiteOuverture_SwitchState(value, callback) {
    this.log.debug("Setting Petite ouverture state to %s", value);
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
    callback(null, this.Contact_Value == 0);
  }

  updateStateFromGPIO() {
    this.Contact_Value = rpio.read(this.Contact_GPIO);
    this.log("Contact is high? %s", this.Contact_Value == rpio.HIGH);
    this.log("Closed Value is Contact High ? %s", this.Contact_closedValueIsHigh);
    var open = this.Contact_closedValueIsHigh ^ (this.Contact_Value == rpio.HIGH);
    this.log("Is open? %s", open);
    this.GarageDoor_currentDoorState = open ? Characteristic.CurrentDoorState.OPEN : Characteristic.CurrentDoorState.CLOSED;
  }

  getCurrentDoorState(callback) {
    // Characteristic.CurrentDoorState.OPEN = 0;
    // Characteristic.CurrentDoorState.CLOSED = 1;
    // Characteristisc.CurrentDoorState.OPENING = 2;
    // Characteristic.CurrentDoorState.CLOSING = 3;
    // Characteristic.CurrentDoorState.STOPPED = 4;
    this.Contact_Value = rpio.read(this.Contact_GPIO);
    var open =
      this.Contact_closedValueIsHigh ^ (this.Contact_Value == rpio.HIGH);
    this.log.debug("Garage door current state opened: %s", open);
    callback(
      null,
      open
        ? Characteristic.CurrentDoorState.OPEN
        : Characteristic.CurrentDoorState.CLOSED
    );
  }

  getTargetDoorState(callback) {
    callback(null, this.GarageDoor_targetDoorState);
  }

  setTargetDoorState(value, callback) {
    this.log("Set Garage door current state: %s", value);
    callback();
  }

  getServices() {
    return [
      this.informationService,
      this.GrandeOuverture_SwitchService,
      this.PetiteOuverture_SwitchService,
      this.Contact_ContactSensorService,
      this.GarageDoorOpenerService,
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
    this.log.debug("Contact on pin P%d has set to %s", pin, value);
    if (this.Contact_Value != value) {
      this.Contact_Value = value;
      this.log("Setting contact sensor state to: %s, %s", value, value == 0);
      this.Contact_ContactSensorService.getCharacteristic(
        Characteristic.ContactSensorState
      ).setValue(value == 0);
    }
  }
}
