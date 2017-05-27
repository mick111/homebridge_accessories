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
   "accessory": "Ledmatrix",
   "name": "Matrice Porte",
   "fileinformation": "/tmp/json.json"
   }
   ],

   "platforms": []
   }

 */

var Service, Characteristic;
var fs = require('fs');

module.exports = function(homebridge) {
    // Service and Characteristic are from hap-nodejs
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    // Register accessory
    homebridge.registerAccessory("homebridge-ledmatrix", "Ledmatrix", Ledmatrix);
};


// Accessory constructor
function Ledmatrix(log, config) {
    this.log = log;
    this.name = config.name;
    this.log("Creation of Ledmatrix named " + this.name);

    this.brightness = 0;
    this.hue = 0;
    this.saturation = 0;
    this.powerState = false;
    // Get file configuration
    this.fileinformation = config["fileinformation"];
    if (fs.existsSync(this.fileinformation)) {
        this.readFileInformation();
    } else {
        this.writeFileInformation();
    }
    this.log("File information path: " + this.fileinformation);
};

Ledmatrix.prototype = {
readFileInformation: function() {
                         try {
                             var json = JSON.parse(fs.readFileSync(this.fileinformation, 'utf8'));

                             this.brightness = json["brightness"];
                             this.hue = json["hue"];
                             this.saturation = json["saturation"];
                             this.powerState = json["powerState"];
                         } catch (err) {
                             // Nothing special to do. We'll try next time.
                         }
                     },

writeFileInformation: function() {
                          var json = {
                              "brightness":this.brightness,
                              "hue":this.hue,
                              "saturation":this.saturation,
                              "powerState":this.powerState
                          };
                          fs.writeFileSync(this.fileinformation, JSON.stringify(json));
                      },

getPowerState: function(callback) {
                   this.readFileInformation();
                   this.log("Get powerstate");
                   this.log(this.powerState);
                   callback(null, this.powerState);
               },
setPowerState: function(powerState, callback) {
                   this.log("PowerState -> ", powerState);
                   this.powerState = powerState;
                   this.writeFileInformation();
                   callback();
               },

getBrightness: function(callback) {
                   this.readFileInformation();
                   this.log("Get brightness");
                   this.log(this.brightness);
                   callback(null, this.brightness);
               },
setBrightness: function(brightness, callback) {
                   this.log("Brightness -> ", brightness);
                   this.brightness = brightness;
                   this.writeFileInformation();
                   callback();
               },

getSaturation: function(callback) {
                   this.readFileInformation();
                   this.log("Get saturation");
                   this.log(this.saturation);
                   callback(null, this.saturation);
               },
setSaturation: function(saturation, callback) {
                   this.log("Saturation -> ", saturation);
                   this.saturation = saturation;
                   this.writeFileInformation();
                   callback();
               },

getHue: function(callback) {
            this.readFileInformation();
            this.log("Get hue");
            this.log(this.hue);
            callback(null, this.hue);
        },
setHue: function(hue, callback) {
            this.log("Hue -> ", hue);
            this.hue = hue;
            this.writeFileInformation();
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

                 this.lightbulbService
                     .addCharacteristic(new Characteristic.Saturation())
                     .on('get', this.getSaturation.bind(this))
                     .on('set', this.setSaturation.bind(this));

                 this.lightbulbService
                     .addCharacteristic(new Characteristic.Hue())
                     .on('get', this.getHue.bind(this))
                     .on('set', this.setHue.bind(this));

                 this.lightbulbService
                     .addCharacteristic(new Characteristic.Brightness())
                     .on('get', this.getBrightness.bind(this))
                     .on('set', this.setBrightness.bind(this));

                 return [informationService, this.lightbulbService];
             }
};
