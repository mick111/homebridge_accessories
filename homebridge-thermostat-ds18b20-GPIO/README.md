# homebridge-thermostat-ds18b20-gpio
This is a plugin for making thermostat with DS18B20 temperature sensors and
GPIO for heating command.

Installation
--------------------
    sudo npm install -g homebridge-thermostat-ds18b20-gpio

Sample HomeBridge Configuration
--------------------
  {
      "accessory": "Thermostat-DS18B20-GPIO",
      "name": "Thermostat Bedroom",
      "DS18B20": "28-0000063f4ead",
      "Heat_BCM_GPIO": 14,
      "Heat_Command_Value": 1,
      "maxHeatingValue": 23,
      "removeForceHeating": true,
      "removeForceCooling": true
  }
