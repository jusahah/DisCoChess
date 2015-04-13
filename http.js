// Include http module.
var http = require("http");
var fs = require('fs');
var ch =  require('./chess');
var chess = new ch.Chess();
var readPGNStream = fs.createReadStream('14fin-9.pgn');
var savePGNstream = fs.createWriteStream('pgn_output_test.txt');

// Express stuff
var express = require('express');
var app = express();
var multer  = require('multer')


var bodyParser  = require('body-parser');

var fileID = 0;

function getRandomHash() {
	var keys = 'abcdfghjlktyrseqpwvumn';
	var l = keys.length;
	var hash = '';
	var i = 3;

	while(i) {
		hash += keys[Math.floor(Math.random() * l)];
		i--;
	}

	return hash;
}

// Multer receives files and checks them
app.use(multer({ 
	dest: './uploads/', 
	limits: {fileSize: 50000},
	rename: function() {
		return getRandomHash() + fileID++;
	},
	onFileUploadStart: function(file) {
		if (file.extension !== 'pgn') {
			console.log("FILE UPLOAD FAILED - NOT PGN FILE");
			res.failure = 'Not a pgn file';
			return false;
		}

	},
	onFileUploadComplete: function(file, req, res) {
	console.log("FILE UPLOAD COMPLETE!: " + file.name + " | " + file.path);
	res.resultFilePath = file.path;
	SERVER.fileManager.addFileForAnalysis(file.name, file.path);
}}));

app.use(express.static('public'));
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(bodyParser.json());
// Middleware 1 - logging request times
app.use(function(req, res, next) {
	requestTimes.push({ip: req.connection.remoteAddress, timestamp: Date.now()}); // Can overflow memory but that takes long time.
	next();
});

app.post('/receivepgn', function(req, res) {

	// If file already exists, send error page to user

	// Else parse file into pgns

	res.send("Analysis request has been confirmed. Your games will be available in address: " + res.resultFilePath);

	//SERVER.fileManager.addFileForAnalysis()


});


app.post('/api', function(req, res) {
	

	var data = req.body.data;
	////console.log("REQ HIT TO API: " + data.method);
	////console.log(data);
	var ret = SERVER.api(data);

	res.setHeader('Content-Type', 'application/json');
	res.end(JSON.stringify(ret));

	//res.json(ret); // Return as json to client

});

app.listen(3000);


// Create the server. Function passed as parameter is called on every request made.
// request variable holds all request parameters
// response variable allows you to do anything with response sent to the client.
/*http.createServer(function (request, response) {
	//console.log("REQUEST");
	// Attach listener on end event.
	// This event is called when client sent all data and is waiting for response.
	response.end('JEE');
	request.on("end", function () {
		// Write headers to the response.
		// 200 is HTTP status code (this one means success)
		// Second parameter holds header fields in object
		// We are sending plain text, so Content-Type should be text/plain
		response.writeHead(200, {
			'Content-Type': 'text/plain'
		});
		// Send data and end response.
		response.end('Hello HTTP!');
	});
// Listen on the 8080 port.
}).listen(8080);*/

var requestTimes = [];

SERVER = {};
SERVER.positionStorage = [];

SERVER.api = function(request) {

    
	////console.log(request);

    var method = request.method;
    var data   = request.payload;

    //console.log(method);

    

    if (method === 'batch') {
      //////
      ////alert("SERVER: Getting batch");
      //////
      ////alert("SERVER: Batch request");

      //console.log("BATCH REQUEST");

      var batch = SERVER.serverBatchController.needBatch();

      if (!batch) {
        return {tag: 'noBatchesAvailable', data: 0};
      }

      return {tag: 'batchForAnalysis', data: {batch: JSON.stringify(batch)}};
    }

    else if (method === 'results') {

      // Save resultBatch to database etc.
      var batchObj = JSON.parse(data);

      console.log("INCOMING HASH: " + batchObj.hashKey);
      //
      ////alert("JOO");
      var serverBatch = new Batch(batchObj.id, batchObj.hashKey);

      // Later you could perhaps just autocopy using jQuery's helper function
      serverBatch.openPositions = batchObj.openPositions;
      serverBatch.pendingPositions = batchObj.pendingPositions;
      serverBatch.donePositions = batchObj.donePositions;
      serverBatch.duration = batchObj.duration;

      SERVER.resultReceiver.processResultBatch(serverBatch);
      //console.log("SERVER: Received result batch: " + serverBatch.id);
      return {tag: 'resultConfirmed', data: 0};
    }

    else {
      //console.log("SERVER ERROR: Unknown method for request: " + method);
      return {tag: 'unknownMethod', data: 0};
    }
}

var GameStorage = function(pgnParser, positionStorage) {

    this.pgnParser = pgnParser;
    this.positionStorage = positionStorage;

    this.games = {};

    this.runningGameID = 1;

    this.getHashForPosition = function() {
      return Math.random() * 1000000000;
    }

    this.findGame = function(id) {
      return this.games[id];
    }

    this.removeGame = function(id) {

      this.games[id] = null;
      delete this.games[id];
    }

    this.addGame = function(positionsAndInfo) {

      // UPDATE 13.0.4.15 - positionsAnfInfo now also contains output stream obj and ref to group (=file namespace)

      //var gameID = Math.floor(Math.random() * 1000000000); // REFACTOR - needs to check that doesn't exist already

      //var positionsAndInfo = this.pgnParser.parseSinglePGN(pgn);
      var positions = positionsAndInfo.positions;
      var info = positionsAndInfo.info;

      if (positions) {

      	var gameID = this.runningGameID++;
      	var game = new Game(gameID);
      	game.setOutputStream(positionsAndInfo.output);
      	game.group = positionsAndInfo.group;
      	this.games[gameID] = game;
        game.addInfo(info);
        game.group.gamesAdded++; // Group only knows # of games it has to wait for; speficic game objects are not of interest
        //////
        ////alert("Game succesfully positionalized");
        //console.log("GAME SUCCESSFULLY POSITIONALIZED");
        for (var i = positions.length - 1; i >= 0; i--) {
          var p = positions[i];
          p.game = gameID;
          p.hashKey = this.getHashForPosition(); // Every position gets hashKey which basically acts like a CSRF protection for the position.
          game.registerOpenPosition(p);
          this.positionStorage.push(p);
        };

        return true;
        
      }
      //console.log("PGN PARSING HAS FAILED -> DUMPING GAME: " + pgn);
      return false;


    }


}

var Batch = function(id, hashKey) {

  this.id = id;
  this.hashKey = hashKey;

  this.openPositions = [];
  this.pendingPositions = [];
  this.donePositions = [];

  this.constructTime = Date.now();
  this.addTime;
  this.duration;

  this.hasExpired = function() {
  	return Date.now() - this.constructTime > 30000;
  }

  this.recordAddTime = function() {
    this.addTime = Date.now();
  }

  this.recordDuration = function() {
    this.duration = Date.now() - this.addTime;
  }

  this.numOfOpenPositions = function() {
    return this.openPositions.length;
  }

  this.numOfPendingPositions = function() {
    return this.pendingPositions.length;
  }

  this.numOfDonePositions = function() {
    return this.donePositions.length;
  }

  this.hasOpenPositions = function() {
    return this.openPositions.length > 0;
  }

  this.hasPendingPositions = function() {
    return this.pendingPositions.length > 0;
  }

  this.isReadyForReturn = function() {
    return !this.hasOpenPositions() && this.numOfPendingPositions === 0;
  }

  this.getPosition = function() {

    if (this.openPositions.length === 0) {
      return false;
    }

    var pos = this.openPositions.shift();
    pos.batchID = this.id; // Decorate so position knows where to return
    this.pendingPositions.push(pos);

    return pos;
  }

  this.confirmPosition = function(pos) {

    var i = this.pendingPositions.indexOf(pos);

    if (i === -1) {
      //console.log("BATCH ERROR: Evaluated position not found in pending positions: " + pos);
      return false;
    }
    //console.log("Removing from pending positions...");
    this.pendingPositions.splice(i, 1);
    this.donePositions.push(pos);
    $(distChess.positionLogger).trigger('notification', [pos.halfMoveNumber, pos.fen, pos.duration]);
    return true;

  }

  this.addPosition = function(pos) {
    ////
    ////alert("ADDING POS INSIDE BATCH");
    this.openPositions.push(pos);
  }

} 

var Game = function(id) {

    this.id = id;

    this.info;

    this.output;
    this.group;

    this.openPositions = [];
    this.pendingPositions = [];
    this.donePositions = [];

    this.setOutputStream = function(op) {
    	this.output = op;
    }

    this.addInfo = function(info) {
      //alert("ADDING INFO: " + JSON.stringify(info));
      this.info = info;
    }

    this.yourPositionHasBeenKickedFromBatch = function(pos) {


      var idx = this.pendingPositions.indexOf(pos);

      if (idx === -1) {
        return false;
      }

      this.pendingPositions.splice(idx, 1);
      this.openPositions.push(pos);
      return true; 
    }

    this.yourPositionHasBeenAddedToBatch = function(pos) {


      ////
      ////alert("GAMES POS LENGTH: " + this.openPositions.length + " | GAMEID: " + pos.game + " === " + this.id);

      var idx = this.openPositions.indexOf(pos);

      if (idx === -1) {
        return false;
      }

      this.openPositions.splice(idx, 1);
      this.pendingPositions.push(pos);
      return true;
    }

    this.registerOpenPosition = function(position) {
      this.openPositions.push(position);
    }

    this.isReady = function() {
      return this.openPositions.length === 0 && this.pendingPositions.length === 0;
    }

    this.getMyPosition = function(position) {

      // Note can return 0 which must be handled as truthy value!
      for (var i = this.pendingPositions.length - 1; i >= 0; i--) {
        // We test that halfMove, move, fen and hashKey all match. Position's gameID has already been tested (we would not be here otherwise)
        // HalfmoveNumber is tested first so we fail cheaply (short-circuiting) on most items
        if (this.pendingPositions[i].halfMoveNumber === position.halfMoveNumber && 
          this.pendingPositions[i].hashKey === position.hashKey && 
          this.pendingPositions[i].move === position.move &&
          this.pendingPositions[i].fen === position.fen) return i;
      }
      return -1;
    }


    this.receiveArrivingPosition = function(position) {
      
      // Welcome home, son
      var index = this.getMyPosition(position);
      if (index === -1) {
        // You are not my son. GTFO.
        return false;
      }
      //////
      ////alert("Removing from pending, adding to done");
      //this.standardizeEvaluationForWhite(position);
      this.pendingPositions.splice(index, 1);
      this.donePositions.push(position);

    }

    this.standardizeEvaluationForWhite = function(pos) {

      var fenParts = pos.fen.split(" ");

      if (fenParts[1] === 'b') {
        pos.evaluation *= -1;
      }
    }


  }

  var ServerBatchController = function(gameStorage, positionStorage) {

    this.gameStorage = gameStorage;
    this.positionStorage = positionStorage;
    this.pending = [];

    this.runningNumber = 1;

    this.removeFromPending = function(batch) {

    	for (var i = this.pending.length - 1; i >= 0; i--) {
    		// Both id and hash key must match
    		if (this.pending[i].id === batch.id && this.pending[i].hashKey === batch.hashKey) break;	
    	};

    	if (i !== -1) {
    		console.log("BATCH REMOVED FROM PENDING: " + batch.id);
    		console.log(this.pending.length);
    		this.pending.splice(i, 1);
    		console.log(this.pending.length);
    	} else {
    		console.log("BATCH FAILED WITH HASH: " + batch.hashKey);
    	}
    }

    this.getAllPendingBatches = function() {
    	return this.pending; // Return straight ref, callers are friendly
    }

    this.sweepPending = function() {
		console.log("BATCH SWEEP STARTS");
		console.log("POSITIONS PENDING: " + this.pending.length);
		console.log("POSITIONS STORED: " + this.positionStorage.length);

		var expired = [];
		// We first go over the array without doing any modification -> much safer that way
		for (var i = this.pending.length - 1; i >= 0; i--) {
			if (this.pending[i].hasExpired()) {
				expired.push(this.pending[i]);
			}
		};

		console.log("FOUND " + expired.length + " EXPIRED BATCHES");

		for (var j = expired.length - 1; j >= 0; j--) {			
			//this.batchExpired(expired[i]);
			console.log("BATCH EXPIRED WITH ID: " + expired[j].id);
			this.addPositionsBack(expired[j]);
			var idx = this.pending.indexOf(expired[j]);
			this.pending.splice(idx, 1);
			
		};	
    }

    this.addPositionsBack = function(batch) {

    	var dones = batch.donePositions;
    	var pend  = batch.pendingPositions;
    	var open  = batch.openPositions;
    	var i;

    	//console.log("ADDING POSITIONS BACK! TOTAL: " + dones.length + pend.length + open.length);
    	console.log("POS: " + this.positionStorage.length)

    	for (i = dones.length - 1; i >= 0; i--) {
    		var game = this.gameStorage.findGame(dones[i].game);
    		if (game && game.yourPositionHasBeenKickedFromBatch(dones[i])) {
    			this.positionStorage.unshift(dones[i]);
    		}
    		
    	};
    	for (i = pend.length - 1; i >= 0; i--) {
    		var game = this.gameStorage.findGame(pend[i].game);
    		if (game && game.yourPositionHasBeenKickedFromBatch(pend[i])) this.positionStorage.unshift(pend[i]);
    	};
    	for (i= open.length - 1; i >= 0; i--) {
    		var game = this.gameStorage.findGame(open[i].game);
    		if (game && game.yourPositionHasBeenKickedFromBatch(open[i])) this.positionStorage.unshift(open[i]);
    	};

    	console.log("POS: " + this.positionStorage.length)
    }

    this.batchExpired = function(batch) {


    }

    this.getHash = function() {

    	return Math.floor(Math.random() * 100000000);
    }

    this.needBatch = function() {
      // No positions, no batch
      //console.log("POSITIONS IN SERVER: " + this.positionStorage.length);
      if (this.positionStorage.length === 0) return false;

      ////
      ////alert("Position available: " + this.positionStorage.length);

      ++this.runningNumber;
      var batch = new Batch(this.runningNumber, this.getHash());
      this.pending.push(batch);

      for (var i = 0; i < 24; i++) {
        ////console.log("SERVER: ADDING POS TO BATCH");
        var pos = this.positionStorage.shift();
        if (pos) {
          var game = this.gameStorage.findGame(pos.game); // Inform game that its position has been allocated to outgoing batch 
          if (!game) {
            ////
            ////alert("NO GAME");
            // Position has no game, so its orphan
            continue; // Dumps the position
          }
          if (game.yourPositionHasBeenAddedToBatch(pos)) {
          	batch.addPosition(pos);
          } else {
          	// Game did not want it so it was not added to batch - put it back to queue
          	console.log("GAME DID NOT WANT IT");
          	this.positionStorage.unshift(pos);
          }                    
        } else {  
            ////
            ////alert("NO POS");    
            break;
        }
      }

      ////
      ////alert("BATCH LEN: " + batch.openPositions.length);

      return batch;
    }


  }

var ResultReceiver = function(doneGameHandler, gameStorage, batchController) {

    this.doneGameHandler = doneGameHandler;
    this.gameStorage = gameStorage;
    this.batchController = batchController;

    this.routeResultPositionToGame = function(position) {


      //////
      ////alert("Routing result to game" + Math.random());
      //////
      ////alert(position.fen + " - " +  position.evaluation);
      if (position && typeof position === 'object') {
        var gameID = position.game;
        var game = this.gameStorage.findGame(gameID);

        if (game) {

          game.receiveArrivingPosition(position);
/*          ////
////alert("Game found: D = " + game.donePositions.length + ", P = " + game.pendingPositions.length + ", O = " + game.openPositions.length);*/
          if (game.isReady()) {
            ////
            console.log("GAME IS READY");
            this.gameStorage.removeGame(gameID);
            this.doneGameHandler.receiveReadyGame(game);
          }

        }

      }

      
    }

    this.processResultBatch = function(batch) {

console.log("______________________");
    	console.log("______________________");
      console.log("RESULT: Processing batch starts: " + batch.hashKey);
      console.log("______________________");
      console.log("______________________");
      var positions = batch.donePositions;
      this.batchController.removeFromPending(batch);

      //////
      ////alert(positions.length);

      for (var i = positions.length - 1; i >= 0; i--) {
        this.routeResultPositionToGame(positions[i]);
      };

    }


}

var DoneGameHandler = function(outputStream) {

    //this.parserEngine = parserEngine;
    this.outputStream = outputStream;

    this.receiveReadyGame = function(game) {

      var pgnString = this.getPGNFromPositions(game);

      // Send to email provided with game
      // Save to DB

      //
      console.log("PELI VALMIS: " + game.id + " , group: " + game.group.id);	

      
      if (game.output) {
      	console.log("WRITING TO SPECIFIC STREAM");
      	// If output stream was given
      	game.output.write(pgnString + "\n\n");
      } else {
	    // Else use modules default output stream
	    console.log("WRITING TO DEFAULT STREAM");
	    this.outputStream.write(pgnString + "\n\n");
	  }
	  // Inform group if game has one
	  if (game.group) {
	  	game.group.gameDone();
	  }
    }

    this.getPGNFromPositions = function(game) {

      var pgnString = '';

      // Set header stuff first
      var headers = '';
      headers += '[Event \"' + game.info.tournament + '\"]\n'; // Field name is 'tournament' as 'event' may be keyword
      headers += '[Date \"' + game.info.date + '\"]\n';
      headers += '[White \"' + game.info.white + '\"]\n';
      headers += '[Black \"' + game.info.black + '\"]\n';
      headers += '[Result \"' + game.info.result + '\"]\n';


      headers += '\n'; // Marks end of headers
      pgnString += headers; 		

      var positions = game.donePositions;

      // Ensure order is right... positions are in ascending order, starting position first.
      positions.sort(function(a, b) {
        return a.halfMoveNumber < b.halfMoveNumber ? -1 : 1; 
      });

      
      var moveNumber = 1;

      for (var i = 0, l = positions.length; i < l; i++) {

        if (i % 2 === 0 || i === 0) {
          pgnString += moveNumber + '. ';
          ++moveNumber;

        }

        pgnString += positions[i].move;
        pgnString += ' {' + (parseInt(positions[i].evaluation)/100).toFixed(2) + ',' + positions[i].bestMove + '} ';

      };

      return pgnString;
    }

}

var PGNParser = function(parserEngine) {

    this.parserEngine = parserEngine;

    this.getInfoObjectForGame = function(pgn) {

      var info = {
        white: '-',
        black: '-',
        result: '*',
        date: '-',
        tournament: '-'
      };

      var pgnParts = pgn.split("]");

      for (var i = 0, l = pgnParts.length; i < l; i++) {

        var part = pgnParts[i];
        var fi = part.indexOf("[White ");

        if (fi !== -1) {
          info.white = part.substr(fi+8).slice(0, -1);
          continue;
        }
        fi = part.indexOf("[Black ");
        if (fi !== -1) {
          info.black = part.substr(fi+8).slice(0, -1);
          continue;
        }
        fi = part.indexOf("[Result ");
        if (fi !== -1) {
          info.result = part.substr(fi+9).slice(0, -1);	
          continue;
        }
        fi = part.indexOf("[Date ");
        if (fi !== -1) {
          info.date = part.substr(fi+7).slice(0, -1);	
          continue;
        } 
        fi = part.indexOf("[Event ");
        if (fi !== -1) {
          info.tournament = part.substr(fi+8).slice(0, -1);	
          continue;
        }                
      };

      
      return info;



    }

    this.parseSinglePGN = function(pgn) {

      var info = this.getInfoObjectForGame(pgn);

      var chess = this.parserEngine;

      if (!chess.load_pgn(pgn)) {
        
        return false;
      }
      var halfMoveFromEnd = 0;
      var positions = [];
      var lastPosition = chess.fen();

      var latestMove = chess.undo();
      while (latestMove) {
        positions.push({halfMoveNumber: halfMoveFromEnd, move: latestMove.san, fen: lastPosition});
        lastPosition = chess.fen();
        latestMove = chess.undo();
        ++halfMoveFromEnd;
      }

      for (var i = 0, l = positions.length; i < l; i++) {
        var position = positions[i];
        position.halfMoveNumber = halfMoveFromEnd - position.halfMoveNumber;
      }
      //console.log("SUCCESSFULL PARSING OF PGN");
      return {info: info, positions: positions};

    }

    this.parseMultiplePGNs = function(pgns, delimiter) {

      var pgnsArr = pgns.split(delimiter);
      var pgnPositions = [];

      for (var i = pgnsArr.length - 1; i >= 0; i--) {
        pgnPositions.push(this.parseSinglePGN(pgnsArr[i]));
      };
      return pgnPositions;
    }
}


var GameReceiver = function(gameStorage, parser) {

	this.gameStorage = gameStorage;
	this.parser = parser;

	this.addGame = function(pgn, group, output) {
		var gameObj = this.parser.parseSinglePGN(pgn);
		gameObj.output = output;
		gameObj.group = group;
		console.log("ADDING OUTPUT TO GAME: " + output);
		//console.log(gameObj.info.white + "\n" + gameObj.info.black + "\n" + gameObj.positions.length);
		this.gameStorage.addGame(gameObj);

	}

	this.receiveGames = function(games, group, output) {
		console.log('GROUP IS : ' + group.id);
		// Parsing pgns into positions is heavy job. We need to make sure we don't steal the main thread altogether.
		var dispatchGame = function() {
			if (games.length > 0) {
				var game = games.shift();
				this.addGame(game, group, output);
				setImmediate(dispatchGame);
			}	
			else {
				group.allGamesAdded();
				console.log("NO GAMES ANYMORE");
			}
		}.bind(this);
		dispatchGame();

	}
}




var PGNFetcher = function(group, filename, readStream, gameReceiver) {

	this.readStream = readStream;
	this.gameReceiver = gameReceiver;

	this.currentTemp = '';
	this.currentPGNString;

	this.partCounter = 0;
	this.currentPart;

	this.games = [];

	this.onePart = function(part) {

		if (this.partCounter % 2 !== 0 && this.partCounter !== 0) {
			console.log('_----------------------_');
			console.log(this.currentPart + "\n\n" + part);
			console.log('_----------------------_');
			this.games.push(this.currentPart + "\n\n" + part);
		} else {
			this.currentPart = part;
		}
		this.partCounter++;

	}

	this.processParts = function(gameStringsArr) {
		var lastIdx = gameStringsArr.length-1;

		for (var i = 0; i < lastIdx; i++) {
			this.onePart(gameStringsArr[i]);		
		};
		this.currentTemp = gameStringsArr[lastIdx];
	}

	this.splitGames = function(chunk) {
		return chunk.split('\n\n');
	}

	this.receiveChunk = function(chunk) {
		this.currentTemp += chunk;
		if (this.currentTemp.indexOf('\n\n') !== -1) {
			console.log("FOUND SPLITTER");
			var foundParts = this.splitGames(this.currentTemp);
			this.processParts(foundParts);
		}
	}

	this.flushTemp = function() {
		if (this.currentTemp !== '') {
			this.processParts(this.splitGames(this.currentTemp));
		}
	}

	this.readStream.on('data', function(chunk) {
		//console.log(chunk.toString());
		this.receiveChunk(chunk.toString());		
	}.bind(this));

	this.readStream.on('error', function() {
		this.currentPGNString = 0; // Help GC, i guess
		this.currentPart = 0;
		return false; // Does nothing much, but indicates maintainer this is error cond
	});

	this.readStream.on('end', function() {
		console.log("__________________" + this.games.length + " | GROUP: " + filename);
		this.flushTemp();
		this.gameReceiver.receiveGames(this.games, group, filename);
		this.games = [];
		this.readStream.close();
		
	}.bind(this));

	console.log("NEW PGN FETCHER DONE");
}

var BatchMonitor = function(interval, batchController) {

	this.interval = interval;
	this.batchController = batchController;

	this.handle;

	this.initSweep = function() {
		console.log("INITING SWEEP");
		this.batchController.sweepPending();
	}

	this.startUp = function() {
		if (!this.handle) {
			console.log("SETTING SWEEP INTERVAL: " + this.interval);
		  this.handle = setInterval(this.initSweep.bind(this), this.interval);
		}
	}

	this.shutDown = function() {

		if (this.handle) {
			clearInterval(this.handle);
			this.handle = 0;
		}
	}

}

var GameGroup = function(id, writeStream, outputPath) {

	this.id = id;
	this.groupActive = false;
	this.gamesAdded = 0;

	this.groupReady = function() {
		writeStream.close();
		setImmediate(function() {
			SERVER.fileManager.groupIsReady(this.id, outputPath);
		}.bind(this));
	}

	this.gameDone = function() {

		if (this.groupActive) {
			this.gamesAdded--;
			console.log("GAMES LEFT IN GROUP: " + this.gamesAdded);
			console.log('KKKKKKKKKKKKKKKKKKKKKKKKKk');
			if (this.gamesAdded <= 0) {
				this.groupReady();
			}
		}



	}

	this.allGamesAdded = function() {
		this.groupActive = true;
	}


}

var FileManager = function() {

	this.pendingFiles = {};

	this.runningID = 1;

	this.checkInitialFiles = function() {

		fs.readdir('uploads', function(err, files) {
			if (err) {
				// Log error
				throw err;
			}
			this.pushCurrentFiles(files);
		}.bind(this));

	}

	this.pushCurrentFiles = function(files) {
		console.log("------------PUSHING CURRENT FILES: " + files.length + " ----------------------");
		for (var i = files.length - 1; i >= 0; i--) {
			this.addFileForAnalysis(files[i], 'uploads/' + files[i]);
		};
	}

	this.addFileForAnalysis = function(filename, path) {

		console.log('/uploads/' + filename);
		console.log(path);
		var readStream = fs.createReadStream(path);
		var outputPath = 'public/downloads/' + filename;
		var fd = fs.openSync(outputPath, 'w'); // This is pretty quick, we are simply creating empty file

		fs.open(outputPath, 'w', function(err, fd) {
			if (err) {
				readStream.close();
				throw err;
			}
		
			var writeStream = fs.createWriteStream(outputPath);
			var group = new GameGroup(++this.runningID, writeStream, outputPath);
			this.pendingFiles[this.runningID] = {group: group, inputPath: path};
			var fetch = new PGNFetcher(group, writeStream, readStream, SERVER.gameReceiver);
			console.log("FETCHING SHOULD NOW COMMENCE");			
		}.bind(this));


	}

	this.groupIsReady = function(groupID, outputPath) {
		console.log("GROUP IS READY: " + groupID);
		fs.unlink(this.pendingFiles[groupID].inputPath, function() {
			/// Nothing to do
		});
		SERVER.userNotificator.groupIsReady(outputPath);
		this.pendingFiles[groupID] = null;
		delete this.pendingFiles[groupID];
		
	}


}

var EmailGateWay = function() {

	this.groupIsReady = function(path) {

		console.log("_______________- ");
		console.log("_______________- ");
		console.log("_______________- ");
		console.log("GROUP IS READY: " + path);
		console.log("_______________- ");
		console.log("_______________- ");
		console.log("_______________- ");


	}
}

SERVER.pgnParser = new PGNParser(new ch.Chess());
SERVER.doneGameHandler = new DoneGameHandler(savePGNstream);
SERVER.gameStorage = new GameStorage(SERVER.pgnParser, SERVER.positionStorage);
SERVER.serverBatchController = new ServerBatchController(SERVER.gameStorage, SERVER.positionStorage);
SERVER.resultReceiver = new ResultReceiver(SERVER.doneGameHandler, SERVER.gameStorage, SERVER.serverBatchController);
SERVER.batchMonitor = new BatchMonitor(8000, SERVER.serverBatchController);
SERVER.fileManager = new FileManager();
SERVER.gameReceiver = new GameReceiver(SERVER.gameStorage, SERVER.pgnParser);
SERVER.userNotificator = new EmailGateWay();


//SERVER.pgnFetcher = new PGNFetcher('14fin-9.pgn', readPGNStream, SERVER.gameReceiver);

SERVER.fileManager.checkInitialFiles();
SERVER.batchMonitor.startUp();






