/*jshint esversion: 6 */

//Requires
const Discord = require("discord.js");
const config = require("./config.js");
const path = require("path");
const fs = require("fs");
const ytdl = require("ytdl-core");
const google = require("googleapis");
const send = require("./lib.js").send;

var permissions = require("./permissions.js");
//To make a Youtube queries for getting playlist items
var youtube = google.youtube({
    version: "v3",
    auth: "AIzaSyCLuDKIFxIljNvS1U9JJvBzvUZIZ3p7Ve8"
});

//The music queue, the property name is the guild id which links to arrays of video info
//Also contains a next function which downloads the next song in the queue
//and a play function which plays a file
//Volume of the bot on each server is also stored in this object as 'vol<guildID>' (number between 0 and 1)
var queue = require("./queue.js");

/*
	the object name is the actual command to be entered - this must be all lowercase (or i could add a toLowerCase() in main.js but I haven't)
	voice dictates whether a user must be in the same voice channel as the bot to use the command
	deleteInvoking is whether the message which invoked the command should be deleted
	use is a simple instruction on how to use the command (Displayed with help)
	shortHelp is shown when all commands are listed
	longHelp is shown when a specific command help is needed - be more detailed
	exe is the function which executes when the command is used
 */

var commands = {
    ping: {
        voice: false,
        deleteInvoking: false,
        use: "ping",
        shortHelp: "Replies with 'Pong!'",
        longHelp: "Simple command which sends the message 'Pong!' in the same channel the command was received on.",
        exe: (bot, msg, ...args) => {
            //Reply in message channel with Pong
            send(msg.channel, "Pong!", 0);
        }
    },

    foo: {
        voice: false,
        deleteInvoking: false,
        use: "foo",
        shortHelp: "Replies with 'Bar!'",
        longHelp: "Simple command which sends the message 'Bar!' in the same channel the command was received on.",
        exe: (bot, msg, ...args) => {
            //Reply in message channel with Bar
            send(msg.channel, "Bar!", 0);
        }
    },

    echo: {
        voice: false,
        deleteInvoking: false,
        use: "echo <words>",
        shortHelp: "Make the bot repeat things",
        longHelp: "Enter words and phrases after the echo command to cause the bot to repeat those words and phrases in the channel.",
        exe: (bot, msg, ...args) => {
			//Take the message, strip the command and send the result back
            if (args.length > 1) {
                let words = args;
                words.splice(0, 1);
                let sentence = words.join(" ");
                send(msg.channel, sentence, 0);
            } else {
            	send(msg.channel, "Maybe you should say something for me to echo", {}, 0);
            }
        }
    },

    help: {
        voice: false,
        deleteInvoking: false,
        use: "help <command>",
        shortHelp: "Displays help information",
        longHelp: "Displays all commands and short help if not provided with a command. Otherwise states detailed help information for the provided command.",
        exe: (bot, msg, ...args) => {
            if (args.length === 1) {
                //Display list of commands
                let helpString = "";

                //Iterate through all commands and add their help to the helpString
                for (let cmd in commands) {
                    if (!commands.hasOwnProperty(cmd)) continue;

                    helpString += config.cmdPrefix + commands[cmd].use + "\n  # " + commands[cmd].shortHelp + "\n";
                }

                //Reply in the channel with the help displayed as a code block
                send(msg.channel, helpString, {
                    code: "Markdown",
					split: true
                }, 0);
            } else {
                //Display specific command help
                if (commands[args[1]] !== undefined) {
                    send(msg.channel, config.cmdPrefix + commands[args[1]].use + "\n  #" + commands[args[1]].longHelp, {
                        code: "Markdown"
                    }, 0);
                } else {
                    send(msg.channel, "Sorry, that command doesn't exist", 0);
                }
            }
        }
    },

    summon: {
        voice: false,
        deleteInvoking: true,
        use: "summon",
        shortHelp: "Summons the bot to your voice channel",
        longHelp: "Makes the bot attempt to join the voice channel you are currently connected to.",
        exe: (bot, msg, ...args) => {
            //Find the voice channel the command issuer is in
            let voiceChannel = msg.member.voiceChannel;
            let id = msg.channel.guild.id;
			//Hey I can't be summoned to nowhere
            if (voiceChannel === undefined) {
                return send(msg.channel, "You must be in a voice channel", 5000);
            }
            //Join the voice channel
            voiceChannel.join().then((connection) => {
                //Set up the queue for this guild if it's not already
                if (queue[id] === undefined) queue[id] = [];
                //Default volume of 25%
                if (queue["vol" + id] === undefined) queue["vol" + id] = config.defaultVolume;

                //Tell the user the bot failed to join the channel and log the error
            }, (err) => {
                send(msg.channel, "Failed to join channel", 5000);
                console.log(err);
            });
        }
    },

    play: {
        voice: true,
		deleteInvoking: true,
        use: "play <Link>|<SearchString> [--playnext]",
        shortHelp: "Plays a video",
        longHelp: "Enter a URL to a sound clip. This will be downloaded and played in the currently connected voice channel.\nEntering text which is not a URL after the command will instead search youtube using the provided term and play the returned video.\n\nBy default the audio track is added to the end of the queue, however if '--playnext' is added to the command the audio track will be added to the start of the queue.",
        exe: (bot, msg, ...args) => {
            let id = msg.channel.guild.id;
            if (args.length !== 1) {
                //Proccess the command

                if (args[1].includes("youtube.com")) {
                    //It's a youtube link, cool

                    if (args[1].includes("watch?v=")) {
                        //It's a video
						//Get the video metadata
                        ytdl.getInfo(args[1], (err, info) => {
                            if (err) {
								//uh oh that video didn't work
                                send(msg.channel, "Error adding video: " + err, {code: true}, 20000);
                                return console.log(err);
                            }

							//Make sure the video isn't too long acording to our config
                            if (info.length_seconds <= config.maxVideoLength) {

								//Should we queue it next or at the end
                                if (msg.content.toLowerCase().includes("--playnext")) {
                                    //Add the video to the start of the queue (pos 0 if the queue is empty or pos 1 if not)
                                    queue[id].length > 0 ? queue[id].splice(1, 0, info) : queue[id].shift(info);
                                } else {
                                    //Add the video to the end of the queue
                                    queue[id].push(info);
                                }

								//It's in the queue
                                send(msg.channel, "Enqueued " + info.title, 8000);

                                //A new video has been added lets check if we should start downloading that
                                if (queue[id].length === 1) {

									//Lets take that metadata and get an audio file from it
                                    let video = ytdl.downloadFromInfo(queue[id][0], {
                                        filter: "audioonly"
                                    });
                                    let file = "";

									//When the download starts
                                    video.on("info", (data) => {
										//Pipe the audio to a file with no extension because I don't know how to work out the encoding and relevant extension
                                        file = path.join(__dirname + "/audioFiles/", data.title);
                                        console.log("Started download of " + queue[id][0].title);
                                        video.pipe(fs.createWriteStream(file));
                                    });

									//Download success
                                    video.on("end", () => {
										//Rename the file to have a .complete extension since it will still play fine and now I can differentiate between full and partial files
                                        console.log("Completed download of " + queue[id][0].title);
                                        let newFile = file + ".complete";
                                        fs.renameSync(file, newFile);
                                        queue.play(id, bot, newFile, msg);
                                    });

									//The download failed
                                    video.on("error", (err) => {
										//Skip this one then
                                        send(msg.channel, "There was an error downloading: " + queue[id][0].title, {code: true}, 5000);
                                        console.log(err);
                                        queue.next(id, bot, msg);
                                    });
                                }
                            } else {
                                send(msg.channel, "Sorry, that video exceeds the max video length", 5000);
                            }
                        });
                    } else if (args[1].includes("playlist?list=")) {
                        //It's a playlist

                        let sizeBefore = queue[id].length;
                        let url = args[1];
                        let plId = "";
                        let start = url.indexOf("?list=");

                        //Make sure it actually has the right format here
                        if (start > 0) {
                            plId = url.substring(start + 6);
							//Get a list of all the videos in the playlist
                            youtube.playlistItems.list({
                                part: "contentDetails",
                                playlistId: plId,
                                fields: "items/contentDetails/videoId"
                            }, (err, results) => {
                                if (err) {
                                    //return errors if any
                                    send(msg.channel, "There was an error adding this playlist", 5000);
                                    return console.log(err);
                                }

                                let pos = 0;
                                //Add each video one by one to the queue
                                results.items.forEach(element => {
									//Get the video metadata
                                    ytdl.getInfo("www.youtube.com/watch?v=" + element.contentDetails.videoId, (err, info) => {
                                        if (err) {
                                            console.log(err);
                                        } else {
											//Check if it exceeds our configured time limit
                                            if (info.length_seconds <= config.maxVideoLength) {
												//add it to either the end of the queue or next in the queue
												//This should maintain playlist order either way
                                                if (msg.content.toLowerCase().includes("--playnext")) {
                                                    queue[id].splice(pos, 0, info);
                                                    pos++;
                                                } else {
                                                    queue[id].push(info);
                                                    pos++;
                                                }

                                                //If we just added the first video, start playing it
                                                if (pos === 1 && sizeBefore === 0 && sizeBefore < queue[id].length) {
													//take the metadata and get an audio file from it
                                                    let video = ytdl.downloadFromInfo(queue[id][0], {
                                                        filter: "audioonly"
                                                    });
                                                    let file = "";

													//pipe the audio stream to a file
                                                    video.on("info", (data) => {
                                                        file = path.join(__dirname + "/audioFiles/", data.title);
                                                        console.log("Started download of " + queue[id][0].title);
                                                        video.pipe(fs.createWriteStream(file));
                                                    });

													//rename the file to have a .complete extension and play it
                                                    video.on("end", () => {
                                                        console.log("Completed download of " + queue[id][0].title);
                                                        let newFile = file + ".complete";
                                                        fs.renameSync(file, newFile);
                                                        queue.play(id, bot, newFile, msg);
                                                    });

													//Just skip this song
                                                    video.on("error", (err) => {
                                                        send(msg.channel, "There was an error downloading: " + queue[id][0].title, {code: true}, 8000);
                                                        console.log(err);
                                                        queue.next(id, bot, msg);
                                                    });
                                                }
                                            }
                                        }
                                    });
                                });
								//I wanted this to say after all videos have been added but getInfo is async and its looped so ¯\_(ツ)_/¯
                                //send(msg.channel, "Added " + pos + " items from playlist", 5000);
                            });
                        }

                    } else {
                        //It's something weird like a channel
                        console.log("Only videos or playlists please");
                    }
                } else if (args[1].includes("youtu.be")) {
                    //It's a shortened Youtube URL
					//Get some video metadata
                    ytdl.getInfo(args[1], (err, info) => {
                        if (err) {
                            send(msg.channel, "Error adding video: " + err, {code: true}, 20000);
                            return console.log(err);
                        }
						//Mkae sure video isn't too long
                        if (info.length_seconds < config.maxVideoLength) {

							//next in queue or end of queue
                            if (msg.content.toLowerCase().includes("--playnext")) {
                                //Add the video to the start of the queue
                                queue[id].splice(1, 0, info);
                            } else {
                                //Add the video to the end of the queue
                                queue[id].push(info);
                            }

                            send(msg.channel, "Enqueued " + info.title, 5000);

                            //A new video has been added lets check if we should start downloading that
                            if (queue[id].length === 1) {

								//Get some audio from the metadata
                                let video = ytdl.downloadFromInfo(queue[id][0], {
                                    filter: "audioonly"
                                });
                                let file = "";

								//pipe said audio to a file
                                video.on("info", (data) => {
                                    file = path.join(__dirname + "/audioFiles/", data.title);
                                    console.log("Started download of " + queue[id][0].title);
                                    video.pipe(fs.createWriteStream(file));
                                });

								//Rename the file to have .complete extension and play file
                                video.on("end", () => {
                                    console.log("Completed download of " + queue[id][0].title);
                                    let newFile = file + ".complete";
                                    fs.renameSync(file, newFile);
                                    queue.play(id, bot, newFile, msg);
                                });

								//Skip this song
                                video.on("error", (err) => {
                                    send(msg.channel, "There was an error downloading: " + queue[id][0].title, {code: true}, 5000);
                                    console.log(err);
                                    queue.next(id, bot, msg);
                                });
                            }
                        } else {
                            send(msg.channel, "Sorry, that video exceeds the max video length", {code: true}, 5000);
                        }
                    });
                } else {
                    //It's either a search string or another website.
					//Check to see if it is a url - Maybe I should make this better but ¯\_(ツ)_/¯
                    if (msg.content.toLowerCase().includes("://") || msg.content.toLowerCase().includes("www.")) {
                        return send(msg.channel, "Sorry, only youtube please", 5000);
                    }

					//Get the search string
                    let search = args.splice(0, 1);
                    search = search.join(" ");
                    search = encodeURI(search);

					//Use the youtube api to search for a single video using this search string and get it's ID
                    youtube.search.list({
                        part: "snippet",
                        maxResults: 1,
                        q: search,
                        fields: "items/id/videoId"
                    }, (err, results) => {
                        if (err) {
                            send(msg.channel, "Error searching for video", 8000);
                            return console.log(err);
                        }

						//Get some metadata for the returned video
                        ytdl.getInfo("www.youtube.com/watch?v=" + results.items[0].id.videoId, (err, info) => {
                            if (err) {
                                send(msg.channel, "Error adding video", 8000);
                                return console.log(err);
                            }
							//Check if the video is too long
                            if (info.length_seconds < config.maxVideoLength) {
								//next in queue or end of queue
                                if (msg.content.toLowerCase().includes("--playnext")) {
                                    //Add the video to the start of the queue (pos 0 if the queue is empty or pos 1 if not)
                                    queue[id].length > 0 ? queue[id].splice(1, 0, info) : queue[id].shift(info);
                                } else {
                                    //Add the video to the end of the queue
                                    queue[id].push(info);
                                }

                                send(msg.channel, "Enqueued " + info.title, 5000);

                                //A new video has been added lets check if we should start downloading that
                                if (queue[id].length === 1) {

									//audio from metadata
									//I should really offload this to its own function
                                    let video = ytdl.downloadFromInfo(queue[id][0], {
                                        filter: "audioonly"
                                    });
                                    let file = "";

									//pipe to file
                                    video.on("info", (data) => {
                                        file = path.join(__dirname + "/audioFiles/", data.title);
                                        console.log("Started download of " + queue[id][0].title);
                                        video.pipe(fs.createWriteStream(file));
                                    });

									//rename and play file
                                    video.on("end", () => {
                                        console.log("Completed download of " + queue[id][0].title);
                                        let newFile = file + ".complete";
                                        fs.renameSync(file, newFile);
                                        queue.play(id, bot, newFile, msg);
                                    });

									//skip errornous song
                                    video.on("error", (err) => {
                                        send(msg.channel, "There was an error downloading: " + queue[id][0].title, {code: true}, 8000);
                                        console.log(err);
                                        queue.next(id, bot, msg);
                                    });
                                }
                            } else {
                                return send(msg.channel, "Sorry, that video exceeds the time limit", 8000);
                            }
                        });
                    });
                }
            } else {
                //They entered the command on it's own
                send(msg.channel, "Incorrect syntax, type '" + config.cmdPrefix + "help play' to learn more", 20000);
            }
        }
    },

    volume: {
        voice: true,
		deleteInvoking: true,
        use: "volume <0-100>",
        shortHelp: "sets the volume",
        longHelp: "Enter a number between 0 and 100 to set the volume to that percent.",
        exe: (bot, msg, ...args) => {
			//it's gotta be a command and an argument
            if (args.length === 2) {
				//make sure they entered a good number and no I'm not supporting 200% volume
                let vol = Math.round(Number(args[1])) / 100;
                if (vol >= 0 && vol <= 1) {
					//Set the volume in the queue object for future streams
                    queue["vol" + msg.channel.guild.id] = vol;
					//set the volume of the current stream if there is one
                    if (bot.voiceConnections.get(msg.channel.guild.id).player.dispatcher !== undefined) {
                        bot.voiceConnections.get(msg.channel.guild.id).player.dispatcher.setVolume(vol);
                    }
                    send(msg.channel, "Volume set to " + (vol * 100) + "%", 8000);
                } else {
                	send(msg.channel, "Please enter a number between 0 and 100, inclusive", 8000);
                }
            } else {
                send(msg.channel, "Incorrect syntax", 8000);
            }
        }
    },

    pause: {
        voice: true,
		deleteInvoking: true,
        use: "pause",
        shortHelp: "pause the currently playing sound track",
        longHelp: "",
        exe: (bot, msg, ...args) => {
            let player = bot.voiceConnections.get(msg.channel.guild.id).player;
            //Pause the bot's stream on the current server if it's not already paused
            if (player.dispatcher === undefined || player.dispatcher.paused) {
                send(msg.channel, "I'm not playing anything", 5000);
            } else {
                player.dispatcher.pause();
            }
        }
    },

    resume: {
        voice: true,
		deleteInvoking: true,
        use: "resume",
        shortHelp: "Resumes the currently playing audio track",
        longHelp: "",
        exe: (bot, msg, ...args) => {
            let player = bot.voiceConnections.get(msg.channel.guild.id).player;

            if (player.dispatcher === undefined) {
                return send(msg.channel, "There's nothing to resume", 8000);
            }

            //Resume the bot's stream on the current server if it's not already playing
            if (player.dispatcher.paused) {
                player.dispatcher.resume();
            } else {
                send(msg.channel, "I'm not paused", 8000);
            }
        }
    },

    skip: {
        voice: true,
		deleteInvoking: true,
        use: "skip",
        shortHelp: "Skips the currently playing audio track",
        longHelp: "",
        exe: (bot, msg, ...args) => {
			//if there is currently a stream playing, we just end it
            if (bot.voiceConnections.get(msg.channel.guild.id).player.dispatcher === undefined) {
                send(msg.channel, "You can only skip an item when I'm playing something", 8000);
            } else {
                bot.voiceConnections.get(msg.channel.guild.id).player.dispatcher.end("Skipped");
            }
        }
    },

    queue: {
        voice: true,
		deleteInvoking: true,
        use: "queue",
        shortHelp: "Displays the queue",
        longHelp: "Displays a list of all videos in the current queue for the server and their position in the queue.",
        exe: (bot, msg, ...args) => {
            let id = msg.channel.guild.id;
            //Is there even a queue on this server yet
            if (queue[id] !== undefined && queue[id].length > 0) {
                let compMsg = "Current Queue";
                //Iterate through all the items in this servers queue and add them to the message
                for (let i = 0; i < queue[id].length; i++) {
                    compMsg += "\n" + i + ". " + queue[id][i].title;
                }
                //Send the compiled queue message to the server
                send(msg.channel, compMsg, {split: true}, 30000);
            } else {
                send(msg.channel, "There is nothing in the queue", 5000);
            }
        }
    },

    clear: {
        voice: true,
		deleteInvoking: true,
        use: "clear [startNum] [endNum]",
        shortHelp: "Clears the current queue",
        longHelp: "Clears videos from the current queue. If start and end numbers are provided only videos in that range are cleared.",
        exe: (bot, msg, ...args) => {
            let id = msg.channel.guild.id;
            if (queue[id].length > 1) {
				//If they haven't entered any number set it to clear the whole queue
                let start = typeof args[1] !== undefined ? Number(args[1]) : 1;
                let end = typeof args[2] !== undefined ? Number(args[2]) : queue[id].length - 1;

                //Make sure that the numbers are correct and clear the queue
                if (start > 0 && start < end && end > 0 && end < queue[id].length) {
                    queue[id].splice(start, end - start);
                    msg.channel.send("Queue Cleared");
                } else {
                    send(msg.channel, "Please enter valid start/end numbers", 5000);
                }
            } else {
                send(msg.channel, "There's nothing in the queue", 5000);
            }
        }
    },

    remove: {
        voice: true,
		deleteInvoking: true,
        use: "remove <queueNumber>",
        shortHelp: "Removes a certain track from the queue",
        longHelp: "Enter the number of a video in the queue after this command to remove the video at that position from the current queue.",
        exe: (bot, msg, ...args) => {
            let id = msg.channel.guild.id;
            if (queue[id].length > 1) {
                let num = Number(args[1]);
				//Make sure they entered a good number and get rid of that item
                if (!isNaN(num) && num > 0 && num < queue[id].length) {
                    queue[id].splice(num, 1);
                    send(msg.channel, "Removed item from queue", 5000);
                } else {
                    send(msg.channel, "Please enter a valid queue number", 8000);
                }
            } else {
                send(msg.channel, "The queue is empty", 5000);
            }
        }
    },

    move: {
        voice: true,
		deleteInvoking: true,
        use: "move <original location> <new location>",
        shortHelp: "Moves an audio track in the queue",
        longHelp: "Move a video from one position in the queue to another. The first argument is the current position of the video you want to move and the second argument is the position you want it to be in.\ne.g., moving an item from 6th position to play next would be 'move 6 1'.",
        exe: (bot, msg, ...args) => {
            let id = msg.channel.guild.id;
            if (queue[id].length > 2) {
                let org = Number(args[1]);
                let fin = Number(args[2]);

				//Make sure the numbers they entered actually work
                if (!isNaN(org) && !isNaN(fin) && org > 0 && fin > 0 && org < queue[id].length && fin < queue[id].length) {
					//since we can't actually move items in an array we store them temporarily and add them in elsewhere
                    let hold = queue[id][org];
                    queue[id].splice(org, 1);
                    queue[id].splice(fin, 0, hold);
                    send(msg.channel, "Moved the video", 5000);
                } else {
                    send(msg.channel, "Please enter valid orgin and finish queue positions", 8000);
                }
            } else {
                send(msg.channel, "There's not enough videos to move", 5000);
            }
        }
    },

    shuffle: {
        voice: true,
		deleteInvoking: true,
        use: "shuffle",
        shortHelp: "Shuffles the current queue",
        longHelp: "",
        exe: (bot, msg, ...args) => {
            let id = msg.channel.guild.id;

            if (queue[id].length > 2) {
                for (let i = 0; i < queue[id].length; i++) {
                    //That's random enough for me
                    let num = Math.floor(Math.random() * ((queue[id].length - 1)) + 1);
                    let hold = queue[id][i];

                    queue[id].splice(i, 1);

                    queue[id].splice(num, 0, hold);
                }
                send(msg.channel, "Shuffled", 5000);
            } else {
                send(msg.channel, "There is not enough items to shuffle in the queue", 8000);
            }

        }
    },

    shutdown: {
        voice: false,
        deleteInvoking: true,
        use: "shutdown",
        shortHelp: "Shuts down the bot",
        longHelp: "Disconnects the bot from all servers and ends the bots proccess.\nIt will need to be restarted manually.",
        exe: (bot, msg, ...args) => {
            //Tell the user they are leaving, destroy the bot's client connection and then kill the node process
            send(msg.channel, ":wave:", 5000);
            bot.destroy();
            process.exit();
        }
    },

    groups: {
        voice: false,
        deleteInvoking: true,
        use: "groups",
        shortHelp: "List all groups",
        longHelp: "",
        exe: (bot, msg, ...args) => {
			//just iterate through all the groups and get their name
            let compMsg = "List of groups";
            for (var key in permissions) {
                if (permissions.hasOwnProperty(key)) {
                    compMsg += "\n" + key;
                }
            }
            send(msg.channel, compMsg, {code: true}, 10000);
        }
    },
	/* These commands aren't working
    newgroup: {
        voice: false,
        deleteInvoking: true,
        use: "newGroup <name>",
        shortHelp: "Create a new group",
        longHelp: "Create a new name with the specified name. The name must be one word.",
        exe: (bot, msg, ...args) => {

        }
    },

    togroup: {
        voice: false,
        deleteInvoking: true,
        use: "ToGroup <groupname> <[@user] | [@role]>",
        shortHelp: "Add users or roles to a group",
        longHelp: "enter a group name as the first parameter to add any user or role mentioned in the command to that group.",
        exe: (bot, msg, ...args) => {

        }
    },

    fromgroup: {
        voice: false,
        deleteInvoking: true,
        use: "FromGroup <groupname> <[@user] | [@role]>",
        shortHelp: "Remove users or roles from a group",
        longHelp: "enter a group name as the first parameter to add any user or role mentioned in the command to that group.",
        exe: (bot, msg, ...args) => {

        }
    },

    deletegroup: {
        voice: false,
        deleteInvoking: true,
        use: "deleteGroup <groupname>",
        shortHelp: "Delete a group",
        longHelp: "Remove a specified group from the bot, all users and roles in this group will lose their priviliges.",
        exe: (bot, msg, ...args) => {

        }
    },

    ygo: {
        voice: false,
        deleteInvoking: true,
        use: "ygo <Search String>",
        shortHelp: "Search for a Yu-Gi-Oh! card details",
        longHelp: "Enter a string to search the Yu-Gi-Oh! wiki for. This command checks the top three results and shows the first card results details, if a card is found.",
        exe: (bot, msg, ...args) => {

        }
    },
	*/
	roll: {
		voice: false,
		deleteInvoking: false,
		use: "roll <numOfDice>d<diceSize>",
		shortHelp: "Roll some dice",
		longHelp: "Roll the specified number of dice with the specified ammount of sides \ne.g., roll 1d20 will roll one 20 sided die",
		exe: (bot, msg, ...args) => {
			if (args.length === 2) {
				let algorithm = args[1].split("d");
				if (algorithm.length === 2 && Number(algorithm[0]) > 0 && Number(algorithm[1]) > 0) {
					let total = 0;
					for (let i = 0; i < Number(algorithm[0]); i++) {
						total += Math.floor(Math.random() * Number(algorithm[1])) + 1;
					}
					send(msg.channel, "Total rolled: " + total, 0);
				} else {
					send(msg.channel, "Incorrect syntax", 5000);
				}
			} else {
				send(msg.channel, "Incorrect syntax", 5000);
			}
		}
	},

	tag: {
		voice: false,
		deleteInvoking: false,
		use: "tag <tagname>",
		shortHelp: "Output saved messages",
		longHelp: "Output a saved message with the corresponding tag name to the channel. Save new messages with addtag",
		exe: (bot, msg, ...args) => {
			//make sure they entered an argument
			if (args.length === 2) {
				//read the tags file
				fs.readFile("tags.json", (err, data) => {
					if (err) {
						console.log(err);
						return send(msg.channel, "There was an error reading tags", 8000);
					}

					let tags = JSON.parse(data);

					//Check to see if there are any tags for this server
					if (tags[msg.channel.guild.id] === undefined || tags[msg.channel.guild.id].length === 0) {
						return send(msg.channel, "There are no tags on this server", 8000);
					}

					let tagname = args[1].toLowerCase();

					//check if the argument they entered is a valid tag name, send the tag message if it is
					if (tags[msg.channel.guild.id][tagname] !== undefined) {
						send(msg.channel, tags[msg.channel.guild.id][tagname], 0);
					} else {
						send(msg.channel, "That tag doesnt exist", 0);
					}
				});
			} else {
				send(msg.channel, "Invalid syntax", 5000);
			}
		}
	},

	addtag: {
		voice: false,
		deleteInvoking: true,
		use: "addTag <tagname> <message>",
		shortHelp: "Save a message",
		longHelp: "Associates a message with a tagname which can be recalled later with the tag command.",
		exe: (bot, msg, ...args) => {
			//make sure they entered at least a name and one word message
			if (args.length > 2) {
				//read the tags file
				fs.readFile("tags.json", (err, data) => {
					let tagname = args[1].toLowerCase();
					if (err) {
						console.log(err);
						return send(msg.channel, "There was an error checking tags", 8000);
					}

					let tags = JSON.parse(data);

					//Create an object in the tags list for this server if one does not already exist
					if (tags[msg.channel.guild.id] === undefined) {
						tags[msg.channel.guild.id] = {};
					}

					//Check if this tag already exists
					if (tags[msg.channel.guild.id][tagname] === undefined) {
						//It doesnt exist, we can add it
						//Get the message as a single string on it's own
						let message = args;
						message.splice(0,2);
						message = message.join(" ");

						//Add the message to this guilds tag list object
						tags[msg.channel.guild.id][tagname] = message;

						//Write the new tag list to the tags file including the new tag
						fs.writeFile("tags.json", JSON.stringify(tags), (err) => {
							if (err) {
								console.log(err);
								return send(msg.channel, "There was an error adding the tag", 8000);
							}
							send(msg.channel, "Tag added", 5000);
						});
					} else {
						send(msg.channel, "Sorry, that tag already exists", 8000);
					}
				});
			} else {
				send(msg.channel, "Invalid syntax", 8000);
			}
		}
	},

	removetag: {
		voice: false,
		deleteInvoking: true,
		use: "removeTag <tagname>",
		shortHelp: "Remove saved messages",
		longHelp: "Removes a previously created tag.",
		exe: (bot, msg, ...args) => {
			//make sure we have a tagname
			if (args.length === 2) {
				//read the tags file
				fs.readFile("tags.json", (err, data) => {
					if (err) {
						console.log(err);
						return send(msg.channel, "There was an error reading tags", 8000);
					}

					let tags = JSON.parse(data);

					//Check if there are any tags for this server
					if (tags[msg.channel.guild.id] === undefined || tags[msg.channel.guild.id].length === 0) {
						return send(msg.channel, "There are no tags on this server", 8000);
					}

					let tagname = args[1].toLowerCase();

					//See if this tagname even exists on this server
					if (tags[msg.channel.guild.id][tagname] !== undefined) {
						//Remove it
						delete tags[msg.channel.guild.id][tagname];

						//write the new taglist with removed tag to the tags file
						fs.writeFile("tags.json", JSON.stringify(tags), (err) => {
							if (err) {
								console.log(err);
								return send(msg.channel, "There was an error deleting the tag", 8000);
							}
							send(msg.channel, "Tag deleted", 5000);
						});
					} else {
						send(msg.channel, "That tag doesnt exist", 0);
					}
				});
			} else {
				send(msg.channel, "Invalid syntax", 5000);
			}
		}
	},

	taglist: {
		voice: false,
		deleteInvoking: false,
		use: "tagList",
		shortHelp: "List all tags",
		longHelp: "Produce a list of all previously saved tags",
		exe: (bot, msg, ...args) => {
			//read the tags file
			fs.readFile("tags.json", (err, data) => {
				if (err) {
					console.log(err);
					return send(msg.channel, "There was an error reading tags", 8000);
				}
				let tags = JSON.parse(data);
				//Check if there are any tags on this server
				if (tags[msg.channel.guild.id] !== undefined || tags[msg.channel.guild.id].length === 0) {
					let message = "Tags available on this server: ";
					//iterate through all the tags on this server and add them to the message to send
					//This only goes over the keys i.e., the tagnames
					Object.keys(tags[msg.channel.guild.id]).forEach(element => {
						message += "\n - " + element;
					});
					send(msg.channel, message, {code: true, split: true}, 0);
				} else {
					send(msg.channel, "No tags for this server exist, create some with addTag", 10000);
				}
			});
		}
	}
};


module.exports = commands;
