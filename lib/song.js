module.exports = class song {
	constructor(data, user) {
		this.id = data.video_id;
		this.title = data.title;
		this.user = user;
	}

	get requester() {
		return `@${this.user}`;
	}
};
