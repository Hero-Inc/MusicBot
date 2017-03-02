//Requires
const config = require(`./config.js`);
const fs = require(`fs`);
const ytdl = require(`ytdl-core`);
const google = require(`googleapis`);
const lib = require(`./lib.js`);
const clever = require(`cleverbot-node`);

var permissions = require(`./permissions.js`);

//To make requests to cleverbot
var cleverbot = new clever;
cleverbot.configure({botapi: config.cleverBotAPIKey});

//To make a Youtube queries for getting playlist items
var youtube = google.youtube({
	version: `v3`,
	auth: config.googleAPIKey
});

//The music queue, the property name is the guildid which links to array of video info
//Also contains a next function which downloads the next song in the queue
//and a play function which plays a file
//Volume of the bot on each server is also stored in this object as 'vol<guildID>' (number between 0 and 1)
var queue = require(`./queue.js`);

function getAllIds (plid, token, idList, cb) {
	if (typeof idList === `function`) {
		cb = idList;
		idList = [];
	}
	if (typeof token === `function`) {
		cb = token;
		idList = [];
		token = null;
	}
	youtube.playlistItems.list({
		part: `contentDetails`,
		playlistId: plid,
		pageToken: token,
		maxResults: 50,
		fields: `items/contentDetails/videoId`
	}, (err, results) => {
		if (err) {
			cb(err, null);
		} else {
			results.items.forEach(element => {
				idList.push(element.contentDetails.videoId);
			});
			if (results.nextPageToken !== undefined) {
				getAllIds(plid, results.nextPageToken, idList, cb);
			} else {
				cb(null, idList);
			}
		}
	});
}

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
	eval: {
		voice: false,
		deleteInvoking: false,
		use: `eval <script to run>`,
		shortHelp: `Run a script`,
		longHelp: `Execute a provided script as a functions and replies with anyhting that the functions returns`,
		exe: (bot, msg, ...args) => {
			if (args.length > 1) {
				args.splice(0, 1);
				let script = args.join(` `);
				try {
					lib.send(msg.channel, eval(script), {code: `JavaScript`}, 0);
				} catch (e) {
					lib.send(msg.channel, e, {code: `JavaScript`}, 0);
				}
			}
		}
	},

	ping: {
		voice: false,
		deleteInvoking: false,
		use: `ping`,
		shortHelp: `Replies with 'Pong!'`,
		longHelp: `Simple command which lib.sends the message 'Pong!' in the same channel the command was received on.`,
		exe: (bot, msg, ...args) => {
			//Reply in message channel with Pong
			lib.send(msg.channel, `Pong!`, 0);
		}
	},

	foo: {
		voice: false,
		deleteInvoking: false,
		use: `foo`,
		shortHelp: `Replies with 'Bar!'`,
		longHelp: `Simple command which lib.sends the message 'Bar!' in the same channel the command was received on.`,
		exe: (bot, msg, ...args) => {
			//Reply in message channel with Bar
			lib.send(msg.channel, `Bar!`, 0);
		}
	},

	echo: {
		voice: false,
		deleteInvoking: false,
		use: `echo <words>`,
		shortHelp: `Make the bot repeat things`,
		longHelp: `Enter words and phrases after the echo command to cause the bot to repeat those words and phrases in the channel.`,
		exe: (bot, msg, ...args) => {
			//Take the message, strip the command and lib.send the result back
			if (args.length > 1) {
				let words = args;
				words.splice(0, 1);
				let sentence = words.join(` `);
				lib.send(msg.channel, sentence, 0);
			} else {
				lib.send(msg.channel, `Maybe you should say something for me to echo`, {}, 0);
			}
		}
	},

	help: {
		voice: false,
		deleteInvoking: false,
		use: `help <command>`,
		shortHelp: `Displays help information`,
		longHelp: `Displays all commands and short help if not provided with a command. Otherwise states detailed help information for the provided command.`,
		exe: (bot, msg, ...args) => {
			if (args.length === 1) {
				//Display list of commands
				let helpString = ``;

				//Iterate through all commands and add their help to the helpString
				for (let cmd in commands) {
					if (!commands.hasOwnProperty(cmd)) {
						continue;
					}

					helpString += `${config.cmdPrefix}${commands[cmd].use}\n - ${commands[cmd].shortHelp}\n`;
				}

				//Reply in the channel with the help displayed as a code block
				lib.send(msg.channel, helpString, {
					code: `Markdown`,
					split: true
				}, 0);
			} else {
				//Display specific command help
				if (commands[args[1]] !== undefined) {
					lib.send(msg.channel, `${config.cmdPrefix}${commands[args[1]].use} \n - ${commands[args[1]].longHelp}`, {
						code: `Markdown`
					}, 0);
				} else {
					lib.send(msg.channel, `Sorry, that command doesn't exist`, 0);
				}
			}
		}
	},

	summon: {
		voice: false,
		deleteInvoking: true,
		use: `summon`,
		shortHelp: `Summons the bot to your voice channel`,
		longHelp: `Makes the bot attempt to join the voice channel you are currently connected to.`,
		exe: (bot, msg, ...args) => {
			//Find the voice channel the command issuer is in
			let voiceChannel = msg.member.voiceChannel;
			let id = msg.channel.guild.id;
			//Hey I can't be summoned to nowhere
			if (voiceChannel === undefined) {
				return lib.send(msg.channel, `You must be in a voice channel`, 5000);
			}
			//Join the voice channel
			voiceChannel.join().then((connection) => {
				//Set up the queue for this guild if it's not already
				if (queue[id] === undefined) {
					queue[id] = [];
				}
				//Default volume of 25%
				if (queue[`vol${id}`] === undefined) {
					queue[`vol${id}`] = config.defaultVolume;
				}
				//Tell the user the bot failed to join the channel and log the error
			}, (err) => {
				lib.send(msg.channel, `Failed to join channel`, 5000);
				lib.log(`error`, `${err}`);
			}).catch(err => {
				lib.send(msg.channel, `Connection issue`, 5000);
				lib.log(`error`, `${err}`);
			});
		}
	},

	disconnect: {
		voice: true,
		deleteInvoking: true,
		use: `disconnect`,
		shortHelp: `Disconnects the bot from the current voice channel`,
		longHelp: `Simply causes the bot to pause the current stream, and leave the voice channel.\nThe queue is kept, however when the bot is reconnected to a voice channel, the resume command will need to be used.`,
		exe: (bot, msg, ...args) => {
			let player = bot.voiceConnections.get(msg.channel.guild.id).player;
			//Pause the bot's stream on the current server if it's not already paused
			if (player.dispatcher) {
				if (player.dispatcher.paused) {
					play.dispatcher.pause();
				}
			}

			player.voiceConnection.channel.leave();
		}
	},

	play: {
		voice: true,
		deleteInvoking: true,
		use: `play <Link>|<SearchString> [--playnext]`,
		shortHelp: `Plays a video`,
		longHelp: `Enter a URL to a sound clip. This will be downloaded and played in the currently connected voice channel.\nEntering text which is not a URL after the command will instead search youtube using the provided term and play the returned video.\n\nBy default the audio track is added to the end of the queue, however if '--playnext' is added to the command the audio track will be added to the start of the queue.`,
		exe: (bot, msg, ...args) => {
			let id = msg.channel.guild.id;
			let playNext = msg.content.toLowerCase().includes(`--playnext`);
			let type = ``;
			if (args.length !== 1) {
				//Proccess the command
				if (args[1].includes(`youtube.com`)) {
					if (args[1].includes(`watch?v=`)) {
						type = `video`;
					} else if (args[1].includes(`playlist?list=`)) {
						type = `playlist`;
					}
				} else if (args[1].includes(`youtu.be`)) {
					type = `video`;
				} else if (msg.content.toLowerCase().includes(`://`) || msg.content.toLowerCase().includes(`www.`)) {
					//It's a website that's not youtube
				} else {
					type = `search`;
				}

				switch (type) {
					case `video`:
						//Get the video metadata
						ytdl.getInfo(args[1], (err, info) => {
							if (err) {
								//uh oh that video didn't work
								lib.send(msg.channel, `Error adding video: ${err}`, {code: true}, 20000);
								return lib.log(`error`, `${err}`);
							}

							//Make sure the video isn't too long acording to our config
							if (info.length_seconds <= config.maxVideoLength) {

								//Should we queue it next or at the end
								if (playNext) {
									//Add the video to the start of the queue (pos 0 if the queue is empty or pos 1 if not)
									queue[id].length > 0 ? queue[id].splice(1, 0, info) : queue[id].shift(info);
								} else {
									//Add the video to the end of the queue
									queue[id].push(info);
								}

								//It's in the queue
								lib.send(msg.channel, `Enqueued ${info.title}`, 8000);

								//A new video has been added lets check if we should start downloading that
								if (queue[id].length === 1) {
									queue.next(id, bot, msg);
								}
							} else {
								lib.send(msg.channel, `Sorry, that video exceeds the max video length`, 5000);
							}
						});
						break;
					case `playlist`:
						let sizeBefore = queue[id].length;
						let url = args[1];
						let plId = ``;
						let start = url.indexOf(`?list=`);

						//Make sure it actually has the right format here
						if (start > 0) {
							plId = url.substring(start + 6);
							//Get a list of all the videos in the playlist

							getAllIds(plId, (err, results) => {
								if (err) {
									//return errors if any
									lib.send(msg.channel, `There was an error adding this playlist`, 5000);
									return lib.log(`error`, `${err}`);
								}

								let pos = 0;
								//Add each video one by one to the queue
								results.forEach(element => {
									//Get the video metadata
									ytdl.getInfo(`www.youtube.com/watch?v=` + element, (err, info) => {
										if (err) {
											return lib.log(`error`, `${err}`);
										}
										//Check if it exceeds our configured time limit
										if (info.length_seconds <= config.maxVideoLength) {
											//add it to either the end of the queue or next in the queue
											//This should maintain playlist order either way
											if (playNext) {
												queue[id].splice(pos, 0, info);
												pos++;
											} else {
												queue[id].push(info);
												pos++;
											}

											//If we just added the first video, start playing it
											if (pos === 1 && sizeBefore === 0 && sizeBefore < queue[id].length) {
												queue.next(id, bot, msg);
											}
										}
									});
								});
								lib.send(msg.channel, `Enqueued ${results.length} Items`, 8000);
							});
						}
						break;
					case `search`:
						//Get the search string
						let search = args;
						search.splice(0, 1);
						if (search.include(`--playnext`)) {
							search.splice(search.indexOf(`--playnext`), 1);
						}
						search = search.join(` `);

						//Use the youtube api to search for a single video using this search string and get it's ID
						youtube.search.list({
							part: `snippet`,
							maxResults: 1,
							q: search,
							fields: `items/id/videoId`
						}, (err, results) => {
							if (err) {
								lib.send(msg.channel, `Error searching for video`, 8000);
								return lib.log(`error`, `${err}`);
							}

							//Get some metadata for the returned video
							ytdl.getInfo(`www.youtube.com/watch?v=` + results.items[0].id.videoId, (err, info) => {
								if (err) {
									lib.send(msg.channel, `Error adding video`, 8000);
									return lib.log(`error`, `${err}`);
								}
								//Check if the video is too long
								if (info.length_seconds < config.maxVideoLength) {
									//next in queue or end of queue
									if (playNext) {
										//Add the video to the start of the queue (pos 0 if the queue is empty or pos 1 if not)
										queue[id].length > 0 ? queue[id].splice(1, 0, info) : queue[id].shift(info);
									} else {
										//Add the video to the end of the queue
										queue[id].push(info);
									}

									lib.send(msg.channel, `Enqueued ${info.title}`, 5000);

									//A new video has been added lets check if we should start downloading that
									if (queue[id].length === 1) {
										queue.next(id, bot, msg);
									}
								} else {
									return lib.send(msg.channel, `Sorry, that video exceeds the time limit`, 8000);
								}
							});
						});
						break;
					default:
						lib.send(msg.channel, `Only Youtube links or search strings please`, 8000);
				}
			} else {
				//They entered the command on it's own
				lib.send(msg.channel, `Incorrect syntax, type '${config.cmdPrefix}help play' to learn more`, 20000);
			}
		}
	},

	np: {
		voice: true,
		deleteInvoking: true,
		use: `np`,
		shortHelp: `See what's playing`,
		longHelp: `Shows the title of the youtube video currently playing`,
		exe: (bot, msg, ...args) => {
			if (queue[msg.channel.guild.id].length > 0) {
				lib.send(msg.channel, `Currently playing: ${queue[msg.channel.guild.id][0].title}`, 10000);
			} else {
				lib.send(msg.channel, `Nothing is playing right now`, 10000);
			}
		}
	},

	volume: {
		voice: true,
		deleteInvoking: true,
		use: `volume <0-100>`,
		shortHelp: `sets the volume`,
		longHelp: `Enter a number between 0 and 100 to set the volume to that percent.`,
		exe: (bot, msg, ...args) => {
			//it's gotta be a command and an argument
			if (args.length === 2) {
				//make sure they entered a good number and no I'm not supporting 200% volume
				let vol = Math.round(Number(args[1])) / 100;
				if (vol >= 0 && vol <= 1) {
					//Set the volume in the queue object for future streams
					queue[`vol${msg.channel.guild.id}`] = vol;
					//set the volume of the current stream if there is one
					if (bot.voiceConnections.get(msg.channel.guild.id).player.dispatcher !== undefined) {
						bot.voiceConnections.get(msg.channel.guild.id).player.dispatcher.setVolume(vol);
					}
					lib.send(msg.channel, `Volume set to ${vol * 100}%`, 8000);
				} else {
					lib.send(msg.channel, `Please enter a number between 0 and 100, inclusive`, 8000);
				}
			} else {
				lib.send(msg.channel, `Incorrect syntax`, 8000);
			}
		}
	},

	pause: {
		voice: true,
		deleteInvoking: true,
		use: `pause`,
		shortHelp: `pause the currently playing sound track`,
		longHelp: ``,
		exe: (bot, msg, ...args) => {
			let player = bot.voiceConnections.get(msg.channel.guild.id).player;
			//Pause the bot's stream on the current server if it's not already paused
			if (player.dispatcher === undefined || player.dispatcher.paused) {
				lib.send(msg.channel, `I'm not playing anything`, 5000);
			} else {
				player.dispatcher.pause();
			}
		}
	},

	resume: {
		voice: true,
		deleteInvoking: true,
		use: `resume`,
		shortHelp: `Resumes the currently playing audio track`,
		longHelp: ``,
		exe: (bot, msg, ...args) => {
			let player = bot.voiceConnections.get(msg.channel.guild.id).player;

			if (player.dispatcher === undefined) {
				return lib.send(msg.channel, `There's nothing to resume`, 8000);
			}

			//Resume the bot's stream on the current server if it's not already playing
			if (player.dispatcher.paused) {
				player.dispatcher.resume();
			} else {
				lib.send(msg.channel, `I'm not paused`, 8000);
			}
		}
	},

	skip: {
		voice: true,
		deleteInvoking: true,
		use: `skip`,
		shortHelp: `Skips the currently playing audio track`,
		longHelp: ``,
		exe: (bot, msg, ...args) => {
			//if there is currently a stream playing, we just end it
			if (bot.voiceConnections.get(msg.channel.guild.id).player.dispatcher === undefined) {
				lib.send(msg.channel, `You can only skip an item when I'm playing something`, 8000);
			} else {
				bot.voiceConnections.get(msg.channel.guild.id).player.dispatcher.end(`Skipped`);
			}
		}
	},

	queue: {
		voice: true,
		deleteInvoking: true,
		use: `queue`,
		shortHelp: `Displays the queue`,
		longHelp: `Displays a list of all videos in the current queue for the server and their position in the queue.`,
		exe: (bot, msg, ...args) => {
			let id = msg.channel.guild.id;
			//Is there even a queue on this server yet
			if (queue[id] !== undefined && queue[id].length > 0) {
				let compMsg = `Current Queue`;
				let len = queue[id].length < 12 ? queue[id].length : 11;
				//Iterate through all the items in this servers queue and add them to the message
				for (let i = 0; i < len; i++) {
					compMsg += `\n${i}. ${queue[id][i].title}`;
				}
				if (queue[id].length > 12) {
					compMsg += `\n\n And ${queue[id].length - 11} more`;
				}
				//lib.send the compiled queue message to the server
				lib.send(msg.channel, compMsg, 30000);
			} else {
				lib.send(msg.channel, `There is nothing in the queue`, 5000);
			}
		}
	},

	clear: {
		voice: true,
		deleteInvoking: true,
		use: `clear [startNum] [endNum]`,
		shortHelp: `Clears the current queue`,
		longHelp: `Clears videos from the current queue. If start and end numbers are provided only videos in that range are cleared.`,
		exe: (bot, msg, ...args) => {
			let id = msg.channel.guild.id;
			if (queue[id].length > 1) {
				//If they haven't entered any number set it to clear the whole queue
				let start = args[1] === undefined ? 1 : Number(args[1]);
				let end = args[2] === undefined ? (queue[id].length - 1) : Number(args[2]);

				//Make sure that the numbers are correct and clear the queue
				if (start > 0 && start < end && end > 0 && end < queue[id].length) {
					queue[id].splice(start, end - start);
					msg.channel.lib.send(`Queue Cleared`);
				} else {
					lib.send(msg.channel, `Please enter valid start/end numbers`, 5000);
				}
			} else {
				lib.send(msg.channel, `There's nothing in the queue`, 5000);
			}
		}
	},

	remove: {
		voice: true,
		deleteInvoking: true,
		use: `remove <queueNumber>`,
		shortHelp: `Removes a certain track from the queue`,
		longHelp: `Enter the number of a video in the queue after this command to remove the video at that position from the current queue.`,
		exe: (bot, msg, ...args) => {
			let id = msg.channel.guild.id;
			if (queue[id].length > 1) {
				let num = Number(args[1]);
				//Make sure they entered a good number and get rid of that item
				if (!isNaN(num) && num > 0 && num < queue[id].length) {
					queue[id].splice(num, 1);
					lib.send(msg.channel, `Removed item from queue`, 5000);
				} else {
					lib.send(msg.channel, `Please enter a valid queue number`, 8000);
				}
			} else {
				lib.send(msg.channel, `The queue is empty`, 5000);
			}
		}
	},

	move: {
		voice: true,
		deleteInvoking: true,
		use: `move <original location> <new location>`,
		shortHelp: `Moves an audio track in the queue`,
		longHelp: `Move a video from one position in the queue to another. The first argument is the current position of the video you want to move and the second argument is the position you want it to be in.\ne.g., moving an item from 6th position to play next would be 'move 6 1'.`,
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
					lib.send(msg.channel, `Moved the video`, 5000);
				} else {
					lib.send(msg.channel, `Please enter valid orgin and finish queue positions`, 8000);
				}
			} else {
				lib.send(msg.channel, `There's not enough videos to move`, 5000);
			}
		}
	},

	shuffle: {
		voice: true,
		deleteInvoking: true,
		use: `shuffle`,
		shortHelp: `Shuffles the current queue`,
		longHelp: ``,
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
				lib.send(msg.channel, `Shuffled`, 5000);
			} else {
				lib.send(msg.channel, `There is not enough items to shuffle in the queue`, 8000);
			}

		}
	},

	shutdown: {
		voice: false,
		deleteInvoking: true,
		use: `shutdown`,
		shortHelp: `Shuts down the bot`,
		longHelp: `Disconnects the bot from all servers and ends the bots proccess.\nIt will need to be restarted manually.`,
		exe: (bot, msg, ...args) => {
			//Tell the user they are leaving, destroy the bot's client connection and then kill the node process
			lib.send(msg.channel, `:wave:`, 5000);
			bot.destroy();
			process.exit();
		}
	},

	groups: {
		voice: false,
		deleteInvoking: true,
		use: `groups`,
		shortHelp: `List all groups`,
		longHelp: ``,
		exe: (bot, msg, ...args) => {
			//just iterate through all the groups and get their name
			let compMsg = `List of groups`;
			for (var key in permissions) {
				if (permissions.hasOwnProperty(key)) {
					compMsg += `\n${key}`;
				}
			}
			lib.send(msg.channel, compMsg, {code: true}, 10000);
		}
	},

	roll: {
		voice: false,
		deleteInvoking: false,
		use: `roll <numOfDice>d<diceSize>`,
		shortHelp: `Roll some dice`,
		longHelp: `Roll the specified number of dice with the specified ammount of sides \ne.g., roll 1d20 will roll one 20 sided die`,
		exe: (bot, msg, ...args) => {
			if (args.length === 2) {
				let algorithm = args[1].split(`d`);
				if (algorithm.length === 2 && Number(algorithm[0]) > 0 && Number(algorithm[1]) > 0) {
					let total = 0;
					for (let i = 0; i < Number(algorithm[0]); i++) {
						total += Math.floor(Math.random() * Number(algorithm[1])) + 1;
					}
					lib.send(msg.channel, `Total rolled: ${total}`, 0);
				} else {
					lib.send(msg.channel, `Incorrect syntax`, 5000);
				}
			} else {
				lib.send(msg.channel, `Incorrect syntax`, 5000);
			}
		}
	},

	tag: {
		voice: false,
		deleteInvoking: false,
		use: `tag <tagname>`,
		shortHelp: `Output saved messages`,
		longHelp: `Output a saved message with the corresponding tag name to the channel. Save new messages with addtag`,
		exe: (bot, msg, ...args) => {
			//make sure they entered an argument
			if (args.length === 2) {
				//read the tags file
				fs.readFile(`tags.json`, (err, data) => {
					if (err) {
						lib.log(`error`, `${err}`);
						return lib.send(msg.channel, `There was an error reading tags`, 8000);
					}

					let tags;
					try {
						tags = JSON.parse(data);
					} catch (e) {
						lib.log(`error`, e);
						tags = {};
					} finally {
						//Check to see if there are any tags for this server
						if (tags[msg.channel.guild.id] === undefined || tags[msg.channel.guild.id].length === 0) {
							return lib.send(msg.channel, `There are no tags on this server`, 8000);
						}

						let tagname = args[1].toLowerCase();

						//check if the argument they entered is a valid tag name, lib.send the tag message if it is
						if (tags[msg.channel.guild.id][tagname] !== undefined) {
							lib.send(msg.channel, tags[msg.channel.guild.id][tagname], 0);
						} else {
							lib.send(msg.channel, `That tag doesnt exist`, 0);
						}
					}
				});
			} else {
				lib.send(msg.channel, `Invalid syntax`, 5000);
			}
		}
	},

	addtag: {
		voice: false,
		deleteInvoking: true,
		use: `addTag <tagname> <message>`,
		shortHelp: `Save a message`,
		longHelp: `Associates a message with a tagname which can be recalled later with the tag command.`,
		exe: (bot, msg, ...args) => {
			//make sure they entered at least a name and one word message
			if (args.length > 2) {
				//read the tags file
				fs.readFile(`tags.json`, (err, data) => {
					let tagname = args[1].toLowerCase();
					if (err) {
						lib.log(`error`, `${err}`);
						return lib.send(msg.channel, `There was an error checking tags`, 8000);
					}

					let tags;
					try {
						tags = JSON.parse(data);
					} catch (e) {
						lib.log(`error`, e);
						tags = {};
					} finally {
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
							message = message.join(` `);

							//Add the message to this guilds tag list object
							tags[msg.channel.guild.id][tagname] = message;

							//Write the new tag list to the tags file including the new tag
							fs.writeFile(`tags.json`, JSON.stringify(tags), (err) => {
								if (err) {
									lib.log(`error`, `${err}`);
									return lib.send(msg.channel, `There was an error adding the tag`, 8000);
								}
								lib.send(msg.channel, `Tag added`, 5000);
							});
						} else {
							lib.send(msg.channel, `Sorry, that tag already exists`, 8000);
						}
					}
				});
			} else {
				lib.send(msg.channel, `Invalid syntax`, 8000);
			}
		}
	},

	removetag: {
		voice: false,
		deleteInvoking: true,
		use: `removeTag <tagname>`,
		shortHelp: `Remove saved messages`,
		longHelp: `Removes a previously created tag.`,
		exe: (bot, msg, ...args) => {
			//make sure we have a tagname
			if (args.length === 2) {
				//read the tags file
				fs.readFile(`tags.json`, (err, data) => {
					if (err) {
						lib.log(`error`, `${err}`);
						return lib.send(msg.channel, `There was an error reading tags`, 8000);
					}

					let tags;
					try {
						tags = JSON.parse(data);
					} catch (e) {
						lib.log(`error`, e);
						tags = {};
					} finally {
						//Check if there are any tags for this server
						if (tags[msg.channel.guild.id] === undefined || tags[msg.channel.guild.id].length === 0) {
							return lib.send(msg.channel, `There are no tags on this server`, 8000);
						}

						let tagname = args[1].toLowerCase();

						//See if this tagname even exists on this server
						if (tags[msg.channel.guild.id][tagname] !== undefined) {
							//Remove it
							delete tags[msg.channel.guild.id][tagname];

							//write the new taglist with removed tag to the tags file
							fs.writeFile(`tags.json`, JSON.stringify(tags), (err) => {
								if (err) {
									lib.log(`error`, `${err}`);
									return lib.send(msg.channel, `There was an error deleting the tag`, 8000);
								}
								lib.send(msg.channel, `Tag deleted`, 5000);
							});
						} else {
							lib.send(msg.channel, `That tag doesnt exist`, 0);
						}
					}
				});
			} else {
				lib.send(msg.channel, `Invalid syntax`, 5000);
			}
		}
	},

	taglist: {
		voice: false,
		deleteInvoking: false,
		use: `tagList`,
		shortHelp: `List all tags`,
		longHelp: `Produce a list of all previously saved tags`,
		exe: (bot, msg, ...args) => {
			//read the tags file
			fs.readFile(`tags.json`, (err, data) => {
				if (err) {
					lib.log(`error`, `${err}`);
					return lib.send(msg.channel, `There was an error reading tags`, 8000);
				}

				let tags;
				try {
					tags = JSON.parse(data);
				} catch (e) {
					lib.log(`error`, e);
					tags = {};
				} finally {
					//Check if there are any tags on this server
					if (tags[msg.channel.guild.id] !== undefined || tags[msg.channel.guild.id].length === 0) {
						let message = `Tags available on this server: `;
						//iterate through all the tags on this server and add them to the message to lib.send
						//This only goes over the keys i.e., the tagnames
						Object.keys(tags[msg.channel.guild.id]).forEach(element => {
							message += `\n - ` + element;
						});
						lib.send(msg.channel, message, {code: true, split: true}, 0);
					} else {
						lib.send(msg.channel, `No tags for this server exist, create some with addTag`, 10000);
					}
				}
			});
		}
	},

	clever: {
		voice: false,
		deleteInvoking: false,
		use: `clever <message>`,
		shortHelp: `Talk with the bot`,
		longHelp: `lib.sends the provided message to the cleverbot service and replies with the message returned from cleverbot.`,
		exe: (bot, msg, ...args) => {
			if (args.length > 1) {
				args.splice(0, 1);
				cleverbot.write(args.join(` `), response => {
					lib.send(msg.channel, response.output, 0);
				});
			} else {
				lib.send(msg.channel, `Don't be shy`, 0);
			}
		}
	},

	listids: {
		voice: false,
		deleteInvoking: false,
		use: `listIDs`,
		shortHelp: `List Server IDs`,
		longHelp: `Returns a list of IDs for roles, text channels and voice channels on a server.`,
		exe: (bot, msg, ...args) => {
			let compMsg = ``;
			compMsg += `IDs for server: ${msg.channel.guild.name}(${msg.channel.guild.id})\n- Channels -`;
			msg.channel.guild.channels.array().forEach(element => {
				compMsg += `\n${element.name}: ${element.id}`;
			});
			compMsg += `\n- Roles-`;
			msg.channel.guild.roles.array().forEach(element => {
				compMsg += `\n${element.name}: ${element.id}`;
			});
			lib.send(msg.channel, compMsg, {code: true}, 0);
		}
	}
};


module.exports = commands;
