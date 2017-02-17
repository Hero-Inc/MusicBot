/*jshint esversion: 6 */
//Just to say the script has started
console.log("Starting Bot");

//requires
const Discord = require("discord.js");
const fs = require("fs");
const cmd = require("./commands.js");

//set bot
const bot = new Discord.Client();

//config
const config = require("./config.js");
const permissions = require("./permissions.js");

//functions
const send = require("./lib.js").send;
const arrShare = require("./lib.js").arrShare;

//start up procedures
function initialise() {
    //Set the bots 'playing ...'
    bot.user.setGame(config.cmdPrefix + "help");
    //Set the bots nickname on all servers
    //bot.guilds.array.forEach((element) => {
	//	element.members.get(bot.user.id).setNickname(config.botName).catch(e => {
	//		console.log(e);
	//	});
	//});
    //set the bots avatar
    bot.user.setAvatar("./avatar.png");
}

//When the bot recieves any message on any channel in any guild
bot.on("message", msg => {

	let a = msg.author;

    //Only allow commands in text channels
    if (msg.channel.type !== "text") return;

    //if message doesn't use cmdPrefix
    if (!msg.content.startsWith(config.cmdPrefix)) return;

    //If the message is from a bot, ignore it
    if (a.bot) return;

	//If the user is blacklisted ignore it
	if (permissions.blacklist.users.includes(a.id) || arrShare(permissions.blacklist.roles, msg.member.roles.array())) return;

    //Here at Hero Inc we're Case Insensitive. we don't want any dirty capitals
    let command = msg.content.substring(1).split(" ")[0].toLowerCase();

	//Create an undefined variable
	let canUse;

	//Check if the command exists
	if (canUse === undefined && cmd[command] === undefined) {
		canUse = "That command does not exist";
	}

	//Check if the command requires voice channel sharing
	if (canUse === undefined && cmd[command].voice && (msg.member.voiceChannel === undefined || bot.voiceConnections.get(msg.channel.guild.id) === undefined || msg.member.voiceChannel.id !== bot.voiceConnections.get(msg.channel.guild.id).channel.id)) {
		canUse = "Must be in the same voice channel as the bot to use this command";
	}

	//Check if user has permissions
	if (canUse === undefined && !(a.id === config.ownerID || permissions.default.commands.includes(command) || permissions.admin.users.includes(a.id) || arrShare(permissions.admin.roles, msg.member.roles.array()))) {
		//Iterate through all permissions and check to see if both the command and the user is in any group
		let hasPerm = false;
		for (let i = 3; i < permissions.length; i++) {
			if (permissions[i].commands.includes(command) && (permissions[i].users.includes(a.id) || arrShare(permissions[i].roles, msg.member.roles.array()))) {
                hasPerm = true;
            }
		}
		if (!hasPerm) {
			canUse = "Does not have permissions";
		}
	}

	//See if any of the checks above passed
	if (canUse === undefined) {
		//Run the command
		cmd[command].exe(bot, msg, ...msg.content.substring(1).split(" "));
		let d = new Date();
		console.log("(" + d.getHours() + ":" + d.getMinutes() + ")" + " [" + a.username + "#" + a.discriminator + "] - success - " + msg.content);
		if (cmd[command].deleteInvoking) {
			msg.delete(config.deleteInvokingTime).catch(e => {console.log(e);});
		}
	} else {
		//Tell the user and the console that the command didn't work
		send(msg.channel, "Command Failed: " + canUse, {code: true}, 0);
		console.log("(" + d.getHours() + ":" + d.getMinutes() + ")" + " [" + a.username + "#" + a.discriminator + "] - failed - " + msg.content + " | " + canUse);
	}
});

//If there is an error with the bot on the discord.js side, just log it to the console and continue working
bot.on("error", (e) => {
    console.log(e);
});

//Once the bot has logged in
bot.on("ready", () => {
    initialise();
    console.log("Bot Started");
});

//Log the bot in
bot.login(config.botToken).then((result) => {
    console.log("Connected");
}, (err) => {
    console.log(err);
});
