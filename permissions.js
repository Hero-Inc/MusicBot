module.exports = {
	admin: { //Full access
		users: ["221509843616399360", "218959728368156674", "194389811660849152"],
		roles: []
	},
	default: { //Commands that everyone can use except those who are blacklisted
		commands: ["ping", "foo", "help", "queue"]
	},
	blacklist: { //Can use no commands
		users: [],
		roles: []
	},
	dj: { //Can use all music based commands
		commands: ["summon", "play", "playnext", "pause", "resume", "skip", "clear", "remove", "volume"],
		users: [],
		roles: []
	}
};
