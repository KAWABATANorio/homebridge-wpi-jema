'use strict';

var Service, Characteristic

function JEMAAccessory(log, accessory, wpi, onChar) {
    var self = this;

    this.accessory = accessory;
    this.log = log;
    this.context = accessory.context;
    this.monitorPin = accessory.context.monitorPin;
    this.controlPin = accessory.context.controlPin;
    this.wpi = wpi;
    this.onChar = onChar;
}

JEMAAccessory.prototype.getOn = function (callback) {
    // inverted XOR pin_value
    var on = (this.monitorPin.inverted != this.wpi.digitalRead(this.monitorPin.pin));
    callback(null, on);
}

JEMAAccessory.prototype.setOn = function (on, callback) {
    var duration = this.controlPin.duration;
    var monitorPin = this.monitorPin;
    var controlPin = this.controlPin;

    var monitorOn = (this.monitorPin.inverted != this.wpi.digitalRead(this.monitorPin.pin));
    if (monitorOn != on) {
        this.pinAction(controlPin, !this.controlPin.inverted * 1);
        if (is_defined(duration) && is_int(duration)) {
            this.pinTimer(controlPin);
        }
        callback(null);
    }
}

JEMAAccessory.prototype.pinAction = function (pin, action) {
    this.log('Turning ' + (action == (!pin.inverted * 1) ? 'on' : 'off') + ' pin #' + pin.pin);

    this.wpi.digitalWrite(pin.pin, action);
    var success = (this.wpi.digitalRead(pin.pin) == action);
    return success;
}

JEMAAccessory.prototype.pinTimer = function (pin) {
    var self = this;
    setTimeout(function () {
        self.log('Timer expired ' + pin.duration + 'ms');
        self.pinAction(pin, pin.inverted * 1);
        self.onChar.getValue();
    }, self.context.duration);
}

// Check value is a +ve integer
var is_int = function (n) {
    return (n > 0) && (n % 1 === 0);
}

var is_defined = function (v) {
    return typeof v !== 'undefined';
}

module.exports = JEMAAccessory;