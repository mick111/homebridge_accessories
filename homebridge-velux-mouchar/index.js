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
      "accessory": "Velux-Mouchar",
      "name": "Velux",
      "distance": "/distance",
      "port": "80",
      "minimum": "50",
      "maximum": "500",
      "hostname": "192.168.XX.XX"
  }
]

"platforms": []
}
*/
var Service, Characteristic;
var https = require('http');

module.exports = function(homebridge) {
  // Service and Characteristic are from hap-nodejs
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  // Register accessory
  homebridge.registerAccessory("homebridge-velux-mouchar", "Velux-Mouchar", VeluxMouchar);
};


// Accessory constructor
function VeluxMouchar(log, config) {
  this.log = log;

  this.name = config.name;
  this.log("Creation of Velux-Mouchar named " + this.name);

  this.keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 1 });

  // Options configuration for request
  this.optionsBase = {
    hostname: config["hostname"],
    port: config["port"],
    agent: this.keepAliveAgent,
    rejectUnauthorized: false
  };
  this.makeRequest('/distance', 'GET', undefined, undefined, this.getCurrentPositionHandler.bind(this), 10, undefined);
};


VeluxMouchar.prototype = {
  // openIfNeeded: function(path, method, json, homebridge_callback) {
  //   if (path=='/post' && method == 'GET' && json != undefined && json.powerstate == 'Standby') {
  //     this.makeRequest('/6/input/key', 'POST', "{ \"key\"  : \"Standby\" }");
  //   }
  //   homebridge_callback();
  // },
  // closeIfNeeded: function(path, method, json, homebridge_callback) {
  //   if (path=='/6/powerstate' && method == 'GET' && json != undefined && json.powerstate == 'On') {
  //     this.makeRequest('/6/input/key', 'POST', "{ \"key\"  : \"Standby\" }");
  //   }
  //   homebridge_callback();
  // },
  getCurrentPositionHandler: function(path, method, distance, homebridge_callback) {
    if (path=='/distance' && method == 'GET' && distance != undefined && homebridge_callback != undefined) {
      homebridge_callback(null, (distance-50 / 50));
    }
  },
  makeRequest: function(path, method, postData, authorizationHeader, handler, tries, homebridge_callback) {
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
        if (response.statusCode == 200 && handler != undefined) {
          this.log('response.statusCode:', response.statusCode, ' -- ', str);
          handler(path, method, (str == '') ? undefined : str, homebridge_callback);
        }
        str = '';
      }).bind(this));
    }).bind(this));

    // Add Authorization Header if provided
    if (authorizationHeader != undefined) {
      request.setHeader('Authorization', authorizationHeader);
    }

    // Add data to POST request if provided
    if (postData != undefined) {
      request.write(postData);
    }

    // Configuration of error
    request.on('error', (function(e) {
      this.log('Error:', e.code);

      if (tries > 0 && (e.code == 'ECONNREFUSED' || e.code == 'EHOSTDOWN')) {
        this.log("Programming to reiter request in 1 second");
        setTimeout(this.makeRequest.bind(this, path, method, postData, authorizationHeader, handler, tries-1, homebridge_callback), 1000);
      }
    }).bind(this));

    request.setTimeout(1000);
    request.on('timeout', (function () {
      this.log('Request timeout');
    }).bind(this));
    request.end();
  },
  getCurrentPosition: function(callback) {
    this.log("Get Distance");
    this.makeRequest('/distance', 'GET', undefined, undefined, this.getCurrentPositionHandler.bind(this), 10, callback);
  },
  setCurrentPosition: function(value, callback) {
    this.makeRequest('/distance', 'POST', JSON.stringify({"current": value, "muted": false}), undefined, this.setVolumeHandler.bind(this), 10, callback);
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

    service = new Service.Window(this.name);
    characteristic = service.getCharacteristic(Characteristic.CurrentPosition)

    characteristic
      .on('get', this.getCurrentPosition.bind(this));
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
