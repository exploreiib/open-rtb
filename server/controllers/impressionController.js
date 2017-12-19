var mongoose = require("mongoose");
var ImpressionDetails = require("../data/impression_dtls");
var _ = require("underscore");

var getImpression = function getImpression(id) {
    ImpressionDetails.find({ imp_id: id },function (err, impression) {
        if (err)
            res.send(err);
        else
            res.json(impression);
    });
}


module.exports = getImpression;
