module.exports = {
	admin: { //Full access
		users: [],
		roles: []
	},
	default: { //Commands that everyone can use except those who are blacklisted
		commands: [`ping`, `foo`, `help`, `queue`, 'tag']
	},
	blacklist: { //Can use no commands
		users: [],
		roles: []
	},
	dj: { //Can use all music based commands
		commands: [`summon`, `play`, `playnext`, `pause`, `resume`, `skip`, `clear`, `remove`, `volume`],
		users: [],
		roles: []
	}
};
