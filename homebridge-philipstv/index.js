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
            "accessory": "PhilipsTV",
            "name": "TV Philips",
            "username": "theusernamegenerated",
            "password": "thepasswordgenerated",
            "wol_mac": "XX:XX:XX:XX:XX:XX",
            "hostname": "192.168.XX.XX"
        }
      ],

      "platforms": []
}
*/

var Service, Characteristic;
var https = require('https');
var wol = require('wol');
var www_authenticate = require('www-authenticate');

module.exports = function(homebridge) {
    // Service and Characteristic are from hap-nodejs
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    // Register accessory
    homebridge.registerAccessory("homebridge-philipstv", "PhilipsTV", PhilipsTV);
};


// Accessory constructor
function PhilipsTV(log, config) {
	this.log = log;

  this.name = config.name;
  this.log("Creation of PhilipsTV named " + this.name);

  this.keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 1 });

  // Options configuration for request
  this.optionsBase = {
    hostname: config["hostname"],
    port: 1926,
    agent: this.keepAliveAgent,
    rejectUnauthorized: false
  };

  this.macAddress = config["wol_mac"];

  this.on_www_authenticate = www_authenticate(config["username"], config["password"]);

  this.infiniteWakeOnLAN(config["WakeOnLANPool"]);
};




PhilipsTV.prototype = {
  turnOnIfNeeded: function(self, path, method, json, homebridge_callback) {
    if (path=='/6/powerstate' && method == 'GET' && json != undefined && json.powerstate == 'Standby') {
      self.makeRequest('/6/input/key', 'POST', "{ \"key\"  : \"Standby\" }");

    }
    homebridge_callback();
  },
  turnOffIfNeeded: function(self, path, method, json, homebridge_callback) {
    if (path=='/6/powerstate' && method == 'GET' && json != undefined && json.powerstate == 'On') {
      self.makeRequest('/6/input/key', 'POST', "{ \"key\"  : \"Standby\" }");
    }
    homebridge_callback();
  },
  powerstateHandler: function(self, path, method, json, homebridge_callback) {
    if (path=='/6/powerstate' && method == 'GET' && json != undefined) {
      homebridge_callback(null, json.powerstate == 'On');
    }
  },
  getVolumeHandler: function(self, path, method, json, homebridge_callback) {
    if (path=='/6/audio/volume' && method == 'GET' && json != undefined) {
      homebridge_callback(json.current);
    }
  },
  setVolumeHandler: function(self, path, method, json, homebridge_callback) {
    homebridge_callback();
  },
  infiniteWakeOnLAN: function(time) {
    //this.log("Waking...", this.macAddress);
    wol.wake(this.macAddress);
    self = this;
    setTimeout(function() {
        self.infiniteWakeOnLAN(time);
    }, time);
  },
  makeRequest: function(path, method, postData, authorizationHeader, callback, tries, homebridge_callback) {
    var options = this.optionsBase;
    options['path'] = path;
    options['method'] = method;

    self = this;

    //this.log('Constructing request with options:', options);
    request = https.request(options, (response) => {
      // Status code of result
      //this.log('statusCode:', response.statusCode);

      var str = '';
      // result data listener
      response.on('data', function (chunk) { str += chunk; });
      // result end listener
      response.on('end', function () {
        //var obj = JSON.parse(str);
        if (response.statusCode == 200 && callback != undefined) {
          if (str == '') {
            callback(self, path, method, undefined, homebridge_callback);
          } else {
            json = JSON.parse(str);
            callback(self, path, method, json, homebridge_callback);
          }
        }
        str = '';
      });


      // If Status Code is 401, we have to reperform the request with correct headers
      if (response.statusCode == 401) {
          var authenticator = this.on_www_authenticate(response.headers['www-authenticate']);
          var authorizationHeader = authenticator.authorize(method, path)
          response.resume();
          this.makeRequest(path, method, postData, authorizationHeader, callback, tries, homebridge_callback);
      }
    });

    // Add Authorization Header if provided
    if (authorizationHeader != undefined) {
      //this.log('Adding Authorization Header to request:', authorizationHeader);
      request.setHeader('Authorization', authorizationHeader);
    }

    if (postData != undefined) {
      request.write(postData);
    }

    // Configuration of error
    request.on('error', (e) => {
      this.log(e);
      if (tries > 0) {
        wol.wake(this.macAddress);
        self = this;
        setTimeout(function() {
            self.makeRequest(path, method, postData, authorizationHeader, callback, tries-1, homebridge_callback);
        }, 1000);
      }
    });
    request.setTimeout(1000);

    //this.log('Calling end():', request);
    request.end();
  },
  getPowerState: function(callback) {
    wol.wake(this.macAddress);
    this.log("Get powerstate");

    self = this;
    //setTimeout(function() {
      self.makeRequest('/6/powerstate', 'GET', undefined, undefined, this.powerstateHandler, 10, callback);
    //}, 1000);
  },
	setPowerState: function(powerOn, callback) {
    if (powerOn) {
      wol.wake(this.macAddress);
      self = this;
      //setTimeout(function() {
        self.makeRequest('/6/powerstate', 'GET', undefined, undefined, this.turnOnIfNeeded, 10, callback);
      //}, 1000);
    } else {
      this.makeRequest('/6/powerstate', 'GET', undefined, undefined, this.turnOffIfNeeded, 10, callback);
    }
  },

  getBrightness: function(callback) {
    wol.wake(this.macAddress);
    this.log("Get Volume");
    this.makeRequest('/6/audio/volume', 'GET', undefined, undefined, this.getVolumeHandler, 10, callback);
  },
	setBrightness: function(brightness, callback) {
    if (brightness > 30) {
      callback();
      return;
    }
    this.makeRequest('/6/audio/volume', 'POST', JSON.stringify({"current": brightness, "muted": false}), undefined, this.setVolumeHandler, 10, callback);
  },

  identify: function(callback) {
		this.log("Identify requested!");
		callback(); // success
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
    .addCharacteristic(new Characteristic.Brightness())
      .on('get', this.getBrightness.bind(this))
      .on('set', this.setBrightness.bind(this));

    return [informationService, this.lightbulbService];
    }
};
