// Just to say the script has started
console.log(`Starting Bot`);

// requires
const Discord = require(`discord.js`);
const cmd = require(`./commands.js`);

// set bot
const bot = new Discord.Client();

// config
const config = require(`./config.js`);
const permissions = require(`./permissions.js`);

// functions
const lib = require(`./lib.js`);

// start up procedures
function initialise() {
	// Set the bots 'playing ...'
	bot.user.setGame(`${config.cmdPrefix}help`);
	// Set the bots nickname on all servers
	// bot.guilds.array.forEach((element) => {
	// 	element.members.get(bot.user.id).setNickname(config.botName).catch(e => {
	// 		lib.log(e);
	// 	});
	// });
	// set the bots avatar
	bot.user.setAvatar(`./avatar.png`);
}

// When the bot recieves any message on any channel in any guild
bot.on(`message`, msg => {
	let a = msg.author;

	// Only allow commands in text channels
	if (msg.channel.type !== `text`) return;

	// if message doesn't use cmdPrefix
	if (!msg.content.startsWith(config.cmdPrefix)) return;

	// If the message is from a bot, ignore it
	if (a.bot) return;

	let userRoles = [];
	msg.member.roles.array().forEach(element => {
		userRoles.push(element.id);
	});

	// If the user is blacklisted ignore it
	if (permissions.blacklist.users.includes(a.id) || lib.arrShare(permissions.blacklist.roles, userRoles)) return;

	// Here at Hero Inc we're Case Insensitive. we don't want any dirty uppercase letters
	let command = msg.content.substring(1).split(` `)[0].toLowerCase();

	// Create an undefined variable
	let canUse;

	// Check if the command exists
	if (canUse === undefined && cmd[command] === undefined) {
		canUse = `That command does not exist`;
	}

	// Check if the command requires voice channel sharing
	if (canUse === undefined && cmd[command].voice && (msg.member.voiceChannel === undefined || bot.voiceConnections.get(msg.channel.guild.id) === undefined || msg.member.voiceChannel.id !== bot.voiceConnections.get(msg.channel.guild.id).channel.id)) {
		canUse = `Must be in the same voice channel as the bot to use this command`;
	}

	// Check if user has permissions
	if (canUse === undefined && !(a.id === config.ownerID || permissions.default.commands.includes(command) || permissions.admin.users.includes(a.id) || lib.arrShare(permissions.admin.roles, userRoles))) {
		// Iterate through all permissions and check to see if both the command and the user is in any group
		let hasPerm = false;
		for (let i = 3; i < permissions.length; i++) {
			if (permissions[i].commands.includes(command) && (permissions[i].users.includes(a.id) || lib.arrShare(permissions[i].roles, userRoles))) {
				hasPerm = true;
			}
		}
		if (!hasPerm) {
			canUse = `Does not have permissions`;
		}
	}

	// See if any of the checks above passed
	if (canUse === undefined) {
		// Run the command
		cmd[command].exe(bot, msg, ...msg.content.substring(1).split(` `));
		lib.log(`command`, `${a.username}#${a.discriminator}: ${msg.content} - Success`);
		if (cmd[command].deleteInvoking) {
			msg.delete(config.deleteInvokingTime).catch(e => { lib.log(e); });
		}
	} else {
		// Tell the user and the console that the command didn't work
		lib.send(msg.channel, `Command Failed: ${canUse}`, { code: true }, 0);
		lib.log(`command`, `${a.username}#${a.discriminator}: ${msg.content} - Failed | ${canUse}`);
	}
});

// If there is an error with the bot on the discord.js side, just log it to the console and continue working
bot.on(`error`, (e) => {
	lib.log(`error`, e);
});

// Once the bot has logged in
bot.on(`ready`, () => {
	initialise();
	lib.log(`def`, `Bot Started`);
});

// Log the bot in
bot.login(config.botToken).then((result) => {
	lib.log(`def`, `Connected`);
}, (err) => {
	lib.log(`error`, err);
});
