var app = require('express')();
var http = require("http").Server(app);
var bodyParser = require("body-parser");
var hat = require('hat');
var fs = require("fs");
var mysql = require("mysql");
var async = require("async");
var ip = require("ip");
var request = require("request");
var port = 8090;
var base = "/events2017"


app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

var con = mysql.createConnection({
	host: "217.155.203.109",
	user: "andrew",
	password: "yxxXA64BvAL",
	database: "events2017"
});

app.get(base, function (req, res) {
	res.sendFile(__dirname + '/index.html');
});

app.get(base + "/index.html", function(req, res) {
	res.sendFile(__dirname + "/index.html");
});

app.get(base + '/style.css', function (req, res) {
	res.sendFile(__dirname + '/styles/style.css');
});

app.get(base + '/login', function (req, res) {
	res.sendFile(__dirname + "/login.html");
});

app.get(base + '/admin', function (req, res) {
	res.sendFile(__dirname + "/admin.html");
});

app.get(base + '/imgs/:filename', function (req, res) {
	res.sendFile(__dirname + "/imgs/" + req.params.filename + ".jpg");
});

//###  VENUES  ###

app.get(base + '/venues', function (req, res) {
	con.query("SELECT * FROM venues", function (err, result, fields) {
		venues = {};

		if (err) throw err;
		result.forEach(function (row) {
			venues['v_' + row.venue_id] = { "name": row.name, "postcode": row.postcode, "town": row.town, "url": row.url, "icon": row.icon };
		});

		jsonResponse = { "venues": venues };
		res.setHeader('content-type', 'application/json');
		res.json(jsonResponse);
	});
});

app.post(base + '/venues/add/', function (req, res) {
	res.setHeader('content-type', 'application/json');

	var auth_token = req.body.auth_token;
	var name = req.body.name;

	if (name == undefined) {
		res.status(400);
		res.json({ "error": "missing required parameter value: name" });
		return;
	}

	var array = [name, req.body.postcode, req.body.town, req.body.url, req.body.icon];

	checkAuthToken(auth_token, req.connection.remoteAddress, addVenue, res, array)

});

//###  EVENTS  ###

app.get(base + '/events/search/:search?:date?', function (req, res) {
	res.setHeader('content-type', 'application/json');

	var search = decodeURI(req.query.search);
	var date = req.query.date;
	var events = {};
	var eventful_date = "";

	if (search == "")
		search = 'undefined';
	if (date == "")
		date = undefined;
	else {
		date = date.split('/');
		eventful_date = date[2] + date[1] + date[0] + "00";
		eventful_date += "-" + eventful_date;

		date = date[2] + "-" + date[1] + "-" + date[0];
	}

	var conditions = "";
	var eventful_url = "http://api.eventful.com/json/events/search?app_key=JC35G3JtgSX9tddm&location=UK&keywords=edm";
	if (search != 'undefined' || date != undefined) {
		conditions += "WHERE ";
		if (search != 'undefined') {
			conditions += "title LIKE '%" + search + "%'";
			eventful_url += "+" + search.concat("+");
		}
		if (date != undefined && search != 'undefined')
			conditions += " AND ";
		if (date != undefined) {
			conditions += "date LIKE '" + date + "%'";
			eventful_url += "&date=" + eventful_date;
		}
	}

	request(eventful_url, function(err, result, data) {
		if (err) throw err;

		if (JSON.parse(data).events != null) {
			var ev_events = JSON.parse(data).events.event;

			for (var i = 0, len = ev_events.length; i < len; i++) {
				event = {}
				event.title = ev_events[i].title;
				event.blurb = ev_events[i].description;
				event.date = ev_events[i].start_time;
				event.url = ev_events[i].url;

				venue = {}
				venue.name = ev_events[i].venue_name;
				venue.postcode = ev_events[i].venue_code;
				venue.town = ev_events[i].city_name;
				venue.url = ev_events[i].venue_url;
				venue.icon = ev_events[i].image;
				venue.venue_id = "v_" + ev_events[i].venue_id;

				event.venue = venue;

				events[ev_events[i].id] = event;
			}
		}

		con.query("SELECT event_id, title, blurb, date, events.url AS eurl, name, postcode, town, venues.url AS vurl, icon, events.venue_id FROM events INNER JOIN venues ON events.venue_id=venues.venue_id " + conditions, function (err, result, fields) {
			if (err) throw err;
	
			// events = {}
	
			result.forEach(function (e) {
				event = {}
				event.title = e.title;
				event.blurb = e.blurb;
				event.date = e.date;
				event.url = e.eurl;
	
				venue = {}
				venue.name = e.name;
				venue.postcode = e.postcode;
				venue.town = e.town;
				venue.url = e.vurl;
				venue.icon = e.icon;
				venue.venue_id = "v_" + e.venue_id;
	
				event.venue = venue;
	
				events["e_" + e.event_id] = event;
			});
	
			res.json({ "events": events });
		});

	});


});

app.get(base + '/events/get/:event_id', function (req, res) {
	res.setHeader('content-type', 'application/json');
	var event_id = req.params.event_id;

	if (req.params.event_id == undefined) {
		res.json({ "error": "data input in incorrect form" });
		return;
	}

	con.query("SELECT event_id, title, blurb, date, events.url AS eurl, name, postcode, town, venues.url AS vurl, icon, events.venue_id FROM events INNER JOIN venues ON venues.venue_id=events.venue_id WHERE event_id=" + event_id.split("_")[1], function (err, result, fields) {
		if (err) throw err;

		if (result.length == 0) {
			res.json({ "error": "no such event" });
			return;
		}

		event = {}
		event.title = result[0].title;
		event.blurb = result[0].blurb;
		event.date = result[0].date;
		event.url = result[0].eurl;

		venue = {}
		venue.name = result[0].name;
		venue.postcode = result[0].postcode;
		venue.town = result[0].town;
		venue.url = result[0].vurl;
		venue.icon = result[0].icon;
		venue.venue_id = "v_" + result[0].venue_id;

		event.venue = venue;

		response = {}
		response[event_id] = event;

		res.json({ "events": response });
	});
});

app.post(base + '/events/add/', function (req, res) {
	res.setHeader('content-type', 'application/json');

	var auth_token = req.body.auth_token;
	var event_id = req.body.event_id.split("_")[1];
	var title = req.body.title;
	var venue_id = req.body.venue_id;
	var date = new Date(req.body.date).toISOString();
	var url = req.body.url;
	var blurb = req.body.blurb;

	var array = [event_id, title, blurb, date, url, venue_id];
	checkAuthToken(auth_token, req.connection.remoteAddress, addEvent, res, array)
});

//###  AUTH TOKENS  ###

app.post(base + '/auth', function (req, res) {
	res.setHeader('content-type', 'application/json');
	
	var username = req.body.name;
	var password = req.body.password;
	var ip_addr = req.connection.remoteAddress;
	var auth_key = hat();

	//check user and password
	con.query("SELECT u_Id FROM users WHERE uname='" + username + "' AND pword='" + password + "';", function (err, result, fields) {
		if (err) throw err;

		//if login details not in DB:
		if (result.length == 0) {
			res.json({ "error": "invalid login credentials supplied" });
			return;
		}

		//insert session into database
		var date = new Date();

		con.query("INSERT INTO sessions(u_Id,auth_token,ip,date) VALUES('" + result[0].u_Id + "', '" + auth_key + "', '" + ip_addr + "', NOW());", function (err, result, fields) {
			if (err) throw err;

			//return the value of the key to the POST
			res.json({ "key": auth_key });
			return;
		});
	});
});

app.get(base + '/check_auth/:auth_key', function (req, res) {
	checkAuthToken(req.params.auth_key, req.connection.remoteAddress, check_auth, res, null);
});

function check_auth(result, res, params) {
	res.setHeader('content-type', 'application/json');
	res.json({ status: result });
}

function addEvent(result, res, params) {
	res.setHeader('content-type', 'application/json');

	if (result == false) {
		res.json({ status: result });
		return;
	}

	con.query("DELETE FROM events WHERE event_id='" + params[0] + "';", function (err, result, fields) {
		if (err) throw err;

		con.query("INSERT INTO events(event_id, title, blurb, date, url, venue_id) VALUES('" + params.join("','") + "');", function (err, result, fields) {
			if (err) throw err;
	
			res.json({ status: true });
			return;
		});
	});


}

function addVenue(result, res, params) {
	res.setHeader('content-type', 'application/json');

	if (result == false) {
		res.json({ status: result });
		return;
	}

	con.query("INSERT INTO venues(name, postcode, town, url, icon) VALUES('" + params.join("','") + "');", function (err, result, fields) {
		if (err) throw err;

		res.json({ status: true });
	});
}

function checkAuthToken(auth_token, ip, callback, res, params) {
	if (auth_token == "concertina")
		return true;
	else {
		//remove all sessions from more than 2 hours ago
		con.query("DELETE FROM sessions WHERE date < (NOW() - INTERVAL 2 HOUR);", function (err, result, fields) {
			if (err) throw err;

			//count how many sessions have that auth_token and ip address (result 0 or 1)
			con.query("SELECT COUNT(s_Id) AS count FROM sessions WHERE auth_token='" + auth_token + "' AND ip='" + ip + "';", function (err, result, fields) {
				if (err) throw err;

				var found = false;

				//if the count is 1 then the sessions must exist 
				if (result[0].count == "1")
					found = true;

				//call the required function
				callback(found, res, params);
			});
		});
	}
}

function getEventfulEvents() {
	$.post("http://api.eventful.com/events", {app_key:"JC35G3JtgSX9tddm",search:"rock"}, function(data) {
		console.log(data);
	});
}

//start server listening on the designated port
http.listen(port, function () {
	//let the server admin know its running with url and port info
	console.log('Server listening at http://127.0.0.1:' + port + '/events2017');
});