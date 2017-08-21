'use strict';
const Discord = require('eris');
const Mongo = require('mongodb');
const Winston = require('winston');
const ytdl = require('ytdl-core');
const Google = require('googleapis');

var config = require('./config.js');
const youtube = Google.youtube({
	version: 'v3',
	auth: config.googleAPIKey,
});

// guildID as property, array of videoIDs as value
var queue = {
	add: (link, guild, txtChannel, when) => {
		ytdl.getInfo(link, (err, info) => {
			if (err) {
				log.error('Issue getting video metadata', { URL: link, ReportedError: err });
				return bot.createMessage(txtChannel, `[ERROR] \`Issue retrieving metadata for video ${link}\``);
			}
			if (queue[guild].length === 0) {
				queue[guild].push(info);
				queue.next(guild);
			} else if (!when) {
				queue[guild].push(info);
			} else if (when === 'now') {
				queue[guild].splice(0, 1, info);
				queue.next(guild);
			} else {
				queue[guild].splice(1, 0, info);
			}
		});
	},
	next: (guild) => {
		let conn = bot.voiceConnections.get(guild);
		conn.play(`www.youtube.com/watch?v=${queue[guild][0].video_id}`, { inlineVolume: true });
		conn.once('end', () => {
			queue[guild].splice(0, 1);
			if (queue[guild].length >= 1) {
				queue.next(guild);
			} else {
				conn.disconnect();
			}
		});
	},
};

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
				let prefix = '@mention';
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
							bot.registerGuildPrefix(msg.channel.guild.id, prefix);
							log.debug(`Succesfully set bot prefix for guildID ${msg.channel.guild.id}`);
							bot.createMessage(msg.channel.id, `Succesfully set command prefix to ${prefix}`);
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
			fullDescription: 'Sets the prefix used before commands for this bot, only on this guild.',
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
			bot.createMessage(msg.channel.id, 'Shutting down, bye.').then(() => {
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
				bot.joinVoiceChannel(msg.member.voiceState.channelID).then((err, conn) => {
					if (err) {
						bot.createMessage('[ERROR] `Failed to join voice channel`');
						log.error('Failed to join voice channel', { ReportedError: err });
					}
					let when,
						full = args.join(' ')
							.toLowerCase()
							.split(' ');
					// Determine where to add the items
					if (full.includes('--playnext')) {
						when = 'next';
						full.splice(full.indexOf('--playnext'));
					}
					if (full.includes('--playnow')) {
						when = 'now';
						full.splice(full.indexOf('--playnow'));
					}
					// vid, list or search
					if (full.includes('?v=')) {
						// Its a video
						queue.add(full[0], msg.channel.guild.id, msg.channel.id, when);
					} else if (full.includes('?list=')) {
						// Its a playlist
						getAllIds(full.substring(full.indexOf('?list=') + 6), (e, IDList) => {
							if (e) {
								log.error('Issue retrieving playlist data', { ReportedError: e });
								return bot.createMessage(msg.channel.id, `[ERROR] \`Issue retrieving playlist data\``);
							}
							queue.add(`www.youtube.com/watch?v=${IDList[0]}`, msg.channel.guild.id, msg.channel.id, when);
							if (when === 'now') {
								when = 'next';
							}
							for (let i = 1; i < IDList.length; i++) {
								queue.add(`www.youtube.com/watch?v=${IDList[i]}`, msg.channel.guild.id, msg.channel.id, when);
							}
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
								log.error('Issue searching youtube for video', { ReportedError: e });
								return bot.createMessage(msg.channel.id, `[ERROR] \`Issue searching youtube for video\``);
							}
							queue.add(`www.youtube.com/watch?v=${results.items[0].id.videoId}`, msg.channel.guild.id, msg.channel.id, when);
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
			usage: 'Play <URL|SearchString> [--PlayNext | --PlayNow]',
			argsRequired: true,
			guildOnly: true,
		},
	],
	[
		'NowPlaying',
		(msg, args) => {
			if (queue[msg.channel.guild.id].length > 0) {
				return `*Now Playing* \`${queue[msg.channel.guild.id][0].title}\``;
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
		'Volume',
		(msg, args) => {
			let vol = parseInt(args[0]);
			if (args.length === 1 && vol !== undefined && !isNaN(vol) && vol >= 0 && vol <= 100) {
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
							bot.voiceConnections.get(msg.channel.guild.id).setVolume(vol / 100);
							log.debug(`Succesfully set bot volume for guildID ${msg.channel.guild.id}`);
							bot.createMessage(msg.channel.id, `Succesfully set volume to ${vol}%`);
						}
					});
			} else {
				log.debug('Bad Syntax. Volume not set');
				return 'Please supply a number between 0 and 100 inclusive as the volume percentage';
			}
		},
		{
			aliases: ['SetVolume', 'SetVol', 'Vol'],
			description: 'Set the bots speaking volume',
			fullDescription: 'Sets the volume at which the bot plays music on this guild.',
			usage: 'Volume <0-100>',
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
	.on('ready', () => {
		// Set the botPrefix on server that have previously used the SetPrefix command
		log.debug('Setting guild command prefixes');
		db.collection('guildData')
			.find({
				prefix: {
					$ne: null,
				},
			})
			.toArray((err, data) => {
				if (err) {
					return log.error(`Failed to retrieve Guild Data from database. Prefixes not set.`, {
						ReportedError: err,
					});
				}
				for (let i = 0; i < data.length; i++) {
					bot.registerGuildPrefix(data[i]._id, data[i].prefix);
				}
				log.debug('Prefixes set');
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
			for (let j = 0; j < commands.length; j++) {
				cmd.registerSubCommand(commands[i][3][j][0], commands[i][3][j][1], commands[i][3][j][2]);
			}
		}
	}
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
