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

    // To make the switches to be temporary
    this.TempSwitchDurationMS = 500;

    // Initialisation of the states
    this.GarageDoor_targetDoorState = Characteristic.CurrentDoorState.CLOSED;
    this.GarageDoor_currentDoorState = Characteristic.CurrentDoorState.CLOSED;

    // To know that there is a request to open or close the door
    // from HomeKit.
    this.GarageDoor_doorStateCurrentRequest = null;
    this.DoorRequestResetTimer = null;
    this.GarageDoorOpeningTimeMS = 40000;

    // Ouverture des GPIOS
    rpio.open(this.GrandeOuverture_GPIO, rpio.OUTPUT, rpio.HIGH);
    rpio.open(this.PetiteOuverture_GPIO, rpio.OUTPUT, rpio.HIGH);
    rpio.open(this.Contact_GPIO, rpio.INPUT, rpio.PULL_UP);

    // Polling for Input changes
    this.ContactPollTimeMS = 1000;
    this.resetPollTimer(true);

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
      "grand"
    );
    this.GrandeOuverture_SwitchService.getCharacteristic(Characteristic.On)
      .onGet(this.getGrandeOuverture_SwitchState.bind(this))
      .onSet(this.setGrandeOuverture_SwitchState.bind(this));

    // Switch 2
    this.PetiteOuverture_SwitchService = new Service.Switch(
      "Petite Ouverture",
      "petit"
    );
    this.PetiteOuverture_SwitchService.getCharacteristic(Characteristic.On)
      .onGet(this.getPetiteOuverture_SwitchState.bind(this))
      .onSet(this.setPetiteOuverture_SwitchState.bind(this));

    // Contact
    this.Contact_ContactSensorService = new Service.ContactSensor(
      "Contact Sensor"
    );
    this.Contact_ContactSensorService.getCharacteristic(
      Characteristic.ContactSensorState
    ).onGet(this.getContact_ContactSensorState.bind(this));

    // Garage Door
    this.GarageDoorOpenerService = new Service.GarageDoorOpener("Portail");
    // Required Characteristics
    // Characteristic.CurrentDoorState : [READ]
    // this.GarageDoorOpenerService.getCharacteristic(
    //   Characteristic.CurrentDoorState
    // ).onGet(this.getCurrentDoorState.bind(this));

    // Characteristic.TargetDoorState : [READ / WRITE]
    this.GarageDoorOpenerService.getCharacteristic(
      Characteristic.TargetDoorState
    )
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
      setTimeout(c.setValue.bind(c, false), this.TempSwitchDurationMS);
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
      setTimeout(c.setValue.bind(c, false), this.TempSwitchDurationMS);
    }
  }

  updateStatesFromGPIO(do_read) {
    if (do_read) {
      this.Contact_Value = rpio.read(this.Contact_GPIO);
    }
    var contact_state = this.getContact_ContactSensorState();
    // The contact is not detected <=> the door is currently open
    this.GarageDoor_currentDoorState =
      contact_state == Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
        ? Characteristic.CurrentDoorState.OPEN
        : Characteristic.CurrentDoorState.CLOSED;
    this.log.debug(
      "Set Current: %s",
      this.cds2str(this.GarageDoor_currentDoorState)
    );
  }

  getContact_ContactSensorState() {
    // The state of the contact according to the configuration
    // and the current value of the GPIO.
    // - closedValueIsHigh == true  and Contact_Value == HIGH => (true  ^ true)  == false -> DETECTED
    // - closedValueIsHigh == false and Contact_Value == LOW  => (false ^ false) == false -> DETECTED
    // - closedValueIsHigh == true  and Contact_Value == LOW  => (true  ^ false) == true  -> NOT_DETECTED
    // - closedValueIsHigh == false and Contact_Value == HIGH => (false ^ true)  == true  -> NOT_DETECTED
    var state =
      this.Contact_closedValueIsHigh ^ (this.Contact_Value == rpio.HIGH)
        ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
        : Characteristic.ContactSensorState.CONTACT_DETECTED;
    this.log.debug("Get Contact Sensor State: %s", this.css2str(state));
    return state;
  }

  css2str(state) {
    switch (state) {
      case Characteristic.ContactSensorState.CONTACT_DETECTED:
        return "  DETECTED  ";
      case Characteristic.ContactSensorState.CONTACT_NOT_DETECTED:
        return "NOT_DETECTED";
      default:
        return "  UNKNOWN   ";
    }
  }

  cds2str(state) {
    switch (state) {
      case Characteristic.CurrentDoorState.OPEN:
        return "  OPEN ";
      case Characteristic.CurrentDoorState.CLOSED:
        return " CLOSED";
      case Characteristic.CurrentDoorState.OPENING:
        return "OPENING";
      case Characteristic.CurrentDoorState.CLOSING:
        return "CLOSING";
      case Characteristic.CurrentDoorState.STOPPED:
        return "STOPPED";
      default:
        return "UNKNOWN";
    }
  }

  getCurrentDoorState() {
    // Characteristic.CurrentDoorState.OPEN = 0;
    // Characteristic.CurrentDoorState.CLOSED = 1;
    // Characteristisc.CurrentDoorState.OPENING = 2;
    // Characteristic.CurrentDoorState.CLOSING = 3;
    // Characteristic.CurrentDoorState.STOPPED = 4;
    this.log.debug(
      "Get Current: %s",
      this.cds2str(this.GarageDoor_currentDoorState)
    );
    return this.GarageDoor_currentDoorState;
  }

  getTargetDoorState() {
    this.log.debug(
      "Get Target: %s",
      this.cds2str(this.GarageDoor_targetDoorState)
    );
    return this.GarageDoor_targetDoorState;
  }

  setDoorRequest(value) {
    // Set the current request
    this.log.debug(
      "Set Request: %s",
      this.cds2str(this.GarageDoor_targetDoorState)
    );
    this.GarageDoor_doorStateCurrentRequest = value;

    // Invalidate the timer if an existing one is set.
    if (this.DoorRequestResetTimer != null) {
      clearTimeout(this.DoorRequestResetTimer);
    }

    // Set a timer to indicate that the request has been terminated.
    this.DoorRequestResetTimer = setTimeout(
      this.setDoorRequest.bind(this),
      this.GarageDoorOpeningTimeMS,
      null
    );
  }

  setTargetDoorState(value) {
    // Get a request from Homekit to set the door's garage target state.
    this.log.debug(
      "Set Target: %s",
      this.cds2str(this.GarageDoor_targetDoorState)
    );
    this.GarageDoor_targetDoorState = value;

    // We register the request, temporarly during 40s, approximately the time to open or close the door.
    this.setDoorRequest(value);

    if (value == this.GarageDoor_currentDoorState) {
      // The state is already at the target, nothing to do
      this.log.debug("The state is already at the target, nothing to do");
      return;
    }

    // Advertise the doors' target state
    this.GarageDoorOpenerService.getCharacteristic(
      Characteristic.TargetDoorState
    ).updateValue(value);

    // Make the Grande Ouverture Switch to be activated
    this.GrandeOuverture_SwitchService.getCharacteristic(
      Characteristic.On
    ).setValue(true);
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
    this.resetPollTimer(false);

    var value = rpio.read(this.Contact_GPIO);
    /*
     * Wait for a small period of time to avoid rapid changes.
     * If the pin has not the same value after the wait then ignore it.
     */
    rpio.msleep(20);
    var value2 = rpio.read(this.Contact_GPIO);
    this.log.debug(
      "Contact on pin P%d is %s, (%s after 20ms)",
      this.Contact_GPIO,
      value,
      value2
    );
    if (value != value2) {
      // The value has changed, ignore it. Relaunch the timer without reading the GPIO.
      this.resetPollTimer(true);
      this.log.debug(
        "Contact on pin P%d is considered unstable",
        this.Contact_GPIO
      );
      return;
    }
    this.log.debug(
      "Contact on pin P%d is considered stable",
      this.Contact_GPIO
    );

    // The value seems stable enough to consider that it is "value".

    // Get the current contact state.
    var old_state = this.getContact_ContactSensorState();

    // Update the contact value and recompute the state.
    this.Contact_Value = value;
    var new_state = this.getContact_ContactSensorState();

    if (old_state != new_state) {
      this.log.debug(
        "Update contact sensor state from %s to: %s",
        old_state,
        new_state
      );
    }

    this.updateStatesFromGPIO(false);

    // Update the contact sensor state, advertize if necessary
    this.Contact_ContactSensorService.getCharacteristic(
      Characteristic.ContactSensorState
    ).updateValue(new_state);

    // Update the current door state, advertize if necessary
    if (
      this.GarageDoor_doorStateCurrentRequest ==
      Characteristic.CurrentDoorState.OPEN
    ) {
      // The request was done during less than 40s, the door is "opening".
      this.log.debug(
        "Avertise Current: %s",
        this.cds2str(Characteristic.CurrentDoorState.OPENING)
      );
      this.GarageDoorOpenerService.getCharacteristic(
        Characteristic.CurrentDoorState
      ).updateValue(Characteristic.CurrentDoorState.OPENING);
    } else if (
      this.GarageDoor_doorStateCurrentRequest ==
      Characteristic.CurrentDoorState.CLOSED
    ) {
      // The request was done during less than 40s, the door is "closing".
      this.log.debug(
        "Avertise Current: %s",
        this.cds2str(Characteristic.CurrentDoorState.CLOSING)
      );
      this.GarageDoorOpenerService.getCharacteristic(
        Characteristic.CurrentDoorState
      ).updateValue(Characteristic.CurrentDoorState.CLOSING);
    } else {
      // We do not know when the request was performed.
      this.GarageDoorOpenerService.getCharacteristic(
        Characteristic.CurrentDoorState
      ).updateValue(this.GarageDoor_currentDoorState);
    }
    this.resetPollTimer(true);

    this.printStates();
  }

  resetPollTimer(pollagain) {
    if (this.polltimer != null) {
      clearTimeout(this.polltimer);
    }
    this.polltimer = null;
    if (pollagain) {
      this.polltimer = setTimeout(
        this.pollcb.bind(this),
        this.ContactPollTimeMS
      );
    }
  }

  printStates() {
    this.log.debug("+==============+===================+");
    this.log.debug("|     DOOR     |  Class  |   HAP   |");
    this.log.debug("+--------------+---------+---------+");
    this.log.debug(
      "| Door.Current | %s | %s |",
      this.cds2str(this.GarageDoor_currentDoorState),
      this.cds2str(
        this.GarageDoorOpenerService.getCharacteristic(
          Characteristic.CurrentDoorState
        ).value
      )
    );
    this.log.debug("+--------------+---------+---------+");
    this.log.debug(
      "| Door.Target  | %s | %s |",
      this.cds2str(this.GarageDoor_targetDoorState),
      this.cds2str(
        this.GarageDoorOpenerService.getCharacteristic(
          this.cds2strCharacteristic.TargetDoorState
        ).value
      )
    );
    this.log.debug("+--------------+---------+---------+");
    this.log.debug(
      "| Door.Request | %s |         |",
      this.cds2str(this.GarageDoor_doorStateCurrentRequest)
    );
    this.log.debug("+--------------+---------+---------+");

    this.log.debug("+==============+==============+==============+");
    this.log.debug("|   CONTACT    |    Class     |      HAP     |");
    this.log.debug("+--------------+--------------+--------------+");
    this.log.debug(
      "| Contact      | %s | %s |",
      this.css2str(this.Contact_Value),
      this.Contact_ContactSensorService.getCharacteristic(
        Characteristic.ContactSensorState
      ).value
    );
  }
}
