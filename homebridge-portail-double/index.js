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

    this.GarageDoor_doorStateCurrentRequest = null;

    this.ContactPollTimeMS = 1000;

    rpio.open(this.GrandeOuverture_GPIO, rpio.OUTPUT, rpio.HIGH);
    rpio.open(this.PetiteOuverture_GPIO, rpio.OUTPUT, rpio.HIGH);
    rpio.open(this.Contact_GPIO, rpio.INPUT, rpio.PULL_UP);

    this.updateStatesFromGPIO(true);
    this.GarageDoor_targetDoorState = this.GarageDoor_currentDoorState;

    // Polling for Input changes
    setTimeout(this.pollcb.bind(this), this.ContactPollTimeMS);
    // rpio.poll(this.Contact_GPIO, this.pollcb.bind(this));

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
      .getCharacteristic(Characteristic.TargetDoorState)
      .onGet(this.getTargetDoorState.bind(this))
      .onSet(this.setTargetDoorState.bind(this));

    // Return always false for Obstruction
    // Characteristic.ObstructionDetected : [READ]
    this.GarageDoorOpenerService.getCharacteristic(
      Characteristic.ObstructionDetected
    ).onGet(function () {
      return false;
    });
  }

  getGrandeOuverture_SwitchState() {
    var onCommand = rpio.read(this.GrandeOuverture_GPIO);
    this.log.debug(
      "Getting Grande ouverture state: %s %s",
      onCommand,
      onCommand == 0
    );
    return onCommand == 0;
  }
  setGrandeOuverture_SwitchState(value) {
    this.log.debug("Setting Grande ouverture state to %s", value);
    rpio.write(this.GrandeOuverture_GPIO, value ? rpio.LOW : rpio.HIGH);

    if (value) {
      var c = this.GrandeOuverture_SwitchService.getCharacteristic(
        Characteristic.On
      );
      setTimeout(c.setValue.bind(c, false), 500);
    }
  }

  getPetiteOuverture_SwitchState() {
    var onCommand = rpio.read(this.PetiteOuverture_GPIO);
    this.log.debug(
      "Getting Petite ouverture state: %s %s",
      onCommand,
      onCommand == 0
    );
    return onCommand == 0;
  }

  setPetiteOuverture_SwitchState(value) {
    this.log.debug("Setting Petite ouverture state to %s", value);
    rpio.write(this.PetiteOuverture_GPIO, value ? rpio.LOW : rpio.HIGH);

    if (value) {
      var c = this.PetiteOuverture_SwitchService.getCharacteristic(
        Characteristic.On
      );
      setTimeout(c.setValue.bind(c, false), 500);
    }
  }

  updateStatesFromGPIO(do_read) {
    if (do_read) {
      this.Contact_Value = rpio.read(this.Contact_GPIO);
    }
    // this.log.debug("Contact is high? %s", this.Contact_Value == rpio.HIGH);
    // this.log.debug("Closed Value is Contact High ? %s", this.Contact_closedValueIsHigh);
    var open = this.Contact_closedValueIsHigh ^ (this.Contact_Value == rpio.HIGH);
    // this.log.debug("Is open? %s", open);
    this.GarageDoor_currentDoorState = open ? Characteristic.CurrentDoorState.OPEN : Characteristic.CurrentDoorState.CLOSED;
  }

  getContact_ContactSensorState() {
    return this.Contact_closedValueIsHigh ^ (this.Contact_Value == rpio.HIGH);
  }

  getCurrentDoorState() {
    // Characteristic.CurrentDoorState.OPEN = 0;
    // Characteristic.CurrentDoorState.CLOSED = 1;
    // Characteristisc.CurrentDoorState.OPENING = 2;
    // Characteristic.CurrentDoorState.CLOSING = 3;
    // Characteristic.CurrentDoorState.STOPPED = 4;
    return this.GarageDoor_currentDoorState;
  }

  getTargetDoorState() {
    this.log("Get Garage door Target state: %s", this.GarageDoor_targetDoorState);
    return this.GarageDoor_targetDoorState;
  }

  setDoorRequest(value) {
    this.log("Garage door Target request: %s", value);
    this.GarageDoor_doorStateCurrentRequest = value;
    this.GarageDoorOpenerService.getCharacteristic(Characteristic.TargetDoorState).updateValue(value);
  }

  setTargetDoorState(value) {
    this.log("Set Garage door Target state: %s", value);
    this.GarageDoor_targetDoorState = value;
    this.setDoorRequest(value);
    setTimeout(this.setDoorRequest.bind(this), 40000, null);
    if (value == this.GarageDoor_currentDoorState) {
      // The state is already at the target, nothing to do
      return;
    }
    // Make the Grande Ouverture Switch to be activated
    this.GrandeOuverture_SwitchService.getCharacteristic(Characteristic.On).setValue(true);
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

  pollcb() {
    var value = rpio.read(this.Contact_GPIO);
    /*
     * Wait for a small period of time to avoid rapid changes.
     * If the pin has not the same value after the wait then ignore it.
     */
    rpio.msleep(20);
    var value2 = rpio.read(this.Contact_GPIO);
    this.log.debug("Contact on pin P%d has set to %s, (%s after 10ms)", this.Contact_GPIO, value, value2);
    if (value != value2) {
      setTimeout(this.pollcb.bind(this), this.ContactPollTimeMS);
    }
    var old_state = this.getContact_ContactSensorState();
    this.Contact_Value = value;
    this.updateStatesFromGPIO(false);
    var new_state = this.getContact_ContactSensorState();
    if (old_state != new_state) {
      this.log("Update contact sensor state from %s to: %s", old_state, new_state);
      this.Contact_ContactSensorService.getCharacteristic(
        Characteristic.ContactSensorState
      ).updateValue(new_state);

      this.GarageDoor_currentDoorState = new_state ? Characteristic.CurrentDoorState.OPEN : Characteristic.CurrentDoorState.CLOSED;
      this.GarageDoorOpenerService.getCharacteristic(Characteristic.CurrentDoorState).updateValue(this.GarageDoor_currentDoorState);
      this.log.debug("Update Current Door State state to: %s", this.GarageDoor_currentDoorState);
      if (this.GarageDoor_doorStateCurrentRequest == null) {
        this.GarageDoor_targetDoorState = new_state ? Characteristic.CurrentDoorState.OPEN : Characteristic.CurrentDoorState.CLOSED;
        this.GarageDoorOpenerService.getCharacteristic(Characteristic.TargetDoorState).updateValue(this.GarageDoor_targetDoorState);
      }
    }

    setTimeout(this.pollcb.bind(this), this.ContactPollTimeMS);
  }
}
