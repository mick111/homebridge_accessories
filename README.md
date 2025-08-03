# homebridge_accessories

# In terminal as pi user

    sudo cp -r /home/pi/Projects/homebridge_accessories/homebridge-ledmatrix /var/lib/homebridge/node_modules
    sudo chown -R homebridge:homebridge /var/lib/homebridge/node_modules
    
# In Hombridge UI terminal: http://<homebridge>:8581/platform-tools/terminal

    cd /var/lib/homebridge/node_modules/homebridge-ledmatrix/
    npm install .
    npm link