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
  turnOnIfNeeded: function(path, method, json, homebridge_callback) {
    if (path=='/6/powerstate' && method == 'GET' && json != undefined && json.powerstate == 'Standby') {
      this.makeRequest('/6/input/key', 'POST', "{ \"key\"  : \"Standby\" }");
    }
    homebridge_callback();
  },
  turnOffIfNeeded: function(path, method, json, homebridge_callback) {
    if (path=='/6/powerstate' && method == 'GET' && json != undefined && json.powerstate == 'On') {
      this.makeRequest('/6/input/key', 'POST', "{ \"key\"  : \"Standby\" }");
    }
    homebridge_callback();
  },
  getVolumeHandler: function(path, method, json, homebridge_callback) {
    if (path=='/6/audio/volume' && method == 'GET' && json != undefined) {
      homebridge_callback(null, json.current);
    }
  },
  powerstateHandler: function(path, method, json, homebridge_callback) {
    if (path=='/6/powerstate' && method == 'GET' && json != undefined) {
      homebridge_callback(null, json.powerstate == 'On');
    }
  },
  ambilightcurrentconfigurationHandler: function(path, method, json, homebridge_callback) {
    if (path=='/6/ambilight/currentconfiguration' && method == 'GET' && json != undefined) {
      homebridge_callback(null, json.styleName == "OFF");
    }
  },
  setAmbilightcurrentconfigurationHandler: function(path, method, json, homebridge_callback) {
    homebridge_callback();
  },
  setVolumeHandler: function(path, method, json, homebridge_callback) {
    homebridge_callback();
  },
  makeRequest: function(path, method, postData, authorizationHeader, callback, tries, homebridge_callback) {
    var options = this.optionsBase;
    options['path'] = path;
    options['method'] = method;

    //this.log('Constructing request', method, path, ((tries == undefined) ? "" : "("+tries+")"));
    request = https.request(options, (function(response) {
      // Status code of response
      //this.log('Status Code:', response.statusCode);

      // Variable to concatenate chunks of received data
      var str = '';

      // Chunk of data listener
      response.on('data', function (chunk) { str += chunk; });
      // End of request listener
      response.on('end', (function () {
        // A status code of 200 indicates that the response is OK
        if (response.statusCode == 200 && callback != undefined) {
          if (str == '') {
            callback.bind(this, path, method, undefined, homebridge_callback);
          } else {
            json = JSON.parse(str);
            callback.bind(this, path, method, json, homebridge_callback);
          }
        }
        str = '';
      }).bind(this));


      // If Status Code is 401, we have to reperform the request with correct headers
      if (response.statusCode == 401) {
        var authenticator = this.on_www_authenticate(response.headers['www-authenticate']);
        var authorizationHeader = authenticator.authorize(method, path)
        response.resume();
        this.makeRequest(path, method, postData, authorizationHeader, callback, tries, homebridge_callback);
      }
    }).bind(this));

    // Add Authorization Header if provided
    if (authorizationHeader != undefined) {
      //this.log('Adding Authorization Header to request:', authorizationHeader);
      request.setHeader('Authorization', authorizationHeader);
    }

    if (postData != undefined) {
      request.write(postData);
    }

    // Configuration of error
    request.on('error', (function(e) {
      this.log('Error:', e.code);
      wol.wake(this.macAddress);

      if (tries > 0 && (e.code == 'ECONNREFUSED' || e.code == 'EHOSTDOWN')) {
        this.log("Programming to reiter request in 1 second");
        setTimeout(this.makeRequest.bind(this, path, method, postData, authorizationHeader, callback, tries-1, homebridge_callback), 1000);
      }
    }).bind(this));

    request.setTimeout(1000);
    request.on('timeout', (function () {
      this.log('Request timeout, waking device ' + this.macAddress);
      wol.wake(this.macAddress);
    }).bind(this));

    //this.log('Calling end():', request);
    wol.wake(this.macAddress);
    request.end();
  },
  getMute: function(callback) {
    this.log("Get powerstate");
    this.makeRequest('/6/powerstate', 'GET', undefined, undefined, this.powerstateHandler.bind(this), 10, callback);
  },
  setMute: function(powerOn, callback) {
    if (powerOn) {
      this.makeRequest('/6/powerstate', 'GET', undefined, undefined, this.turnOffIfNeeded.bind(this), 10, callback);
    } else {
      this.makeRequest('/6/powerstate', 'GET', undefined, undefined, this.turnOnIfNeeded.bind(this), 10, callback);
    }
  },
  // getRotationDirection: function(callback) {
  //   //wol.wake(this.macAddress);
  //   //this.log("Get powerstate");
  //   //this.makeRequest('/6/powerstate', 'GET', undefined, undefined, this.powerstateHandler, 10, callback, this);
  //   callback(null, Characteristic.RotationDirection.CLOCKWISE);
  // },
  // setRotationDirection: function(direction, callback) {
  //   if (Characteristic.RotationDirection.CLOCKWISE == direction) {
  //     //wol.wake(this.macAddress);
  //     //this.makeRequest('/6/powerstate', 'GET', undefined, undefined, this.turnOnIfNeeded, 10, callback, this);
  //   } else if (Characteristic.RotationDirection.COUNTER_CLOCKWISE == direction) {
  //     //this.makeRequest('/6/powerstate', 'GET', undefined, undefined, this.turnOffIfNeeded, 10, callback, this);
  //   }
  //   callback();
  // },
  getSwingMode: function(callback) {
    this.log("Get ambilight currentconfiguration");
    this.makeRequest('/6/ambilight/currentconfiguration', 'GET', undefined, undefined, this.ambilightcurrentconfigurationHandler.bind(this), 10, callback);
  },
  setSwingMode: function(mode, callback) {
    if (Characteristic.SwingMode.SWING_DISABLED == mode) {
      this.makeRequest('/6/ambilight/currentconfiguration', 'POST', JSON.stringify({"styleName":"OFF","isExpert":false}), undefined, this.setAmbilightcurrentconfigurationHandler.bind(this), 10, callback);
    } else if (Characteristic.SwingMode.SWING_ENABLED == mode) {
      this.makeRequest('/6/ambilight/currentconfiguration', 'POST', JSON.stringify({"styleName":"FOLLOW_VIDEO","isExpert":false,"menuSetting":"STANDARD"}), undefined, this.setAmbilightcurrentconfigurationHandler.bind(this), 10, callback);
    } else {
      callback();
    }
  },
  getVolume: function(callback) {
    this.log("Get Volume");
    this.makeRequest('/6/audio/volume', 'GET', undefined, undefined, this.getVolumeHandler.bind(this), 10, callback);
  },
  setVolume: function(value, callback) {
    if (value > 90) {
      callback();
      return;
    }
    if (value > 60) { value = 60; }
    this.makeRequest('/6/audio/volume', 'POST', JSON.stringify({"current": value, "muted": false}), undefined, this.setVolumeHandler.bind(this), 10, callback);
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

    service = new Service.Speaker(this.name);
    service
      .getCharacteristic(Characteristic.Mute)
      .on('get', this.getPowerState.bind(this))
      .on('set', this.setPowerState.bind(this));
    service
      .addCharacteristic(Characteristic.Volume)
      .on('get', this.getVolume.bind(this))
      .on('set', this.setVolume.bind(this));
    service
      .getCharacteristic(Characteristic.Volume)
      .setProps({
        format: Characteristic.Formats.UINT8,
        unit: Characteristic.Units.PERCENTAGE,
        maxValue: 60,
        minValue: 1,
        minStep: 1,
        perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
      });
    // this.service
    //   .addCharacteristic(Characteristic.RotationDirection)
    //   .on('get', this.getRotationDirection.bind(this))
    //   .on('set', this.setRotationDirection.bind(this));
    // service
    //   .addCharacteristic(Characteristic.SwingMode)
    //   .on('get', this.getSwingMode.bind(this))
    //   .on('set', this.setSwingMode.bind(this));

    return [informationService, service];
  }
};
