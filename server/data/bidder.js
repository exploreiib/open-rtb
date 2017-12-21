var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var BidderDetailsSchema = Schema({
  bidder_id : String,	
  bidder_name: String,
  bidder_url: String,
  bidder_priority: Number
});

module.exports = mongoose.model('bidder', BidderDetailsSchema);