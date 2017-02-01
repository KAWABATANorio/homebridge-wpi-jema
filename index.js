const wpi = require('node-wiring-pi');

const sysfs = require('./lib/readExports.js');
const JEMAAccessory = require('./lib/JEMAAccessory.js');
const AutoExport = require('./lib/autoExport.js');

var Accessory, Service, Characteristic, UUIDGen;


module.exports = function (homebridge) {

  // Accessory must be created from PlatformAccessory Constructor
  Accessory = homebridge.platformAccessory;

  // Service and Characteristic are from hap-nodejs
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform("homebridge-gpio-jema", "WiringPiJEMAPlatform", JEMAPlatform, false);
}

// Platform constructor
function JEMAPlatform(log, config, api) {
  log("WORK IN PROGRESS... Report issues on https://github.com/KAWABATANorio/homebridge-gpio-jema");
  var platform = this;
  this.log = log;
  this.config = config;
  this.terminals = this.config.terminals;
  this.accessories = [];
  this.gpiopins = [];
  for (var i in this.terminals) {
    this.gpiopins.push(this.terminals[i].monitorPin, this.terminals[i].controlPin);
  }

  //Export pins via sysfs if enabled with autoExport
  if ((typeof this.config.autoExport !== undefined) && (this.config.autoExport == true)) {
    AutoExport(this.log, this.gpiopins);
  }

  //Configure wiring pi using 'sys' mode - requires pins to
  //have been exported via `gpio export`
  wpi.setup('sys');

  if (api) {
    // Save the API object as plugin needs to register new accessory via this object.
    this.api = api;
    platform.log("homebridge API version: " + api.version);

    // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories
    // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
    // Or start discover new accessories
    this.api.on('didFinishLaunching', function () {
      platform.log("Loading cached GPIO pins complete");
      for (var i in this.terminals) { this.addTerminal(this.terminals[i]); }

      //Start polling all pins...
      this.statePolling();
    }.bind(this));
  }
}

// Function invoked when homebridge tries to restore cached accessory
JEMAPlatform.prototype.configureAccessory = function (accessory) {
  this.log(accessory.displayName, "Configure GPIO Pin", accessory.UUID);
  var platform = this;

  if (platform.config.overrideCache == true) {
    var newContext = platform.terminals.find(p => p.name === accessory.context.name);
    accessory.context = newContext;
  }

  //Check reachability by querying the sysfs path
  var exportMonitorState = sysfs(accessory.context.monitorPin.pin);
  var exportControlState = sysfs(accessory.context.controlPin.pin);

  if (!exportMonitorState.error && !exportControlState.error) {
    if (exportMonitorState.direction === accessory.context.monitorPin.mode
      && exportControlState.direction === accessory.context.controlPin.mode) {
      accessory.reachable = true;
    }
  }

  accessory.reachable = true;

  var onChar;
  if (accessory.getService(Service.Switch)) {
    onChar = accessory.getService(Service.Switch).getCharacteristic(Characteristic.On);
  }

  var jemaAccessory = new JEMAAccessory(platform.log, accessory, wpi, onChar);

  accessory.getService(Service.Switch)
    .getCharacteristic(Characteristic.On)
    .on('get', jemaAccessory.getOn.bind(jemaAccessory))
    .on('set', jemaAccessory.setOn.bind(jemaAccessory));

  // Handle the 'identify' event
  accessory.on('identify', function (paired, callback) {
    platform.log(accessory.displayName, "Identify!!!");
    // TODO: run 3000ms on/off?
    callback();
  });


  this.accessories.push(accessory);
}

//Handler will be invoked when user try to config your plugin
//Callback can be cached and invoke when nessary
JEMAPlatform.prototype.configurationRequestHandler = function (context, request, callback) {
  console.log("Not Implemented");
}

JEMAPlatform.prototype.addTerminal = function (terminal) {
  var platform = this;
  var uuid;

  uuid = UUIDGen.generate(terminal.name);

  var uuidExists = this.accessories.filter(function (item) {
    return item.UUID == uuid;
  }).length;

  if (uuidExists == 0) {
    this.log("New JEMA Terminal from config.json: " + terminal.name + " (" + terminal.controlPin.pin + ", " + terminal.monitorPin.pin + ")");

    var newAccessory = new Accessory(terminal.name, uuid);

    newAccessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, platform.config.manufacturer ? platform.config.manufacturer : "Raspberry Pi Foundation")
      .setCharacteristic(Characteristic.Model, platform.config.model ? platform.config.model : "Pi GPIO")
      .setCharacteristic(Characteristic.SerialNumber, platform.config.serial ? platform.config.serial : "Default-SerialNumber");

    newAccessory.addService(Service.Switch, terminal.name);

    newAccessory.context = terminal;

    this.configureAccessory(newAccessory);
    this.api.registerPlatformAccessories("homebridge-WPiJEMAPlatform", "JEMAPlatform", [newAccessory]);
  }
}

JEMAPlatform.prototype.updateAccessoriesReachability = function () {
  this.log("Update Reachability");
  for (var index in this.accessories) {
    var accessory = this.accessories[index];
    accessory.updateReachability(false);
  }
}

// Sample function to show how developer can remove accessory dynamically from outside event
JEMAPlatform.prototype.removeAccessory = function (accessory) {
  this.log("Remove Accessory");
  this.api.unregisterPlatformAccessories("homebridge-WPiJEMAPlatform", "JEMAPlatform", this.accessories);

  this.accessories = [];
}

// Method for state periodic update
JEMAPlatform.prototype.statePolling = function () {
  var platform = this;

  // Clear polling
  //clearTimeout(this.tout);

  // Setup periodic update with polling interval
  this.tout = setTimeout(function () {
    // Update states for all HomeKit accessories
    for (var deviceID in platform.accessories) {
      var accessory = platform.accessories[deviceID];
      if (accessory.context.monitorPin.polling == true) {
        accessory.getService(Service.Switch).getCharacteristic(Characteristic.On).getValue();
      }
    }

    // Setup next polling
    platform.statePolling();

  }, 2000);
}
