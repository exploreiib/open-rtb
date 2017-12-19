// @ts-check

'use strict';


const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const fs = require('fs');
const path = require('path');
const winston = require('winston');
const url = require('url');

const openrtb = require('openrtb');
const moment = require('moment');
const uuidv1 = require('uuid/v1');
const fetch = require('node-fetch');
const mongoose = require("mongoose");

//
// Logger configuration
// -----------------------------------------------------------------------------
winston.handleExceptions(new winston.transports.Console({ colorize: true, json: true }));

const log_directory = 'log';
const log_filename = path.resolve(__dirname, `${log_directory}/-logfile.log`);
const timestamp_format = () => (new Date()).toLocaleTimeString();
const prettyprint_format = (obj) => JSON.stringify(obj, null, 2);

//Global Variables used 

let impCounter = 0;
var jsonParser = bodyParser.json();
var urlencodedParser = bodyParser.urlencoded({ extended: false })
var bidderInfoList = require("./bidder_config.json");

//controllers
var impressionController = require("./controllers/impressionController");


if (!fs.existsSync(log_directory)) {
    fs.mkdirSync(log_directory);
}

// @ts-ignore
const logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({
        timestamp: timestamp_format,
        colorize: true,
        level: 'debug',
        prettyPrint: prettyprint_format
      }),
      new (require('winston-daily-rotate-file'))({
        filename: log_filename,
        timestamp: timestamp_format,
        datePattern: 'yyyy-MM-dd',
        prepend: true,
        level: 'debug',
        json: false,
        prettyprint: prettyprint_format
      })
    ]
});


let bidRequest; 

//
// Logic that handles the sms endpoint.
// -----------------------------------------------------------------------------
const openRtbAdaptor = (req, res) => {
    logger.debug('Request received from Publisher Channel');
		

    const queryData = url.parse(req.url, true).query;
    //Stpe1: Create OpenRTB BidRequest
    //Step2: Invoke Bidders passing BidRequest
    impressionController.getImpression()

    impressionController.getImpression(queryData.id).then(function (impressionData) {
		build_json_bidrequest(bidRequest,impressionData).then(request => {
	           logger.debug('bidRequest before invoking bidders==>',request);			   
			   call_bidder.callBidder(request).then(adresponse => {
			   logger.debug('final adresponse ==>',adresponse);			   

			          res.send(adresponse);
			   }).catch(error => {
                logger.error('Rejecting Promise. Error calling Bidder', error);
				res.json(error);
        })
	    }).catch(error => {
                logger.error('Rejecting Promise. Error creating BidRequest', error);
				res.json(error);
	    })        
	});
		
	
};


const build_json_bidrequest = (bidRequest,impressionData) => {
    return new Promise ((resolve, reject) => {
		//logger.debug('Inside build_json_bidrequest----');
        var bidRequestBuilder = openrtb.getBuilder({
             builderType: 'bidRequest'
        });
  
            resolve(bidRequestBuilder
                .timestamp(moment.utc().format())
                .id(uuidv1())
                .at(2)
                .imp([
                    	build_imp_object('BANNER',queryData.width,queryData.height,queryData.bidfloor)
                    ])
                .build());
  
 
 });
};


//
// Helper function to create impression json object like Banner/Vedio/Native 
// -----------------------------------------------------------------------------
const build_imp_object = (impressionData) => {
	//impCounter = impCounter+1;
	var typeOfImp = impressionData.imp_type;
	if(typeOfImp === 'BANNER'){//Create BANNER object
		
	    return{  
		  "id":impressionData.imp_id,
		  "banner":(impressionData.imp_dimension)?impressionData.imp_dimension:null,
          "bidfloor": (impressionData.bidfloor)?impressionData.bidfloor:0
        };
			
	}else if(typeOfImp === 'VEDIO'){//Create VEDIO Object
	
	return{
		    "id":impressionData.imp_id,
	        "vedio": (impressionData.imp_dimension)?impressionData.imp_dimension:null,
            "bidfloor": (impressionData.bidfloor)?impressionData.bidfloor:0
    };
		
	}else if(typeOfImp === 'NATIVE'){//Create NATIVE Object
	
	 return{
		  "id":impressionData.imp_id,
         "native":{
            "request": {
               "ver": 1,
               "layout": 6,
               "assets": [
                       { "id": 0, "req": 1, "title": { "len": 25 } }, 
                       { "id": 1, "req": 1, "img": { "type": 3, "wmin": 100, "hmin": 100 } },
                       { "id": 3, "req": 0, "data": { "type": 2, "len": 90 } }
                    ]
               }
        },
	  
            "bidfloor": (impressionData.bidfloor)?impressionData.bidfloor:0

    };
		
	}else{//Create BANNER Object as default , if no typeOfImpression passed
	    return{  
		  "id":impressionData.imp_id,
		  "banner":(impressionData.imp_dimension)?impressionData.imp_dimension:null,
          "bidfloor": (impressionData.bidfloor)?impressionData.bidfloor:0
        };

    }	
	   
};

 
 
 const call_bidder =  {	
	
	callBidder: function(bidrequest){
		
	return new Promise ((resolve, reject) => {
		
		 var url = this.getBidderUrl(this.currentBidderIndex);
	  
	  const options = {
         method: 'POST',
         headers: {
             'Content-Type': 'application/json',
             'Accept': 'application/json',
			 'x-openrtb-version': '2.5'
         },
         body: JSON.stringify(bidrequest)
        };
	
fetch(url, options)
    .then(function(res) {
		if(!call_bidder.chekcForStatusCode(res)){
		//if(res && !res.status === 204){		
          return res.json();
		}else{
  			     logger.debug('sorry..Bid response is empty===>');
   		  	     call_bidder.currentBidderIndex = call_bidder.currentBidderIndex+1;
				  
				 if(call_bidder.currentBidderIndex < bidderInfoList.biddersInfo.length){
  				    resolve(call_bidder.callBidder(bidrequest));
				 }else{							  
				   logger.debug('No more bidders available..serve default ad...');
				 }
			  
		}  
    }).then(function(json) {
  	    logger.debug('Bid response is ===>',json);
		if(json){
		if(call_bidder.chekcForBidEmpty(json)){
			logger.debug('sorry..Bid response is empty===>');
   		  	call_bidder.currentBidderIndex = call_bidder.currentBidderIndex+1;
				  
			if(call_bidder.currentBidderIndex < bidderInfoList.biddersInfo.length){
  			    resolve(call_bidder.callBidder(bidrequest));
			}else{							  
			   logger.debug('No more bidders available..serve default ad...');
			}
		}else{	
		  resolve(json);
		}
	}		
    }).catch(err => {
		 			  	    logger.debug('error inside call bidder ===>',err);
				  	
		
	  });
     
    });		
     
	},

	getBidderUrl: function(index){
		logger.debug('try Bidder  url..===>',bidderInfoList.biddersInfo[index].url);
		return bidderInfoList.biddersInfo[index].url;
	},
	
	chekcForBidEmpty: function(bidResponse){
		let bidResponseObj =  JSON.parse(bidResponse);
		                  if(!bidResponseObj ||  !bidResponseObj.seatbid || bidResponseObj.seatbid.length === 0 || (bidResponseObj.nbr &&    bidResponseObj.nbr > 0 )){
	                          return true;	
	                      }else{		
                                      logger.debug('bidResponseObj.seatbid.length()==>',bidResponseObj.seatbid.length);
	                                return false;	
	                      }	
	},
	chekcForStatusCode: function(bidResponse){
		                   logger.debug('bidResponse.status==>',bidResponse.status);
                           if(!bidResponse)	   
		                          return true;

                       	   if(bidResponse.status === 204) return true;

							return false;   
	},
	currentBidderIndex:	0
	
	
 
 }

//
// Helper function to send json to back-end
// -----------------------------------------------------------------------------
const build_user_json_object = (userid ) => {
{//No field is manadatory..enite user object is optional
   return{
	  
              "id":uuidv1(),
              "buyeruid":uuidv1(),
              "keywords":"sports, entertainment",
              "yob":1976,
              "gender":"F",
              "ext":{
                  "ug":1,
                  "cookie_age":15
              }
      
    };
  }
};


const construct_bid_response = (bidRequest) =>  {
	
    return new Promise ((resolve, reject) => {
			var bidResponseBuilder = openrtb.getBuilder({
    builderType: 'bidResponse'
  });
  
 resolve(bidResponseBuilder
  .timestamp(moment.utc().format())
  .status(1)
  .id('1234567890')
  .seatbid([
    {
 "bid": [
         {
           "id": "1",
           "impid": bidRequest.imp[0].id,
           "price": bidRequest.imp[0].bidfloor,
           "adid": "314",
           "cid": "42",
           "cat": ["IAB12"],
           "language": "en",
           "burl":"https://adserver.com/imp?impid=102&winprice=${AUCTION_PRICE}",
           "adm": "<a href=\"http://adserver.com/click?adid=12345&tracker=${CLICK_URL:URLENCODE}\"><img src=\"http://image1.cdn.com/impid=102\"/></a>",
           "nurl": "http://adserver.com/winnotice?impid=102&winprice=${AUCTION_PRICE}",
           "iurl": "http://adserver.com/preview?crid=314",
           "adomain": [
             "advertiserdomain.com"
           ],
           "ext": {
             "advertiser_name": "Coca-Cola",
             "agency_name": "CC-advertising"
           }
         }
       ],
       "seat": "4"
    }
  ])
  .build());
  
 
 });
};

	
//
// Register app's endpoints
// -----------------------------------------------------------------------------
app.get('/openrtb', urlencodedParser,openRtbAdaptor);

// POST http://localhost:8080/api/users
// parameters sent with 
app.post('/bid',jsonParser,function(bidreq, bidres) {

			construct_bid_response(bidreq.body).then(response => {
			    return bidres.json(response.stringify());
			   }).catch(error => {
                logger.error('Rejecting Promise. Error calling construct_bid_response', error);
				bidres.json(error);
			})
});


// POST http://localhost:8080/api/users
// parameters sent with 
app.post('/bid1',jsonParser,function(bidreq, bidres) {

			return bidres.status(204).send({});
});


// POST http://localhost:8080/api/users
// parameters sent with 
app.post('/bid2',jsonParser,function(bidreq, bidres) {

			return bidres.status(204).send({});

});
// POST http://localhost:8080/api/users
// parameters sent with 
app.post('/bid3',jsonParser,function(bidreq, bidres) {

			return bidres.status(204).send({});

		
});
//
// Launch the server
// -----------------------------------------------------------------------------
var listener = app.listen(8080, function(){
    logger.info('Listening on port ' + listener.address().port); //Listening on port 8888
});

// Connect to mongodb database
mongoose.connect('mongodb://localhost:27017/rtbframework');
