var mongoose = require("mongoose");

var BidderDetailsSchema = new mongoose.Schema({
  bidder_id : String,	
  bidder_name: String,
  bidder_url: String,
  bidder_priority: Number
});

module.exports = mongoose.model('bidder', BidderDetailsSchema);