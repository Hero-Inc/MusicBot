'use strict';
const Discord = require('eris');
const Mongo = require('mongodb');
const Winston = require('winston');
const Google = require('googleapis');

const Queue = require(`./lib/queue.js`);

var config = require('./config.js');
const youtube = Google.youtube({
	version: 'v3',
	auth: config.googleAPIKey,
});

var queues = new Map();

// Setup winston logging
var log = new Winston.Logger({
	transports: [
		new Winston.transports.Console({
			handleExceptions: true,
			level: config.consoleDebugLevel === undefined ? 'info' : config.consoleDebugLevel,
		}),
		new Winston.transports.File({
			filename: '../logs/musicBot.log',
			handleExceptions: true,
			level: config.fileDebugLevel === undefined ? 'debug' : config.fileDebugLevel,
		}),
	],
	exitOnError: false,
});

var db;

// Make the owner an admin
log.debug('Adding owner to adminUsers');
config.adminUsers.push(config.ownerID);

function getAllIds(plid, token, idList, cb) {
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
		fields: `items/contentDetails/videoId`,
	}, (err, results) => {
		if (err) {
			return cb(err, null);
		} else {
			results.items.forEach(element => {
				idList.push(element.contentDetails.videoId);
			});
			if (results.nextPageToken !== undefined) {
				getAllIds(plid, results.nextPageToken, idList, cb);
			} else {
				return cb(null, idList);
			}
		}
	});
}

log.debug('Creating commands array');
var commands = [
	[
		'Ping',
		'Pong!',
		{
			description: 'Replies "Pong!"',
		},
	],
	[
		'SetPrefix',
		(msg, args) => {
			if (args.length <= 1) {
				let prefix = null;
				if (args.length === 1) {
					prefix = args[0];
				}
				db.collection('guildData')
					.update({
						_id: msg.channel.guild.id,
					}, {
						$set: {
							prefix: prefix,
						},
					}, {
						upsert: true,
					})
					.then(result => {
						if (result.writeError) {
							log.error(`Issue setting bot prefix for guildID ${msg.channel.guild.id}`, {
								ReportedError: result.writeError.errmsg,
							});
							bot.createMessage(msg.channel.id, 'There was an error saving settings for this guild.');
						} else {
							bot.registerGuildPrefix(msg.channel.guild.id, prefix === null ? config.cmdPrefix : prefix);
							log.debug(`Succesfully set bot prefix for guildID ${msg.channel.guild.id}`);
							bot.createMessage(msg.channel.id, `Succesfully set command prefix to ${prefix === null ? config.cmdPrefix : prefix}`);
						}
					});
			} else {
				log.debug('Bad Syntax. Prefix not set');
				return 'Please supply one word or character to use as the command prefix';
			}
		},
		{
			aliases: ['Prefix', 'cmdPrefix', '~'],
			description: 'Set the command prefix',
			fullDescription: 'Sets the prefix used before commands for this bot, only on this guild.\n Set it to "@mention" to use the bots mention as the prefix. e.g., "@musicBot Help"',
			usage: 'SetPrefix <prefix>',
			guildOnly: true,
			requirements: {
				permissions: {
					administrator: true,
				},
			},
		},
	],
	[
		'GetLink',
		config.inviteLink === undefined || config.inviteLink === '' ? 'Sorry, an invite link has not been configured by the bot owner.' : config.inviteLink,
		{
			aliases: ['Link', 'AddURL', '&'],
			description: 'Add me to a guild',
			fullDescription: 'Return a link which you can use to add me to your own guild.',
		},
	],
	[
		'Shutdown',
		(msg, args) => {
			bot.createMessage(msg.channel.id, 'Shutting down, bye.')
				.then(() => {
					process.kill(process.pid, 'SIGINT');
				});
		},
		{
			aliases: ['kill', 'x-x'],
			description: 'Shutdown the bot',
			fullDescription: 'Stops the bot process.',
			requirements: {
				userIDs: [config.botOwner],
			},
		},
	],
	[
		'Disconnect',
		(msg, args) => {
			bot.voiceConnections.leave(msg.channel.guild.id);
		},
		{
			aliases: ['Leave', 'UnJoin', 'Quit'],
			description: 'Make the bot leave the channel',
			fullDescription: 'Cause the bot to disconnect from the current voice channel',
			guildOnly: true,
		},
	],
	[
		'Play',
		(msg, args) => {
			if (msg.member.voiceState.channelID) {
				bot.joinVoiceChannel(msg.member.voiceState.channelID)
					.then((err, conn) => {
						if (err) {
							bot.createMessage('[ERROR] `Failed to join voice channel`');
							log.error('Failed to join voice channel', {
								ReportedError: err,
							});
						}
						let next = false,
							full = args.join(' ')
							.toLowerCase()
							.split(' ');
						// Determine where to add the items
						if (full.includes('--playnext')) {
							next = true;
							full.splice(full.indexOf('--playnext'));
						}
						// vid, list or search
						if (full.includes('?v=')) {
							// Its a video
							queues.get(msg.channel.guild.id)
								.addSong(full[0], msg.user.id, next, (e, title) => {
									if (e) {
										log.error('Issue getting video metadata', {
											URL: full[0],
											ReportedError: e,
										});
										return bot.createMessage(msg.channel.id, `[ERROR] \`Issue retrieving metadata for video ${full[0]}\``);
									}
									bot.createMessage(msg.channel.id, `Added \`${title}\` to the queue`);
									if (queues.get(msg.channel.guild.id)
										.queue.length === 1) {
										queues.get(msg.channel.guild.id)
											.play(conn, msg.channel.id, bot.createMessage);
									}
								});
						} else if (full.includes('?list=')) {
							// Its a playlist
							bot.createMessage(msg.channel.id, `Processing playlist ...`);
							getAllIds(full.substring(full.indexOf('?list=') + 6), (e, IDList) => {
								if (e) {
									log.error('Issue retrieving playlist data', {
										ReportedError: e,
									});
									return bot.createMessage(msg.channel.id, `[ERROR] \`Issue retrieving playlist data\``);
								}
								for (let i = 0; i < IDList.length; i++) {
									let url = `www.youtube.com/watch?v=${IDList[i]}`;
									queues.get(msg.channel.guild.id)
										.addSong(url, msg.user.id, next, (er, title) => {
											if (er) {
												log.error('Issue getting video metadata', {
													URL: url,
													ReportedError: er,
												});
												return bot.createMessage(msg.channel.id, `[ERROR] \`Issue retrieving metadata for video ${url}\``);
											}
											bot.createMessage(msg.channel.id, `Added \`${title}\` to the queue`);
										});
									if (queues.get(msg.channel.guild.id)
										.queue.length === 1) {
										queues.get(msg.channel.guild.id)
											.play(conn, msg.channel.id, bot.createMessage);
									}
								}
								bot.createMessage(msg.channel.id, `Playlist added to queue`);
							});
						} else {
							// Its a search string
							youtube.search({
								part: `snippet`,
								maxResults: 1,
								q: full.join(' '),
								fields: `items/id/videoId`,
							}, (e, results) => {
								if (e) {
									log.error('Issue searching youtube for video', {
										ReportedError: e,
									});
									return bot.createMessage(msg.channel.id, `[ERROR] \`Issue searching youtube for video\``);
								}
								let url = `www.youtube.com/watch?v=${results.items[0].id.videoId}`;
								queues.get(msg.channel.guild.id)
									.addSong(url, msg.user.id, next, (er, title) => {
										if (er) {
											log.error('Issue getting video metadata', {
												URL: url,
												ReportedError: er,
											});
											return bot.createMessage(msg.channel.id, `[ERROR] \`Issue retrieving metadata for video ${url}\``);
										}
										bot.createMessage(msg.channel.id, `Added \`${title}\` to the queue`);
										if (queues.get(msg.channel.guild.id)
											.queue.length === 1) {
											queues.get(msg.channel.guild.id)
												.play(conn, msg.channel.id, bot.createMessage);
										}
									});
							});
						}
					});
			} else {
				return 'You must be in a voice channel to use this command';
			}
		},
		{
			aliases: ['Add', 'Song', 'NewSong', 'AddToQueue', '+queue', 'qa'],
			description: 'Add a new song to the queue',
			fullDescription: 'Cause the bot to disconnect from the current voice channel',
			usage: 'Play <VideoURL | PlaylistURL | SearchString> [--PlayNext]',
			argsRequired: true,
			guildOnly: true,
		},
	],
	[
		'NowPlaying',
		(msg, args) => {
			let gqueue = queues.get(msg.channel.guild.id)
				.queue;
			if (gqueue.length > 0) {
				return `Now Playing \`${gqueue[0].title}\` requested by ${gqueue.requester}`;
			} else {
				return 'Nothing is currently being played';
			}
		},
		{
			aliases: ['NP', 'Now', 'WhatsOn'],
			description: 'See what song is playing',
			fullDescription: 'Display the title of the current video being played by the bot',
			guildOnly: true,
		},
	],
	[
		'MaxLength',
		(msg, args) => {
			if (args.length >= 1) {
				let length = parseInt(args[0]);
				if (args.join(' ')
					.toLowerCase()
					.split(' ')
					.includes('--default')) {
					length = config.maxLength;
				}
				if (length !== undefined && !isNaN(length) && length >= 0 && length <= config.maxLength) {
					db.collection('guildData')
						.update({
							_id: msg.channel.guild.id,
						}, {
							$set: {
								maxLength: length,
							},
						}, {
							upsert: true,
						})
						.then(result => {
							if (result.writeError) {
								log.error(`Issue setting bot maxLength for guildID ${msg.channel.guild.id}`, {
									ReportedError: result.writeError.errmsg,
								});
								bot.createMessage(msg.channel.id, 'There was an error saving settings for this guild.');
							} else {
								queues.get(msg.channel.guild.id)
									.maxLength = length;
								log.debug(`Succesfully set bot maxLength for guildID ${msg.channel.guild.id}`);
								bot.createMessage(msg.channel.id, `Succesfully set max length to ${queues.get(msg.channel.guild.id).strMaxLength}`);
							}
						});
				} else {
					log.debug('Bad Syntax. Volume not set');
					return 'Please supply a number in seconds as the maximum song length';
				}
			} else {
				return `The current max length is ${queues.get(msg.channel.guild.id).strMaxLength}`;
			}
		},
		{
			aliases: ['SetLength', 'SongLength', 'Duration'],
			description: 'Set or get the bots maximum song length',
			fullDescription: 'Sets the maximum length a song can be to be played on this guild. If no arguments are provided the current max length is returned.\nUse the "--default" flag to reset the max length to the bot deault.',
			usage: 'MaxLength [numberOfSeconds] [--default]',
			guildOnly: true,
			requirements: {
				roleIDs: config.adminRoles,
			},
		},
	],
	[
		'Volume',
		(msg, args) => {
			if (args.length >= 1) {
				let vol = parseInt(args[0]);
				if (args.join(' ')
					.toLowerCase()
					.split(' ')
					.includes('--default')) {
					vol = config.defaultVolume * 100;
				}
				if (vol !== undefined && !isNaN(vol) && vol >= 0 && vol <= 100) {
					vol /= 100;
					db.collection('guildData')
						.update({
							_id: msg.channel.guild.id,
						}, {
							$set: {
								volume: vol,
							},
						}, {
							upsert: true,
						})
						.then(result => {
							if (result.writeError) {
								log.error(`Issue setting bot volume for guildID ${msg.channel.guild.id}`, {
									ReportedError: result.writeError.errmsg,
								});
								bot.createMessage(msg.channel.id, 'There was an error saving settings for this guild.');
							} else {
								bot.voiceConnections.get(msg.channel.guild.id)
									.setVolume(vol);
								queues.get(msg.channel.guild.id)
									.volume = vol;
								log.debug(`Succesfully set bot volume for guildID ${msg.channel.guild.id}`);
								bot.createMessage(msg.channel.id, `Succesfully set volume to ${vol * 100}%`);
							}
						});
				} else {
					log.debug('Bad Syntax. Volume not set');
					return 'Please supply a number between 0 and 100 inclusive as the volume percentage';
				}
			} else {
				return `The current volume is ${queues.get(msg.channel.guild.id).strVolume}`;
			}
		},
		{
			aliases: ['SetVolume', 'SetVol', 'Vol'],
			description: 'Set or get the bots speaking volume',
			fullDescription: 'Sets the volume at which the bot plays music on this guild. If no arguments are provided the current volume is returned.\nUse the "--default" flag to reset the volume to the bot deault.',
			usage: 'Volume [0-100] [--default]',
			guildOnly: true,
		},
	],
	[
		'Queue',
		(msg, args) => queues.get(msg.channel.guild.id)
		.songList(),
		{
			aliases: ['SongList', 'ListSongs', 'Songs', 'WhatsNext'],
			description: 'See what songs are coming up',
			fullDescription: 'Show a list of the currently playing song and the next 10 songs in the queue after it.',
			guildOnly: true,
		},
	],
];

log.debug('Creating bot');
var bot = new Discord.CommandClient(
	config.botToken, {
		// Bot Options
	}, {
		// Command Options
		description: 'A bot to play music',
		owner: 'Mr Hero#6252',
		defaultCommandOptions: {
			caseInsensitive: true,
			deleteCommand: true,
			cooldownMessage: 'You\'re using this command faster than I can cool down.',
			permissionMessage: 'You don\'t have permissions for that command.',
			errorMessage: '[ERROR] Something went wrong processing that command, try again later and if errors persist contact your administrator.',
		},
	}
);

log.debug('Creating bot event listeners');
bot
	.on('error', err => {
		log.error(`ERIS Error`, {
			ReportedError: err,
		});
	})
	.on('warn', err => {
		log.warn(`ERIS Warning`, {
			ReportedError: err,
		});
	})
	.on('messageCreate', msg => {
		if (msg.command) {
			log.verbose('Command Recieved', {
				author: `"${msg.author.username}#${msg.author.discriminator}"`,
				msg: msg.content,
			});
		}
	})
	.on('guildAvailable', guild => {
		log.debug('Added to new guild, checking for data.');
		db.collection('guildData')
			.find({
				_id: guild.id,
			})
			.toArray((err, data) => {
				if (err) {
					return log.error(`Failed to retrieve Guild Data from database.`, {
						ReportedError: err,
					});
				}
				if (data[0] !== undefined) {
					bot.registerGuildPrefix(guild.id, data[0].prefix === undefined ? config.cmdPrefix : data[0].prefix);
					queues.set(guild.id, new Queue(guild.id, data[0].volume === undefined ? config.volume : data[0].volume));
				}
				log.debug('New guild data retrieved');
			});
	})
	.on('ready', () => {
		// Set the botPrefix on server that have previously used the SetPrefix command
		log.debug('Setting up saved guild Data');
		let guilds = {};
		db.collection('guildData')
			.find({})
			.toArray((err, data) => {
				if (err) {
					return log.error(`Failed to retrieve Guild Data from database.`, {
						ReportedError: err,
					});
				}
				for (let i = 0; i < data.length; i++) {
					guilds[data._id] = data[i];
				}
				bot.guilds.forEach((guild) => {
					bot.registerGuildPrefix(guild.id, guilds[guild.id] === undefined || guilds[guild.id].prefix === undefined ? config.cmdPrefix : guilds[guild.id].prefix);
					queues.set(guild.id, new Queue(guild.id, guilds[guild.id] === undefined || guilds[guild.id].volume === undefined ? config.volume : guilds[guild.id].volume, guilds[guild.id] === undefined || guilds[guild.id].maxLength === undefined ? config.maxLength : guilds[guild.id].maxLength));
				});
				log.debug('Guild data retrieved set');
			});
		log.info('Bot ready');
	});

function initialise() {
	log.verbose('Initialising bot instance');
	process.on('SIGINT', () => {
		log.info('Shutting Down');
		bot.disconnect();
		db.close();
		process.exit();
	});
	log.debug('Registering commands');
	for (let i = 0; i < commands.length; i++) {
		let cmd = bot.registerCommand(commands[i][0], commands[i][1], commands[i][2]);
		if (commands[i][3]) {
			for (let j = 0; j < commands[i][3].length; j++) {
				cmd.registerSubCommand(commands[i][3][j][0], commands[i][3][j][1], commands[i][3][j][2]);
			}
		}
	}
	commands = null;
	log.debug('Connecting to Discord.');
	bot.connect();
}

log.verbose('Connecting to MongoDB', {
	link: config.connectionString,
});
Mongo.MongoClient.connect(config.connectionString, (err, database) => {
	if (err) {
		log.error('MongoDB connection failed. Retrying ...', {
			ReportedError: err,
		});
		// Wait 3 seconds to try again
		setTimeout(
			Mongo.MongoClient.connect.bind(null, config.connectionString, (err2, database2) => {
				if (err) {
					log.error('MongoDB connection failed. Retrying ...', {
						ReportedError: err2,
					});
					// Wait 3 seconds to try again
					setTimeout(
						Mongo.MongoClient.connect.bind(null, config.connectionString, (err3, database3) => {
							if (err) {
								return log.error('MongoDB connection failed. Please check connectionString in config and try again.', {
									ReportedError: err3,
								});
							}
							log.verbose('Connected to Mongodb');
							db = database3;
							initialise();
						}),
						3000
					);
					return;
				}
				log.verbose('Connected to Mongodb');
				db = database2;
				initialise();
			}),
			3000
		);
		return;
	}
	log.verbose('Connected to Mongodb');
	db = database;
	initialise();
});
