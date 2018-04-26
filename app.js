var login = require("facebook-chat-api");
var http = require('http');
var cron = require('node-cron');
var modeRTM = false;
var MyPosition = {"latitude": "43.2861297", "longitude": "5.464669"};
var cronJobs = [];
round = function (value, exp) {
  if (typeof exp === 'undefined' || +exp === 0)
    return Math.round(value);

  value = +value;
  exp = +exp;

  if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0))
    return NaN;

  // Shift
  value = value.toString().split('e');
  value = Math.round(+(value[0] + 'e' + (value[1] ? (+value[1] + exp) : exp)));

  // Shift back
  value = value.toString().split('e');
  return +(value[0] + 'e' + (value[1] ? (+value[1] - exp) : -exp));
}
rad = function (x) {
      return x * Math.PI / 180;
}
getDistance = function (p1, p2) {
      var R = 6378137;
      var dLat = rad(p2.latitude - p1.latitude);
      var dLong = rad(p2.longitude - p1.longitude);
      var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(rad(p1.latitude)) * Math.cos(rad(p2.latitude)) *
        Math.sin(dLong / 2) * Math.sin(dLong / 2);
      var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      var d = R * c;
      return d;
}
isInString = function(msg, array) {
    if(msg !== undefined) {
        for(i=0;i<array.length;i++) {
            if(msg.toLowerCase().indexOf(array[i].toLowerCase()) != -1) {
                return true;
            }
        }
        return false;
    }
    return false;
}

showDistance = function (distancem) {
    var sentence = "";
    var distanceround = round(distancem, 2);
    if(distancem > 1000)
    {
        sentence = distanceround * 0.001+" km";
    }
    else
    {
          sentence = distanceround+" mètres";
    }
    return sentence;
}
getData = function (api, threadId) {
    var options = {
        host: 'map.rtm.fr',
        path: '/WebBusServeur/getListVehicules?response=application/json'
    };
    var req = http.get(options, function(res) {
        //console.log('STATUS: ' + res.statusCode);
        //console.log('HEADERS: ' + JSON.stringify(res.headers));
        var bodyChunks = [];
        res.on('data', function(chunk) {
            bodyChunks.push(chunk);
        }).on('end', function() {
            var body = Buffer.concat(bodyChunks);
            var objet = JSON.parse(body);
            var details = objet.getListVehiculesResponse.vehicule;
            var compteur = 0;
            var output = "";
            for (property in details) {
                var busPosition = {"latitude": details[property].latitude, "longitude" : details[property].longitude};
                if(getDistance(MyPosition, busPosition) < 500)
                {
                    var distance = showDistance(getDistance(MyPosition, busPosition));
                    output += "Bus proche de vous : "+details[property].nomLigneCial+" ("+distance+")\n";
                }
            }
            if(output.length<20000) {
                api.sendMessage(output, threadId);
            }
        })
    });
    req.on('error', function(e) {
        console.log('ERROR: ' + e.message);
    });
}
login({email: "adressefacebook", password: "motdepasse"}, function callback (err, api) {
    if(err) return console.error(err);
    api.setOptions({listenEvents: true});
    var stopListening = api.listen(function(err, event) {
        if(err) return console.error(err);
        switch(event.type) {
            case "message":
                console.log(JSON.stringify(event));
                if(event.body === '/stop') {
                    if(modeRTM) {
                        api.sendMessage("Mode traceur de bus désactivé !", event.threadID);
                        modeRTM = false;
                        if(typeof cronJobs[event.senderID] !== 'undefined' && typeof cronJobs[event.senderID] !== "") {
                            cronJobs[event.senderID].destroy();
                            cronJobs[event.senderID] = "";
                        }
                    }
                }
                else if(event.body === '/RTM') {
                    api.sendMessage("Mode traceur de bus activé : il y a un délai de 20 secondes entre la position réelle et la position donnée", event.threadID);
                    api.sendMessage("Veuillez envoyer votre position s'il vous plait", event.threadID);
                    modeRTM = true;
                }
                /*else if(event.body === '/showfriendlist') {
                    var separator = event.body.split(" ");
                    var name = separator[1];
                    var lastname = separator[2];
                    if(name.length > 0 && lastname.length>0) {
                        api.getUserID(name+" "+lastname, function(err, data) {
                            if(err) 
                            { 
                                return callback(err) 
                            }
                            else 
                            {
                                api.getFriendsList(function(err, data) {
                                    if(err) return console.error(err);
                                    console.log(data.length);
                                });
                            }
                            var threadID = data[0].userID;
                            
                        });
                    }
                    api.sendMessage("JE ME CASSE DE CE GROUPE DE MERDE", event.threadID);
                    api.removeUserFromGroup(api.getCurrentUserID(), event.threadID);
                }*/
                
                if(modeRTM && event.attachments.length >0) {
                    api.sendMessage("Position enregistrée", event.threadID);
                    api.sendMessage("Je vous préviens quand un bus est a moins de 500 mètres de votre position...", event.threadID);
                    if(event.attachments.length >0) {
                        var image = event.attachments[0].image;
                        if(image.length>0) {
                            var line = image.split("=");
                            var lineplus = line[5].replace("%2C", "=").replace("&", "=");
                            var lo = lineplus.split("=");
                            var latitude = lo[0];
                            var longitude = lo[1];
                            MyPosition.latitude = latitude;
                            MyPosition.longitude = longitude;
                            cronJobs[event.senderID] = cron.schedule("*/20 * * * * *", function(){
                                getData(api, event.threadID);
                                console.info('cron job completed');
                            }); 
                            cronJobs[event.senderID].start();
                        }
                    }
                }
                break;
            case "event":
                console.log(event);
                break;
        }
    });
});