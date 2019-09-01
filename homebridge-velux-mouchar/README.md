# homebridge-velux-mouchar
Homebridge module for having the opening state of the velux with the mouchar

# Configuration
Example accessory config to be added to the homebridge config.json:
 ```
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
 ```
