var mongoose = require("mongoose");
var Impression = require("../data/impression");
var Bidder = require("../data/bidder");

var _ = require("underscore");

module.exports = {
    getImpression: function getImpression(id) {
        return new Promise((resolve, reject) => {
            console.log("impression id is::" + id);
        Impression.findOne({imp_id: id}, function (err, imp) {
            if (err) {
                console.log("error is::" + err);

                reject(err);
            } else {
                //console.log("impression is::" + imp);

                resolve(imp);
            }
        });
    });
    },
     loadBidders: function(){
         return new Promise ((resolve, reject) =>  {
             Bidder.find({}).sort({bidder_priority: 'asc'}).exec(function(err, bidders) {
             if (err) {
                 console.log("error is::" + err);

                 reject(err);
             } else {
                 //console.log("bidders are::" + bidders);

                 resolve(bidders);
              }
             });
     });

     }

}