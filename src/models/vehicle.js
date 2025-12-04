const mongoose = require('mongoose');

const VehicleSchema = new mongoose.Schema({
    patente: { type: String, required: true, unique: true, index: true },
    modelo: { type: String, required: true },
    color: { type: String },
    owner_rut: { type: String, ref: 'Citizen' } // Referencia flexible por RUT
});

module.exports = mongoose.model('Vehicle', VehicleSchema);