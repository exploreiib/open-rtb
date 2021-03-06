var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var ImpressionDetailsSchema = Schema({
  imp_id : String,	
  publisher_id: String,
  publisher_name: String,
  imp_type: String,
  imp_dimension: Schema.Types.Mixed,
  publisher_source: String,
  bidfloor: Number
});

module.exports = mongoose.model('impression', ImpressionDetailsSchema);