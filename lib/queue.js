const Song = require('./song.js');
const ytdl = require('ytdl-core');

module.exports = class queue {
	constructor(id, volume, maxLength) {
		this.guild = id;
		this.volume = volume;
		this.maxLength = maxLength;
		this.queue = [];
	}

	get strMaxLength() {
		let seconds = this.maxLength % 60;
		let minutes = Math.floor(this.maxLength / 60) % 60;
		let hours = Math.floor(Math.floor(this.maxLength / 60) / 60);
		return `${hours}:${minutes}:${seconds}`;
	}

	get strVolume() {
		return `${this.volume * 100}%`;
	}

	get songList() {
		if (this.queue.length === 0) {
			return 'No songs in queue';
		} else {
			let list = `Now Playing \`${this.queue[0].title}\` requested by ${this.queue.requester}`;
			for (let i = 1; i < this.queue.length && i < 11; i++) {
				list += `\n${i}. \`${this.queue[i].title}\` requested by ${this.queue.requester}`;
			}
			if (this.queue.length > 11) {
				list += `\nAnd ${this.queue.length - 11} more`;
			}
			return list;
		}
	}

	addSong(url, user, start, cb) {
		ytdl.getInfo(url, (err, info) => {
			if (err) {
				cb(err);
				return;
			}
			if (start) {
				this.queue.splice(1, 0, new Song(info, user));
			} else {
				this.queue.push(new Song(info, user));
			}
			cb(null, info.title);
		});
	}

	removeSong(index) {
		if (index > 0 && index < this.queue.length) {
			this.queue.splice(index, 1);
			return true;
		}
		return false;
	}

	play(conn, channel, send) {
		conn.play(`www.youtube.com/watch?v=${this.queue[0].id}`, {
			inlineVolume: true,
		});
		conn.setVolume(this.volume);
		send(channel, `Now Playing \`${this.queue[0].title}\` requested by ${this.queue.requester}`);
		conn.once('end', () => {
			this.queue.splice(0, 1);
			if (this.queue.length > 0) {
				this.play(conn, channel, send);
			} else {
				conn.disconnect();
			}
		});
	}
};
