//requires
const Discord = require(`discord.js`);
const config = require(`./config.js`);
const path = require(`path`);
const fs = require(`fs`);
const ytdl = require(`ytdl-core`);
const send = require(`./lib.js`).send;

queue = {
	//download the next song in the queue
	next: (id, bot, msg) => {
		//kick out the currently playing song - which should actually be ended if this function is called
		queue[id].splice(0, 1);

		//Make sure theres actually another song to download
		if (queue[id].length > 0) {

			//get some audio from some metadata
			let video = ytdl.downloadFromInfo(queue[id][0], {filter: `audioonly`});
			let file = ``;

			//pipe the audio into a file
			video.on(`info`, (data) => {
				file = path.join(__dirname + `/audioFiles/`, data.title);
				console.log(`Started download of ` + queue[id][0].title);
				video.pipe(fs.createWriteStream(file));
			});

			//rename the file and play it
			video.on(`end`, () => {
				console.log(`Completed download of ` + queue[id][0].title);
				let newFile = file + `.complete`;
				fs.renameSync(file, newFile);
				queue.play(id, bot, newFile, msg);
			});

			//Skip this song
			video.on(`error`, (err) => {
				send(msg.channel, `There was an error downloading: ` + queue[id][0].title, 8000);
				console.log(err);
				queue.next(id, bot, msg);
			});
		}
	},

	play: (id, bot, file, msg) => {
		//create a stream from the file data
		let audio = fs.createReadStream(file);

		//check to see if the stream was actually made
		if (audio !== undefined) {
			//start playing the audio
			let stream = bot.voiceConnections.get(id).playStream(audio, {volume: queue[`vol` + id]});

			//tell the users what we're playing
			stream.once(`start`, () => {
				send(msg.channel, `Now playing: ` + queue[id][0].title, 10000);
			});

			//Song ended, start the next one
			stream.once(`end`, reason => {
				console.log(`Ended stream, reason: ` + reason);
				queue.next(id, bot, msg);
			});
		} else {
			console.log(`error playing file`);
			queue.next(id, bot, msg);
		}
	},
};

module.exports = queue;
