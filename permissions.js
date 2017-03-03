module.exports = {
	// Full access
	admin: {
		users: [],
		roles: [],
	},
	// Commands that everyone can use except those who are blacklisted
	default: {
		commands: [`ping`, `foo`, `help`, `queue`, `tag`, `groups`, `roll`, `taglist`, `np`, `echo`, `clever`],
	},
	// Can use no commands
	blacklist: {
		users: [],
		roles: [],
	},
	// Can use all music based commands
	dj: {
		commands: [`summon`, `play`, `pause`, `resume`, `skip`, `clear`, `remove`, `volume`, `move`, `shuffle`],
		users: [],
		roles: [],
	},
};
