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
      self.makeRequest('/6/input/key', 'POST', "{ \"key\"  : \"Standby\" }";
    }
    homebridge_callback();
  },
  getVolumeHandler: function(self, path, method, json, homebridge_callback) {
    if (path=='/6/audio/volume' && method == 'GET' && json != undefined) {
      homebridge_callback(null, json.current);
    }
  },
  powerstateHandler: function(self, path, method, json, homebridge_callback) {
    if (path=='/6/powerstate' && method == 'GET' && json != undefined) {
      homebridge_callback(null, json.powerstate == 'On');
    }
  },
  setVolumeHandler: function(self, path, method, json, homebridge_callback) {
    homebridge_callback();
  },
  makeRequest: function(path, method, postData, authorizationHeader, callback, tries, homebridge_callback, self) {
    if (self == undefined) { self = this; }
    var options = self.optionsBase;
    options['path'] = path;
    options['method'] = method;

    //this.log('Constructing request', method, path, ((tries == undefined) ? "" : "("+tries+")"));
    request = https.request(options, (response) => {
      // Status code of response
      self.log('Status Code:', response.statusCode);

      // Variable to concatenate chunks of received data
      var str = '';

      // Chunk of data listener
      response.on('data', function (chunk) { str += chunk; });

      // End of request listener
      response.on('end', function () {
        // A status code of 200 indicates that the response is OK
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
          self.makeRequest(path, method, postData, authorizationHeader, callback, tries, homebridge_callback, self);
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
      self.log('Error:', e.code);
      wol.wake(this.macAddress);

      if (tries > 0 && (e.code == 'ECONNREFUSED' || e.code == 'EHOSTDOWN')) {
        self.log("Programming to reiter request in 1 second");
        setTimeout(self.makeRequest, 1000, path, method, postData, authorizationHeader, callback, tries-1, homebridge_callback, self);
      }
    });

    request.setTimeout(1000);
    request.on('timeout', () => {
      self.log('Request timeout, waking device');
      wol.wake(this.macAddress);
    });

    //this.log('Calling end():', request);
    wol.wake(this.macAddress);
    request.end();
  },
  getPowerState: function(callback) {
    wol.wake(this.macAddress);
    this.log("Get powerstate");
    this.makeRequest('/6/powerstate', 'GET', undefined, undefined, this.powerstateHandler, 10, callback, this);
  },
	setPowerState: function(powerOn, callback) {
    if (powerOn) {
      wol.wake(this.macAddress);
      this.makeRequest('/6/powerstate', 'GET', undefined, undefined, this.turnOnIfNeeded, 10, callback, this);
    } else {
      this.makeRequest('/6/powerstate', 'GET', undefined, undefined, this.turnOffIfNeeded, 10, callback, this);
    }
  },
  getVolume: function(callback) {
    wol.wake(this.macAddress);
    this.log("Get Volume");
    this.makeRequest('/6/audio/volume', 'GET', undefined, undefined, this.getVolumeHandler, 10, callback, this);
  },
	setVolume: function(value, callback) {
    if (value > 30) {
      callback();
      return;
    }
    this.makeRequest('/6/audio/volume', 'POST', JSON.stringify({"current": value, "muted": false}), undefined, this.setVolumeHandler, 10, callback, this);
  },
  identify: function(callback) {
		this.log("Identify requested!");
		callback(); // success
	},
  getServices: function() {
    var informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Manufacturer, this.name)
      .setCharacteristic(Characteristic.Model, this.name)
      .setCharacteristic(Characteristic.SerialNumber, this.macAddress);

    this.fanService = new Service.Fan(this.name);
    this.fanService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getPowerState.bind(this))
      .on('set', this.setPowerState.bind(this));

    this.fanService
    .addCharacteristic(Characteristic.RotationSpeed)
      .on('get', this.getVolume.bind(this))
      .on('set', this.setVolume.bind(this));

    return [informationService, this.fanService];
    }
};
