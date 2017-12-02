# homebridge-philipstv
Homebridge module for Philips TV (with JointSpace enabled)

# Configuration
Example accessory config to be added to the homebridge config.json:
 ```
"accessories": [
  {
      "accessory": "PhilipsTV",
      "name": "TV Philips",
      "username": "theusernamegenerated",
      "password": "thepasswordgenerated",
      "wol_mac": "XX:XX:XX:XX:XX:XX",
      "hostname": "192.168.XX.XX"
  }
]
 ```
