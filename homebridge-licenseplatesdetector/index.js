/*
  {
    "accessory": "LicensePlatesDetector",
    "name": "Plaques",
    "command": "wget 'http://192.168.0.33:88/cgi-bin/CGIProxy.fcgi?cmd=snapPicture2&usr=&pwd=' -q -O /tmp/lp.jpg; alpr -c eu -p fr /tmp/lp.jpg"
    "licenseplates" : ["XX123YY"],
    "poolTimingMS": 3000
  }
*/

var Service;
var Characteristic;
var HomebridgeAPI;

var exec = require('child_process').exec;

var POOLTIME_MS = 3000;

module.exports = function(homebridge) {
    // Service and Characteristic are from hap-nodejs
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    HomebridgeAPI = homebridge;

    // Register accessory
    homebridge.registerAccessory("homebridge-licenseplatesdetector", "LicensePlatesDetector", LicensePlatesDetector);
};

// Accessory constructor
function LicensePlatesDetector(log, config) {
	this.log = log;
	this.name = config.name;
  this.log("New LicensePlatesDetector named " + this.name);

  // Get configuration
  this.command = config.command;
  this.poolTimingMS = config.poolTimingMS || POOLTIME_MS;
  this.licenseplates = config.licenseplates || [];

  this.updateLicensePlatesDetection();
}

LicensePlatesDetector.prototype = {
  // Identificator
  identify: function(callback) {
    this.log("Identifcation requested!");
    callback(null);
  },
  updateLicensePlatesDetection: function() {
    exec(this.command, (function(error, stdout, stderr) {
      // Search for any License Plates in the output
      for (i in this.licenseplates) {
        // Get the license plate value
        var licenseplate = this.licenseplates[i];
        var value =
          (stdout.indexOf(substr) > -1) ?
          Characteristic.OccupancyDetected.OCCUPANCY_DETECTED :
          Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED;
        this.licensePlateDetected[licenseplate] = value;
        this.OccupancySensorServices[licenseplate]
          .getCharacteristic(Characteristic.OccupancyDetected)
          .setValue(value);
      }).bind(this));
    setTimeout(updateLicensePlatesDetection.bind(this), this.poolTimingMS);
  },
  getOccupancyDetected: function(callback) {
    self = this[0];
    licenseplate = this[1];
    callback(null, self.licensePlateDetected[licenseplate]);
  },
  getServices: function() {
    var informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "MM Manufacturer")
      .setCharacteristic(Characteristic.Model, "MM Model")
      .setCharacteristic(Characteristic.SerialNumber, "MM SN");

    var services = [informationService];
    for (i in this.licenseplates) {
      var licenseplate = this.licenseplates[i];
      var service = new Service.OccupancySensor(licenseplate);
      this.OccupancySensorService[licenseplate] = service;

      // Required Characteristics
          // Characteristic.OccupancyDetected : [READ]
      service.getCharacteristic(Characteristic.OccupancyDetected)
        .on('get', this.getOccupancyDetected.bind([this, licenseplate]));
      services.push(service);
    }

    return services;
  }
};
