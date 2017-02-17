/*jshint esversion: 6*/

const Discord = require("discord.js");
const config = require("./config.js");
const path = require("path");
const fs = require("fs");
const ytdl = require("ytdl-core");
const send = require("./lib.js").send;

queue = {
	next: (id, bot, msg) => {
		queue[id].splice(0, 1);

		if (queue[id].length > 0) {

			let video = ytdl(queue[id][0].webpage_url, {filter: "audioonly"});
			let file = "";

			video.on("info", (data) => {
				file = path.join(__dirname + "/audioFiles/", data.title);
				console.log("Started download of " + queue[id][0].title);
				video.pipe(fs.createWriteStream(file));
			});

			video.on("end", () => {
				console.log("Completed download of " + queue[id][0].title);
				let newFile = file + ".complete";
				fs.renameSync(file, newFile);
				queue.play(id, bot, newFile, msg);
			});

			video.on("error", (err) => {
				send(msg.channel, "There was an error downloading: " + queue[id][0].title, 8000);
				console.log(err);
				queue.next(id, bot, msg);
			});
		}
	},

	play: (id, bot, file, msg) => {
		let audio = fs.createReadStream(file);

		if (audio !== undefined) {
			let stream = bot.voiceConnections.get(id).playStream(audio, {volume: queue["vol" + id]});

			stream.once("start", () => {
				send(msg.channel, "Now playing: " + queue[id][0].title, 10000);
			});

			stream.once("end", reason => {
				console.log("Ended stream, reason: " + reason);
				queue.next(id, bot, msg);
			});
		} else {
			console.log("error playing file");
			queue.next(id, bot, msg);
		}
	},
};

module.exports = queue;
