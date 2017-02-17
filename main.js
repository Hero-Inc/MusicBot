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

    //Here at Hero Inc we're Case Insensitive. we don't want any dirty capitals
    let command = msg.content.substring(1).split(" ")[0].toLowerCase();

    //run the command if it exists, otherwise just chill
    if (cmd[command] !== undefined) {

        //Check to see if the command is voice only
        if (cmd[command].voice) {
            //check if the user issueing the command is in the same voice channel as the bot on the server the command was sent on.
            if (msg.member.voiceChannel === undefined || bot.voiceConnections.get(msg.channel.guild.id) === undefined || msg.member.voiceChannel.id !== bot.voiceConnections.get(msg.channel.guild.id).channel.id) {
                //Break from the event and tell the user they're useless
                console.log(a.username + "#" + a.discriminator + " tried: " + command + " - Was not in the same voice channel");
				if (cmd[command].deleteInvoking) {
					msg.delete(config.deleteInvokingTime).catch(e => {console.log(e);});
				}
                return send(msg.channel, "This command can only be used when in a voice channel with the bot", {}, 5000);
            }
        }

        let canUse = false;

        //If theyre in the blacklist, ignore them
        if (permissions.blacklist.users.includes(a.id) || arrShare(permissions.blacklist.roles, msg.member.roles.array())) {
            return;

            //If they are an admin or if the command is a default or they're the owner
        } else if (a.id === config.ownerID || permissions.default.commands.includes(command) || permissions.admin.users.includes(a.id) || arrShare(permissions.admin.roles, msg.member.roles.array())) {
            canUse = true;
        }

        //Iterate through all permissions and check to see if both the command and the user is in any group
        let permIt = 3;
        while (!canUse && permissions[permIt] !== undefined) {
            if (permissions[permIt].commands.includes(command) && (permissions[permIt].users.includes(a.id) || arrShare(permissions[permIt].roles, msg.member.roles.array()))) {
                canUse = true;
            }
            permIt++;
        }

        //Run the command if the user has permissions otherwise just chill
        if (canUse) {
            cmd[command].exe(bot, msg, ...msg.content.substring(1).split(" "));
            console.log(a.username + "#" + a.discriminator + " used: " + command);
        } else {
            console.log(a.username + "#" + a.discriminator + " tried: " + command + " - Does not have permissions");
            send(msg.channel, "Sorry, you don't have permission to use that command", {code: "Markdown"}, 5000);
        }

		if (cmd[command].deleteInvoking) {
			msg.delete(config.deleteInvokingTime).catch(e => {console.log(e);});
		}
    } else {
        console.log(a.username + "#" + a.discriminator + " tried: " + command + " - Does not exist");
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
