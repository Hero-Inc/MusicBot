// requires
const path = require(`path`);
const fs = require(`fs`);
const ytdl = require(`ytdl-core`);
const send = require(`./lib.js`)
	.send;

var queue = {
	// download the next song in the queue
	next: (id, bot, msg) => {
		// Make sure theres actually another song to download
		if (queue[id].length > 0) {
			let file = path.join(`${__dirname}/audioFiles/`, `${queue[id][0].video_id}.complete`);
			fs.access(file, err => {
				if (err) {
					// get some audio from some metadata
					let video = ytdl.downloadFromInfo(queue[id][0], {
						filter: `audioonly`,
					});
					let newFile = ``;
					// pipe the audio into a file
					video.on(`info`, (data) => {
						console.log(`Started download of ${queue[id][0].title}`);
						newFile = file.substring(0, file.length - 9);
						video.pipe(fs.createWriteStream(newFile));
					});

					// rename the file and play it
					video.on(`end`, () => {
						console.log(`Completed download of ${queue[id][0].title}`);
						fs.renameSync(newFile, file);
						queue.play(id, bot, file, msg);
					});

					// Skip this song
					video.on(`error`, (e) => {
						send(msg.channel, `There was an error downloading: ${queue[id][0].title}`, 8000);
						console.log(e);
						queue.next(id, bot, msg);
					});
				} else {
					queue.play(id, bot, file, msg);
				}
			});
		}
	},

	play: (id, bot, file, msg) => {
		// start playing the audio
		let stream = bot.voiceConnections.get(id)
			.playFile(file, {
				volume: queue[`vol${id}`],
			});

		// tell the users what we're playing
		stream.once(`start`, () => {
			send(msg.channel, `Now playing: ${queue[id][0].title}`, 10000);
		});

		// Song ended, start the next one
		stream.once(`end`, reason => {
			// kick out the currently playing song - which should actually be ended if this function is called
			queue[id].splice(0, 1);

			console.log(`Ended stream, reason: ${reason}`);
			queue.next(id, bot, msg);
		});
	},
};

module.exports = queue;
