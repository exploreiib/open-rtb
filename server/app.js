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
const requestHelper = require('request');
var mockResponse = require('./mocks/mockResponse');


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
var urlencodedParser = bodyParser.urlencoded({ extended: false });
var bidderInfoList;


//controllers
var openrtbDBController = require("./controllers/openrtbDBController");


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
// Logic that handles the Openrtb request & response orchestration.
// -----------------------------------------------------------------------------
const openRtbAdaptor = (req, res) => {
    logger.debug('Request received from Publisher Channel');
		

    const queryData = url.parse(req.url, true).query;
    logger.debug('Request received from Publisher Channel::',queryData);

    res.setHeader('Access-Control-Allow-Origin', '*');


    //Stpe1: Create OpenRTB BidRequest
    //Step2: Invoke Bidders passing BidRequest
    //Step3: send ad content in response
    openrtbDBController.getImpression(queryData.id).then(function (impressionData) {

        logger.debug('impressionData from db is =>',impressionData.imp_dimension);

        build_json_bidrequest(bidRequest,impressionData).then(request => {
	           logger.debug('bidRequest before invoking bidders==>',JSON.stringify(request));
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

//
// Helper function to create bidrequest object
// -----------------------------------------------------------------------------
const build_json_bidrequest = (bidRequest,impressionData) => {
    return new Promise ((resolve, reject) => {

        var bidRequestBuilder = openrtb.getBuilder({
             builderType: 'bidRequest'
        });
  
        bidRequestBuilder.timestamp(moment.utc().format()).id(uuidv1()).at(2).imp(build_imp_object(impressionData));
        if(build_site_object(impressionData)){
           bidRequestBuilder.site(build_site_object(impressionData));
        }
        if(build_app_object(impressionData)){
           bidRequestBuilder.app(build_app_object(impressionData));
        }
        resolve(bidRequestBuilder.build());
 });
};

//
// Helper function to create impression json object like Banner/Vedio/Native 
// -----------------------------------------------------------------------------
const build_imp_object = (impressionData) => {
    var imp = [];
    var impBuilder = openrtb.getBuilder({
        builderType: 'imp'
    });

    impBuilder.bidfloor((impressionData.bidfloor)?impressionData.bidfloor:0);
    impBuilder.id(impressionData.imp_id);

	var typeOfImp = impressionData.imp_type;

    if(typeOfImp === 'BANNER'){

        var bannerBuilder = openrtb.getBuilder({
            builderType: 'banner'
        });

        if(impressionData.imp_dimension.format){
          //It need to enhance existing openrtb Node module for including this field
       }else {
            bannerBuilder.w(impressionData.imp_dimension.w).h(impressionData.imp_dimension.h);
        }
        impBuilder.banner(bannerBuilder.build());

    }else if(typeOfImp === 'VEDIO'){
        var vedioBuilder = openrtb.getBuilder({
            builderType: 'video'
        });
        var mimes =vedio_mimetypes();

        vedioBuilder.mimes(mimes).w(impressionData.imp_dimension.w).h(impressionData.imp_dimension.h);
        impBuilder.video(vedioBuilder.build());
    }else if(typeOfImp === 'NATIVE'){
        var nativeBuilder = openrtb.getBuilder({
            builderType: 'native'
        });
        nativeBuilder.request(impressionData.imp_dimension.toString());
        impBuilder.native(nativeBuilder.build());
    }

    console.log("impression object is ::"+ (impBuilder.build()).stringify() );
    imp[0] = impBuilder.build();
    return imp;
	   
};
//
// Helper function to create site object
// -----------------------------------------------------------------------------

const build_site_object = (impressionData) => {
    if(impressionData.publisher_source && impressionData.publisher_source === 'SITE') {
        return {
            "id": "SSPid_1345135123",
            "name": "Site ABCD",
            "domain": "siteabcd.com",
            "cat": [
                "IAB2-1",
                "IAB2-2"
            ],
            "page": "http://siteabcd.com/page.htm",
            "ref": "http://referringsite.com/referringpage.htm",
            "privacypolicy": 1,
            "publisher": {"id": "SSPid_12345", "name": "Publisher A"}

        }
    }else{

        return null;
    }
}


const build_app_object = (impressionData) => {
    if(impressionData.publisher_source && impressionData.publisher_source === 'APP') {
        return {
                "id":"adaptv_",
                "publisher":{
                    "name":"",
                    "id":"adaptv_11690"
                },
                "storeurl":"https://play.google.com/store/apps/details?id=com.zynga.looney",
                "bundle":"com.zynga.looney",
                "cat":[
                    "IAB1"
                ],
                "name":"looney tunes dash!"
            }


    }else{

        return null;
    }
}
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

	         fetch(url, options).then(function(res) {
		             if(!call_bidder.chekcForStatusCode(res)){
		                return res.json();
		             }else{
  			            logger.debug('sorry..Bid response has inavlid status code===>');
   		  	            call_bidder.currentBidderIndex = call_bidder.currentBidderIndex+1;
				  
				        if(call_bidder.currentBidderIndex < bidderInfoList.length){
  				           resolve(call_bidder.callBidder(bidrequest));
				        }else{
				           logger.debug('No more bidders available..serve default ad...');
				        }
			         }
	         }).then(function(res) {
                     logger.debug('Bid response is ===>',res);
                     if(res){
                         if(call_bidder.chekcForBidEmpty(res)){
                               logger.debug('sorry..Bid response is empty===>');
                               call_bidder.currentBidderIndex = call_bidder.currentBidderIndex+1;
                              if(call_bidder.currentBidderIndex < bidderInfoList.length){
                                 resolve(call_bidder.callBidder(bidrequest));
                               }else{
                                 logger.debug('No more bidders available..serve default ad...');
                              }
                         }else{
                              process_bid_response(bidrequest,res).then(adcontent => {
                                          resolve(adcontent);
                              });
                         }
  	                 }
             }).catch(err => {
                     logger.debug('error inside call bidder ===>',err);
             });
     
        });
	},

	getBidderUrl: function(index){
		logger.debug('try Bidder  url..===>',bidderInfoList[index].bidder_url);
		return bidderInfoList[index].bidder_url;
	},
	
	chekcForBidEmpty: function(bidResponse){
		let bidResponseObj =  bidResponse;
        if(!bidResponseObj ||  !bidResponseObj.seatbid || bidResponseObj.seatbid.length === 0 || (bidResponseObj.nbr &&    bidResponseObj.nbr > 0 )){
	        return true;
	    }else{
             logger.debug('bidResponseObj.seatbid.length()==>',bidResponseObj.seatbid.length);
	           return false;
	    }
	},

	chekcForStatusCode: function(bidResponse){
	    logger.debug('bidResponse.status==>',bidResponse.status);
        logger.debug('bidResponse.body==>',bidResponse.headers);

        if(!bidResponse)
		  return true;
   	    if(bidResponse.status === 204) return true;
        if(bidResponse.status === 400) return true;
		return false;
	},

    currentBidderIndex:	0

 }

//
// Helper function to ceate user object
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
        mockResponse.seatbid[0].bid[0].impid =  bidRequest.imp[0].id;
        mockResponse.seatbid[0].bid[0].price = bidRequest.imp[0].bidfloor + 0.1;
        resolve(mockResponse);
    });
};

//
// Helper function to create seatbid json object
// -----------------------------------------------------------------------------
const build_seatbid_object = (bidRequest) => {
    var bid = [];
    var seatbid = [];


    var bidBuilder = openrtb.getBuilder({
        builderType: 'bid'
    });

    bidBuilder.id(uuidv1());
    bidBuilder.impid(bidRequest.imp[0].id);
    bidBuilder.price(bidRequest.imp[0].bidfloor);
    bidBuilder.clearPrice(bidRequest.imp[0].bidfloor);
    bidBuilder.adm("<a href=\"http://adserver.com/click?adid=12345&tracker=${CLICK_URL:URLENCODE}\"><img src=\"http://image1.cdn.com/impid=102\"/></a>");
    bidBuilder.nurl("http://adserver.com/winnotice?impid=102&winprice=${AUCTION_PRICE}");
    bid[0] = bidBuilder.build();

    var seatBidBuilder = openrtb.getBuilder({
        builderType: 'seatbid'
    });

    seatBidBuilder.bid(bid);
    seatbid[0] = seatBidBuilder.build();
    return seatbid;

};
//
// Helper function to replace macros in bid response URLs
// -----------------------------------------------------------------------------

const replace_macros = (bidRequest,bidResponse) => {

    var bidBuilder = openrtb.getBuilder({
        builderType: 'bid'
    });

    bidBuilder.clearPrice(bidResponse.seatbid[0].bid[0].price);//);
    var bid = bidBuilder.build();

    var valuesMap =  {
        '${AUCTION_BID_ID}': bidResponse.id,
        '${AUCTION_PRICE}': bidResponse.seatbid[0].bid[0].price,
        '${AUCTION_IMP_ID}': bidResponse.seatbid[0].bid[0].impid,
        '${AUCTION_ID}': bidRequest.id
    };


    //winnotice URL
    if(bidResponse.seatbid[0].bid[0].nurl){
        var nurl_replaced = bid.replaceMacros(bidResponse.seatbid[0].bid[0].nurl,valuesMap);
        bidResponse.seatbid[0].bid[0].nurl = nurl_replaced;
    }
    //billing notice URL
    if(bidResponse.seatbid[0].bid[0].burl){
        var burl_replaced = bid.replaceMacros(bidResponse.seatbid[0].bid[0].burl,valuesMap);
        bidResponse.seatbid[0].bid[0].burl = burl_replaced;
    }
    //Loss notice URL
    if(bidResponse.seatbid[0].bid[0].lurl){
        var burl_replaced = bid.replaceMacros(bidResponse.seatbid[0].bid[0].lurl,valuesMap);
        bidResponse.seatbid[0].bid[0].lurl = lurl_replaced;
    }

    //Loss notice URL
    if(bidResponse.seatbid[0].bid[0].adm){
        var adm_replaced = bid.replaceMacros(bidResponse.seatbid[0].bid[0].adm,valuesMap);
        bidResponse.seatbid[0].bid[0].adm = adm_replaced;
    }

    return bidResponse;
}

//
// Helper function to process bidresponse
// -----------------------------------------------------------------------------

const process_bid_response = (bidRequest,bidResponse) => {

    return new Promise((resolve, reject) => {

        var bidResUpd = replace_macros(bidRequest, bidResponse);
        console.log("process_bid_response..bidResUpd", bidResUpd);
        if (bidResUpd.seatbid[0].bid[0].adm) {
            console.log("process_bid_response..bidResUpd..adm::", bidResUpd.seatbid[0].bid[0].adm);
            invoke_notice_url(bidResUpd).then(response => {
                logger.info('Response from winnotice URL::', response);
            }).catch(error => {
                logger.info('Exception Response while invoking winnotice URL');
            });

            resolve(bidResUpd.seatbid[0].bid[0].adm);
        } else {
            console.log("process_bid_response..inside invoke notice url and wait for response...=>");
            invoke_notice_url(bidResUpd.seatbid[0].bid[0].nurl).then(response => {
                if (!response.includes("EXCEPTION::")) {
                    resolve(response);
                } else {

                    var error = '<a href="http://adserver.com/click?adid=12345&tracker=${CLICK_URL:URLENCODE}&AUCTION_BID_ID=${AUCTION_BID_ID}"><img src="win-notice-error.jpg"/></a>';
                    resolve(error);
                }
            }).catch(error => {
                var error = '<a href="http://adserver.com/click?adid=12345&tracker=${CLICK_URL:URLENCODE}&AUCTION_BID_ID=${AUCTION_BID_ID}"><img src="win-notice-error.jpg"/></a>';
                resolve(error);

            });
        }
    });
}
//
// Helper function to invoke notice URL
// -----------------------------------------------------------------------------

const invoke_notice_url = (bidResUpd) => {

    return new Promise ((resolve, reject) => {

            requestHelper.get(bidResUpd.seatbid[0].bid[0].nurl, (error, response, body) => {

                if (error) {
                    resolve("EXCEPTION::caught error while calling notice url");
                } else if (!response) {
                    resolve("EXCEPTION::invalid response while calling notice url");
                }else if(response.statusCode === 200){
                    resolve(body)
                }else{
                    resolve ("EXCEPTION::invalid response code[" + response.statusCode + "]recieved while calling notice url");
                }
            })
    });
}


//
// Register app's endpoints
// -----------------------------------------------------------------------------
app.get('/openrtb', urlencodedParser,openRtbAdaptor);

// POST http://localhost:8080/api/users
// parameters sent with 
app.post('/bid',jsonParser,function(bidreq, bidres) {

			construct_bid_response(bidreq.body).then(response => {
			    return bidres.send(response);
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
mongoose.connect('mongodb://localhost:27017/openrtb_db',{ useMongoClient: true });
//Load Bidder URL Iand other nformation from DB
openrtbDBController.loadBidders().then(function (bidders) {
    bidderInfoList = bidders;
    //console.log("bidderInfoList ::"+bidderInfoList);
    console.log("bidderInfoList length::"+bidderInfoList.length);
});

//
// Helper function to create vedio mime object
// -----------------------------------------------------------------------------

const vedio_mimetypes = () => {
    console.log("inside vedio_mimetypes.... ");
    var mimesList = ["video/x-flv",
        "video/mp4",
        "video/x-ms-wmv",
        "application/x-shockwave-flash",
        "application/javascript"];
    return mimesList;
}