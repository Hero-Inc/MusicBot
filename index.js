'use strict';
const Discord = require('eris');
const Mongo = require('mongodb');
const Winston = require('winston');

var config = require('./config.js');

// guildID as property, array of videoIDs as value
var queue = {};

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
							bot.registerGuildPrefix(msg.channel.id, prefix);
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
		'Summon',
		(msg, args) => {
			if (msg.member.voiceState.channelID) {
				bot.joinVoiceChannel(msg.member.voiceState.channelID).then((err, conn) => {
					if (err) {
						bot.createMessage('[ERROR] `Failed to join voice channel`');
						log.error('Failed to join voice channel', { ReportedError: err });
					}
				});
			} else {
				return 'You must be in a voice channel to use this command';
			}
		},
		{
			aliases: ['Voice', 'Join', 'JoinVoice', 'JoinChannel', 'Connect'],
			description: 'Summon the bot to your channel',
			fullDescription: 'Make the bot join the voice channel you are currently connected to.',
			guildOnly: true,
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
